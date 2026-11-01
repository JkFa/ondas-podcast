"""Chamadas à API do GitHub pela CLI `gh` (já instalada nos runners; usa GH_TOKEN)."""
import json
import re
import subprocess


def gh(*args, input_text=None):
    r = subprocess.run(["gh", *args], capture_output=True, text=True, input=input_text)
    if r.returncode:
        raise RuntimeError(f"gh {' '.join(args[:2])}: {r.stderr.strip()[:300]}")
    return r.stdout


def list_comments(repo, number, runner=gh):
    """Todos os comentários da Issue. `--paginate` imprime vários arrays JSON colados; aceitamos os dois formatos."""
    out = runner("api", f"repos/{repo}/issues/{number}/comments", "--paginate")
    items = []
    dec = json.JSONDecoder()
    i = 0
    while i < len(out):
        if out[i].isspace():
            i += 1
            continue
        obj, i = dec.raw_decode(out, i)
        items += obj if isinstance(obj, list) else [obj]
    return items


def post_comment(repo, number, body, runner=gh):
    runner("api", "-X", "POST", f"repos/{repo}/issues/{number}/comments", "--input", "-", input_text=json.dumps({"body": body}))


def upsert_comment(repo, number, body, marker, bot="github-actions[bot]", runner=gh):
    """Atualiza o último comentário do robô com `marker` (ou cria): a Issue não enche de comentários a cada edição."""
    mine = [c for c in list_comments(repo, number, runner) if c["user"]["login"] == bot and marker in (c.get("body") or "")]
    if mine:
        runner("api", "-X", "PATCH", f"repos/{repo}/issues/comments/{mine[-1]['id']}", "--input", "-", input_text=json.dumps({"body": body}))
    else:
        post_comment(repo, number, body, runner)
