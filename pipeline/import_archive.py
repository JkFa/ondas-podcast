#!/usr/bin/env python3
"""Ondas — importador do Internet Archive.

Transforma itens de áudio que JÁ estão no archive.org (audiolivros do LibriVox,
programas, coletâneas) em episódios do catálogo (web/public/catalog.json): um
item vira uma obra e cada MP3 vira uma parte (`series` + `part`).

Nada é copiado nem reenviado: o catálogo só aponta para os arquivos do archive.org.
Antes de gravar, cada URL de áudio e de capa é verificada (HEAD, 200 + tipo correto).

Exemplos:
  # itens específicos (identificador ou URL da página)
  python pipeline/import_archive.py dom_casmurro_2102_librivox https://archive.org/details/senhora_0910_librivox

  # os mais baixados do LibriVox em português que ainda não estão no catálogo
  python pipeline/import_archive.py --search --limit 10 --dry-run
  python pipeline/import_archive.py --search --limit 10
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import html
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SCHEMA_VERSION = 1
HERE = Path(__file__).resolve().parent
DEFAULT_CATALOG = HERE.parent / "web" / "public" / "catalog.json"
DEFAULT_QUERY = "collection:librivoxaudio AND language:por"
PD_URL = "https://librivox.org/pages/public-domain/"  # LibriVox só publica domínio público
UA = {"User-Agent": "ondas-importer/1.0 (+https://github.com/JkFa/ondas-podcast)"}
NEUTRAL_ACCENT = "#6d5dfc"
FORMAT_RANK = {"VBR MP3": 0, "128Kbps MP3": 1, "MP3": 2, "64Kbps MP3": 3}


def log(msg=""):
    print(msg, file=sys.stderr)


# --------------------------------------------------------------------------- rede
def fetch(url, tries=4):
    err = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read()
        except Exception as e:  # o archive.org responde 500/timeouts de vez em quando
            err = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"{url}: {err}")


def head_ok(url, prefix, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, method="HEAD", headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status == 200 and r.headers.get("Content-Type", "").startswith(prefix)
        except Exception:
            time.sleep(2 * (i + 1))
    return False


def metadata(identifier):
    return json.loads(fetch(f"https://archive.org/metadata/{identifier}"))


def search(query, rows):
    qs = urllib.parse.urlencode(
        [("q", query), ("fl[]", "identifier"), ("fl[]", "downloads"), ("rows", rows), ("sort[]", "downloads desc"), ("output", "json")]
    )
    data = json.loads(fetch(f"https://archive.org/advancedsearch.php?{qs}"))
    return [d["identifier"] for d in data["response"]["docs"]]


def parse_identifier(arg):
    """Aceita 'identificador' ou URL (/details/ID, /download/ID/...)."""
    m = re.search(r"archive\.org/(?:details|download|metadata)/([^/?#]+)", arg)
    return m.group(1) if m else arg.strip().strip("/")


# ------------------------------------------------------------------------ helpers
def slugify(s):
    import unicodedata

    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


_GENERIC_SUBJECTS = {"librivox", "audiobook", "audiobooks", "audio book", "audio books", "audio", "livro de áudio", "audiolivro", "audiolivros"}


def clean_subjects(raw, limit=12):
    """`subject` do archive.org (texto livre, `;` ou lista) → tags em minúsculas, sem as genéricas ("librivox", "audiobooks")."""
    items = raw if isinstance(raw, list) else [raw] if raw else []
    out = []
    for item in items:
        for tag in re.split(r"[;,]", str(item)):
            tag = re.sub(r"\s+", " ", tag).strip().strip(".").lower()
            if tag and tag not in _GENERIC_SUBJECTS and tag not in out and len(tag) <= 60:
                out.append(tag)
    return out[:limit]


def clean_description(raw):
    t = re.sub(r"<br\s*/?>", "\n", raw or "")
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    t = re.split(r"For further information", t)[0]
    t = re.sub(r"[ \t]+\n", "\n", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def seconds(value):
    if value in (None, ""):
        return 0
    value = str(value)
    if ":" in value:
        n = 0.0
        for p in value.split(":"):
            n = n * 60 + float(p)
        return int(round(n))
    return int(round(float(value)))


def natural_key(name):
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", name)]


def as_text(v):
    if isinstance(v, list):
        v = ", ".join(str(x) for x in v)
    return html.unescape(str(v or "")).strip()


def pick_parts(files):
    """Um MP3 por parte: agrupa variantes (_64kb etc.) e escolhe a melhor, preferindo o original."""
    groups = {}
    for f in files:
        fmt = f.get("format")
        if fmt not in FORMAT_RANK or not f["name"].lower().endswith(".mp3") or "/" in f["name"]:
            continue
        base = re.sub(r"_(?:64|128|256)kb", "", f["name"], flags=re.I)
        groups.setdefault(base, []).append(f)
    parts = []
    for base, variants in groups.items():
        best = min(variants, key=lambda f: FORMAT_RANK[f["format"]])
        info = next((v for v in variants if v.get("title")), best)  # título/duração podem estar só numa variante
        length = next((v["length"] for v in variants if v.get("length")), None)
        parts.append({"name": best["name"], "title": info.get("title"), "length": length, "track": info.get("track")})
    parts.sort(key=lambda p: natural_key(p["name"]))
    return parts


def pick_cover(files):
    jpgs = [f["name"] for f in files if f.get("format") == "JPEG" and "itemimage" not in f["name"] and "thumb" not in f["name"].lower() and "/" not in f["name"]]
    if jpgs:
        return sorted(jpgs, key=natural_key)[0]
    items = [f["name"] for f in files if f.get("format") == "Item Image"]
    return items[0] if items else None


def accent_from(url):
    try:
        from PIL import Image

        sys.path.insert(0, str(HERE))
        import publish  # reaproveita o mesmo cálculo de cor do pipeline de publicação

        return publish.accent_color(Image.open(io.BytesIO(fetch(url))))
    except Exception as e:
        log(f"    aviso: cor de destaque neutra ({e})")
        return NEUTRAL_ACCENT


def part_label(raw_title, series, n):
    t = re.sub(r"^\s*\d+\s*[-–.:]*\s*", "", raw_title or "").strip()
    if not t:
        return f"Parte {n}"
    return t


# ------------------------------------------------------------------- um item → episódios
class Skip(Exception):
    pass


def build_item(identifier, opts, existing_by_url):
    meta = metadata(identifier)
    m, files = meta.get("metadata") or {}, meta.get("files") or []
    if not files:
        raise Skip("item inexistente ou sem arquivos")
    if m.get("mediatype") != "audio":
        raise Skip(f"mediatype '{m.get('mediatype')}' (esperado: audio)")
    collections = m.get("collection") or []
    collections = [collections] if isinstance(collections, str) else collections
    is_librivox = "librivoxaudio" in collections
    license_url = (m.get("licenseurl") or "").replace("http://", "https://") or None
    if not license_url:
        if is_librivox:
            license_url = PD_URL
        elif not opts.allow_unlicensed:
            raise Skip("sem licenseurl (use --allow-unlicensed só se tiver certeza dos direitos)")

    parts = pick_parts(files)
    if not parts:
        raise Skip("nenhum MP3 encontrado")
    durations = [seconds(p["length"]) for p in parts]
    total_h = sum(durations) / 3600
    if opts.search:
        if len(parts) > opts.max_parts:
            raise Skip(f"{len(parts)} partes (limite {opts.max_parts})")
        if opts.max_hours and total_h > opts.max_hours:
            raise Skip(f"{total_h:.1f} h (limite {opts.max_hours})")
    if any(d == 0 for d in durations):
        raise Skip("alguma parte sem duração nos metadados")

    title = as_text(m.get("title")) or identifier
    series = opts.series or title
    creator = as_text(m.get("creator"))
    show = f"LibriVox · {creator}" if is_librivox and creator else (creator or "Internet Archive")
    base_id = re.sub(r"_librivox$", "", identifier).replace("_", "-").lower()
    base_id = re.sub(r"[^a-z0-9-]+", "-", base_id).strip("-")
    cover_name = pick_cover(files)
    cover = f"https://archive.org/download/{identifier}/{urllib.parse.quote(cover_name)}" if cover_name else None
    published = dt.datetime.strptime(m["publicdate"], "%Y-%m-%d %H:%M:%S").strftime("%Y-%m-%dT%H:%M:%SZ")
    description = clean_description(as_text(m.get("description")) if not isinstance(m.get("description"), list) else " ".join(m["description"]))

    urls = [f"https://archive.org/download/{identifier}/{urllib.parse.quote(p['name'])}" for p in parts]
    if not opts.no_verify:
        with cf.ThreadPoolExecutor(max_workers=4) as ex:
            results = list(ex.map(lambda u: head_ok(u, "audio/"), urls))
        bad = [u for u, ok in zip(urls, results) if not ok]
        if bad:
            raise Skip(f"{len(bad)} URL(s) de áudio não responderam 200 com audio/* (ex.: {bad[0]})")
        if cover and not head_ok(cover, "image/"):
            log(f"    aviso: capa não verificada, ficará sem capa ({cover})")
            cover = None

    previous = next((existing_by_url[u] for u in urls if u in existing_by_url), None)
    accent = previous["accentColor"] if previous and previous.get("accentColor") else (accent_from(cover) if cover else NEUTRAL_ACCENT)

    tags = clean_subjects(m.get("subject"))
    single = len(parts) == 1
    episodes = []
    for n, (p, url, dur) in enumerate(zip(parts, urls, durations), 1):
        old = existing_by_url.get(url)
        ep = {
            "schemaVersion": SCHEMA_VERSION,
            "id": old["id"] if old else (base_id if single else f"{base_id}-{n:02d}"),
            "title": title if single else (series if (lbl := part_label(p["title"], series, n)).lower() == series.lower() else f"{series} — {lbl}"),
            "show": show,
            "description": description if (n == 1 or not opts.slim) else f"Parte {n} de {len(parts)} de “{series}”, de {creator or 'autor desconhecido'}.",
            "audioUrl": url,
            "archiveId": identifier,
            **({"cover": cover} if cover else {}),
            "accentColor": accent,
            "duration": dur,
            "publishedAt": published,
            **({"license": license_url} if license_url else {}),
            **({"tags": tags} if n == 1 and tags else {}),  # assuntos do archive.org, só na 1ª parte (a obra inteira usa os dela)
            "source": "local",
        }
        if not single:
            ep["series"], ep["part"] = series, n
        if old:  # preserva o que foi curado à mão (título, descrição, capítulos, transcrição)
            for k in ("title", "description", "chapters", "transcript", "tags"):
                if k in old:
                    ep[k] = old[k]
        episodes.append(ep)
    return episodes, total_h


# ------------------------------------------------------------------------- catálogo
def load_catalog(path):
    if not path.exists():
        return {"schemaVersion": SCHEMA_VERSION, "episodes": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("episodes"), list):
        sys.exit(f"{path} não tem a lista 'episodes'; nada foi alterado.")
    return data


def merge(catalog, new_eps):
    by_id = {e["id"]: i for i, e in enumerate(catalog["episodes"])}
    added = replaced = 0
    for ep in new_eps:
        if ep["id"] in by_id:
            catalog["episodes"][by_id[ep["id"]]] = ep
            replaced += 1
        else:
            catalog["episodes"].append(ep)
            by_id[ep["id"]] = len(catalog["episodes"]) - 1
            added += 1
    return added, replaced


def slim_existing(catalog):
    """Partes 2..N de uma obra não precisam repetir a sinopse inteira (o livro usa a da parte 1)."""
    totals = {}
    for e in catalog["episodes"]:
        if e.get("series"):
            totals[e["series"]] = totals.get(e["series"], 0) + 1
    n = 0
    for e in catalog["episodes"]:
        if e.get("series") and e.get("part", 1) > 1 and len(e.get("description", "")) > 200:
            creator = e["show"].replace("LibriVox · ", "")
            e["description"] = f"Parte {e['part']} de {totals[e['series']]} de “{e['series']}”, de {creator}."
            n += 1
    return n


def write_catalog(path, catalog):
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


# ------------------------------------------------------------------------------ CLI
def parse_args(argv):
    p = argparse.ArgumentParser(
        prog="import_archive.py",
        description="Importa itens de áudio do Internet Archive para o catálogo do Ondas (um item = uma obra, cada MP3 = uma parte).",
    )
    p.add_argument("items", nargs="*", help="identificadores ou URLs de páginas do archive.org")
    p.add_argument("--search", action="store_true", help="busca no archive.org (padrão: LibriVox em português, mais baixados primeiro)")
    p.add_argument("--query", default=DEFAULT_QUERY, help=f"consulta do --search (padrão: {DEFAULT_QUERY!r})")
    p.add_argument("--limit", type=int, default=10, help="quantas obras NOVAS importar no --search (padrão 10)")
    p.add_argument("--max-parts", type=int, default=40, help="no --search, ignora obras com mais partes que isso (padrão 40)")
    p.add_argument("--max-hours", type=float, default=0, help="no --search, ignora obras mais longas que isso (0 = sem limite)")
    p.add_argument("--series", help="nome da obra (só com um identificador); padrão: título do item")
    p.add_argument("--catalog", default=str(DEFAULT_CATALOG), help="catalog.json a atualizar (padrão: web/public/catalog.json)")
    p.add_argument("--slim", action="store_true", help="partes 2..N com descrição curta (catálogo menor); aplica também às obras já existentes")
    p.add_argument("--allow-unlicensed", action="store_true", help="aceita itens fora do LibriVox sem licenseurl (confirme os direitos antes!)")
    p.add_argument("--no-verify", action="store_true", help="não verifica as URLs com HEAD (não recomendado)")
    p.add_argument("--dry-run", action="store_true", help="mostra o que seria importado, sem gravar")
    args = p.parse_args(argv)
    if not args.items and not args.search:
        p.error("informe identificadores/URLs ou use --search")
    if args.series and (len(args.items) != 1 or args.search):
        p.error("--series só vale com exatamente um identificador")
    return args


def main(argv=None):
    opts = parse_args(argv)
    path = Path(opts.catalog)
    catalog = load_catalog(path)
    existing_by_url = {e["audioUrl"]: e for e in catalog["episodes"]}
    known_items = {e.get("archiveId") for e in catalog["episodes"]}

    queue = [parse_identifier(i) for i in opts.items]
    if opts.search:
        log(f"Buscando: {opts.query}")
        # pede bastante além do limite: parte dos resultados já está no catálogo ou é descartada pelos filtros
        for ident in search(opts.query, max(opts.limit * 8, 50)):
            if ident not in known_items and ident not in queue:
                queue.append(ident)

    new_eps, done, skipped = [], [], []
    wanted = opts.limit if opts.search and not opts.items else None
    for ident in queue:
        if wanted is not None and len(done) >= wanted:
            break
        log(f"→ {ident}")
        try:
            eps, hours = build_item(ident, opts, existing_by_url)
        except Skip as e:
            log(f"    ignorado: {e}")
            skipped.append((ident, str(e)))
            continue
        except Exception as e:
            log(f"    erro: {e}")
            skipped.append((ident, f"erro: {e}"))
            continue
        new_eps += eps
        done.append((ident, eps[0]["title"] if len(eps) == 1 else eps[0].get("series"), len(eps), hours))
        log(f"    ok: {done[-1][1]} — {len(eps)} parte(s), {hours:.1f} h")

    log("\nResumo")
    for ident, name, n, h in done:
        log(f"  + {name}  ({ident}; {n} parte(s), {h:.1f} h)")
    for ident, why in skipped:
        log(f"  - {ident}: {why}")

    if opts.dry_run:
        log(f"\n--dry-run: {len(new_eps)} episódios de {len(done)} obra(s) seriam gravados em {path}. Nada foi alterado.")
        return 0
    if not new_eps and not opts.slim:
        log("\nNada a gravar.")
        return 1 if skipped else 0

    added, replaced = merge(catalog, new_eps)
    slimmed = slim_existing(catalog) if opts.slim else 0
    write_catalog(path, catalog)
    log(f"\nGravado em {path}: {added} episódio(s) novo(s), {replaced} atualizado(s)" + (f", {slimmed} descrição(ões) encurtada(s)" if opts.slim else "") + f". Total no catálogo: {len(catalog['episodes'])}.")
    log("Próximo passo: git add web/public/catalog.json && git commit && git push (o deploy publica o site e o feed).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log("Interrompido.")
        sys.exit(130)
