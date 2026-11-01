"""Comentários do robô na Issue: prévia (com o hash do pedido e os metadados em YAML), resultado e erros.
Também lê de volta a prévia e os ajustes de metadados feitos por quem mantém o projeto."""
import json
import re

PREVIEW_MARK = "ondas-previa"
MAX_COMMENT = 60000


def preview_comment(f, h, result, run_url, artifact_hint=True):
    """`result`: o JSON de `publish.py --json-out`. O bloco ```yaml pode ser copiado, editado e devolvido com /metadados."""
    ep, meta = result["episode"], result["metadata"]
    import metadata as M

    yaml_text = M.to_yaml(meta)
    lines = [
        f"<!-- {PREVIEW_MARK}: {json.dumps({'hash': h})} -->",
        "## Prévia do episódio",
        "",
        f"**{ep['title']}** — {ep['show']}",
        "",
        f"- Duração: {ep['duration'] // 60} min {ep['duration'] % 60:02d} s · {'música (estéreo)' if result['kind'] == 'music' else 'voz (mono)'} · licença {ep.get('licenseName', ep['license'])}",
        f"- Categoria: {ep['category']} · explícito: {'sim' if ep['explicit'] else 'não'} · idioma: {ep['language']}",
        f"- Capítulos: {len(ep.get('chapters', []))} · transcrição: {'sim' if ep.get('transcripts') else 'não'} · metadados por: {result['provider']}",
        f"- Descrição curta: {ep['shortDescription']}",
        "",
        "<details><summary>Descrição longa</summary>",
        "",
        ep["description"][:3000],
        "",
        "</details>",
        "",
        "### Metadados que serão publicados",
        "Para ajustar, comente `/metadados` seguido do YAML corrigido (num bloco ```yaml); o último comentário de quem mantém o projeto vale.",
        "",
        "```yaml",
        yaml_text.strip(),
        "```",
        "",
        f"Áudio já tratado (para ouvir antes de aprovar): [artefatos da execução]({run_url}) (é preciso estar logado no GitHub).",
        "",
        "**Para publicar:** quem mantém o projeto aplica o rótulo **`aprovado`**. Se você editar este pedido depois da prévia, será preciso uma nova prévia.",
        "",
        f"<sub>Pedido `{h[:12]}` · {f['url']}</sub>",
    ]
    text = "\n".join(lines)
    return text if len(text) <= MAX_COMMENT else text[:MAX_COMMENT - 200] + "\n```\n\n_(comentário truncado)_"


def error_comment(title, problems):
    return "\n".join([f"<!-- {PREVIEW_MARK}: {json.dumps({'hash': None})} -->", f"## {title}", ""] + [f"- {p}" for p in problems] +
                     ["", "Edite a Issue para corrigir; a prévia roda de novo sozinha."])


def result_comment(episode, site_url):
    page = f"{site_url}episodio/{episode['id']}/"
    return "\n".join([
        "## Publicado ✅", "",
        f"**{episode['title']}** já está no Internet Archive e entrou no catálogo.",
        f"- Áudio: {episode['audioUrl']}",
        f"- Página no Ondas (leva ~2–5 min para o site atualizar): {page}",
        f"- Item no archive.org: https://archive.org/details/{episode['archiveId']}",
        "", "O feed RSS e as páginas de compartilhamento são regenerados no próximo deploy.",
    ])


def failure_comment(run_url, reason):
    return f"## Não consegui publicar ❌\n\n{reason}\n\nDetalhes: [execução]({run_url}). Corrija o que for preciso e aplique o rótulo `aprovado` de novo."


def find_preview(comments):
    """Último comentário do robô com a marca de prévia → (hash, yaml) ou (None, None). `comments`: lista da API do GitHub."""
    for c in reversed(comments):
        m = re.search(rf"<!-- {PREVIEW_MARK}: (\{{.*?\}}) -->", c.get("body") or "")
        if m:
            h = json.loads(m.group(1)).get("hash")
            y = re.search(r"```yaml\n(.*?)\n```", c["body"], re.S)
            return h, (y.group(1) if y else None)
    return None, None


def find_override(comments, trusted=("OWNER", "MEMBER", "COLLABORATOR")):
    """YAML do último comentário `/metadados` de quem tem permissão (author_association confiável)."""
    for c in reversed(comments):
        body = (c.get("body") or "").strip()
        if body.startswith("/metadados") and c.get("author_association") in trusted:
            y = re.search(r"```(?:yaml|yml)?\n(.*?)\n```", body, re.S)
            if y:
                return y.group(1)
    return None
