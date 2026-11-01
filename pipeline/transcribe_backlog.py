#!/usr/bin/env python3
"""Ondas — transcrições retroativas.

Gera .vtt/.txt/.md (faster-whisper local) para episódios do catálogo que ainda não têm transcrição
e registra os caminhos no catalog.json. Pode ser interrompido (Ctrl+C) e rodado de novo: cada
episódio concluído é gravado e registrado na hora, e quem já tem arquivos é só registrado.

Onde ficam os arquivos:
  - por padrão em web/public/transcripts/<id>.{vtt,txt,md} (vão para o site no deploy). É o que
    serve para obras de terceiros (LibriVox etc.): não dá para enviar arquivos ao item de outra pessoa
    no archive.org;
  - com --upload-own EMAIL, episódios cujo item no archive.org foi enviado por esse e-mail (e
    cujo id == identificador) recebem os arquivos no próprio item, junto do MP3.

Exemplos:
  python pipeline/transcribe_backlog.py --dry-run --limit 5
  python pipeline/transcribe_backlog.py --series "O Livro de Ruth"
  python pipeline/transcribe_backlog.py --shortest-first --max-minutes 90   # orçamento de tempo
"""
import argparse
import json
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import transcripts as T  # noqa: E402

DEFAULT_CATALOG = HERE.parent / "web" / "public" / "catalog.json"
DEFAULT_OUT = HERE.parent / "web" / "public" / "transcripts"
UA = {"User-Agent": "ondas-transcribe/1.0 (+https://github.com/JkFa/ondas-podcast)"}


def log(msg=""):
    print(msg, file=sys.stderr, flush=True)


def has_transcript(ep):
    return bool(ep.get("transcripts") or ep.get("transcript"))


def select(episodes, ids=None, series=None, max_audio_minutes=0, shortest_first=False, limit=0, out_dir=None):
    """Episódios sem transcrição, filtrados e ordenados. Os que já têm arquivos no out_dir vêm primeiro
    (só precisam ser registrados no catálogo)."""
    chosen = [e for e in episodes if not has_transcript(e)]
    if ids:
        chosen = [e for e in chosen if e["id"] in set(ids)]
    if series:
        chosen = [e for e in chosen if e.get("series") == series]
    if max_audio_minutes:
        chosen = [e for e in chosen if (e.get("duration") or 0) <= max_audio_minutes * 60]
    if shortest_first:
        chosen.sort(key=lambda e: e.get("duration") or 0)
    if out_dir is not None:
        done = [e for e in chosen if all((Path(out_dir) / f"{e['id']}.{x}").exists() for x in ("vtt", "txt", "md"))]
        chosen = done + [e for e in chosen if e not in done]
    return chosen[:limit] if limit else chosen


def download(url, dest, tries=4):
    err = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r, open(dest, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            return
        except Exception as e:
            err = e
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"download falhou ({err})")


def write_catalog(path, catalog):
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def register(catalog, path, ep, urls, language):
    for e in catalog["episodes"]:
        if e["id"] == ep["id"]:
            e["transcripts"] = {**urls, "language": language}
            break
    write_catalog(path, catalog)


def meta_for(ep, model, language):
    return {
        "title": ep["title"],
        "author": ep["show"].replace("LibriVox · ", ""),
        "license": ep.get("license"),
        "language": language,
        "model": model,
        "episode_url": f"{T.SITE_URL}#/livro/{T.slugify(ep.get('series') or ep['title'])}?ep={ep['id']}",  # a página estática com prévia chega na Fase 3
        "archive_url": f"https://archive.org/details/{ep['archiveId']}" if ep.get("archiveId") else None,
    }


def parse_args(argv):
    p = argparse.ArgumentParser(prog="transcribe_backlog.py", description="Gera transcrições (.vtt/.txt/.md) para episódios já publicados.")
    p.add_argument("--catalog", default=str(DEFAULT_CATALOG))
    p.add_argument("--out", default=str(DEFAULT_OUT), help="pasta dos arquivos (padrão web/public/transcripts)")
    p.add_argument("--model", default=T.DEFAULT_MODEL, help="modelo do faster-whisper (padrão small)")
    p.add_argument("--language", default=T.DEFAULT_LANGUAGE)
    p.add_argument("--ids", nargs="+", help="só estes ids de episódio")
    p.add_argument("--series", help="só esta obra")
    p.add_argument("--limit", type=int, default=0, help="no máximo N episódios nesta execução")
    p.add_argument("--max-minutes", type=float, default=0, help="orçamento de tempo: não começa episódio novo depois disso")
    p.add_argument("--max-audio-minutes", type=float, default=0, help="pula episódios mais longos que isso")
    p.add_argument("--shortest-first", action="store_true", help="começa pelos mais curtos")
    p.add_argument("--upload-own", metavar="EMAIL", help="envia os arquivos ao item do archive.org se foi enviado por este e-mail")
    p.add_argument("--dry-run", action="store_true", help="só lista o que seria feito")
    return p.parse_args(argv)


