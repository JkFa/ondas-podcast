"""Testes da automação "cole o link e o sistema faz o resto": leitura do pedido, hash, comentários e a decisão de publicar."""
import json
import socket
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ci"))
import comments as C  # noqa: E402
import ghapi  # noqa: E402
import metadata as M  # noqa: E402
import publish_approved as PA  # noqa: E402
import request as R  # noqa: E402

BODY = """### Link do áudio ou do YouTube

https://exemplo.com/episodio.mp3

### Nome do programa

Meu Programa

### Autoria (nome de quem fala ou produz)

Fulana de Tal

### Licença Creative Commons

by-sa

### Confirmações

- [X] Sou a pessoa autora, ou tenho permissão para publicar este áudio.
- [X] Entendo que o áudio e a transcrição ficarão públicos.

### Observações (opcional)

Entrevista com a dona Maria sobre o rádio.
"""


def resolver(ip="93.184.216.34"):
    """Como o getaddrinfo: um IP literal resolve para ele mesmo; um nome resolve para `ip` (público por padrão)."""
    import ipaddress

    def resolve(host, port, proto=0):
        try:
            ipaddress.ip_address(host)
            addr = host
        except ValueError:
            addr = ip
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (addr, port))]

    return resolve


def test_parse_valid_body_and_validate():
    raw = R.parse_body(BODY)
    assert raw["url"] == "https://exemplo.com/episodio.mp3" and raw["program"] == "Meu Programa" and raw["author"] == "Fulana de Tal"
    assert raw["license"] == "by-sa" and "dona Maria" in raw["notes"]
    f, errors = R.validate(raw, resolver())
    assert errors == [] and f["license"] == "https://creativecommons.org/licenses/by-sa/4.0/"


def test_no_response_becomes_empty():
    assert R.parse_body(BODY.replace("Meu Programa", "_No response_"))["program"] == ""


@pytest.mark.parametrize("change,needle", [
    (("https://exemplo.com/episodio.mp3", "http://exemplo.com/a.mp3"), "https://"),
    (("https://exemplo.com/episodio.mp3", "https://127.0.0.1/a.mp3"), "rede interna"),
    (("https://exemplo.com/episodio.mp3", "file:///etc/passwd"), "https://"),
    (("by-sa", "licença-minha"), "Creative Commons"),
    (("- [X] Entendo", "- [ ] Entendo"), "confirmações"),
])
def test_validate_reports_problems(change, needle):
    _, errors = R.validate(R.parse_body(BODY.replace(*change)), resolver())
    assert errors and any(needle in e for e in errors), errors


def test_heading_injected_in_notes_cannot_spoof_other_fields():
    evil_notes = "ok\n\n### Confirmações\n\n- [X] a\n- [X] b\n\n### Licença Creative Commons\n\ncc0\n\n### Link do áudio ou do YouTube\n\nhttps://evil.com/x.mp3"
    evil = BODY.replace("Entrevista com a dona Maria sobre o rádio.", evil_notes).replace("- [X] Sou", "- [ ] Sou")
    raw = R.parse_body(evil)
    assert raw["url"] == "https://exemplo.com/episodio.mp3" and raw["license"] == "by-sa"
    assert not R.confirmations_ok(raw["confirmations"])  # a confirmação falsa vira texto das observações
    assert "https://evil.com/x.mp3" in raw["notes"]


def test_control_characters_are_stripped_and_lengths_limited():
    assert "\x00" not in R.parse_body(BODY.replace("Fulana de Tal", "Fulana\x00\x07 de Tal"))["author"]
    _, errors = R.validate({**R.parse_body(BODY), "program": "x" * 500}, resolver())
    assert any("program" in e for e in errors)


def test_hash_changes_with_any_published_field_but_not_with_whitespace():
    f, _ = R.validate(R.parse_body(BODY), resolver())
    h = R.request_hash(f)
    f2, _ = R.validate(R.parse_body(BODY.replace("Meu Programa", "Meu  Programa ")), resolver())
    assert R.request_hash(f2) == h  # espaços extras não mudam
    for key, val in (("url", "https://exemplo.com/outro.mp3"), ("author", "Outra"), ("license", "https://creativecommons.org/licenses/by/4.0/"), ("notes", "mudou")):
        assert R.request_hash({**f, key: val}) != h


