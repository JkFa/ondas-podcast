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
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audio_tools  # noqa: E402
import covergen  # noqa: E402
import licenses  # noqa: E402
import metadata as metadata_mod  # noqa: E402
import safety  # noqa: E402
import transcripts as T  # noqa: E402

SCHEMA_VERSION = 1
NEUTRAL_ACCENT = "#6d5dfc"
COVER_SIZE = 1400
IA_DOWNLOAD = "https://archive.org/download"
SITE_URL = "https://jkfa.github.io/ondas-podcast/"
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
EXIT_DUPLICATE = 19  # o mesmo áudio já está no catálogo
EXIT_CONFIRM = 20  # publicar exige confirmação humana (--yes ou terminal interativo)
EXIT_VALIDATION = 21  # campos obrigatórios do episódio/RSS faltando


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
def ia_credentials():
    """Credenciais do archive.org: variáveis IA_ACCESS_KEY/IA_SECRET_KEY (GitHub Actions) ou o `ia configure` local."""
    access, secret = os.environ.get("IA_ACCESS_KEY"), os.environ.get("IA_SECRET_KEY")
    if access and secret:
        return access, secret
    from internetarchive import get_session

    session = get_session()
    return (session.access_key, session.secret_key) if session.access_key and session.secret_key else (None, None)


def classify_input(value):
    """'local' | 'youtube' | 'direct' (link para arquivo de áudio) | 'ytdlp' (outra página de vídeo/áudio)."""
    if not is_url(value):
        return "local"
    if is_youtube(value):
        return "youtube"
    path = urllib.parse.urlsplit(value).path.lower()
    return "direct" if re.search(r"\.(mp3|m4a|wav|ogg|oga|opus|flac|aac|wma)$", path) else "ytdlp"


def precheck(args, kind, uploading):
    step(1, "Pré-checagem")
    needed = ["ffmpeg", "ffprobe"] + (["yt-dlp"] if kind in ("youtube", "ytdlp") else []) + (["ia"] if uploading and not os.environ.get("IA_ACCESS_KEY") else [])
    missing = [t for t in needed if not find_tool(t)]
    if missing:
        raise PipelineError(
            EXIT_DEPENDENCY,
            f"Faltando: {', '.join(missing)}. Veja pipeline/README.md (apt install ffmpeg; pip install -r requirements.txt).",
        )
    ok("ferramentas: " + ", ".join(needed))
    if uploading:
        access, secret = ia_credentials()
        if not (access and secret):
            raise PipelineError(EXIT_CREDENTIALS, "Credenciais do Internet Archive ausentes. Rode: ia configure (ou defina IA_ACCESS_KEY e IA_SECRET_KEY)")
        ok("credenciais do archive.org encontradas")


def resolve_license(args):
    """Licença Creative Commons obrigatória: código (by, by-sa, cc0…) ou URL; sem ela, seletor guiado no terminal."""
    step(2, "Direitos e licença")
    value = args.license
    if not value:
        if sys.stdin.isatty():
            lic = licenses.guided_select()
        else:
            raise PipelineError(EXIT_INPUT, "--license é obrigatória (licença Creative Commons). Opções:\n" + licenses.options_text())
    else:
        try:
            lic = licenses.resolve(value)
        except licenses.LicenseError as e:
            raise PipelineError(EXIT_INPUT, str(e))
    ok(f"licença: {lic['name']} ({lic['url']})")
    info("(" + next((v["explain"] for v in licenses.LICENSES.values() if v["url"] == lic["url"]), "licença Creative Commons") + ")")
    return lic


