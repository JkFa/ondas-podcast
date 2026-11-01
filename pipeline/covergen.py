"""Capa automática 3000×3000 no visual do Ondas (título, autor e onda), usada quando o episódio não tem capa."""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE = 3000
BG = (11, 11, 20)
SIGNAL = (198, 244, 50)
TEXT = (246, 246, 252)
MUTED = (154, 154, 184)
FONTS = Path(__file__).resolve().parent / "assets" / "fonts"


def _font(name, size):
    try:
        return ImageFont.truetype(str(FONTS / name), size)
    except OSError:  # fonte não encontrada: usa a padrão do Pillow (>= 10.1 aceita tamanho)
        return ImageFont.load_default(size=size)


def _wrap(draw, text, font, max_width, max_lines):
    lines, line = [], ""
    for word in text.split():
        test = f"{line} {word}".strip()
        if draw.textlength(test, font=font) > max_width and line:
            lines.append(line)
            line = word
        else:
            line = test
    if line:
        lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(" .,;:") + "…"
    return lines


def make_cover(title, author, dest, accent=(109, 93, 252)):
    img = Image.new("RGB", (SIZE, SIZE), BG)
    glow = Image.new("RGB", (SIZE, SIZE), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-400, -700, SIZE + 400, 1700), fill=tuple(int(c * 0.55) for c in accent))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(420)), 0.9)
    d = ImageDraw.Draw(img)

    # onda
    pts = [(x, 1180 + math.sin((x - 300) / (SIZE - 600) * math.pi * 4) * 150) for x in range(300, SIZE - 300 + 1, 6)]
    for x, y in pts:  # círculos ao longo da curva (joint="curve" deixa serrilhado nas dobras)
        d.ellipse((x - 22, y - 22, x + 22, y + 22), fill=SIGNAL)

    # título e autor
    f_title = _font("AtkinsonHyperlegible-Bold.ttf", 230)
    lines = _wrap(d, title, f_title, SIZE - 500, 5)
    y = 1560
    for line in lines:
        w = d.textlength(line, font=f_title)
        d.text(((SIZE - w) / 2, y), line, font=f_title, fill=TEXT)
        y += 270
    if author:
        f_auth = _font("AtkinsonHyperlegible-Regular.ttf", 130)
        a = _wrap(d, author, f_auth, SIZE - 600, 1)[0]
        w = d.textlength(a, font=f_auth)
        d.text(((SIZE - w) / 2, min(y + 40, 2560)), a, font=f_auth, fill=MUTED)

    f_brand = _font("AtkinsonHyperlegible-Bold.ttf", 110)
    w = d.textlength("ONDAS", font=f_brand)
    d.text(((SIZE - w) / 2, 330), "ONDAS", font=f_brand, fill=SIGNAL)
    img.save(dest, "JPEG", quality=90, optimize=True)
    return dest