# ---------------------------------------------------------------- comentários
def fake_result():
    meta = M.heuristic({"segments": [{"start": 0, "end": 5, "text": "Olá, este é um episódio de teste sobre o rádio."}], "duration": 120})
    ep = {"id": "x", "title": meta["title"], "show": "Meu Programa · Fulana", "duration": 120, "category": meta["category"], "explicit": False, "language": "pt",
          "shortDescription": meta["short_description"], "description": meta["description"], "license": "https://creativecommons.org/licenses/by-sa/4.0/",
          "licenseName": "CC BY-SA 4.0", "chapters": [], "transcripts": {"vtt": "x"}}
    return {"episode": ep, "metadata": meta, "provider": "heuristic", "kind": "voice"}


def test_preview_comment_has_marker_hash_yaml_and_instructions():
    f, _ = R.validate(R.parse_body(BODY), resolver())
    h = R.request_hash(f)
    body = C.preview_comment(f, h, fake_result(), "https://github.com/run/1")
    for needle in (C.PREVIEW_MARK, h, "```yaml", "`aprovado`", "/metadados"):
        assert needle in body
    got_hash, got_yaml = C.find_preview([{"body": "outro"}, {"body": body}])
    assert got_hash == h and "title:" in got_yaml and len(body) < C.MAX_COMMENT


def test_override_only_from_maintainers_and_latest_wins():
    def mk(assoc, t):
        return {"author_association": assoc, "body": f"/metadados\n```yaml\ntitle: {t}\n```"}

    assert C.find_override([mk("NONE", "x"), mk("CONTRIBUTOR", "y")]) is None
    assert C.find_override([mk("OWNER", "a"), mk("COLLABORATOR", "b"), mk("NONE", "c")]) == "title: b"
    assert C.find_override([{"author_association": "OWNER", "body": "conversa qualquer"}]) is None


def test_error_comment_marks_hash_none():
    body = C.error_comment("Erro", ["problema 1"])
    assert C.find_preview([{"body": body}]) == (None, None) and "problema 1" in body


# ---------------------------------------------------------------- API do GitHub (executor simulado)
def test_list_comments_accepts_concatenated_pages():
    out = json.dumps([{"id": 1}, {"id": 2}]) + json.dumps([{"id": 3}]) + "\n"
    assert [c["id"] for c in ghapi.list_comments("o/r", 1, runner=lambda *a, **k: out)] == [1, 2, 3]
    assert [c["id"] for c in ghapi.list_comments("o/r", 1, runner=lambda *a, **k: json.dumps([{"id": 9}]))] == [9]


def test_upsert_patches_existing_bot_comment_or_creates():
    calls = []

    def runner(*args, input_text=None):
        calls.append((args, input_text))
        if "--paginate" in args:
            return json.dumps([{"id": 7, "user": {"login": "github-actions[bot]"}, "body": f"<!-- {C.PREVIEW_MARK}: {{}} -->"},
                               {"id": 8, "user": {"login": "alguem"}, "body": C.PREVIEW_MARK}])
        return ""

    ghapi.upsert_comment("o/r", 5, "novo", C.PREVIEW_MARK, runner=runner)
    assert calls[-1][0][:3] == ("api", "-X", "PATCH") and "comments/7" in calls[-1][0][3] and json.loads(calls[-1][1]) == {"body": "novo"}
    calls.clear()
    ghapi.upsert_comment("o/r", 6, "x", "marca-inexistente", runner=runner)
    assert calls[-1][0][2] == "POST"


