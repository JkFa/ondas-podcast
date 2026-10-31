#!/usr/bin/env python3
"""Ondas — pipeline de publicação.

Baixa (YouTube) ou lê (arquivo local) um áudio, normaliza o volume (loudnorm em
duas passadas), codifica MP3 com ID3 + capa, publica no Internet Archive e
imprime o JSON do episódio no schema usado pelo front (web/public/catalog.json).
"""
import argparse
import colorsys
import datetime as dt
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

SCHEMA_VERSION = 1
NEUTRAL_ACCENT = "#6d5dfc"
COVER_SIZE = 1400
IA_DOWNLOAD = "https://archive.org/download"
DEFAULT_CATALOG = Path(__file__).resolve().parent.parent / "web" / "public" / "catalog.json"

# Códigos de saída distintos por tipo de erro (argparse usa 2 para uso incorreto).
EXIT_DEPENDENCY = 10
EXIT_CREDENTIALS = 11
EXIT_INPUT = 12
EXIT_DOWNLOAD = 13
EXIT_FFMPEG = 14
EXIT_COVER = 15
EXIT_TRANSCRIBE = 16
EXIT_UPLOAD = 17
EXIT_VERIFY = 18


class PipelineError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


# --------------------------------------------------------------------------- log
_COLOR = sys.stderr.isatty()


def _paint(code, text):
    return f"\033[{code}m{text}\033[0m" if _COLOR else text


def step(n, title):
    print(_paint("1;36", f"\n[{n}] {title}"), file=sys.stderr)


def info(msg):
    print(f"    {msg}", file=sys.stderr)


def ok(msg):
    print(_paint("32", f"    ✓ {msg}"), file=sys.stderr)


def warn(msg):
    print(_paint("33", f"    ! {msg}"), file=sys.stderr)


def fail(msg):
    print(_paint("1;31", f"\n✗ {msg}"), file=sys.stderr)


# ----------------------------------------------------------------------- helpers
def find_tool(name):
    """Procura no PATH e na pasta do interpretador (venv sem `activate`)."""
    found = shutil.which(name)
    if found:
        return found
    candidate = Path(sys.executable).parent / name
    return str(candidate) if candidate.exists() else None


def run(cmd, code, what, capture=False):
    try:
        return subprocess.run(cmd, check=True, text=True, capture_output=capture)
    except FileNotFoundError:
        raise PipelineError(EXIT_DEPENDENCY, f"Programa não encontrado: {cmd[0]}")
    except subprocess.CalledProcessError as e:
        detail = (e.stderr or "").strip().splitlines()[-5:]
        raise PipelineError(code, f"{what} falhou (código {e.returncode}).\n" + "\n".join(detail))


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def is_url(value):
    return re.match(r"https?://", value) is not None


def is_youtube(value):
    return re.match(r"https?://([\w-]+\.)?(youtube\.com|youtu\.be)/", value) is not None


# ------------------------------------------------------------------- 1. pré-checagem
def precheck(args, youtube, uploading):
    step(1, "Pré-checagem")
    needed = ["ffmpeg", "ffprobe"] + (["yt-dlp"] if youtube else []) + (["ia"] if uploading else [])
    missing = [t for t in needed if not find_tool(t)]
    if missing:
        raise PipelineError(
            EXIT_DEPENDENCY,
            f"Faltando: {', '.join(missing)}. Veja pipeline/README.md (apt install ffmpeg; pip install -r requirements.txt).",
        )
    ok("ferramentas: " + ", ".join(needed))
    if uploading:
        from internetarchive import get_session

        session = get_session()
        if not (session.access_key and session.secret_key):
            raise PipelineError(EXIT_CREDENTIALS, "Credenciais do Internet Archive ausentes. Rode: ia configure")
        ok("credenciais do `ia` encontradas")
    if not re.match(r"https?://", args.license):
        raise PipelineError(EXIT_INPUT, "--license deve ser uma URL (ex.: https://creativecommons.org/licenses/by/4.0/)")


