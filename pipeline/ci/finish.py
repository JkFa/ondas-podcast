#!/usr/bin/env python3
"""Fecha o ciclo na Issue: comenta o resultado (sucesso ou falha), troca os rótulos e, se deu certo, fecha a Issue."""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import comments  # noqa: E402
import ghapi  # noqa: E402

REPO = Path(__file__).resolve().parents[2]


def main(argv):
    mode = argv[1]
    repo, number = os.environ["GITHUB_REPOSITORY"], os.environ["ISSUE_NUMBER"]
    run_url = os.environ.get("RUN_URL", "")
    if mode == "success":
        owner, name = repo.split("/")
        site = f"https://{owner.lower()}.github.io/{name}/"
        episode = json.loads((REPO / "out" / "publicado.json").read_text(encoding="utf-8"))["episode"]
        ghapi.post_comment(repo, number, comments.result_comment(episode, site))
        ghapi.gh("api", "-X", "POST", f"repos/{repo}/issues/{number}/labels", "--input", "-", input_text=json.dumps({"labels": ["publicado"]}))
        ghapi.gh("api", "-X", "PATCH", f"repos/{repo}/issues/{number}", "--input", "-", input_text=json.dumps({"state": "closed", "state_reason": "completed"}))
    else:
        reason = os.environ.get("REASON", "").strip() or "Veja os detalhes na execução."
        if "Credenciais do Internet Archive ausentes" in reason:
            reason = "As credenciais do Internet Archive não estão configuradas neste repositório (secrets `IA_ACCESS_KEY` e `IA_SECRET_KEY`). Veja o README, seção “Publicar sem terminal”."
        ghapi.post_comment(repo, number, comments.failure_comment(run_url, reason[:600]))
        ghapi.gh("api", "-X", "POST", f"repos/{repo}/issues/{number}/labels", "--input", "-", input_text=json.dumps({"labels": ["erro-publicacao"]}))
        try:
            ghapi.gh("api", "-X", "DELETE", f"repos/{repo}/issues/{number}/labels/aprovado")
        except RuntimeError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
