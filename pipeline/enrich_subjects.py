#!/usr/bin/env python3
"""Acrescenta `tags` (assuntos do archive.org) às obras que já estão no catálogo, sem tocar no resto.

Uso:  python pipeline/enrich_subjects.py [--catalog web/public/catalog.json] [--dry-run]
As tags alimentam as páginas de gênero do site (regras em config/genres.json). Só a 1ª parte de cada obra recebe as tags.
Obras que já têm `tags` são puladas; os assuntos vêm de https://archive.org/metadata/<id>/metadata.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_archive as ia  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--catalog", default=str(ROOT / "web" / "public" / "catalog.json"))
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)
    path = Path(args.catalog)
    catalog = json.loads(path.read_text(encoding="utf-8"))
    firsts = {}
    for ep in catalog["episodes"]:
        if ep.get("archiveId") and ep["archiveId"] not in firsts:
            firsts[ep["archiveId"]] = ep
    changed = 0
    for i, (ident, ep) in enumerate(firsts.items(), 1):
        if ep.get("tags"):
            continue
        try:
            subjects = (json.loads(ia.fetch(f"https://archive.org/metadata/{ident}/metadata")).get("result") or {}).get("subject")
        except Exception as e:  # noqa: BLE001 - rede instável: segue com as outras obras
            print(f"  [{i}/{len(firsts)}] {ident}: falhou ({e})", file=sys.stderr)
            continue
        tags = ia.clean_subjects(subjects)
        if tags:
            ep["tags"] = tags
            changed += 1
        print(f"  [{i}/{len(firsts)}] {ident}: {', '.join(tags) or '(sem assuntos)'}", file=sys.stderr)
    print(f"{changed} obras com tags novas", file=sys.stderr)
    if changed and not args.dry_run:
        ia.write_catalog(path, catalog)
    return 0


if __name__ == "__main__":
    sys.exit(main())
