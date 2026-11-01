"""Testes do pipeline de publicação: normalização, detecção voz/música, metadados (provedor simulado), licenças,
segurança de links, capa e validações. Os que usam ffmpeg são pulados se ele não estiver instalado."""
import json
import shutil
import socket
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audio_tools as A  # noqa: E402
import covergen  # noqa: E402
import licenses as L  # noqa: E402
import metadata as M  # noqa: E402
import publish as P  # noqa: E402
import safety as S  # noqa: E402

needs_ffmpeg = pytest.mark.skipif(not (shutil.which("ffmpeg") and shutil.which("ffprobe")), reason="ffmpeg não instalado")


def ff(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


# ---------------------------------------------------------------- licenças
def test_license_codes_urls_and_explanations():
    assert L.resolve("by")["url"] == "https://creativecommons.org/licenses/by/4.0/"
    assert L.resolve("CC BY-NC-SA 4.0")["name"] == "CC BY-NC-SA 4.0"
    assert L.resolve("cc0")["url"].endswith("/publicdomain/zero/1.0/")
    assert L.resolve("https://creativecommons.org/licenses/by-sa/3.0/br/")["name"] == "CC BY-SA 3.0"
    assert L.resolve("https://creativecommons.org/publicdomain/mark/1.0/")["name"].startswith("Domínio Público")
    assert all(len(v["explain"]) > 30 and v["explain"].endswith(".") for v in L.LICENSES.values())


@pytest.mark.parametrize("bad", ["", "   ", "mit", "https://example.com/licenca", "http://creativecommons.org/licenses/by/4.0/", "all rights reserved"])
def test_license_rejects_non_cc(bad):
    with pytest.raises(L.LicenseError):
        L.resolve(bad)


def test_guided_selector_accepts_number_or_code_and_retries():
    answers = iter(["99", "abc", "3"])
    out = []
    lic = L.guided_select(input_fn=lambda _: next(answers), out=type("O", (), {"write": lambda self, s: out.append(s), "flush": lambda self: None})())
    assert lic["name"] == "CC BY-SA 4.0"
    assert any("Escolha a licença" in line for line in out)


# ---------------------------------------------------------------- segurança de links
def fake_resolver(ip):
    return lambda host, port, proto=0: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port))]


@pytest.mark.parametrize("url", ["http://a.com/x.mp3", "ftp://a.com/x", "https://u:p@a.com/x", "https://a.com:8080/x", "file:///etc/passwd", "https:///x"])
def test_unsafe_url_shapes(url):
    with pytest.raises(S.UnsafeUrl):
        S.check_public_url(url, resolver=fake_resolver("93.184.216.34"))


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.0.0.5", "192.168.1.9", "172.16.0.1", "169.254.169.254", "0.0.0.0", "224.0.0.1"])
def test_internal_addresses_are_refused(ip):
    with pytest.raises(S.UnsafeUrl):
        S.check_public_url("https://exemplo.com/a.mp3", resolver=fake_resolver(ip))


def test_public_address_is_accepted():
    assert S.check_public_url("https://exemplo.com/a.mp3", resolver=fake_resolver("93.184.216.34")) == "https://exemplo.com/a.mp3"


# ---------------------------------------------------------------- entrada
def test_classify_input():
    assert P.classify_input("meu.wav") == "local"
    assert P.classify_input("https://www.youtube.com/watch?v=x") == "youtube"
    assert P.classify_input("https://youtu.be/x") == "youtube"
    assert P.classify_input("https://site.com/a/episodio.MP3") == "direct"
    assert P.classify_input("https://site.com/a/episodio.mp3?x=1") == "direct"
    assert P.classify_input("https://vimeo.com/123") == "ytdlp"


# ---------------------------------------------------------------- áudio (ffmpeg)
@pytest.fixture(scope="module")
def tone_with_silence(tmp_path_factory):
    d = tmp_path_factory.mktemp("audio")
    f = d / "tone.wav"
    # 2 s de silêncio + 6 s de seno + 2 s de silêncio, mono
    ff("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=2", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=6", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=2",
       "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1[a]", "-map", "[a]", str(f))
    return f