# ------------------------------------------------------------------- 3. entrada
def fetch_input(args, workdir, kind):
    """Retorna (audio_path, thumbnail_path|None, info_dict)."""
    if kind == "local":
        src = Path(args.input).expanduser()
        if not src.is_file():
            raise PipelineError(EXIT_INPUT, f"Arquivo não encontrado: {src}")
        ok(f"arquivo local: {src.name}")
        return src, None, {}

    try:
        safety.check_public_url(args.input)
    except safety.UnsafeUrl as e:
        raise PipelineError(EXIT_INPUT, f"Link recusado: {e}")
    print(
        _paint("1;33", "\n⚠ Direitos autorais: publique apenas conteúdo próprio ou com licença compatível "
               "com a que você informou em --license."),
        file=sys.stderr,
    )
    if kind == "direct":
        step(3, "Download do link de áudio")
        suffix = Path(urllib.parse.urlsplit(args.input).path).suffix or ".audio"
        dest = workdir / f"source{suffix}"
        try:
            ctype = safety.download_direct(args.input, dest)
        except (safety.UnsafeUrl, ValueError, OSError) as e:
            raise PipelineError(EXIT_DOWNLOAD, f"Não consegui baixar o link: {e}")
        try:
            audio_tools.duration(dest)
        except (ValueError, FileNotFoundError):
            raise PipelineError(EXIT_INPUT, "O arquivo baixado não parece ser um áudio válido.")
        ok(f"baixado: {dest.name} ({dest.stat().st_size / 1e6:.1f} MB, {ctype or 'tipo desconhecido'})")
        return dest, None, {}

    step(3, "Download (yt-dlp)")
    try:
        run(
            [find_tool("yt-dlp"), "-f", "bestaudio", "--no-playlist", "--max-filesize", "800M", "--write-info-json", "--write-thumbnail",
             "-o", str(workdir / "source.%(ext)s"), args.input],
            EXIT_DOWNLOAD, "Download", capture=True,
        )
    except PipelineError as e:
        if re.search(r"Sign in to confirm|not a bot|HTTP Error 403|Private video|This video is unavailable", str(e), re.I):
            raise PipelineError(EXIT_DOWNLOAD, "O YouTube recusou o download (bloqueio contra robôs, vídeo privado ou indisponível). "
                                "Servidores na nuvem costumam ser bloqueados: use um link direto para o arquivo de áudio "
                                "ou rode o pipeline no seu computador.\n" + str(e))
        raise
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


