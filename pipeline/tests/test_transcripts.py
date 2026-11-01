import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import transcribe_backlog as B  # noqa: E402
import transcripts as T  # noqa: E402


def seg(a, b, text):
    return {"start": a, "end": b, "text": text}


def test_vtt_time_and_mmss():
    assert T.vtt_time(3725.5) == "01:02:05.500"
    assert T.vtt_time(0.004) == "00:00:00.004"
    assert T.mmss(75) == "1:15"
    assert T.mmss(3725) == "1:02:05"


def test_paragraphs_break_on_pause_size_and_count():
    segs = [seg(0, 2, "Olá."), seg(2.2, 4, "Tudo bem?"), seg(9, 11, "Outra fala depois de uma pausa.")]
    p = T.to_paragraphs(segs)
    assert [x["text"] for x in p] == ["Olá. Tudo bem?", "Outra fala depois de uma pausa."]
    assert p[1]["start"] == 9
    many = [seg(i, i + 0.9, f"frase {i}.") for i in range(14)]
    assert [len(x["text"].split(". ")) for x in T.to_paragraphs(many, max_segments=6)] == [6, 6, 2]
    long = [seg(0, 1, "a" * 400), seg(1.1, 2, "b" * 400)]
    assert len(T.to_paragraphs(long, max_chars=600)) == 2


def test_empty_segments_are_ignored():
    assert T.to_paragraphs([seg(0, 1, "  "), seg(1, 2, "")]) == []
    assert T.render_vtt([seg(0, 1, " ")]) == "WEBVTT\n"


def test_render_vtt():
    out = T.render_vtt([seg(0, 1.5, "Oi"), seg(2, 3, "Tchau")])
    assert out.startswith("WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nOi\n")
    assert "00:00:02.000 --> 00:00:03.000\nTchau" in out


def test_render_md_has_header_and_timestamps():
    meta = {"title": "Título", "author": "Autora", "license": "https://creativecommons.org/publicdomain/zero/1.0/",
            "episode_url": "https://x/ep", "archive_url": "https://archive.org/details/x", "language": "pt", "model": "small"}
    md = T.render_md(meta, [{"start": 0, "end": 5, "text": "Primeiro."}, {"start": 65, "end": 70, "text": "Segundo."}])
    assert md.startswith("# Título")
    for needle in ("Autora", "creativecommons.org/publicdomain/zero/1.0/", "<https://x/ep>", "archive.org/details/x", "**[0:00]** Primeiro.", "**[1:05]** Segundo."):
        assert needle in md
    linked = T.render_md(meta, [{"start": 65, "end": 70, "text": "x"}], link_for=lambda t: f"https://x/ep?t={int(t)}")
    assert "**[1:05](https://x/ep?t=65)** x" in linked


def test_write_all_is_atomic_and_complete(tmp_path):
    paths = T.write_all(tmp_path, "ep1", [seg(0, 2, "Olá mundo.")], {"title": "T", "author": "A"})
    assert set(paths) == {"vtt", "txt", "md"}
    assert all(p.exists() for p in paths.values())
    assert not list(tmp_path.glob("*.tmp"))
    assert paths["txt"].read_text(encoding="utf-8") == "Olá mundo.\n"


def test_backlog_selection_priorities_and_filters():
    eps = [
        {"id": "a", "duration": 600, "series": "X"},
        {"id": "b", "duration": 60, "series": "X"},
        {"id": "c", "duration": 120, "series": "Y", "transcripts": {"vtt": "t.vtt"}},
        {"id": "d", "duration": 90, "transcript": [{"start": 0, "end": 1, "text": "x"}]},
        {"id": "e", "duration": 30},
    ]
    assert [e["id"] for e in B.select(eps)] == ["a", "b", "e"]
    assert [e["id"] for e in B.select(eps, shortest_first=True)] == ["e", "b", "a"]
    assert [e["id"] for e in B.select(eps, series="X")] == ["a", "b"]
    assert [e["id"] for e in B.select(eps, max_audio_minutes=2)] == ["b", "e"]
    assert [e["id"] for e in B.select(eps, ids=["e"])] == ["e"]
    assert len(B.select(eps, limit=1)) == 1


def test_backlog_selection_puts_already_generated_first(tmp_path):
    eps = [{"id": "a", "duration": 10}, {"id": "b", "duration": 10}]
    for x in ("vtt", "txt", "md"):
        (tmp_path / f"b.{x}").write_text("x")
    assert [e["id"] for e in B.select(eps, out_dir=tmp_path)] == ["b", "a"]


def test_register_updates_only_that_episode(tmp_path):
    path = tmp_path / "catalog.json"
    cat = {"schemaVersion": 1, "episodes": [{"id": "a"}, {"id": "b"}]}
    B.register(cat, path, {"id": "b"}, {"vtt": "transcripts/b.vtt"}, "pt")
    import json

    saved = json.loads(path.read_text(encoding="utf-8"))
    assert "transcripts" not in saved["episodes"][0]
    assert saved["episodes"][1]["transcripts"] == {"vtt": "transcripts/b.vtt", "language": "pt"}


def test_slugify_matches_the_front_end_rule():
    assert T.slugify("O Livro de Ruth") == "o-livro-de-ruth"
    assert T.slugify("Memórias Póstumas de Brás Cubas") == "memorias-postumas-de-bras-cubas"
    assert T.slugify("Era uma vez…") == "era-uma-vez"
    assert B.meta_for({"id": "x-01", "title": "T", "series": "O Livro de Ruth", "show": "LibriVox · A", "archiveId": "arq"}, "small", "pt")["episode_url"].endswith("#/livro/o-livro-de-ruth?ep=x-01")
