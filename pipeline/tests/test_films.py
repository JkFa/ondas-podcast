"""Testes do catálogo de filmes: regras de elegibilidade (licença, ano, lista de exclusão), escolha do vídeo, legendas e coerência
entre config/films.json e web/public/films.json. Não usam a rede (o archive.org é simulado)."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import films as F  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CONFIG = json.loads((ROOT / "config" / "films.json").read_text(encoding="utf-8"))
CATALOG = json.loads((ROOT / "web" / "public" / "films.json").read_text(encoding="utf-8"))
GENRES = {"faroeste", "misterio", "comedia", "drama", "aventura", "guerra", "terror", "musical", "animacao", "documentario"}


# ---------------------------------------------------------------- licença
@pytest.mark.parametrize("url,kind,name", [
    ("http://creativecommons.org/publicdomain/mark/1.0/", "pd", "Domínio público"),
    ("http://creativecommons.org/licenses/publicdomain/", "pd", "Domínio público"),
    ("http://creativecommons.org/publicdomain/zero/1.0/", "cc", "CC0 1.0"),
    ("http://creativecommons.org/licenses/by/3.0/", "cc", "CC BY 3.0"),
    ("https://creativecommons.org/licenses/by-nc-nd/2.5/", "cc", "CC BY-NC-ND 2.5"),
])
def test_license_info_accepts_pd_and_cc(url, kind, name):
    assert F.license_info(url) == (kind, name)


@pytest.mark.parametrize("url", [None, "", "https://example.com/licenca", "all rights reserved", "http://creativecommons.org/about"])
def test_license_info_rejects_the_rest(url):
    assert F.license_info(url) == (None, None)


# ---------------------------------------------------------------- legendas
SRT = "1\r\n00:00:01,500 --> 00:00:03,000\r\n<i>Olá</i> & tchau\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,250\r\n\r\n\r\n3\r\n00:01:00,000 --> 00:01:02,000\r\nDois\r\nlinhas\r\n"


def test_srt_to_vtt_converts_times_drops_empty_cues_and_escapes():
    vtt = F.srt_to_vtt(SRT)
    assert vtt.startswith("WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nOlá &amp; tchau\n")
    assert "00:00:04.000" not in vtt  # bloco vazio
    assert "Dois\nlinhas" in vtt and vtt.count("-->") == 2


def test_guess_language_prefers_file_suffix_then_content():
    assert F.guess_language("qualquer coisa", "Filme.eng.srt") == "en"
    assert F.guess_language("x", "filme-fra.srt") == "fr"
    pt = "você não está aqui para isso mas eu que sou ela com uma casa para os dos meus " * 4
    en = "the man and you that was for this not are his her what your with have " * 4
    assert F.guess_language(pt, "filme.srt") == "pt"
    assert F.guess_language(en, "filme.srt") == "en"
    assert F.guess_language("curto demais", "filme.srt") is None
    assert F.guess_language("zzzz qqqq " * 40, "filme.srt") is None


def test_caption_candidates_prefer_human_over_asr_and_skip_legacy_encodings_and_folders():
    files = [{"name": n, "size": 1000} for n in ["f.asr.srt", "f.srt", "f-cs-1250.srt", "pasta/x.srt", "f.eng.srt", "f.mp4"]]
    files.append({"name": "gigante.srt", "size": 10_000_000})
    assert F.caption_candidates(files) == ["f.eng.srt", "f.srt", "f.asr.srt"]


# ---------------------------------------------------------------- vídeo
def mp4(name, fmt, size):
    return {"name": name, "format": fmt, "size": str(size), "length": "5400.0"}


def test_pick_video_prefers_light_derivative_and_offers_the_larger_h264_as_high():
    files = [mp4("a_512kb.mp4", "512Kb MPEG4", 300), mp4("a.mp4", "h.264", 900), mp4("a.ogv", "Ogg Video", 5), mp4("x/b.mp4", "h.264", 9999)]
    low, high = F.pick_video(files)
    assert low["name"] == "a_512kb.mp4" and high["name"] == "a.mp4"


def test_pick_video_falls_back_to_original_mpeg4_up_to_1_2_gb():
    assert F.pick_video([mp4("o.mp4", "MPEG4", 500_000_000)]) [0]["name"] == "o.mp4"
    assert F.pick_video([mp4("o.mp4", "MPEG4", 2_000_000_000)]) == (None, None)
    assert F.pick_video([mp4("o.ogv", "Ogg Video", 5)]) == (None, None)


# ---------------------------------------------------------------- elegibilidade (archive.org simulado)
def item(**over):
    meta = {"collection": [F.COLLECTION, "feature_films"], "mediatype": "movies", "title": "Um Filme", "year": "1935",
            "licenseurl": "http://creativecommons.org/publicdomain/mark/1.0/", "description": "<p>Drama de época.</p>", "subject": "drama; cinema"}
    meta.update(over)
    return {"metadata": meta, "files": [mp4("f_512kb.mp4", "512Kb MPEG4", 300_000_000), mp4("f.mp4", "h.264", 900_000_000)]}


@pytest.fixture
def archive(monkeypatch):
    state = {"data": item(), "head": True}
    monkeypatch.setattr(F.ia, "metadata", lambda ident: state["data"])
    monkeypatch.setattr(F.ia, "head_ok", lambda url, prefix, tries=3: state["head"])
    return state


def build(opts=None):
    return F.build_film("um_filme", {"genre": "drama", **(opts or {})}, 1955, ["sex", "nude"])


def test_eligible_film_gets_all_fields(archive):
    f = build({"language": "en", "warning": "period"})
    assert f["title"] == "Um Filme" and f["year"] == 1935 and f["rights"] == "pd" and f["licenseName"] == "Domínio público"
    assert f["video"]["url"] == "https://archive.org/download/um_filme/f_512kb.mp4" and f["hd"]["size"] == 900_000_000
    assert f["description"] == "Drama de época." and f["duration"] == 5400 and f["warning"] == "period"
    assert f["poster"] == "https://archive.org/services/img/um_filme" and f["archiveUrl"] == "https://archive.org/details/um_filme"


@pytest.mark.parametrize("meta,needle", [
    ({"licenseurl": None}, "sem licença"),
    ({"licenseurl": "https://example.com/x"}, "sem licença"),
    ({"year": "1956"}, "1956 > 1955"),
    ({"year": None, "date": None}, "sem ano"),
    ({"mediatype": "audio"}, "não é filme"),
    ({"collection": ["outra"]}, "fora da coleção"),
    ({"title": "Sex Madness"}, "exclusão"),
    ({"subject": "nude; drama"}, "exclusão"),
])
def test_ineligible_films_are_refused_with_a_reason(archive, meta, needle):
    archive["data"] = item(**meta)
    with pytest.raises(ValueError, match=needle):
        build()


def test_cc_license_is_accepted_after_1955_but_public_domain_is_not(archive):
    archive["data"] = item(year="1980", licenseurl="http://creativecommons.org/licenses/by/3.0/")
    assert build()["rights"] == "cc"
    archive["data"] = item(year="1980")
    with pytest.raises(ValueError, match="1980 > 1955"):
        build()


def test_deny_list_uses_whole_words_and_can_be_overridden(archive):
    archive["data"] = item(title="Essex Story", description="Sussex")
    assert build()["title"] == "Essex Story"  # "sex" dentro de outra palavra não conta
    archive["data"] = item(subject="nude")
    assert build({"allowDenied": True})["title"] == "Um Filme"


def test_broken_video_url_and_missing_mp4_are_refused(archive):
    archive["head"] = False
    with pytest.raises(ValueError, match="não responde"):
        build()
    archive["head"] = True
    archive["data"]["files"] = [mp4("f.ogv", "Ogg Video", 1)]
    with pytest.raises(ValueError, match="sem MP4"):
        build()


# ---------------------------------------------------------------- coerência dos arquivos do repositório
def test_config_entries_are_unique_and_well_formed():
    ids = [e["id"] for e in CONFIG["films"]]
    assert len(ids) == len(set(ids))
    for e in CONFIG["films"]:
        assert e["genre"] in GENRES, e["id"]
        assert e.get("warning") in (None, "period", "violence", "war", "graphic"), e["id"]
        assert isinstance(e.get("year"), int) and e["year"] > 1880, e["id"]
    assert CONFIG["maxYear"] == 1955


def test_published_catalog_respects_the_rights_rule():
    assert CATALOG["films"], "catálogo vazio"
    slugs = [f["slug"] for f in CATALOG["films"]]
    assert len(slugs) == len(set(slugs))
    config_ids = {e["id"] for e in CONFIG["films"]}
    for f in CATALOG["films"]:
        assert f["id"] in config_ids, f"{f['id']} no catálogo mas fora da curadoria"
        assert f["rights"] in ("pd", "cc")
        if f["rights"] == "pd":
            assert f["year"] <= CONFIG["maxYear"], f"{f['id']} ({f['year']}) é domínio público fora do limite"
        assert f["license"].startswith("http") and f["video"]["url"].startswith("https://archive.org/download/")
        assert f["genre"] in GENRES
        for c in f["captions"]:
            assert (ROOT / "web" / "public" / c["src"]).exists(), c["src"]
            assert c["lang"] in ("pt", "en")


def test_no_denied_word_in_published_titles():
    deny = {w.lower() for w in CONFIG["deny"]}
    for f in CATALOG["films"]:
        if next((e for e in CONFIG["films"] if e["id"] == f["id"]), {}).get("allowDenied"):
            continue
        assert not (set(f["title"].lower().split()) & deny), f["title"]
