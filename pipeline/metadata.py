"""Metadados do episódio gerados a partir da transcrição: título, descrições, capítulos, tags, categoria Apple,
conteúdo explícito e idioma. O provedor de IA é plugável:

  ollama   (padrão se estiver rodando; custo zero)  → OLLAMA_HOST (http://localhost:11434), OLLAMA_MODEL (llama3.2)
  openai   (qualquer API compatível com a da OpenAI, ex.: camadas gratuitas)  → AI_BASE_URL, AI_API_KEY, AI_MODEL
  heuristic (sem IA: primeiras frases, palavras mais frequentes, blocos de tempo)  → sempre disponível
  mock     (testes)

Qualquer falha da IA cai na heurística: o pipeline nunca para por falta de IA.
"""
import collections
import json
import os
import re
import urllib.error
import urllib.request

APPLE_CATEGORIES = [
    "Arts", "Business", "Comedy", "Education", "Fiction", "Government", "History", "Health & Fitness", "Kids & Family",
    "Leisure", "Music", "News", "Religion & Spirituality", "Science", "Society & Culture", "Sports", "Technology",
    "True Crime", "TV & Film",
]
STOPWORDS = set("""a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre entre até e ou mas que se
como mais menos muito muita muitos muitas já não sim ser estar ter haver foi era são está estão tem têm tinha isso isto aquilo esse essa
esses essas este esta estes estas aquele aquela eu tu ele ela nós vocês eles elas me te lhe nos lhes meu minha seu sua nosso nossa
então assim também quando onde porque porquê pois só ainda depois antes agora aqui ali lá cada todo toda todos todas outro outra
outros outras mesmo mesma coisa coisas fazer faz fez vai vão vou pode podem posso quer querem disse diz falar gente tipo né""".split())
PROFANITY = set("porra caralho merda foda foder puta buceta cacete viado cuzão".split())
CATEGORY_KEYWORDS = {
    "History": "história histórico século império guerra rei revolução antigo medieval colonial",
    "Religion & Spirituality": "deus bíblia igreja fé oração espiritual santo jesus religião sermão",
    "Science": "ciência científico pesquisa universo física química biologia experimento",
    "Technology": "tecnologia software computador internet programação código dados digital",
    "Business": "empresa negócio mercado dinheiro investimento carreira empreendedor vendas",
    "Education": "aula ensino escola estudo aprender professor educação universidade",
    "Arts": "arte literatura poesia livro romance escritor teatro pintura poema conto",
    "Music": "música banda canção show álbum melodia ritmo cantor",
    "Comedy": "piada humor engraçado risada comédia",
    "News": "notícia governo eleição política presidente jornal",
    "Health & Fitness": "saúde exercício dieta médico corpo sono mental terapia",
    "Sports": "futebol jogo campeonato time atleta esporte treino",
    "Kids & Family": "criança filhos família infantil brincadeira",
}


class MetadataError(ValueError):
    pass


# ---------------------------------------------------------------- texto
def _sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?…])\s+", text) if len(s.strip()) > 2]


def _clip(text, n):
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= n:
        return text
    cut = text[: n - 1].rsplit(" ", 1)[0].rstrip(" ,;:.-")
    return cut + "…"


def _mmss(sec):
    sec = int(sec)
    h, m, s = sec // 3600, sec % 3600 // 60, sec % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def transcript_text(segments):
    return " ".join(s["text"].strip() for s in segments if s["text"].strip())


def marked_transcript(segments, every=30):
    """Texto com marcas [mm:ss] a cada ~30 s, para a IA poder indicar o início dos capítulos."""
    out, last = [], -every
    for s in segments:
        if s["start"] - last >= every:
            out.append(f"\n[{_mmss(s['start'])}] ")
            last = s["start"]
        out.append(s["text"].strip() + " ")
    return "".join(out).strip()


# ---------------------------------------------------------------- heurística (sem IA)
def _title_from(sents):
    """Primeira frase, no máximo ~70 caracteres, cortada em palavra inteira e sem terminar em preposição/artigo."""
    if not sents:
        return "Novo episódio"
    first = re.split(r"[:;—–]| - ", sents[0])[0].strip()
    words = _clip(first, 70).rstrip("…").split()
    while len(words) > 3 and words[-1].lower().strip(",.") in STOPWORDS:
        words.pop()
    return " ".join(words).rstrip(" ,;:.") or "Novo episódio"


