# Ondas

Portal de podcasts independente, de **custo zero e sem servidor**: o áudio mora no
[Internet Archive](https://archive.org), o catálogo é um JSON versionado neste repositório
e o front (React + Tailwind v4) é estático.

```
gravar/baixar ──► pipeline/publish.py ──► archive.org (MP3, capa, VTT)
                         │
                         └─► JSON do episódio ──► web/public/catalog.json (ou modal "Importar")
                                                        │
                                                        └─► deploy estático (GitHub Pages / Cloudflare Pages)
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `pipeline/` | CLI Python: normaliza (loudnorm), codifica MP3, gera capa/cor, transcreve e publica. Veja `pipeline/README.md`. |
| `web/` | App Vite + React + Tailwind v4 (PWA leve). |
| `.github/workflows/deploy.yml` | Deploy automático no GitHub Pages. |

## Fluxo de publicação

1. **Gravar** (ou escolher um vídeo seu no YouTube).
2. **Publicar:** `python pipeline/publish.py ... --license <url>` (instalação em `pipeline/README.md`).
3. **Adicionar ao catálogo**, de uma destas formas:
   - colar o JSON impresso em `web/public/catalog.json` (dentro de `episodes`) e fazer commit — vale para todo mundo;
   - ou abrir o app → **+** → colar o JSON (ou digitar o identificador do archive.org) — fica só no seu navegador (localStorage).
     Use **Exportar catalog.json** para levar essa lista para o repositório depois.
4. **Deploy:** push na `main` publica via GitHub Actions.

### Schema do episódio (`schemaVersion: 1`)

```json
{
  "schemaVersion": 1,
  "id": "slug-unico",
  "title": "string",
  "show": "string",
  "description": "markdown simples (parágrafos, #, listas, **negrito**, *itálico*, [links](https://…))",
  "audioUrl": "https://archive.org/download/{identifier}/{arquivo}.mp3",
  "archiveId": "identifier",
  "cover": "https://archive.org/download/{identifier}/cover.jpg",
  "accentColor": "#rrggbb",
  "duration": 1234,
  "publishedAt": "ISO-8601",
  "chapters": [{ "start": 0, "title": "Abertura" }],
  "transcript": [{ "start": 0.0, "end": 4.2, "text": "..." }],
  "license": "https://creativecommons.org/licenses/by/4.0/",
  "source": "youtube|local"
}
```

`chapters` e `transcript` são opcionais. O catálogo é `{ "schemaVersion": 1, "episodes": [...] }`.
Episódios inválidos são ignorados com um aviso no console; um episódio importado com o mesmo `id` sobrescreve o da base.

## Desenvolvimento do front

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # saída em web/dist
```

Atalhos no desktop: **espaço** play/pause · **← / →** ∓15 s · **`<` / `>`** velocidade.
Progresso, favoritos, fila, velocidade, volume e episódios importados ficam em
`localStorage` (chaves `ondas:v1:*`).

## Feed RSS

`npm run build` também gera `dist/feed.xml` (RSS 2.0 com tags iTunes) a partir de
`web/public/catalog.json`, via `web/scripts/build-feed.mjs`. O tamanho de cada MP3
(`<enclosure length>`) é lido do archive.org no build. Em produção o feed fica em
`<site>/feed.xml`; a URL base vem de `SITE_URL` (ou, no GitHub Actions, de `GITHUB_REPOSITORY`).
Para ouvir em apps de podcast, adicione essa URL manualmente ("adicionar por URL"). Edite título,
descrição e idioma do canal em `CHANNEL` no script. O app também expõe o feed via `<link rel="alternate">`.

## Deploy

### GitHub Pages (recomendado)

1. No repositório: **Settings → Pages → Source: GitHub Actions**.
2. Faça push na `main`. O workflow `deploy.yml` compila com `VITE_BASE=/<nome-do-repo>/`
   e publica em `https://<usuario>.github.io/<nome-do-repo>/`.

Para um domínio próprio ou site de usuário (`<usuario>.github.io`), troque o valor de
`VITE_BASE` no workflow por `/`.

### Cloudflare Pages (alternativa)

Conecte o repositório e use:

- **Build command:** `cd web && npm ci && npm run build`
- **Build output directory:** `web/dist`
- Variável `NODE_VERSION=20`. Não defina `VITE_BASE` (o padrão `/` serve na raiz).

## Limitações conhecidas

- **MediaSession no iOS:** a tela de bloqueio mostra play/pause e ±15 s, mas `seekto`/faixas
  anterior-próxima variam por versão; em PWA instalado o áudio pode pausar ao bloquear a tela
  dependendo da versão do iOS.
- **Cor de destaque automática** depende de CORS do archive.org na capa; se o navegador bloquear,
  usa-se o tom neutro (ou o `accentColor` do catálogo).
- O archive.org às vezes responde 500 em arquivos isolados; o app tenta a capa de novo e o player oferece "Tentar novamente".
- Itens recém-enviados podem levar alguns minutos para ficarem disponíveis (o pipeline espera ~2 min).
- Os capítulos dos episódios de exemplo são ilustrativos; a transcrição de exemplo cobre só o primeiro minuto.

## Créditos dos episódios de exemplo

Gravações voluntárias do [LibriVox](https://librivox.org), em domínio público:
*O Alienista* (Machado de Assis), *Negrinha* (Monteiro Lobato), *Iracema* (José de Alencar) e
*Páginas Recolhidas* (Machado de Assis). Licenças e links estão no `license` de cada episódio.
