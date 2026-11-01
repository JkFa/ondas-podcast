"""Pedido de publicação vindo do formulário de Issue (texto NÃO confiável): leitura, validação e hash.

O hash dos campos do pedido amarra a aprovação à prévia: se a Issue for editada depois da prévia, o hash muda e
a publicação é recusada (evita "aprovar uma coisa e publicar outra").
"""
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import licenses  # noqa: E402
import safety  # noqa: E402

# Ordem EXATA dos campos no formulário (.github/ISSUE_TEMPLATE/enviar-episodio.yml). "Observações" é o último e o único campo
# de texto livre com várias linhas: assim um "### ..." digitado nele nunca é tomado por outro campo (ver parse_body).
ORDER = [
    ("link do áudio ou do youtube", "url"),
    ("nome do programa", "program"),
    ("autoria", "author"),
    ("licença creative commons", "license"),
    ("confirmações", "confirmations"),
    ("observações", "notes"),
]
NO_RESPONSE = {"_no response_", "no response", ""}
MAX = {"url": 500, "program": 120, "author": 120, "notes": 1500}
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def parse_body(body):
    """Lê o markdown gerado pelo formulário ("### Rótulo\\n\\nresposta") e devolve {chave: texto}.
    Só aceita os rótulos na ordem do formulário: um "### Confirmações" escrito dentro das Observações (o último campo)
    não é aceito como campo, porque o "pos" já passou dele."""
    fields, pos = {}, -1
    for block in re.split(r"(?m)^### ", body or ""):
        if "\n" not in block:
            continue
        label, _, value = block.partition("\n")
        name = label.strip().lower().rstrip("*").split(" (")[0].strip()
        idx = next((i for i, (lab, _) in enumerate(ORDER) if lab == name), None)
        if idx is not None and idx > pos:
            pos = idx
            fields[ORDER[idx][1]] = "" if CONTROL.sub("", value).strip().lower() in NO_RESPONSE else CONTROL.sub("", value).strip()
        elif fields and pos >= 0:  # cabeçalho fora de ordem: faz parte do texto do campo anterior
            key = ORDER[pos][1]
            fields[key] = (fields[key] + "\n### " + CONTROL.sub("", block)).strip()
    return fields


def confirmations_ok(text):
    """Todas as caixas de confirmação marcadas ("- [X] ...") e pelo menos duas."""
    boxes = re.findall(r"(?m)^\s*- \[([ xX])\]", text or "")
    return len(boxes) >= 2 and all(b in "xX" for b in boxes)


def normalize(fields):
    f = {k: re.sub(r"\s+", " ", (fields.get(k) or "")).strip() for k in ("url", "program", "author", "license")}
    f["notes"] = (fields.get("notes") or "").strip()
    return f


def validate(fields, resolver=None):
    """Devolve (campos normalizados, lista de problemas em português)."""
    f = normalize(fields)
    errors = []
    for key, limit in MAX.items():
        if len(f[key]) > limit:
            errors.append(f"O campo '{key}' passa de {limit} caracteres.")
    if not f["url"]:
        errors.append("Faltou o link do áudio ou do YouTube.")
    else:
        try:
            safety.check_public_url(f["url"], **({"resolver": resolver} if resolver else {}))
        except safety.UnsafeUrl as e:
            errors.append(f"Link recusado: {e}.")
    try:
        f["license"] = licenses.resolve(f["license"])["url"]
    except licenses.LicenseError as e:
        errors.append(str(e).splitlines()[0] + " Use um destes códigos: " + ", ".join(licenses.LICENSES) + ".")
    if not confirmations_ok(fields.get("confirmations")):
        errors.append("É preciso marcar as confirmações de direitos e de publicação.")
    return f, errors


def request_hash(f):
    """SHA-256 dos campos que definem o que será publicado (ordem fixa, JSON canônico)."""
    canon = json.dumps({k: f.get(k, "") for k in ("url", "program", "author", "license", "notes")}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()
