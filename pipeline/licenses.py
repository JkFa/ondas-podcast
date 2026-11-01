"""Licenças Creative Commons aceitas pelo Ondas, cada uma explicada em uma frase, e o seletor guiado."""
import json
import re
import sys
from pathlib import Path

BASE = "https://creativecommons.org"

# As licenças e suas explicações ficam em config/licenses.json, compartilhado com o site (formulário "Publique o seu episódio").
LICENSES = json.loads((Path(__file__).resolve().parent.parent / "config" / "licenses.json").read_text(encoding="utf-8"))

# URL de licença CC reconhecida (versões 1.0 a 4.0; inclui CC0 e a Marca de Domínio Público)
_URL = re.compile(
    r"^https://creativecommons\.org/(?:licenses/(by|by-sa|by-nc|by-nd|by-nc-sa|by-nc-nd)/(\d\.\d)/?(?:[a-z]{2})?/?|publicdomain/(zero|mark)/1\.0/?)$"
)
_ALIASES = {"cc-by": "by", "cc by": "by", "cc-by-sa": "by-sa", "cc by-sa": "by-sa", "cc-by-nc": "by-nc", "cc by-nc": "by-nc",
            "cc-by-nd": "by-nd", "cc by-nd": "by-nd", "cc-by-nc-sa": "by-nc-sa", "cc by-nc-sa": "by-nc-sa",
            "cc-by-nc-nd": "by-nc-nd", "cc by-nc-nd": "by-nc-nd", "cc-0": "cc0", "cc 0": "cc0", "cc0 1.0": "cc0"}


class LicenseError(ValueError):
    pass


def options_text():
    return "\n".join(f"  {k:9} {v['name']:14} {v['explain']}" for k, v in LICENSES.items())


def resolve(value):
    """Aceita um código ('by', 'cc-by', 'CC BY 4.0') ou uma URL do creativecommons.org. Devolve {'url','name'}."""
    v = (value or "").strip()
    if not v:
        raise LicenseError("licença Creative Commons obrigatória")
    key = re.sub(r"\s*4\.0$", "", v.lower()).strip()
    key = _ALIASES.get(key, key)
    if key in LICENSES:
        return {"url": LICENSES[key]["url"], "name": LICENSES[key]["name"]}
    m = _URL.match(v)
    if not m:
        raise LicenseError(f"'{v}' não é uma licença Creative Commons reconhecida. Opções:\n{options_text()}")
    if m.group(3):
        return {"url": v if v.endswith("/") else v + "/", "name": "CC0 1.0" if m.group(3) == "zero" else "Domínio Público (Marca CC PDM 1.0)"}
    return {"url": v if v.endswith("/") else v + "/", "name": f"CC {m.group(1).upper()} {m.group(2)}"}


def guided_select(input_fn=input, out=sys.stderr):
    """Seletor interativo: lista as licenças com uma frase cada e devolve a escolhida."""
    keys = list(LICENSES)
    print("\nEscolha a licença do episódio (Creative Commons):", file=out)
    for i, k in enumerate(keys, 1):
        print(f"  {i}. {LICENSES[k]['name']:14} {LICENSES[k]['explain']}", file=out)
    while True:
        raw = input_fn("Número (ou o código, ex.: by): ").strip()
        if raw.isdigit() and 1 <= int(raw) <= len(keys):
            return resolve(keys[int(raw) - 1])
        try:
            return resolve(raw)
        except LicenseError as e:
            print(f"  {e.args[0].splitlines()[0]}", file=out)