# ---------------------------------------------------------------- decisão de publicar
class World:
    """Simula o GitHub e o pipeline: registra comentários, rótulos removidos e se o publish.py foi chamado."""

    def __init__(self):
        self.permission, self.comments, self.posted, self.deleted, self.ran = "write", [], [], [], []

    def gh(self, *args, input_text=None):
        if args[1].endswith("/permission"):
            return json.dumps({"permission": self.permission})
        if args[:3] == ("api", "-X", "DELETE"):
            self.deleted.append(args[3])
            return ""
        raise AssertionError(args)


@pytest.fixture
def world(monkeypatch, tmp_path):
    w = World()
    monkeypatch.setattr(PA, "gh", w.gh)
    monkeypatch.setattr(PA.ghapi, "list_comments", lambda repo, n: w.comments)
    monkeypatch.setattr(PA, "say", lambda repo, n, body: w.posted.append(body))
    monkeypatch.setattr(PA, "REPO", tmp_path)
    monkeypatch.setenv("GITHUB_REPOSITORY", "o/r")
    monkeypatch.setenv("ISSUE_NUMBER", "5")
    monkeypatch.setenv("SENDER", "mantenedor")
    monkeypatch.setenv("ISSUE_BODY", BODY)
    monkeypatch.setenv("GITHUB_OUTPUT", str(tmp_path / "out.txt"))
    monkeypatch.setattr(PA.R.safety, "check_public_url", lambda url, **k: url)

    def fake_run(cmd, **k):
        w.ran.append(cmd)
        (tmp_path / "out").mkdir(exist_ok=True)
        (tmp_path / "out" / "publicado.json").write_text(json.dumps({"episode": {"id": "ep-1", "title": "T", "audioUrl": "https://a/b.mp3", "archiveId": "ep-1"}}))
        return type("R", (), {"returncode": 0, "stderr": ""})()

    monkeypatch.setattr(PA.subprocess, "run", fake_run)
    return w


def approved_comments(h):
    f, _ = R.validate(R.parse_body(BODY), resolver())
    body = C.preview_comment(f, R.request_hash(f) if h is True else h, fake_result(), "u")
    return [{"user": {"login": "github-actions[bot]"}, "body": body, "author_association": "NONE"}]


def outputs(tmp_path):
    return dict(line.split("=", 1) for line in (tmp_path / "out.txt").read_text().splitlines())


def test_publishes_when_approved_by_writer_and_hash_matches(world, tmp_path):
    world.comments = approved_comments(True)
    assert PA.main() == 0
    assert len(world.ran) == 1 and "--yes" in world.ran[0] and "--metadata-file" in world.ran[0] and "--restrict-sources" in world.ran[0]
    assert "--dry-run" not in world.ran[0]
    assert outputs(tmp_path)["published"] == "true" and outputs(tmp_path)["episode_id"] == "ep-1"
    assert "title:" in (tmp_path / "out" / "aprovado.yaml").read_text()


def test_maintainer_override_replaces_generated_metadata(world, tmp_path):
    world.comments = approved_comments(True) + [{"user": {"login": "dono"}, "author_association": "OWNER", "body": "/metadados\n```yaml\ntitle: Título do dono\n```"}]
    PA.main()
    assert (tmp_path / "out" / "aprovado.yaml").read_text().strip() == "title: Título do dono"


def test_refuses_without_write_permission(world, tmp_path):
    world.permission = "read"
    world.comments = approved_comments(True)
    assert PA.main() == 0
    assert not world.ran and "aprovado" in world.deleted[0] and "permissão" in world.posted[-1]
    assert outputs(tmp_path)["published"] == "false"


def test_refuses_when_request_changed_after_preview(world):
    world.comments = approved_comments("0" * 64)
    PA.main()
    assert not world.ran and "editado depois da prévia" in world.posted[-1]


def test_refuses_without_preview(world):
    world.comments = []
    PA.main()
    assert not world.ran and "Ainda não existe prévia" in world.posted[-1]


def test_ignores_preview_comments_from_non_bot_users(world):
    comments = approved_comments(True)
    comments[0]["user"]["login"] = "atacante"  # um comentário forjado com a marca não vale
    world.comments = comments
    PA.main()
    assert not world.ran