def heuristic(ctx):
    segs = ctx.get("segments") or []
    text = transcript_text(segs) or ctx.get("source_description") or ""
    sents = _sentences(text)
    title = ctx.get("title") or _title_from(sents)
    short = _clip(" ".join(sents[:2]) or title, 160)
    long_ = _clip(" ".join(sents[:6]), 600) if sents else title

    chapters = []
    if segs:
        total = ctx.get("duration") or segs[-1]["end"]
        block = max(180, min(480, total / 8))  # blocos de 3 a 8 minutos, no máximo ~8 capítulos
        next_t = 0.0
        for s in segs:
            if s["start"] >= next_t:
                label = _clip(_sentences(s["text"])[0] if _sentences(s["text"]) else s["text"], 60).rstrip("…")
                chapters.append({"start": int(s["start"]), "title": label})
                next_t = s["start"] + block
        if len(chapters) < 2 or total < 360:
            chapters = []
        else:
            chapters[0] = {"start": 0, "title": "Abertura"}
        chapters = chapters[:20]
    words = [w for w in re.findall(r"[a-záéíóúâêôãõçà]{5,}", text.lower()) if w not in STOPWORDS]
    tags = [w for w, _ in collections.Counter(words).most_common(8)]

    counts = {c: sum(text.lower().count(k) for k in kw.split()) for c, kw in CATEGORY_KEYWORDS.items()}
    best = max(counts, key=counts.get) if counts else None
    category = best if best and counts[best] >= 3 else "Society & Culture"
    explicit = any(w in PROFANITY for w in re.findall(r"[a-záéíóúâêôãõçà]+", text.lower()))
    return {
        "title": title, "short_description": short, "description": long_, "chapters": chapters,
        "tags": tags, "category": category, "explicit": explicit, "language": ctx.get("language") or "pt",
    }


# ---------------------------------------------------------------- validação do que a IA devolve
def validate(raw, ctx):
    """Normaliza a resposta (de IA ou não): limites de tamanho, tipos, categoria válida. Completa o que faltar com a heurística."""
    base = heuristic(ctx)
    if not isinstance(raw, dict):
        raise MetadataError("a resposta não é um objeto JSON")
    out = dict(base)
    if isinstance(raw.get("title"), str) and raw["title"].strip():
        out["title"] = _clip(raw["title"], 100)
    if isinstance(raw.get("short_description"), str) and raw["short_description"].strip():
        out["short_description"] = _clip(raw["short_description"], 160)
    if isinstance(raw.get("description"), str) and raw["description"].strip():
        out["description"] = _clip(raw["description"], 4000)
    if isinstance(raw.get("chapters"), list):
        total = ctx.get("duration") or float("inf")
        chapters = []
        for c in raw["chapters"]:
            try:
                start, title = int(c["start"]), str(c["title"]).strip()
            except (KeyError, TypeError, ValueError):
                continue
            if title and 0 <= start < total:
                chapters.append({"start": start, "title": _clip(title, 80)})
        chapters.sort(key=lambda c: c["start"])
        if chapters and chapters[0]["start"] != 0:
            chapters.insert(0, {"start": 0, "title": "Abertura"})
        out["chapters"] = chapters[:30] if len(chapters) >= 2 else []
    if isinstance(raw.get("tags"), list):
        tags = [re.sub(r"\s+", " ", str(t)).strip().lower() for t in raw["tags"] if str(t).strip()]
        out["tags"] = list(dict.fromkeys(tags))[:12] or base["tags"]
    if raw.get("category") in APPLE_CATEGORIES:
        out["category"] = raw["category"]
    if isinstance(raw.get("explicit"), bool):
        out["explicit"] = raw["explicit"]
    if isinstance(raw.get("language"), str) and re.fullmatch(r"[a-z]{2,3}(-[A-Za-z]{2,4})?", raw["language"]):
        out["language"] = raw["language"]
    return out


# ---------------------------------------------------------------- provedores
PROMPT = """Você é editor de podcasts. Com base na transcrição abaixo (com marcas de tempo [mm:ss]), responda SOMENTE com um objeto JSON com estas chaves:
- "title": título curto e claro em português (até 80 caracteres)
- "short_description": resumo de até 160 caracteres, para buscas e prévias em redes sociais
- "description": descrição longa (2 a 4 parágrafos curtos, texto simples)
- "chapters": lista de {{"start": segundos, "title": "título curto"}}, começando em 0, entre 3 e 15 capítulos, usando só tempos que aparecem nas marcas
- "tags": até 10 palavras-chave em minúsculas
- "category": uma destas categorias do Apple Podcasts: {categories}
- "explicit": true se houver palavrões ou conteúdo adulto, senão false
- "language": código do idioma (ex.: "pt")
Não invente fatos que não estejam na transcrição.
Título sugerido pela pessoa (pode estar vazio): {title}
Autor: {author}
Duração: {duration}
Observações da pessoa: {notes}

TRANSCRIÇÃO:
{transcript}
"""