# ------------------------------------------------------------------- 3. entrada
def fetch_input(args, workdir, youtube):
    """Retorna (audio_path, thumbnail_path|None, info_dict)."""
    if not youtube:
        src = Path(args.input).expanduser()
        if not src.is_file():
            raise PipelineError(EXIT_INPUT, f"Arquivo não encontrado: {src}")
        ok(f"arquivo local: {src.name}")
        return src, None, {}

    print(
        _paint("1;33", "\n⚠ Direitos autorais: publique apenas conteúdo próprio ou com licença compatível "
               "com a que você informou em --license."),
        file=sys.stderr,
    )
    step(3, "Download (yt-dlp)")
    run(
        [find_tool("yt-dlp"), "-f", "bestaudio", "--no-playlist", "--write-info-json", "--write-thumbnail",
         "-o", str(workdir / "source.%(ext)s"), args.input],
        EXIT_DOWNLOAD, "Download",
    )
    info_file = workdir / "source.info.json"
    meta = json.loads(info_file.read_text(encoding="utf-8")) if info_file.exists() else {}
    skip = {".json", ".part"}
    audio = next((p for p in workdir.glob("source.*") if p.suffix not in skip and p.suffix not in {".jpg", ".jpeg", ".png", ".webp"}), None)
    if not audio:
        raise PipelineError(EXIT_DOWNLOAD, "yt-dlp não gerou arquivo de áudio.")
    thumb = next((p for p in workdir.glob("source.*") if p.suffix in {".jpg", ".jpeg", ".png", ".webp"}), None)
    ok(f"baixado: {audio.name}" + (" (+ thumbnail)" if thumb else ""))
    return audio, thumb, meta


# ------------------------------------------------------------------- 4/5. áudio
def parse_loudnorm_json(stderr):
    """O ffmpeg imprime o JSON do loudnorm no final do stderr."""
    match = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr, re.S)
    if not match:
        raise PipelineError(EXIT_FFMPEG, "Não foi possível ler a medição do loudnorm.")
    return json.loads(match.group(0))


