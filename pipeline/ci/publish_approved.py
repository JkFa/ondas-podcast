#!/usr/bin/env python3
"""Etapa de PUBLICAÇÃO (workflow episodio-publicar.yml), disparada pelo rótulo `aprovado`.
Confere que quem aprovou tem permissão, que o pedido não mudou desde a prévia (hash) e publica com os metadados aprovados."""
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import comments  # noqa: E402
import request as R  # noqa: E402
import ghapi  # noqa: E402
from ghapi import gh  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
CAN_APPROVE = {"admin", "maintain", "write"}


say = ghapi.post_comment


def output(key, value):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"{key}={value}\n")


def refuse(repo, number, why):
    try:
        gh("api", "-X", "DELETE", f"repos/{repo}/issues/{number}/labels/aprovado")
    except RuntimeError:
        pass
    say(repo, number, f"## Publicação não feita\n\n{why}")
    output("published", "false")
    return 0


def main():
    repo, number, sender = os.environ["GITHUB_REPOSITORY"], os.environ["ISSUE_NUMBER"], os.environ["SENDER"]
    perm = json.loads(gh("api", f"repos/{repo}/collaborators/{sender}/permission")).get("permission")
    if perm not in CAN_APPROVE:
        return refuse(repo, number, f"@{sender} não tem permissão de escrita no repositório; só quem mantém o projeto pode aprovar.")
    f, errors = R.validate(R.parse_body(os.environ.get("ISSUE_BODY", "")))
    if errors:
        return refuse(repo, number, "O pedido tem problemas: " + "; ".join(errors))
    items = ghapi.list_comments(repo, number)
    bot = [c for c in items if c["user"]["login"] == "github-actions[bot]"]
    prev_hash, prev_yaml = comments.find_preview(bot)
    if not prev_hash or not prev_yaml:
        return refuse(repo, number, "Ainda não existe prévia deste pedido. Edite a Issue (ou reabra) para gerar a prévia e aplique `aprovado` de novo.")
    if prev_hash != R.request_hash(f):
        return refuse(repo, number, "O pedido foi **editado depois da prévia**. Espere a nova prévia (ela roda sozinha) e aprove de novo.")
    approved = comments.find_override(items) or prev_yaml
    yaml_path = REPO / "out" / "aprovado.yaml"
    yaml_path.parent.mkdir(exist_ok=True)
    yaml_path.write_text(approved + "\n", encoding="utf-8")
    out_json = REPO / "out" / "publicado.json"
    show = " · ".join(x for x in (f["program"], f["author"]) if x) or None
    cmd = [sys.executable, str(REPO / "pipeline" / "publish.py"), f["url"], "--license", f["license"], "--transcribe", "--transcribe-max-minutes", "90",
           "--max-minutes", "180", "--yes", "--restrict-sources", "--metadata-file", str(yaml_path), "--notes", f["notes"], "--json-out", str(out_json)]
    if show:
        cmd += ["--show", show]
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    sys.stderr.write(r.stderr[-6000:])
    if r.returncode not in (0, 18):  # 18 = enviado, mas o MP3 ainda não respondeu 200 (pode demorar): não é falha
        tail = " | ".join(l.strip("✗ ").strip() for l in r.stderr.splitlines() if l.strip())[-500:]
        output("published", "false")
        output("reason", tail.replace("\n", " "))
        return 1
    result = json.loads(out_json.read_text(encoding="utf-8"))
    output("published", "true")
    output("episode_id", result["episode"]["id"])
    output("title", result["episode"]["title"].replace("\n", " "))
    return 0


if __name__ == "__main__":
    sys.exit(main())
