"""Guardas de segurança e de consistência dos workflows e do formulário de Issue."""
import re
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "ci"))
sys.path.insert(0, str(ROOT / "pipeline"))
import request as R  # noqa: E402


def load(p):
    return yaml.safe_load((ROOT / p).read_text(encoding="utf-8"))


PREVIEW = load(".github/workflows/episodio-previa.yml")
PUBLISH = load(".github/workflows/episodio-publicar.yml")
FORM = load(".github/ISSUE_TEMPLATE/enviar-episodio.yml")


def triggers(wf):
    return wf.get("on") or wf.get(True)  # PyYAML lê a chave `on:` como True


def steps(wf):
    return [s for job in wf["jobs"].values() for s in job["steps"]]


@pytest.mark.parametrize("wf", [PREVIEW, PUBLISH], ids=["previa", "publicar"])
def test_scripts_never_interpolate_github_expressions(wf):
    """Injeção de comandos: `${{ ... }}` dentro de `run:` seria executado como shell. Valores externos vão por `env:`."""
    for s in steps(wf):
        assert "${{" not in s.get("run", ""), f"expressão dentro de run: {s.get('name')}"


def test_preview_has_no_archive_credentials_and_minimal_permissions():
    text = (ROOT / ".github/workflows/episodio-previa.yml").read_text(encoding="utf-8")
    assert "IA_ACCESS_KEY" not in text and "IA_SECRET_KEY" not in text
    assert PREVIEW["permissions"] == {"contents": "read", "issues": "write"}
    assert set(triggers(PREVIEW)["issues"]["types"]) == {"opened", "edited", "reopened"}
    assert "enviar-episodio" in PREVIEW["jobs"]["previa"]["if"]
    assert PREVIEW["concurrency"]["cancel-in-progress"] is True


def test_publish_requires_the_approval_label_and_serializes_runs():
    assert triggers(PUBLISH)["issues"]["types"] == ["labeled"]
    cond = PUBLISH["jobs"]["publicar"]["if"]
    assert "github.event.label.name == 'aprovado'" in cond and "enviar-episodio" in cond
    assert PUBLISH["concurrency"] == {"group": "publicar-episodio", "cancel-in-progress": False}
    assert PUBLISH["permissions"]["contents"] == "write" and PUBLISH["permissions"]["actions"] == "write"


def test_publish_secrets_only_in_the_publish_step():
    users = [s["name"] for s in steps(PUBLISH) if "secrets.IA_" in str(s.get("env", {}))]
    assert users == ["Conferir a aprovação e publicar no Internet Archive"]


def test_publish_dispatches_deploy_because_token_pushes_do_not_trigger_workflows():
    run = next(s["run"] for s in steps(PUBLISH) if s.get("name", "").startswith("Gravar no catálogo"))
    assert "gh workflow run deploy.yml" in run and "git push origin HEAD:main" in run
    assert "workflow_dispatch" in (triggers(load(".github/workflows/deploy.yml")) or {})


def test_both_workflows_have_timeouts():
    assert PREVIEW["jobs"]["previa"]["timeout-minutes"] <= 120 and PUBLISH["jobs"]["publicar"]["timeout-minutes"] <= 180


def test_form_fields_match_the_parser_order_and_labels():
    """Se alguém renomear um campo do formulário sem atualizar request.ORDER, a leitura do pedido quebra em silêncio."""
    fields = [b for b in FORM["body"] if b["type"] != "markdown"]
    form_labels = [re.sub(r"\s*\(.*\)$", "", f["attributes"]["label"]).strip().lower() for f in fields]
    assert form_labels == [label for label, _ in R.ORDER]
    assert FORM["labels"] == ["enviar-episodio"]
    required = {f["id"] for f in fields if f.get("validations", {}).get("required")}
    assert {"link", "licenca"} <= required
    boxes = next(f for f in fields if f["id"] == "confirmacoes")["attributes"]["options"]
    assert len(boxes) >= 2 and all(o["required"] for o in boxes)
    assert fields[-1]["id"] == "observacoes" and fields[-1]["type"] == "textarea"  # único campo livre de várias linhas: o último


def test_form_roundtrip_with_a_github_style_body():
    body = "\n\n".join(f"### {f['attributes']['label']}\n\n{'- [X] ' + chr(10) + '- [X] ' if f['type'] == 'checkboxes' else 'valor ' + f['id']}" for f in FORM["body"] if f["type"] != "markdown")
    raw = R.parse_body(body)
    assert set(raw) == {k for _, k in R.ORDER}
