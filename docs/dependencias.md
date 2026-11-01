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