def normalize_and_encode(src, dest, kind, trim_silence=False):
    """loudnorm em 2 passadas (I=-16, TP=-1.5, LRA=11) e MP3 de 128 kbps: mono para voz, joint stereo para música.
    Ainda sem capa/ID3 (isso é feito em finalize_mp3, depois que título e capa estão decididos)."""
    step(4, "Normalização (loudnorm, 2 passadas)" + (" + corte de silêncio" if trim_silence else ""))
    target = "I=-16:TP=-1.5:LRA=11"
    pre = (audio_tools.TRIM_SILENCE + ",") if trim_silence else ""
    first = run(
        [find_tool("ffmpeg"), "-hide_banner", "-nostdin", "-i", str(src), "-vn",
         "-af", f"{pre}loudnorm={target}:print_format=json", "-f", "null", "-"],
        EXIT_FFMPEG, "Medição do loudnorm", capture=True,
    )
    m = parse_loudnorm_json(first.stderr)
    info(f"medido: I={m['input_i']} LUFS, TP={m['input_tp']} dBTP, LRA={m['input_lra']}")
    loudnorm = (
        f"{pre}loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
        f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
        f"offset={m['target_offset']}:linear=true"
    )

    step(5, "Encode MP3")
    if kind == "music":
        quality = ["-ac", "2", "-b:a", "128k", "-joint_stereo", "1"]
        label = "128 kbps joint stereo (música)"
    else:
        quality = ["-ac", "1", "-b:a", "128k"]
        label = "128 kbps mono (voz)"
    run(
        [find_tool("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-i", str(src), "-vn", "-af", loudnorm, "-ar", "44100",
         "-c:a", "libmp3lame", *quality, str(dest)],
        EXIT_FFMPEG, "Encode MP3", capture=True,
    )
    ok(f"{dest.name}: {label}, 44.1 kHz, {dest.stat().st_size / 1e6:.1f} MB")


def finalize_mp3(tmp_mp3, cover, dest, tags):
    """Embute a capa e as tags ID3 (cópia do áudio, sem recodificar)."""
    cmd = [find_tool("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-i", str(tmp_mp3), "-i", str(cover), "-map", "0:a:0", "-map", "1:v:0",
           "-c", "copy", "-id3v2_version", "3", "-metadata:s:v", "title=Capa", "-metadata:s:v", "comment=Cover (front)"]
    for key, value in tags.items():
        cmd += ["-metadata", f"{key}={value}"]
    run(cmd + [str(dest)], EXIT_FFMPEG, "Capa e tags ID3", capture=True)


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


def prepare_cover(source, dest, title="", author=""):
    """Com imagem: recorta quadrado, 1400×1400, cor de destaque. Sem imagem: gera uma capa 3000×3000 no visual do Ondas."""
    step(8, "Capa e cor de destaque")
    try:
        from PIL import Image

        if source:
            img = Image.open(source).convert("RGB")
            side = min(img.size)
            left, top = (img.width - side) // 2, (img.height - side) // 2
            img = img.crop((left, top, left + side, top + side)).resize((COVER_SIZE, COVER_SIZE), Image.LANCZOS)
            img.save(dest, "JPEG", quality=88, optimize=True)
            accent, label = accent_color(img), f"{COVER_SIZE}×{COVER_SIZE} JPEG"
        else:
            covergen.make_cover(title or "Novo episódio", author, dest)
            accent, label = NEUTRAL_ACCENT, f"capa gerada automaticamente {covergen.SIZE}×{covergen.SIZE}"
    except Exception as e:  # PIL levanta vários tipos (arquivo corrompido, formato desconhecido)
        raise PipelineError(EXIT_COVER, f"Falha ao processar a capa: {e}")
    ok(f"{label}, accentColor {accent}")
    return accent


# ------------------------------------------------------------------- 7. transcrição
def transcribe_segments(mp3, model_name, language):
    """Transcreve com o faster-whisper local; devolve a lista de segmentos {start,end,text}."""
    step(6, f"Transcrição (faster-whisper {model_name}, {language}, CPU int8)")
    try:
        model = T.load_model(model_name)
    except ImportError:
        raise PipelineError(EXIT_DEPENDENCY, "faster-whisper não instalado. Rode: pip install faster-whisper")
    except Exception as e:
        raise PipelineError(EXIT_TRANSCRIBE, f"Não consegui carregar o modelo '{model_name}': {e}")
    last = [0]

    def progress(done, total):
        pct = int(done / total * 100) if total else 0
        if pct >= last[0] + 10:
            last[0] = pct
            info(f"{pct}%")

    try:
        segments, _ = T.transcribe_file(mp3, model, language, progress)
    except Exception as e:
        raise PipelineError(EXIT_TRANSCRIBE, f"Transcrição falhou: {e}")
    if not segments:
        warn("nenhuma fala detectada; sem transcrição")
    else:
        ok(f"{len(segments)} segmentos")
    return segments


def write_transcripts(segments, work, base, meta):
    """Grava <base>.vtt/.txt/.md em `work` e devolve {'vtt': Path, ...} (vazio se não há segmentos)."""
    return T.write_all(work, base, segments, meta) if segments else {}


# ------------------------------------------------------------------- 8. identificador
def choose_identifier(args, title, check_remote):
    step(9, "Identificador")
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
    step(11, "Upload para o Internet Archive")
    from internetarchive import upload as ia_upload

    delay = 5
    for attempt in range(1, 6):
        try:
            access, secret = ia_credentials()
            responses = ia_upload(identifier, files=files, metadata=metadata, retries=3, verbose=True, access_key=access, secret_key=secret)
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
    step(12, "Aguardando o archive.org disponibilizar o MP3")
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
IA_LANG = {"pt": "por", "en": "eng", "es": "spa", "fr": "fre", "de": "ger", "it": "ita"}


def build_episode(identifier, show, meta, accent, duration, transcript_files, args, kind, license_info, hashes):
    """JSON do episódio no schema do front (web/src/lib/catalog.js), com os metadados gerados/revisados."""
    episode = {
        "schemaVersion": SCHEMA_VERSION,
        "id": identifier,
        "title": meta["title"],
        "show": show,
        "description": meta["description"],
        "shortDescription": meta["short_description"],
        "audioUrl": f"{IA_DOWNLOAD}/{identifier}/{identifier}.mp3",
        "archiveId": identifier,
        "cover": f"{IA_DOWNLOAD}/{identifier}/cover.jpg",
        "accentColor": accent,
        "duration": duration,
        "publishedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "license": license_info["url"],
        "licenseName": license_info["name"],
        "language": meta["language"],
        "category": meta["category"],
        "explicit": meta["explicit"],
        "source": "youtube" if kind == "youtube" else "local",
        "sha256": hashes["mp3"],
        "sourceSha256": hashes["source"],
    }
    if meta["tags"]:
        episode["tags"] = meta["tags"]
    if meta["chapters"]:
        episode["chapters"] = meta["chapters"]
    if transcript_files:
        episode["transcripts"] = {
            ext: f"{IA_DOWNLOAD}/{identifier}/{identifier}.{ext}" for ext in ("vtt", "txt", "md") if ext in transcript_files
        }
        episode["transcripts"]["language"] = args.language
    return episode


def validate_publishable(episode):
    """Campos obrigatórios para o RSS e o catálogo; levanta PipelineError(EXIT_VALIDATION) listando o que falta."""
    problems = []
    for key in ("title", "show", "description", "audioUrl", "license", "language"):
        if not str(episode.get(key) or "").strip():
            problems.append(f"campo obrigatório vazio: {key}")
    if not episode.get("duration") or episode["duration"] <= 0:
        problems.append("duração inválida")
    if not str(episode.get("audioUrl", "")).startswith("https://"):
        problems.append("audioUrl precisa ser https")
    if len(episode.get("shortDescription", "")) > 160:
        problems.append("descrição curta passa de 160 caracteres")
    if episode.get("category") not in metadata_mod.APPLE_CATEGORIES:
        problems.append(f"categoria Apple inválida: {episode.get('category')}")
    if not isinstance(episode.get("explicit"), bool):
        problems.append("explicit precisa ser verdadeiro/falso")
    if problems:
        raise PipelineError(EXIT_VALIDATION, "Episódio incompleto:\n  - " + "\n  - ".join(problems))


def known_hashes(catalog_path):
    """Hashes SHA-256 (do áudio de origem e do MP3 final) dos episódios que já estão no catálogo."""
    try:
        data = json.loads(Path(catalog_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    found = {}
    for e in data.get("episodes", []):
        for key in ("sourceSha256", "sha256"):
            if e.get(key):
                found[e[key]] = e.get("id")
    return found


def format_summary(episode, provider_name, kind):
    ch = episode.get("chapters") or []
    lines = [
        "", "─" * 64, "Resumo do episódio (revise antes de publicar)", "─" * 64,
        f"Título:      {episode['title']}",
        f"Programa:    {episode['show']}",
        f"Licença:     {episode['licenseName']}",
        f"Duração:     {episode['duration'] // 60} min {episode['duration'] % 60:02d} s   ({'música, 128 kbps estéreo' if kind == 'music' else 'voz, 128 kbps mono'})",
        f"Idioma:      {episode['language']}    Explícito: {'sim' if episode['explicit'] else 'não'}    Categoria: {episode['category']}",
        f"Curta:       {episode['shortDescription']}",
        f"Descrição:   {episode['description'][:300]}{'…' if len(episode['description']) > 300 else ''}",
        f"Tags:        {', '.join(episode.get('tags', [])) or '—'}",
        f"Capítulos:   {len(ch)}" + ("".join(f"\n    {c['start'] // 60}:{c['start'] % 60:02d}  {c['title']}" for c in ch[:12])),
        f"Transcrição: {'sim' if episode.get('transcripts') else 'não'}    Metadados por: {provider_name}",
        "─" * 64,
    ]
    return "\n".join(lines)


def review(meta, yaml_path, ctx, args, uploading, show):
    """Revisão humana. Grava o YAML dos campos gerados; no terminal deixa editar e pede confirmação.
    Sem terminal (ex.: GitHub Actions) só publica com --yes (a aprovação é feita antes, pelo rótulo `aprovado`)."""
    yaml_path.write_text(metadata_mod.to_yaml(meta), encoding="utf-8")
    show(meta)
    if args.yes or not uploading:
        return meta
    if not sys.stdin.isatty():
        raise PipelineError(EXIT_CONFIRM, "Publicar exige confirmação: rode num terminal interativo ou use --yes (veja pipeline/README.md).")
    while True:
        answer = input("\nPublicar? [s]im / [e]ditar os campos / [n]ão: ").strip().lower()
        if answer in ("s", "sim", "y", "yes"):
            return meta
        if answer in ("n", "não", "nao", "no"):
            raise PipelineError(EXIT_CONFIRM, "Publicação cancelada.")
        if answer in ("e", "editar"):
            editor = os.environ.get("VISUAL") or os.environ.get("EDITOR") or shutil.which("nano") or "vi"
            subprocess.run([*editor.split(), str(yaml_path)])
            try:
                meta = metadata_mod.from_yaml(yaml_path.read_text(encoding="utf-8"), ctx)
                yaml_path.write_text(metadata_mod.to_yaml(meta), encoding="utf-8")
                show(meta)
            except Exception as e:
                warn(f"YAML inválido ({e}); tente de novo")


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
        description="Baixa, normaliza, transcreve, descreve e publica um episódio no Internet Archive (com uma confirmação humana).",
    )
    p.add_argument("input", help="link do YouTube, link direto para um arquivo de áudio (mp3/m4a/wav/ogg…), outra página de vídeo/áudio ou caminho de arquivo local")
    p.add_argument("--title", help="Título (sem ele, é sugerido a partir da transcrição)")
    p.add_argument("--show", help="Nome do programa/autor")
    p.add_argument("--description", help="Descrição (sem ela, é gerada a partir da transcrição)")
    p.add_argument("--identifier", help="Identificador desejado no archive.org (será sanitizado)")
    p.add_argument("--cover", help="Imagem de capa (jpg/png/webp); sem ela usa a do vídeo ou gera uma 3000×3000")
    p.add_argument("--license", help="licença Creative Commons: código (cc0, by, by-sa, by-nc, by-nd, by-nc-sa, by-nc-nd) ou URL; sem ela, seletor guiado no terminal")
    p.add_argument("--kind", choices=["auto", "voice", "music"], default="auto", help="voz = MP3 128 kbps mono; música = 128 kbps estéreo; auto detecta (padrão)")
    p.add_argument("--music", action="store_true", help="atalho para --kind music")
    p.add_argument("--trim-silence", action="store_true", help="remove o silêncio do começo e do fim")
    p.add_argument("--transcribe", action="store_true", help="Gera transcrição (.vtt, .txt, .md) com faster-whisper e envia junto do MP3")
    p.add_argument("--whisper-model", default="small", help="modelo do faster-whisper (tiny, base, small, medium...; padrão small)")
    p.add_argument("--language", default="pt", help="idioma da fala (padrão pt)")
    p.add_argument("--ai", default="auto", choices=["auto", "ollama", "openai", "heuristic"], help="provedor dos metadados: Ollama local, API compatível com a da OpenAI (AI_BASE_URL/AI_API_KEY/AI_MODEL) ou heurística (padrão: o que estiver disponível)")
    p.add_argument("--notes", default="", help="observações para a IA (contexto, nomes, tema)")
    p.add_argument("--metadata-file", help="YAML de metadados já revisado (pula a geração por IA)")
    p.add_argument("--max-minutes", type=float, default=0, help="recusa áudio mais longo que isso (0 = sem limite)")
    p.add_argument("--transcribe-max-minutes", type=float, default=0, help="não transcreve áudio mais longo que isso (0 = sem limite; usado nas automações)")
    p.add_argument("--restrict-sources", action="store_true", help="aceita só YouTube e links diretos de áudio (usado nas automações, que recebem links de desconhecidos)")
    p.add_argument("--allow-duplicate", action="store_true", help="publica mesmo que o mesmo áudio já esteja no catálogo")
    p.add_argument("--yes", "-y", action="store_true", help="pula a confirmação humana (use só depois de aprovar)")
    p.add_argument("--json-out", help="grava aqui um JSON com o episódio, os metadados e o resumo (para automações)")
    p.add_argument("--dry-run", action="store_true", help="Faz tudo menos o upload e mostra o que seria enviado")
    p.add_argument("--no-upload", action="store_true", help="Gera os arquivos em ./out/<id>/ sem enviar")
    p.add_argument("--catalog", metavar="ARQUIVO", default=str(DEFAULT_CATALOG),
                   help="catalog.json a atualizar após o upload (padrão: web/public/catalog.json)")
    p.add_argument("--no-catalog", action="store_true", help="Não atualiza o catalog.json")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    kind_in = classify_input(args.input)
    uploading = not (args.dry_run or args.no_upload)

    if args.restrict_sources and kind_in in ("ytdlp", "local"):
        raise PipelineError(EXIT_INPUT, "Neste modo só aceitamos links do YouTube e links diretos para arquivos de áudio (.mp3, .m4a, .wav, .ogg…).")
    precheck(args, kind_in, uploading)
    license_info = resolve_license(args)

    out_dir = Path("out")
    with tempfile.TemporaryDirectory(prefix="ondas-") as tmp:
        work = Path(tmp)
        source, thumb, src_meta = fetch_input(args, work, kind_in)

        src_dur = audio_tools.duration(source)
        if args.max_minutes and src_dur > args.max_minutes * 60:
            raise PipelineError(EXIT_INPUT, f"Áudio com {src_dur / 60:.0f} min passa do limite de {args.max_minutes:g} min.")
        src_hash = audio_tools.sha256_file(source)
        known = known_hashes(args.catalog)
        if src_hash in known and not args.allow_duplicate:
            raise PipelineError(EXIT_DUPLICATE, f"Este áudio já está no catálogo (episódio '{known[src_hash]}'). Use --allow-duplicate para publicar mesmo assim.")
        ok(f"sha256 do áudio: {src_hash[:16]}… (não é duplicado)")

        kind = "music" if args.music else args.kind
        if kind == "auto":
            kind = audio_tools.detect_kind(source)
            info(f"detectado: {'música (estéreo de verdade)' if kind == 'music' else 'voz (mono ou estéreo quase igual)'}")

        mp3_tmp = work / "episode-raw.mp3"
        normalize_and_encode(source, mp3_tmp, kind, args.trim_silence)
        duration = probe_duration(mp3_tmp)

        do_transcribe = args.transcribe
        if do_transcribe and args.transcribe_max_minutes and duration > args.transcribe_max_minutes * 60:
            warn(f"áudio de {duration / 60:.0f} min passa de {args.transcribe_max_minutes:g} min: sem transcrição neste modo")
            do_transcribe = False
        segments = transcribe_segments(mp3_tmp, args.whisper_model, args.language) if do_transcribe else []
        if not do_transcribe:
            step(6, "Transcrição")
            info("ignorada (use --transcribe: ela melhora a descrição, os capítulos e a acessibilidade)")

        # ---- metadados
        step(7, "Metadados")
        show = args.show or src_meta.get("uploader") or src_meta.get("channel") or "Ondas"
        ctx = {
            "title": args.title or src_meta.get("title") or "", "author": show, "segments": segments, "duration": duration,
            "language": args.language, "source_description": src_meta.get("description") or "", "notes": args.notes,
        }
        if args.metadata_file:
            meta = metadata_mod.from_yaml(Path(args.metadata_file).read_text(encoding="utf-8"), ctx)
            provider_name = "arquivo revisado"
            ok(f"metadados lidos de {args.metadata_file}")
        else:
            provider = metadata_mod.choose_provider(args.ai)
            info(f"provedor: {provider.name}")
            meta, provider_name, warns = metadata_mod.generate_metadata(ctx, provider)
            for w in warns:
                warn(w)
            if args.title:
                meta["title"] = args.title
            if args.description:
                meta["description"] = args.description
                meta["short_description"] = metadata_mod._clip(args.description, 160)
            if src_meta.get("chapters"):  # capítulos feitos pelo autor valem mais que os gerados
                meta["chapters"] = [{"start": int(c["start_time"]), "title": c["title"]} for c in src_meta["chapters"]]
            ok(f"título: {meta['title']}")

        # ---- capa e identificador
        cover_src = Path(args.cover).expanduser() if args.cover else thumb
        if args.cover and not cover_src.is_file():
            raise PipelineError(EXIT_INPUT, f"Capa não encontrada: {cover_src}")
        cover = work / "cover.jpg"
        accent = prepare_cover(cover_src, cover, meta["title"], show)
        identifier = choose_identifier(args, meta["title"], check_remote=True)

        # ---- transcrição em arquivos e MP3 final (capa + ID3)
        transcript_files = write_transcripts(segments, work, identifier, {
            "title": meta["title"], "author": show, "license": license_info["url"], "language": args.language, "model": args.whisper_model,
            "episode_url": f"{SITE_URL}#/livro/{slugify(meta['title'])}?ep={identifier}", "archive_url": f"https://archive.org/details/{identifier}",
        })
        mp3 = work / f"{identifier}.mp3"
        finalize_mp3(mp3_tmp, cover, mp3, {"title": meta["title"], "artist": show, "album": show, "comment": license_info["url"]})
        mp3_hash = audio_tools.sha256_file(mp3)
        if mp3_hash in known and not args.allow_duplicate:
            raise PipelineError(EXIT_DUPLICATE, f"Este MP3 já está no catálogo (episódio '{known[mp3_hash]}').")

        episode = build_episode(identifier, show, meta, accent, duration, transcript_files, args, kind_in, license_info, {"mp3": mp3_hash, "source": src_hash})
        validate_publishable(episode)

        # ---- revisão humana (YAML + confirmação)
        step(10, "Revisão")
        kept = out_dir / identifier
        kept.mkdir(parents=True, exist_ok=True)
        meta = review(meta, kept / "metadata.yaml", ctx, args, uploading, lambda m: print(format_summary(build_episode(identifier, show, m, accent, duration, transcript_files, args, kind_in, license_info, {"mp3": mp3_hash, "source": src_hash}), provider_name, kind), file=sys.stderr))
        episode = build_episode(identifier, show, meta, accent, duration, transcript_files, args, kind_in, license_info, {"mp3": mp3_hash, "source": src_hash})
        validate_publishable(episode)

        files = {f"{identifier}.mp3": str(mp3), "cover.jpg": str(cover)}
        for ext, path in transcript_files.items():
            files[f"{identifier}.{ext}"] = str(path)
        ia_meta = {
            "mediatype": "audio", "collection": "opensource_audio", "title": episode["title"], "creator": show,
            "description": episode["description"], "licenseurl": license_info["url"], "language": IA_LANG.get(episode["language"].split("-")[0], episode["language"]),
            "subject": ["podcast", "ondas", *episode.get("tags", [])],
        }

        verify_error = None
        if uploading:
            upload(identifier, files, ia_meta)
            try:
                wait_for_url(episode["audioUrl"])
            except PipelineError as e:
                verify_error = e  # o upload já foi feito: ainda entregamos o JSON abaixo
                warn(str(e))
        else:
            step(11, "Upload")
            for name, path in files.items():
                shutil.copy2(path, kept / name)
            info("não enviado (" + ("--dry-run" if args.dry_run else "--no-upload") + "). Seria enviado:")
            for name, path in files.items():
                info(f"  {name}  ({Path(path).stat().st_size / 1e6:.2f} MB)")
            info("metadata: " + json.dumps(ia_meta, ensure_ascii=False))
            ok(f"arquivos mantidos em {kept}/")

    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / f"{identifier}.json"
    payload = json.dumps(episode, ensure_ascii=False, indent=2)
    out_file.write_text(payload + "\n", encoding="utf-8")
    if args.json_out:
        Path(args.json_out).write_text(json.dumps({"episode": episode, "metadata": meta, "provider": provider_name, "kind": kind,
                                                    "summary": format_summary(episode, provider_name, kind), "uploaded": uploading and not verify_error,
                                                    "audio_verified": uploading and not verify_error}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if uploading and not args.no_catalog:
        step(13, "Catálogo")
        try:
            action = update_catalog(args.catalog, episode)
            ok(f"episódio {action} em {args.catalog}")
            info("para publicar no site: git add, commit e push do catalog.json (o deploy gera feed, feeds por obra e páginas de compartilhamento)")
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
