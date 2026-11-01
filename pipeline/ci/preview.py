#!/usr/bin/env python3
"""Etapa de PRÉVIA (workflow episodio-previa.yml): lê o pedido da Issue, roda o pipeline em --dry-run e comenta o resultado.
NÃO usa credenciais do archive.org. O corpo da Issue é texto não confiável: chega por variável de ambiente."""
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import comments  # noqa: E402
import ghapi  # noqa: E402
import request as R  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
EXPLAIN = {
    13: "Não consegui baixar o áudio. Se for um link do YouTube, saiba que o YouTube costuma bloquear downloads feitos de servidores na nuvem; use um link direto para o arquivo de áudio (.mp3, .m4a, .wav…) ou peça a quem mantém o projeto para publicar pelo terminal.",
    12: "O pedido não pôde ser lido (link, áudio ou licença).",
    14: "O áudio não pôde ser convertido (arquivo corrompido ou formato incomum).",
    19: "Este áudio já está no catálogo.",
    21: "Faltam campos obrigatórios do episódio.",
}


def main():
    repo, number = os.environ["GITHUB_REPOSITORY"], os.environ["ISSUE_NUMBER"]
    run_url = os.environ.get("RUN_URL", "")
    raw = R.parse_body(os.environ.get("ISSUE_BODY", ""))
    f, errors = R.validate(raw)
    if errors:
        ghapi.upsert_comment(repo, number, comments.error_comment("Não deu para ler o pedido", errors), comments.PREVIEW_MARK)
        print("pedido inválido:", errors)
        return 0
    h = R.request_hash(f)
    out_json = REPO / "out" / "preview.json"
    out_json.parent.mkdir(exist_ok=True)
    show = " · ".join(x for x in (f["program"], f["author"]) if x) or None
    cmd = [sys.executable, str(REPO / "pipeline" / "publish.py"), f["url"], "--license", f["license"], "--transcribe", "--transcribe-max-minutes", "90",
           "--max-minutes", "180", "--ai", "auto", "--dry-run", "--yes", "--restrict-sources", "--notes", f["notes"], "--json-out", str(out_json),
           "--catalog", str(REPO / "web" / "public" / "catalog.json")]
    if show:
        cmd += ["--show", show]
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    sys.stderr.write(r.stderr[-6000:])
    if r.returncode:
        tail = [l.strip("✗ ").strip() for l in r.stderr.splitlines() if l.strip()][-6:]
        reason = EXPLAIN.get(r.returncode, "Algo deu errado ao preparar o episódio.")
        ghapi.upsert_comment(repo, number, comments.error_comment("Não consegui preparar a prévia", [reason, "Detalhe técnico: `" + " | ".join(tail)[:500].replace("`", "'") + "`"]), comments.PREVIEW_MARK)
        return 0
    result = json.loads(out_json.read_text(encoding="utf-8"))
    ghapi.upsert_comment(repo, number, comments.preview_comment(f, h, result, run_url), comments.PREVIEW_MARK)
    print("prévia publicada na Issue", number)
    return 0


if __name__ == "__main__":
    sys.exit(main())
