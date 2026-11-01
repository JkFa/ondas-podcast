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
