# Dependências adicionadas no Ondas v2

Todas de código aberto, sem custo e sem serviço externo em produção (as de teste só rodam em desenvolvimento e no CI).

## Fase 1 — Acessibilidade

| Pacote | Uso | Licença |
|---|---|---|
| `@fontsource/atkinson-hyperlegible` | fonte de legibilidade, auto-hospedada (só baixa se a pessoa escolher) | OFL-1.1 |
| `@fontsource/opendyslexic` | fonte para dislexia, auto-hospedada | OFL-1.1 |
| `vitest` (dev) | testes unitários | MIT |
| `playwright` (dev) | navegador nos testes e2e | Apache-2.0 |
| `@axe-core/playwright` (dev) | auditoria WCAG automática | MPL-2.0 |
| `@lhci/cli` (dev) | Lighthouse no CI | Apache-2.0 |

Serviço de terceiros opcional: **VLibras** (`vlibras.gov.br`, widget do governo federal), carregado só se a pessoa ativar no painel.

## Fase 2 — Transcrições

Nenhuma dependência nova no front. No pipeline, `faster-whisper` (MIT) e `av<17` já eram opcionais; entram:

| Pacote | Uso | Licença |
|---|---|---|
| `pytest` (dev, Python) | testes do pipeline | MIT |

O modelo do Whisper (`small`, da Systran no Hugging Face, licença MIT) é baixado na primeira execução e fica em cache local; não vai para o repositório.

## Fase 3 — Compartilhamento

| Pacote | Uso | Licença |
|---|---|---|
| `simple-icons` | logos de WhatsApp, X, Facebook, Telegram, Threads, Bluesky, Instagram e TikTok (só os usados entram no bundle: o pacote é `sideEffects: false`) | CC0-1.0 (os logos são marcas dos respectivos donos; ver o DISCLAIMER do pacote) |

Não há SDK de nenhuma rede: os botões são links de compartilhamento comuns, sem rastreadores.

## Fase 4 — Ouvir sem internet

| Pacote | Uso | Licença |
|---|---|---|
| `vite-plugin-pwa` (dev) | gera o service worker (modo injectManifest) e o registro | MIT |
| `workbox-window`, `workbox-core`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response`, `workbox-range-requests` | cache do app, rotas e resposta a Range no `src/sw.js` | MIT |
| `@fontsource-variable/inter`, `@fontsource-variable/bricolage-grotesque` | fontes auto-hospedadas (só os subconjuntos latin e latin-ext), no lugar do Google Fonts | OFL-1.1 |

Sem serviço externo: todo o armazenamento é local (Cache Storage + localStorage).

## Fase 5 — Assinar no app

| Pacote | Uso | Licença |
|---|---|---|
| `qrcode-generator` | QR code do feed, gerado no navegador | MIT |
| `jsqr` (dev) | decodifica o QR nos testes e2e | Apache-2.0 |
| `simple-icons` (já existente) | logos de Apple Podcasts, Overcast, Pocket Casts, AntennaPod, Castro, Podcast Addict, Castbox, Spotify, YouTube Music e Deezer | CC0-1.0 (marcas dos donos) |

Sem SDK de nenhum app: tudo são links e esquemas de URL.

## Fase 6 — Publicar sem terminal

| Componente | Uso | Licença |
|---|---|---|
| `PyYAML` (pipeline) | metadados editáveis em `metadata.yaml` | MIT |
| `fast-xml-parser` (dev) | validador dos feeds RSS (`scripts/validate-feed.mjs`) | MIT |
| Atkinson Hyperlegible (arquivos `.ttf` em `pipeline/assets/fonts/`) | texto das capas geradas | OFL-1.1 (`OFL.txt` junto) |
| Ollama / API compatível com a da OpenAI | opcionais; só se você configurar `AI_*` ou rodar o Ollama | conforme o provedor |

GitHub Actions, formulários de Issue e a CLI `gh` são recursos do próprio GitHub (gratuitos em repositório público).
