"""Transcrições do Ondas: gera .vtt, .txt e .md a partir de segmentos com tempo.

Funções puras (agrupar parágrafos, formatar) ficam separadas da parte que usa o faster-whisper,
para poderem ser testadas sem baixar modelo nenhum. Usado por publish.py (episódios novos) e por
transcribe_backlog.py (episódios já publicados).
"""
import datetime as dt
import re
from pathlib import Path

DEFAULT_MODEL = "small"
DEFAULT_LANGUAGE = "pt"
SITE_URL = "https://jkfa.github.io/ondas-podcast/"


def slugify(text):
    """Mesma regra de web/src/lib/books.js (slug da obra na rota #/livro/<slug>)."""
    import unicodedata

    s = unicodedata.normalize("NFD", str(text))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def vtt_time(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def mmss(t):
    """75 → '1:15'; 3725 → '1:02:05'"""
    s = int(t)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def to_paragraphs(segments, gap=1.5, max_chars=600, max_segments=6):
    """Junta segmentos em parágrafos: quebra numa pausa maior que `gap` s, ao passar de `max_chars`
    ou de `max_segments` segmentos. O front usa a mesma regra (web/src/lib/transcript.js)."""
    paragraphs, cur = [], None
    for seg in segments:
        text = seg["text"].strip()
        if not text:
            continue
        if cur and (seg["start"] - cur["end"] > gap or len(cur["text"]) + len(text) > max_chars or cur["n"] >= max_segments):
            paragraphs.append(cur)
            cur = None
        if cur is None:
            cur = {"start": seg["start"], "end": seg["end"], "text": text, "n": 1}
        else:
            cur["text"] += " " + text
            cur["end"] = seg["end"]
            cur["n"] += 1
    if cur:
        paragraphs.append(cur)
    return [{"start": p["start"], "end": p["end"], "text": p["text"]} for p in paragraphs]


def render_vtt(segments):
    lines = ["WEBVTT", ""]
    for seg in segments:
        if seg["text"].strip():
            lines += [f"{vtt_time(seg['start'])} --> {vtt_time(seg['end'])}", seg["text"].strip(), ""]
    return "\n".join(lines)


def render_txt(paragraphs):
    return "\n\n".join(p["text"] for p in paragraphs) + "\n"


def render_md(meta, paragraphs, link_for=None):
    """Markdown com cabeçalho (título, autor, licença, links) e um parágrafo por trecho, com o tempo.
    `link_for(segundos)` (opcional) transforma o tempo em link para aquele ponto do episódio."""
    lines = [f"# {meta['title']}", ""]
    if meta.get("author"):
        lines.append(f"- **Autor / programa:** {meta['author']}")
    if meta.get("license"):
        lines.append(f"- **Licença:** <{meta['license']}>")
    if meta.get("episode_url"):
        lines.append(f"- **Ouça no Ondas:** <{meta['episode_url']}>")
    if meta.get("archive_url"):
        lines.append(f"- **Arquivo no Internet Archive:** <{meta['archive_url']}>")
    lines.append(f"- **Idioma:** {meta.get('language', DEFAULT_LANGUAGE)} · transcrição automática (faster-whisper {meta.get('model', DEFAULT_MODEL)}), pode conter erros")
    lines.append(f"- **Gerada em:** {dt.date.today().isoformat()}")
    lines += ["", "## Transcrição", ""]
    for p in paragraphs:
        stamp = f"[{mmss(p['start'])}]({link_for(p['start'])})" if link_for else f"[{mmss(p['start'])}]"
        lines += [f"**{stamp}** {p['text']}", ""]
    return "\n".join(lines)


def write_all(out_dir, base, segments, meta, link_for=None):
    """Grava <base>.vtt/.txt/.md em out_dir (escrita atômica) e devolve {'vtt': Path, 'txt': Path, 'md': Path}."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    paragraphs = to_paragraphs(segments)
    contents = {
        "vtt": render_vtt(segments),
        "txt": render_txt(paragraphs),
        "md": render_md(meta, paragraphs, link_for),
    }
    paths = {}
    for ext, text in contents.items():
        final = out_dir / f"{base}.{ext}"
        tmp = final.with_name(final.name + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(final)
        paths[ext] = final
    return paths


def load_model(name=DEFAULT_MODEL):
    from faster_whisper import WhisperModel  # import tardio: o resto do módulo não depende dele

    return WhisperModel(name, device="cpu", compute_type="int8")


def transcribe_file(audio_path, model, language=DEFAULT_LANGUAGE, on_progress=None):
    """Transcreve com um modelo já carregado. Devolve (segmentos, duração em s).
    on_progress(fim_do_segmento, duração) é chamado a cada segmento (para mostrar andamento)."""
    segments_iter, info = model.transcribe(str(audio_path), language=language, vad_filter=True)
    out = []
    for s in segments_iter:
        text = re.sub(r"\s+", " ", s.text).strip()
        if text:
            out.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": text})
        if on_progress:
            on_progress(s.end, info.duration)
    return out, info.duration
