#!/usr/bin/env python3
"""Ondas — filmes do Internet Archive (coleção feature_films_unsorted).

O catálogo de filmes é CURADO: só entra o que está em `config/films.json`. Nada é copiado nem reenviado;
`web/public/films.json` só aponta para os arquivos do archive.org (e guarda as legendas convertidas para WebVTT,
porque o archive.org não libera CORS para <track> de outra origem).

Regra de elegibilidade (também verificada aqui, filme a filme):
  1. o item está na coleção e declara licença: domínio público (CC PDM / "publicdomain") ou Creative Commons;
  2. domínio público só vale até `maxYear` (1955): no Brasil, obra audiovisual tem 70 anos contados de 1º de janeiro do
     ano seguinte à divulgação (Lei 9.610/98, art. 44) — um filme de 1955 caiu em domínio público em 1º/1/2026;
     licença Creative Commons explícita vale em qualquer ano;
  3. o arquivo de vídeo responde 200 com tipo video/*.
A licença é DECLARADA por quem enviou ao archive.org; este projeto não faz parecer jurídico.

Comandos:
  python pipeline/films.py candidates [--limit 600]   # lista candidatos para a curadoria (não grava nada)
  python pipeline/films.py build [--dry-run]          # lê config/films.json e grava web/public/films.json + legendas
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_archive as ia  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "films.json"
OUT = ROOT / "web" / "public" / "films.json"
CAPTIONS_DIR = ROOT / "web" / "public" / "films" / "captions"
COLLECTION = "feature_films_unsorted"
SCHEMA_VERSION = 1
MAX_CAPTION_BYTES = 400_000

PD_RE = re.compile(r"creativecommons\.org/(publicdomain/mark|licenses/publicdomain)")
CC_RE = re.compile(r"creativecommons\.org/(publicdomain/zero|licenses/by[a-z-]*)/(\d\.\d)")
LANGS = {"eng": "en", "english": "en", "por": "pt", "portuguese": "pt", "jpn": "ja", "japanese": "ja", "fre": "fr", "fra": "fr", "french": "fr",
         "ger": "de", "deu": "de", "german": "de", "rus": "ru", "russian": "ru", "ita": "it", "italian": "it", "spa": "es", "spanish": "es", "dan": "da", "danish": "da"}


def license_info(url):
    """('pd', 'Domínio público') | ('cc', 'CC BY 3.0') | (None, None)."""
    url = url or ""
    if PD_RE.search(url):
        return "pd", "Domínio público"
    m = CC_RE.search(url)
    if m:
        kind, ver = m.group(1), m.group(2)
        return "cc", "CC0 1.0" if kind.startswith("publicdomain") else f"CC {kind.split('/')[-1].upper()} {ver}"
    return None, None


def year_of(meta):
    m = re.match(r"(\d{4})", str(meta.get("year") or meta.get("date") or ""))
    return int(m.group(1)) if m else None


def language_of(meta):
    raw = meta.get("language")
    raw = raw[0] if isinstance(raw, list) and raw else raw
    return LANGS.get(str(raw or "").strip().lower())


# --------------------------------------------------------------------------- legendas
_TS = re.compile(r"(\d{2}:\d{2}:\d{2})[,.](\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2})[,.](\d{3})")


def srt_to_vtt(srt):
    """SubRip → WebVTT (vírgula vira ponto nos tempos; sem índices; blocos vazios descartados)."""
    out = ["WEBVTT", ""]
    for block in re.split(r"\n\s*\n", srt.replace("\r\n", "\n").replace("﻿", "").strip()):
        lines = [ln for ln in block.split("\n")]
        for i, ln in enumerate(lines):
            m = _TS.search(ln)
            if m:
                text = "\n".join(x.strip() for x in lines[i + 1:] if x.strip())
                text = re.sub(r"<[^>]*>", "", text).replace("&", "&amp;").replace("<", "&lt;")
                if text:
                    out += [f"{m.group(1)}.{m.group(2)} --> {m.group(3)}.{m.group(4)}", text, ""]
                break
    return "\n".join(out)


_STOP = {
    "pt": {"que", "não", "uma", "para", "com", "você", "está", "mas", "como", "são", "foi", "ele", "ela", "dos", "das", "meu", "minha"},
    "en": {"the", "and", "you", "that", "was", "for", "with", "have", "this", "not", "are", "his", "her", "what", "your"},
    "es": {"que", "los", "las", "una", "por", "con", "para", "pero", "como", "estoy", "esta", "del", "muy", "usted"},
    "fr": {"les", "des", "une", "est", "pas", "vous", "que", "pour", "dans", "avec", "nous", "sont", "mais"},
    "it": {"che", "non", "una", "per", "sono", "del", "della", "con", "gli", "questo", "come", "anche"},
    "de": {"und", "der", "die", "das", "nicht", "ich", "ist", "mit", "für", "sie", "ein", "eine", "auch"},
}
_NAME_LANG = re.compile(r"[-_.](pt|por|en|eng|fr|fra|fre|de|ger|deu|es|spa|it|ita)$", re.I)


def guess_language(text, name=""):
    """Idioma da legenda: sufixo do nome do arquivo (".eng.srt"), senão a língua cujas palavras comuns mais aparecem. None se duvidoso."""
    m = _NAME_LANG.search(Path(name).stem)
    if m:
        return LANGS.get(m.group(1).lower(), m.group(1).lower()[:2])
    words = re.findall(r"[a-zà-ú]+", text.lower())
    if len(words) < 30:
        return None
    score = {lang: sum(w in stops for w in words) / len(words) for lang, stops in _STOP.items()}
    best = max(score, key=score.get)
    ordered = sorted(score.values(), reverse=True)
    return best if ordered[0] >= 0.05 and ordered[0] > 1.5 * ordered[1] else None


def caption_candidates(files):
    """Legendas do item, da mais útil para a menos: humanas antes das automáticas (.asr.srt); codificações antigas ficam de fora."""
    out = [f for f in files if f["name"].lower().endswith((".srt", ".vtt")) and "/" not in f["name"] and int(f.get("size") or 0) <= MAX_CAPTION_BYTES * 2
           and not re.search(r"(1250|1251|1252|big5|-gb)\.", f["name"].lower())]
    out.sort(key=lambda f: (".asr." in f["name"].lower(), f["name"].lower()))
    return [f["name"] for f in out][:8]


# --------------------------------------------------------------------------- vídeo
def pick_video(files):
    """(econômica, alta): derivado 512Kb MPEG4 e o h.264 maior. Só aceita nomes simples (sem pastas)."""
    flat = [f for f in files if "/" not in f["name"] and f["name"].lower().endswith(".mp4")]

    def size(f):
        return int(f.get("size") or 0)

    low = next((f for f in flat if f.get("format") == "512Kb MPEG4"), None)
    high = max((f for f in flat if f.get("format") in ("h.264", "h.264 HD") and f is not low), key=size, default=None)
    if not low:
        # sem derivado leve: usa o melhor MP4 disponível (h.264 ou o original em MPEG4), se não passar de 1,2 GB
        low = min((f for f in flat if f.get("format") in ("h.264", "h.264 HD", "MPEG4") and size(f) <= 1_200_000_000), key=size, default=None)
        high = None
    return low, high


def file_url(identifier, name):
    return f"https://archive.org/download/{identifier}/{urllib.parse.quote(name)}"


def build_film(identifier, opts, max_year, deny, tries=3):
    """Metadados do archive.org + regras de elegibilidade → entrada do catálogo. Levanta ValueError se não puder entrar."""
    d = ia.metadata(identifier)
    meta, files = d.get("metadata", {}), d.get("files", [])
    if not meta:
        raise ValueError("item não existe")
    cols = meta.get("collection") or []
    if COLLECTION not in (cols if isinstance(cols, list) else [cols]):
        raise ValueError(f"fora da coleção {COLLECTION}")
    if meta.get("mediatype") != "movies":
        raise ValueError("não é filme")
    kind, license_name = license_info(meta.get("licenseurl"))
    if not kind:
        raise ValueError("sem licença de domínio público ou Creative Commons declarada")
    year = opts.get("year") or year_of(meta)
    if not year:
        raise ValueError("sem ano")
    if kind == "pd" and year > max_year:
        raise ValueError(f"{year} > {max_year}: domínio público no Brasil não confirmado")
    text = " ".join(ia.as_text(meta.get(k)) for k in ("title", "subject", "description")).lower()
    hit = next((w for w in deny if re.search(rf"\b{re.escape(w)}\b", text)), None)
    if hit and not opts.get("allowDenied"):
        raise ValueError(f"palavra da lista de exclusão: {hit!r}")
    low, high = pick_video(files)
    if not low:
        raise ValueError("sem MP4 reproduzível")
    for f in (low, high):
        if f and not ia.head_ok(file_url(identifier, f["name"]), "video/", tries=tries):
            raise ValueError(f"vídeo não responde: {f['name']}")
    film = {
        "id": identifier,
        "slug": ia.slugify(opts.get("title") or meta.get("title") or identifier) or identifier.lower(),
        "title": opts.get("title") or ia.as_text(meta.get("title")),
        "year": year,
        "director": opts.get("director") or ia.as_text(meta.get("creator")) or None,
        "description": opts.get("description") or ia.clean_description(ia.as_text(meta.get("description")))[:900],
        "duration": int(round(float(low.get("length") or 0))) or ia.seconds(meta.get("runtime")),
        "language": opts.get("language") or language_of(meta),
        "silent": bool(opts.get("silent")),
        "genre": opts["genre"],
        "tags": ia.clean_subjects(meta.get("subject"), limit=8),
        "warning": opts.get("warning"),
        "license": meta["licenseurl"],
        "licenseName": license_name,
        "rights": kind,
        "poster": f"https://archive.org/services/img/{identifier}",
        "video": {"url": file_url(identifier, low["name"]), "size": int(low.get("size") or 0)},
        "archiveUrl": f"https://archive.org/details/{identifier}",
        "captions": [],
    }
    if high:
        film["hd"] = {"url": file_url(identifier, high["name"]), "size": int(high.get("size") or 0)}
    film["_captions"] = caption_candidates(files)
    return film


def write_captions(film, dry_run=False):
    """Baixa as legendas, converte para VTT e guarda no site: no máximo uma em português e uma em inglês (as do idioma da interface)."""
    names = film.pop("_captions", [])
    for old in CAPTIONS_DIR.glob(f"{film['id']}.*.vtt"):
        if not dry_run:
            old.unlink()
    found = {}
    for name in names:
        try:
            raw = ia.fetch(file_url(film["id"], name)).decode("utf-8")
        except (RuntimeError, UnicodeDecodeError):
            continue
        vtt = raw if raw.lstrip().startswith("WEBVTT") else srt_to_vtt(raw)
        if vtt.count("-->") < 5 or len(vtt.encode()) > MAX_CAPTION_BYTES or "\ufffd" in vtt:
            continue
        lang = guess_language(vtt, name)
        if lang in ("pt", "en") and lang not in found:
            rel = f"films/captions/{film['id']}.{lang}.vtt"
            if not dry_run:
                CAPTIONS_DIR.mkdir(parents=True, exist_ok=True)
                (ROOT / "web" / "public" / rel).write_text(vtt, encoding="utf-8")
            found[lang] = {"lang": lang, "auto": ".asr." in name.lower(), "src": rel}
    return [found[k] for k in ("pt", "en") if k in found]


# --------------------------------------------------------------------------- comandos
def cmd_candidates(args):
    cfg = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {"maxYear": 1955}
    q = (f"collection:{COLLECTION} AND mediatype:movies AND (licenseurl:*publicdomain* OR licenseurl:*creativecommons.org*) "
         f"AND year:[1890 TO {cfg['maxYear']}]")
    fl = ["identifier", "title", "year", "language", "downloads", "licenseurl"]
    qs = urllib.parse.urlencode([("q", q), ("rows", args.limit), ("sort[]", "downloads desc"), ("output", "json")] + [("fl[]", f) for f in fl])
    docs = json.loads(ia.fetch(f"https://archive.org/advancedsearch.php?{qs}"))["response"]["docs"]
    deny = [w.lower() for w in cfg.get("deny", [])]
    for x in docs:
        t = str(x.get("title", "")).lower()
        flag = "x" if any(re.search(rf"\b{re.escape(w)}\b", t) for w in deny) else " "
        print(f"{flag} {x['identifier']} | {str(x.get('title'))[:50]} | {x.get('year')} | {x.get('downloads')}")
    ia.log(f"{len(docs)} candidatos (x = título bate com a lista de exclusão)")


def cmd_build(args):
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    deny = [w.lower() for w in cfg.get("deny", [])]
    previous = {}
    if OUT.exists():
        previous = {f["id"]: f for f in json.loads(OUT.read_text(encoding="utf-8")).get("films", [])}
    entries = cfg["films"]

    def work(entry):
        try:
            return entry["id"], build_film(entry["id"], entry, cfg["maxYear"], deny), None
        except (ValueError, RuntimeError) as e:
            return entry["id"], None, str(e)

    films, failed = [], []
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for ident, film, err in pool.map(work, entries):
            if err:
                failed.append((ident, err))
                ia.log(f"  ✗ {ident}: {err}")
                continue
            film["captions"] = write_captions(film, args.dry_run)
            cap = film["captions"]
            films.append(film)
            ia.log(f"  ✓ {ident}: {film['title']} ({film['year']}, {film['licenseName']}{', legenda' if cap else ''})")
    if failed and not args.keep_going:
        ia.log(f"\n{len(failed)} filme(s) reprovado(s); nada foi gravado. Corrija config/films.json ou use --keep-going.")
        return 1
    films.sort(key=lambda f: (f["title"].lower(), f["year"]))
    data = {"schemaVersion": SCHEMA_VERSION, "generatedAt": dt.date.today().isoformat(), "source": f"https://archive.org/details/{COLLECTION}", "films": films}
    ia.log(f"\n{len(films)} filmes, {sum(1 for f in films if f['captions'])} com legenda, {sum(f['video']['size'] for f in films) / 1e9:.1f} GB no archive.org")
    if args.dry_run:
        return 0
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    ia.log(f"gravado {OUT.relative_to(ROOT)}")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("candidates")
    c.add_argument("--limit", type=int, default=600)
    c.set_defaults(fn=cmd_candidates)
    b = sub.add_parser("build")
    b.add_argument("--dry-run", action="store_true")
    b.add_argument("--keep-going", action="store_true", help="grava mesmo que algum filme seja reprovado")
    b.set_defaults(fn=cmd_build)
    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