def uploader_of(archive_id):
    from internetarchive import get_item

    return (get_item(archive_id).metadata.get("uploader") or "").lower()


def main(argv=None):
    a = parse_args(argv)
    cat_path, out_dir = Path(a.catalog), Path(a.out)
    catalog = json.loads(cat_path.read_text(encoding="utf-8"))
    todo = select(catalog["episodes"], a.ids, a.series, a.max_audio_minutes, a.shortest_first, a.limit, out_dir)
    total_h = sum(e.get("duration") or 0 for e in todo) / 3600
    log(f"{len(todo)} episódio(s) sem transcrição na seleção ({total_h:.1f} h de áudio). Saída: {out_dir}")
    if a.dry_run:
        for e in todo[:50]:
            log(f"  {e['id']}  {int((e.get('duration') or 0) / 60)} min  {e['title']}")
        if len(todo) > 50:
            log(f"  … e mais {len(todo) - 50}")
        return 0
    if not todo:
        return 0

    started = time.time()
    model = None
    done = skipped = 0
    try:
        for n, ep in enumerate(todo, 1):
            if a.max_minutes and time.time() - started > a.max_minutes * 60:
                log(f"\nOrçamento de {a.max_minutes:g} min atingido; parando. Rode de novo para continuar.")
                break
            files = {x: out_dir / f"{ep['id']}.{x}" for x in ("vtt", "txt", "md")}
            language = a.language
            urls = {x: f"transcripts/{ep['id']}.{x}" for x in files}
            log(f"\n[{n}/{len(todo)}] {ep['title']} ({int((ep.get('duration') or 0) / 60)} min)")
            if all(f.exists() for f in files.values()):
                log("    arquivos já existem; só registrando no catálogo")
            else:
                if model is None:
                    log(f"    carregando o modelo {a.model}…")
                    model = T.load_model(a.model)
                with tempfile.TemporaryDirectory(prefix="ondas-tr-") as tmp:
                    audio = Path(tmp) / "audio.mp3"
                    try:
                        download(ep["audioUrl"], audio)
                    except Exception as e:
                        log(f"    ignorado: {e}")
                        skipped += 1
                        continue
                    t0 = time.time()
                    last = [0]

                    def progress(d, tot):
                        pct = int(d / tot * 100) if tot else 0
                        if pct >= last[0] + 20:
                            last[0] = pct
                            log(f"    {pct}%")

                    segments, dur = T.transcribe_file(audio, model, language, progress)
                    if not segments:
                        log("    nenhuma fala detectada; ignorado")
                        skipped += 1
                        continue
                    T.write_all(out_dir, ep["id"], segments, meta_for(ep, a.model, language))
                    el = time.time() - t0
                    log(f"    {len(segments)} segmentos em {el:.0f} s ({dur / max(el, 1):.1f}× o tempo real)")
            if a.upload_own and ep.get("archiveId") and ep["id"] == ep["archiveId"]:
                try:
                    if uploader_of(ep["archiveId"]) == a.upload_own.lower():
                        from internetarchive import upload

                        upload(ep["archiveId"], files={f"{ep['id']}.{x}": str(p) for x, p in files.items()}, retries=3)
                        urls = {x: f"https://archive.org/download/{ep['archiveId']}/{ep['id']}.{x}" for x in files}
                        log("    enviado ao item no archive.org")
                    else:
                        log("    item de outro usuário: arquivos ficam só no repositório")
                except Exception as e:
                    log(f"    upload não feito ({e}); arquivos ficam no repositório")
            register(catalog, cat_path, ep, urls, language)
            done += 1
    except KeyboardInterrupt:
        log("\nInterrompido. O que já foi concluído está registrado; rode de novo para continuar.")
        return 130
    log(f"\nConcluído: {done} registrado(s), {skipped} ignorado(s). Faltam {len(todo) - done - skipped}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