def build_prompt(ctx, limit=14000):
    t = marked_transcript(ctx.get("segments") or []) or ctx.get("source_description") or ""
    if len(t) > limit:  # transcrições longas: começo, meio e fim
        third = limit // 3
        mid = len(t) // 2
        t = t[:third] + "\n[...]\n" + t[mid - third // 2: mid + third // 2] + "\n[...]\n" + t[-third:]
    return PROMPT.format(categories=", ".join(APPLE_CATEGORIES), title=ctx.get("title") or "", author=ctx.get("author") or "",
                         duration=_mmss(ctx.get("duration") or 0), notes=ctx.get("notes") or "", transcript=t)


def _post_json(url, payload, headers=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _extract_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise MetadataError("a IA não devolveu JSON")
    return json.loads(m.group(0))


class Provider:
    name = "base"

    def generate(self, ctx):  # devolve o dict bruto (sem validar)
        raise NotImplementedError


class HeuristicProvider(Provider):
    name = "heuristic"

    def generate(self, ctx):
        return heuristic(ctx)


class MockProvider(Provider):
    """Provedor simulado para testes: devolve o dict recebido (ou levanta o erro indicado)."""
    name = "mock"

    def __init__(self, response=None, error=None):
        self.response, self.error, self.calls = response, error, []

    def generate(self, ctx):
        self.calls.append(ctx)
        if self.error:
            raise self.error
        return self.response


class OllamaProvider(Provider):
    name = "ollama"

    def __init__(self, host=None, model=None):
        self.host = (host or os.environ.get("OLLAMA_HOST") or "http://localhost:11434").rstrip("/")
        self.model = model or os.environ.get("OLLAMA_MODEL") or "llama3.2"

    def available(self):
        try:
            urllib.request.urlopen(f"{self.host}/api/tags", timeout=1.5).read()
            return True
        except Exception:
            return False

    def generate(self, ctx):
        res = _post_json(f"{self.host}/api/generate", {"model": self.model, "prompt": build_prompt(ctx), "stream": False, "format": "json"}, timeout=300)
        return _extract_json(res.get("response", ""))


class OpenAICompatProvider(Provider):
    name = "openai"

    def __init__(self, base_url=None, api_key=None, model=None):
        self.base_url = (base_url or os.environ.get("AI_BASE_URL") or "").rstrip("/")
        self.api_key = api_key or os.environ.get("AI_API_KEY")
        self.model = model or os.environ.get("AI_MODEL")

    def available(self):
        return bool(self.base_url and self.api_key and self.model)

    def generate(self, ctx):
        res = _post_json(
            f"{self.base_url}/chat/completions",
            {"model": self.model, "messages": [{"role": "user", "content": build_prompt(ctx)}], "response_format": {"type": "json_object"}, "temperature": 0.3},
            headers={"Authorization": f"Bearer {self.api_key}"}, timeout=180,
        )
        return _extract_json(res["choices"][0]["message"]["content"])


def choose_provider(name="auto", env=None):
    """auto: Ollama local se estiver rodando; senão API compatível (variáveis de ambiente); senão heurística."""
    name = (name or "auto").lower()
    if name == "heuristic":
        return HeuristicProvider()
    if name == "ollama":
        return OllamaProvider()
    if name == "openai":
        return OpenAICompatProvider()
    ollama = OllamaProvider()
    if ollama.available():
        return ollama
    api = OpenAICompatProvider()
    return api if api.available() else HeuristicProvider()


def generate_metadata(ctx, provider):
    """Devolve (metadados validados, nome do provedor realmente usado, avisos)."""
    warnings = []
    if provider.name not in ("heuristic",):
        try:
            return validate(provider.generate(ctx), ctx), provider.name, warnings
        except Exception as e:  # rede, JSON inválido, limite de uso etc.: segue com a heurística
            warnings.append(f"IA ({provider.name}) indisponível: {e}; usando heurística")
    return validate(heuristic(ctx), ctx), "heuristic", warnings


# ---------------------------------------------------------------- YAML de revisão
def to_yaml(meta, extra=None):
    import yaml

    data = {**(extra or {}), **meta}
    header = "# Revise e edite os campos. Salve e feche o editor para continuar.\n# chapters: start em segundos. category: uma das categorias do Apple Podcasts.\n"
    return header + yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=100)


def from_yaml(text, ctx):
    import yaml

    data = yaml.safe_load(text) or {}
    return validate(data, ctx)