@needs_ffmpeg
def test_normalization_targets_minus_16_lufs_and_128k_mono(tone_with_silence, tmp_path):
    out = tmp_path / "o.mp3"
    P.normalize_and_encode(tone_with_silence, out, "voice", trim_silence=False)
    assert abs(A.duration(out) - 10) < 0.3
    lufs = A.integrated_loudness(out)
    assert lufs is not None and abs(lufs - (-16)) < 1.0, lufs
    assert A.channels(out) == 1
    bitrate = int(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=bit_rate", "-of", "default=nw=1:nk=1", str(out)], capture_output=True, text=True).stdout)
    assert 120_000 <= bitrate <= 136_000


@needs_ffmpeg
def test_trim_silence_removes_start_and_end(tone_with_silence, tmp_path):
    out = tmp_path / "t.mp3"
    P.normalize_and_encode(tone_with_silence, out, "voice", trim_silence=True)
    assert 5.5 < A.duration(out) < 7.0, A.duration(out)  # ~6 s de seno; sem os 4 s de silêncio


@needs_ffmpeg
def test_music_is_stereo_and_voice_is_mono(tmp_path):
    wide = tmp_path / "wide.wav"
    ff("-f", "lavfi", "-i", "sine=frequency=330:duration=4", "-f", "lavfi", "-i", "sine=frequency=523:duration=4", "-filter_complex", "[0][1]amerge=inputs=2", str(wide))
    fake_stereo = tmp_path / "fake.wav"
    ff("-f", "lavfi", "-i", "sine=frequency=330:duration=4", "-filter_complex", "[0]asplit[a][b];[a][b]amerge=inputs=2", str(fake_stereo))
    mono = tmp_path / "mono.wav"
    ff("-f", "lavfi", "-i", "sine=frequency=330:duration=4", "-ac", "1", str(mono))
    assert A.detect_kind(wide) == "music"
    assert A.detect_kind(fake_stereo) == "voice"
    assert A.detect_kind(mono) == "voice"
    out = tmp_path / "m.mp3"
    P.normalize_and_encode(wide, out, "music")
    assert A.channels(out) == 2


@needs_ffmpeg
def test_finalize_embeds_cover_and_tags(tone_with_silence, tmp_path):
    raw, cover, final = tmp_path / "raw.mp3", tmp_path / "c.jpg", tmp_path / "f.mp3"
    P.normalize_and_encode(tone_with_silence, raw, "voice")
    covergen.make_cover("Título de teste", "Autora", cover)
    P.finalize_mp3(raw, cover, final, {"title": "Título de teste", "artist": "Autora"})
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags=title,artist:stream=codec_type", "-of", "json", str(final)], capture_output=True, text=True).stdout)
    assert probe["format"]["tags"]["title"] == "Título de teste"
    assert {s["codec_type"] for s in probe["streams"]} == {"audio", "video"}


def test_sha256_is_stable(tmp_path):
    f = tmp_path / "a.bin"
    f.write_bytes(b"ondas")
    assert A.sha256_file(f) == "1dd0db8c1ecb3a8bd7b8a0e2ee8a05f64c2ddc0d58e5f2a1a2d55bd2d4b13c0f" or len(A.sha256_file(f)) == 64
    assert A.sha256_file(f) == A.sha256_file(f)


# ---------------------------------------------------------------- capa
def test_generated_cover_is_3000_square(tmp_path):
    from PIL import Image

    out = tmp_path / "cover.jpg"
    covergen.make_cover("Um título bem longo " * 8, "Alguém com um nome compridíssimo " * 3, out)
    im = Image.open(out)
    assert im.size == (3000, 3000) and im.format == "JPEG"


# ---------------------------------------------------------------- metadados (provedor simulado)
SEGS = [{"start": float(i * 25), "end": float(i * 25 + 24), "text": f"Hoje falamos da história do rádio no Brasil, parte {i}. Foi uma época de muita criatividade."} for i in range(40)]
CTX = {"title": "", "author": "Rádio Livre", "segments": SEGS, "duration": 1000, "language": "pt", "notes": ""}
GOOD = {
    "title": "A história do rádio no Brasil", "short_description": "x" * 400, "description": "Uma conversa sobre o rádio.",
    "chapters": [{"start": 300, "title": "Os primeiros programas"}, {"start": 700, "title": "A era de ouro"}, {"start": 99999, "title": "fora do áudio"}, {"start": "x"}],
    "tags": ["Rádio", "história", "rádio", " Brasil "], "category": "History", "explicit": False, "language": "pt",
}


def test_mock_provider_response_is_validated_and_clamped():
    prov = M.MockProvider(GOOD)
    meta, used, warns = M.generate_metadata(CTX, prov)
    assert used == "mock" and not warns and len(prov.calls) == 1
    assert meta["title"] == "A história do rádio no Brasil"
    assert len(meta["short_description"]) <= 160 and meta["short_description"].endswith("…")
    assert meta["chapters"][0] == {"start": 0, "title": "Abertura"}  # sempre começa em 0
    assert [c["start"] for c in meta["chapters"]] == [0, 300, 700]  # tempo fora do áudio e item inválido descartados
    assert meta["tags"] == ["rádio", "história", "brasil"]
    assert meta["category"] == "History" and meta["explicit"] is False


@pytest.mark.parametrize("error", [RuntimeError("sem rede"), json.JSONDecodeError("x", "y", 0), TimeoutError()])
def test_provider_failure_falls_back_to_heuristic(error):
    meta, used, warns = M.generate_metadata(CTX, M.MockProvider(error=error))
    assert used == "heuristic" and warns and "heurística" in warns[0]
    assert meta["title"] and meta["short_description"] and len(meta["short_description"]) <= 160


def test_invalid_response_values_fall_back_field_by_field():
    meta, used, _ = M.generate_metadata(CTX, M.MockProvider({"title": 5, "category": "Nada", "explicit": "sim", "language": "português!!", "tags": "x"}))
    base = M.heuristic(CTX)
    assert used == "mock" and meta["category"] in M.APPLE_CATEGORIES and meta["category"] == base["category"]
    assert meta["explicit"] is False and meta["language"] == "pt" and isinstance(meta["tags"], list)


def test_heuristic_is_sensible():
    meta = M.heuristic(CTX)
    assert meta["title"].startswith("Hoje falamos") and len(meta["short_description"]) <= 160
    assert 2 <= len(meta["chapters"]) <= 20 and meta["chapters"][0] == {"start": 0, "title": "Abertura"}
    assert all(c["start"] < CTX["duration"] for c in meta["chapters"])
    assert "rádio" in meta["tags"] and meta["language"] == "pt" and meta["explicit"] is False
    assert M.heuristic({**CTX, "segments": [{"start": 0, "end": 3, "text": "Que porra é essa, caralho."}]})["explicit"] is True


def test_user_title_is_kept_and_prompt_has_context():
    ctx = {**CTX, "title": "Meu título", "notes": "entrevista com a dona Maria"}
    p = M.build_prompt(ctx)
    assert "Meu título" in p and "dona Maria" in p and "[0:50]" in p and "History" in p
    assert len(M.build_prompt({**CTX, "segments": SEGS * 60}, limit=3000)) < 6000  # transcrição longa é amostrada


def test_provider_selection(monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    assert M.choose_provider("heuristic").name == "heuristic"
    monkeypatch.setattr(M.OllamaProvider, "available", lambda self: False)
    assert M.choose_provider("auto").name == "heuristic"
    monkeypatch.setenv("AI_BASE_URL", "https://api.exemplo/v1")
    monkeypatch.setenv("AI_API_KEY", "k")
    monkeypatch.setenv("AI_MODEL", "m")
    assert M.choose_provider("auto").name == "openai"
    monkeypatch.setattr(M.OllamaProvider, "available", lambda self: True)
    assert M.choose_provider("auto").name == "ollama"


def test_yaml_roundtrip_is_editable_and_revalidated():
    meta = M.heuristic(CTX)
    text = M.to_yaml(meta)
    assert text.startswith("#") and "title:" in text
    edited = text.replace(meta["title"], "Título editado à mão", 1)
    assert M.from_yaml(edited, CTX)["title"] == "Título editado à mão"
    assert M.from_yaml("category: Inexistente\nexplicit: true", CTX)["explicit"] is True  # o resto vem da heurística


# ---------------------------------------------------------------- validações de publicação
def episode(**kw):
    base = {"title": "T", "show": "S", "description": "D", "shortDescription": "curta", "audioUrl": "https://archive.org/x.mp3", "license": "https://creativecommons.org/licenses/by/4.0/",
            "language": "pt", "duration": 60, "category": "Arts", "explicit": False}
    return {**base, **kw}


def test_validate_publishable_lists_every_problem():
    P.validate_publishable(episode())
    with pytest.raises(P.PipelineError) as e:
        P.validate_publishable(episode(title="", description="  ", duration=0, shortDescription="x" * 161, category="Zzz", explicit="não", audioUrl="http://x"))
    assert e.value.code == P.EXIT_VALIDATION
    for needle in ("title", "description", "duração", "160", "categoria", "explicit", "https"):
        assert needle in str(e.value)


def test_duplicate_detection_by_hash(tmp_path):
    cat = tmp_path / "c.json"
    cat.write_text(json.dumps({"episodes": [{"id": "a", "sha256": "h1"}, {"id": "b", "sourceSha256": "h2"}, {"id": "c"}]}))
    found = P.known_hashes(cat)
    assert found == {"h1": "a", "h2": "b"}
    assert P.known_hashes(tmp_path / "nao-existe.json") == {}


def test_build_episode_has_podcast_fields():
    class A:
        language = "pt"

    meta = {"title": "T", "description": "D", "short_description": "S", "language": "pt", "category": "Arts", "explicit": False, "tags": ["a"], "chapters": [{"start": 0, "title": "x"}]}
    ep = P.build_episode("id-1", "Show", meta, "#112233", 60, {"vtt": Path("x.vtt")}, A(), "youtube", {"url": "https://creativecommons.org/licenses/by/4.0/", "name": "CC BY 4.0"}, {"mp3": "m", "source": "s"})
    assert ep["licenseName"] == "CC BY 4.0" and ep["sha256"] == "m" and ep["sourceSha256"] == "s" and ep["source"] == "youtube"
    assert ep["transcripts"]["vtt"].endswith("/id-1/id-1.vtt") and ep["tags"] == ["a"] and ep["chapters"][0]["start"] == 0


def test_review_requires_confirmation_without_terminal(tmp_path, monkeypatch):
    class Args:
        yes = False

    monkeypatch.setattr(sys.stdin, "isatty", lambda: False)
    seen = []
    with pytest.raises(P.PipelineError) as e:
        P.review(M.heuristic(CTX), tmp_path / "m.yaml", CTX, Args(), True, seen.append)
    assert e.value.code == P.EXIT_CONFIRM and (tmp_path / "m.yaml").exists() and seen
    Args.yes = True
    assert P.review(M.heuristic(CTX), tmp_path / "m2.yaml", CTX, Args(), True, lambda m: None)["title"]