def normalize_and_encode(src, cover, dest, args, tags):
    step(4, "Normalização (loudnorm, 2 passadas)")
    target = "I=-16:TP=-1.5:LRA=11"
    first = run(
        [find_tool("ffmpeg"), "-hide_banner", "-nostdin", "-i", str(src), "-vn",
         "-af", f"loudnorm={target}:print_format=json", "-f", "null", "-"],
        EXIT_FFMPEG, "Medição do loudnorm", capture=True,
    )
    m = parse_loudnorm_json(first.stderr)
    info(f"medido: I={m['input_i']} LUFS, TP={m['input_tp']} dBTP, LRA={m['input_lra']}")
    loudnorm = (
        f"loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
        f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
        f"offset={m['target_offset']}:linear=true"
    )

    step(5, "Encode MP3")
    if args.music:
        quality = ["-ac", "2", "-b:a", "128k", "-joint_stereo", "1"]
        label = "128 kbps joint stereo"
    else:
        quality = ["-ac", "1", "-b:a", "96k"]
        label = "96 kbps mono"
    cmd = [
        find_tool("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-i", str(src), "-i", str(cover),
        "-map", "0:a:0", "-map", "1:v:0", "-af", loudnorm, "-ar", "44100",
        "-c:a", "libmp3lame", *quality, "-c:v", "copy", "-id3v2_version", "3",
        "-metadata:s:v", "title=Capa", "-metadata:s:v", "comment=Cover (front)",
    ]
    for key, value in tags.items():
        cmd += ["-metadata", f"{key}={value}"]
    run(cmd + [str(dest)], EXIT_FFMPEG, "Encode MP3", capture=True)
    ok(f"{dest.name}: {label}, 44.1 kHz, {dest.stat().st_size / 1e6:.1f} MB")


def probe_duration(path):
    out = run(
        [find_tool("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        EXIT_FFMPEG, "ffprobe", capture=True,
    )
    return round(float(out.stdout.strip()))


# ------------------------------------------------------------------- 6. capa
def accent_color(img):
    """Cor dominante vibrante: quantiza em 8 cores, descarta quase pretos/brancos
    e dessaturados, e entre as frequentes escolhe a mais saturada."""
    small = img.convert("RGB").resize((128, 128))
    quant = small.quantize(colors=8)
    palette = quant.getpalette()
    candidates = []
    for count, idx in quant.getcolors():
        r, g, b = palette[idx * 3: idx * 3 + 3]
        _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        if lum < 30 or lum > 225 or s < 0.25:
            continue
        candidates.append((count, s, (r, g, b)))
    if not candidates:
        return NEUTRAL_ACCENT
    top = max(c[0] for c in candidates)
    frequent = [c for c in candidates if c[0] >= top * 0.25]
    r, g, b = max(frequent, key=lambda c: c[1])[2]
    return f"#{r:02x}{g:02x}{b:02x}"


def prepare_cover(source, dest):
    step(6, "Capa e cor de destaque")
    try:
        from PIL import Image

        if source:
            img = Image.open(source).convert("RGB")
            side = min(img.size)
            left, top = (img.width - side) // 2, (img.height - side) // 2
            img = img.crop((left, top, left + side, top + side)).resize((COVER_SIZE, COVER_SIZE), Image.LANCZOS)
        else:
            warn("sem capa: usando placeholder neutro (use --cover)")
            img = Image.new("RGB", (COVER_SIZE, COVER_SIZE), (39, 39, 42))
        img.save(dest, "JPEG", quality=88, optimize=True)
        accent = accent_color(img)
    except Exception as e:  # PIL levanta vários tipos (arquivo corrompido, formato desconhecido)
        raise PipelineError(EXIT_COVER, f"Falha ao processar a capa: {e}")
    ok(f"{COVER_SIZE}×{COVER_SIZE} JPEG, accentColor {accent}")
    return accent


# ------------------------------------------------------------------- 7. transcrição
def vtt_time(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def transcribe(mp3, vtt_path):
    step(7, "Transcrição (faster-whisper small, pt, CPU int8)")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise PipelineError(EXIT_DEPENDENCY, "faster-whisper não instalado. Rode: pip install faster-whisper")
    try:
        model = WhisperModel("small", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(str(mp3), language="pt", vad_filter=True)
        result = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segments]
    except Exception as e:
        raise PipelineError(EXIT_TRANSCRIBE, f"Transcrição falhou: {e}")
    lines = ["WEBVTT", ""]
    for seg in result:
        lines += [f"{vtt_time(seg['start'])} --> {vtt_time(seg['end'])}", seg["text"], ""]
    vtt_path.write_text("\n".join(lines), encoding="utf-8")
    ok(f"{len(result)} segmentos → {vtt_path.name}")
    return result


# ------------------------------------------------------------------- 8. identificador
def choose_identifier(args, title, check_remote):
    step(8, "Identificador")
    date = dt.date.today().strftime("%Y%m%d")
    base = slugify(args.identifier or title) or "episodio"
    base = re.sub(rf"-?{date}$", "", base)
    cap = lambda b, suffix: f"{b[: 80 - len(suffix) - 1].rstrip('-')}-{suffix}"  # noqa: E731
    candidate = cap(base, date)
    if check_remote:
        from internetarchive import get_item

        try:
            n = 1
            while get_item(candidate).exists:
                n += 1
                candidate = cap(base, f"{date}-{n}")
                if n > 20:
                    raise PipelineError(EXIT_UPLOAD, "Não foi possível achar um identificador livre.")
        except PipelineError:
            raise
        except Exception as e:
            warn(f"não foi possível checar duplicidade no archive.org ({e})")
    ok(candidate)
    return candidate


# ------------------------------------------------------------------- 9/10. upload e verificação
def upload(identifier, files, metadata):
    step(9, "Upload para o Internet Archive")
    from internetarchive import upload as ia_upload

    delay = 5
    for attempt in range(1, 6):
        try:
            responses = ia_upload(identifier, files=files, metadata=metadata, retries=3, verbose=True)
            bad = [r for r in responses if r.status_code != 200]
            if not bad:
                ok(f"{len(files)} arquivo(s) enviados para https://archive.org/details/{identifier}")
                return
            raise RuntimeError(f"HTTP {bad[0].status_code}")
        except Exception as e:
            if attempt == 5:
                raise PipelineError(EXIT_UPLOAD, f"Upload falhou após 5 tentativas: {e}")
            warn(f"tentativa {attempt} falhou ({e}); nova tentativa em {delay}s")
            time.sleep(delay)
            delay *= 2


def wait_for_url(url, timeout=120):
    step(10, "Aguardando o archive.org disponibilizar o MP3")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    ctype = resp.headers.get("Content-Type", "")
                    if "audio/mpeg" not in ctype:
                        warn(f"Content-Type inesperado: {ctype}")
                    ok("URL respondeu 200")
                    return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(5)
    raise PipelineError(EXIT_VERIFY, f"A URL ainda não respondeu 200 após {timeout}s: {url}. O item pode levar mais alguns minutos.")


# ------------------------------------------------------------------- episódio
def build_episode(identifier, title, show, description, accent, duration, chapters, transcript, args, youtube):
    episode = {
        "schemaVersion": SCHEMA_VERSION,
        "id": identifier,
        "title": title,
        "show": show,
        "description": description,
        "audioUrl": f"{IA_DOWNLOAD}/{identifier}/{identifier}.mp3",
        "archiveId": identifier,
        "cover": f"{IA_DOWNLOAD}/{identifier}/cover.jpg",
        "accentColor": accent,
        "duration": duration,
        "publishedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "license": args.license,
        "source": "youtube" if youtube else "local",
    }
    if chapters:
        episode["chapters"] = chapters
    if transcript:
        episode["transcript"] = transcript
    return episode


def update_catalog(path, episode):
    """Insere (ou substitui, pelo id) o episódio no catalog.json. Escrita atômica."""
    path = Path(path)
    if path.exists():
        try:
            catalog = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise PipelineError(EXIT_INPUT, f"{path} não é um JSON válido ({e}); catálogo não alterado.")
        if not isinstance(catalog, dict) or not isinstance(catalog.get("episodes"), list):
            raise PipelineError(EXIT_INPUT, f"{path} não tem a lista 'episodes'; catálogo não alterado.")
    else:
        catalog = {"schemaVersion": SCHEMA_VERSION, "episodes": []}

    episodes = catalog["episodes"]
    for i, existing in enumerate(episodes):
        if isinstance(existing, dict) and existing.get("id") == episode["id"]:
            episodes[i] = episode
            action = "substituído"
            break
    else:
        episodes.append(episode)
        action = "adicionado"

    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    return action


def parse_args(argv):
    p = argparse.ArgumentParser(
        prog="publish.py",
        description="Normaliza, codifica e publica um episódio no Internet Archive.",
    )
    p.add_argument("input", help="URL do YouTube ou caminho de arquivo de áudio (wav/m4a/mp3)")
    p.add_argument("--title", help="Título (obrigatório para arquivo local)")
    p.add_argument("--show", help="Nome do programa/artista")
    p.add_argument("--description", help="Descrição (markdown simples)")
    p.add_argument("--identifier", help="Identificador desejado no archive.org (será sanitizado)")
    p.add_argument("--cover", help="Imagem de capa (jpg/png/webp)")
    p.add_argument("--license", required=True, help="URL da licença, ex.: https://creativecommons.org/licenses/by/4.0/")
    p.add_argument("--music", action="store_true", help="128 kbps joint stereo em vez de voz 96 kbps mono")
    p.add_argument("--transcribe", action="store_true", help="Gera transcrição com faster-whisper")
    p.add_argument("--dry-run", action="store_true", help="Faz tudo menos o upload e mostra o que seria enviado")
    p.add_argument("--no-upload", action="store_true", help="Gera os arquivos em ./out/<id>/ sem enviar")
    p.add_argument("--catalog", metavar="ARQUIVO", default=str(DEFAULT_CATALOG),
                   help="catalog.json a atualizar após o upload (padrão: web/public/catalog.json)")
    p.add_argument("--no-catalog", action="store_true", help="Não atualiza o catalog.json")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    youtube = is_youtube(args.input)
    if is_url(args.input) and not youtube:
        raise PipelineError(EXIT_INPUT, "Só URLs do YouTube são suportadas; para outros, baixe o arquivo e passe o caminho.")
    uploading = not (args.dry_run or args.no_upload)

    precheck(args, youtube, uploading)
    step(2, "Direitos e licença")
    ok(f"licença: {args.license}")

    out_dir = Path("out")
    with tempfile.TemporaryDirectory(prefix="ondas-") as tmp:
        work = Path(tmp)
        source, thumb, meta = fetch_input(args, work, youtube)

        title = args.title or meta.get("title")
        if not title:
            raise PipelineError(EXIT_INPUT, "--title é obrigatório para arquivos locais.")
        show = args.show or meta.get("uploader") or meta.get("channel") or "Ondas"
        description = args.description or meta.get("description") or ""
        chapters = [{"start": int(c["start_time"]), "title": c["title"]} for c in meta.get("chapters") or []]

        cover_src = Path(args.cover).expanduser() if args.cover else thumb
        if args.cover and not cover_src.is_file():
            raise PipelineError(EXIT_INPUT, f"Capa não encontrada: {cover_src}")
        cover = work / "cover.jpg"
        accent = prepare_cover(cover_src, cover)

        mp3_tmp = work / "episode.mp3"
        normalize_and_encode(source, cover, mp3_tmp, args, {"title": title, "artist": show, "album": show})
        duration = probe_duration(mp3_tmp)

        vtt_tmp = work / "transcript.vtt"
        transcript = transcribe(mp3_tmp, vtt_tmp) if args.transcribe else None
        if not args.transcribe:
            step(7, "Transcrição")
            info("ignorada (use --transcribe)")

        identifier = choose_identifier(args, title, check_remote=True)
        episode = build_episode(identifier, title, show, description, accent, duration, chapters, transcript, args, youtube)

        files = {f"{identifier}.mp3": str(mp3_tmp), "cover.jpg": str(cover)}
        if transcript:
            files[f"{identifier}.vtt"] = str(vtt_tmp)
        metadata = {
            "mediatype": "audio", "collection": "opensource_audio", "title": title, "creator": show,
            "description": description, "licenseurl": args.license, "language": "por",
            "subject": ["podcast", "ondas"],
        }

        verify_error = None
        if uploading:
            upload(identifier, files, metadata)
            try:
                wait_for_url(episode["audioUrl"])
            except PipelineError as e:
                verify_error = e  # o upload já foi feito: ainda entregamos o JSON abaixo
                warn(str(e))
        else:
            step(9, "Upload")
            kept = out_dir / identifier
            kept.mkdir(parents=True, exist_ok=True)
            for name, path in files.items():
                shutil.copy2(path, kept / name)
            info("não enviado (" + ("--dry-run" if args.dry_run else "--no-upload") + "). Seria enviado:")
            for name, path in files.items():
                info(f"  {name}  ({Path(path).stat().st_size / 1e6:.2f} MB)")
            info("metadata: " + json.dumps(metadata, ensure_ascii=False))
            ok(f"arquivos mantidos em {kept}/")

    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / f"{identifier}.json"
    payload = json.dumps(episode, ensure_ascii=False, indent=2)
    out_file.write_text(payload + "\n", encoding="utf-8")

    if uploading and not args.no_catalog:
        step(11, "Catálogo")
        try:
            action = update_catalog(args.catalog, episode)
            ok(f"episódio {action} em {args.catalog}")
            info("para publicar no site: git add, commit e push do catalog.json")
        except (PipelineError, OSError) as e:
            warn(f"catálogo não atualizado: {e}")  # o upload já foi feito; o JSON abaixo continua valendo

    print(_paint("1;32", "\nConcluído."), file=sys.stderr)
    print(f"URL direta: {episode['audioUrl']}", file=sys.stderr)
    print(f"JSON salvo em: {out_file}\n", file=sys.stderr)
    print(payload)  # stdout só com o JSON: facilita `| pbcopy` / redirecionamento
    if verify_error:
        raise verify_error  # código 18, mas só depois de salvar e imprimir o JSON
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except PipelineError as e:
        fail(str(e))
        sys.exit(e.code)
    except KeyboardInterrupt:
        fail("Interrompido.")
        sys.exit(130)
