"""Ferramentas de áudio do pipeline: voz ou música (detecção automática), corte de silêncio e hash."""
import hashlib
import re
import shutil
import subprocess
from pathlib import Path

# Corta o silêncio do começo e do fim (o fim usa o truque do areverse). Limiar de -50 dB.
TRIM_SILENCE = (
    "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
    "silenceremove=start_periods=1:start_threshold=-50dB,areverse"
)


def _tool(name):
    path = shutil.which(name)
    if not path:
        raise FileNotFoundError(name)
    return path


def channels(path):
    out = subprocess.run(
        [_tool("ffprobe"), "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return int(out.stdout.strip())
    except ValueError:
        return 1


def _mean_volume(path, pan):
    out = subprocess.run(
        [_tool("ffmpeg"), "-hide_banner", "-nostdin", "-i", str(path), "-vn", "-af", f"pan=mono|c0={pan},volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    m = re.search(r"mean_volume:\s*(-?[\d.]+|-inf) dB", out.stderr)
    return -91.0 if not m or m.group(1) == "-inf" else float(m.group(1))


def stereo_side_to_mid_db(path):
    """Quanto o sinal "lado" (L−R) é mais fraco que o "centro" (L+R), em dB. Muito negativo = estéreo falso (mono)."""
    mid = _mean_volume(path, "0.5*c0+0.5*c1")
    side = _mean_volume(path, "0.5*c0-0.5*c1")
    return side - mid


def detect_kind(path, mono_threshold_db=-25.0):
    """'voice' (MP3 128 kbps mono) ou 'music' (128 kbps joint stereo).
    Fonte mono, ou estéreo cujos canais são praticamente iguais, = voz; estéreo de verdade = música."""
    if channels(path) < 2:
        return "voice"
    return "voice" if stereo_side_to_mid_db(path) < mono_threshold_db else "music"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def duration(path):
    out = subprocess.run(
        [_tool("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def integrated_loudness(path):
    """Loudness integrado (LUFS) medido com ebur128; usado nos testes e na verificação."""
    out = subprocess.run(
        [_tool("ffmpeg"), "-hide_banner", "-nostdin", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", out.stderr)
    return float(m[-1]) if m else None
