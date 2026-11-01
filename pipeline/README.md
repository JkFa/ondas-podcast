# Pipeline de publicação

`publish.py` transforma uma gravação (arquivo local ou vídeo do YouTube) em um episódio
publicado no Internet Archive e imprime o JSON pronto para o catálogo do front.

## Instalação (Ubuntu)

```bash
sudo apt update && sudo apt install -y ffmpeg python3-venv

cd pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Opcional, para --transcribe (modelo `small` baixa ~460 MB na primeira execução):
pip install faster-whisper "av<17"

# Credenciais do Internet Archive (conta gratuita em archive.org):
ia configure
```

`ia configure` pede e-mail e senha e grava as chaves S3 em `~/.config/internetarchive/ia.ini`.
Sem elas, o script encerra com código 11 antes de processar qualquer coisa
(exceto com `--dry-run`/`--no-upload`, que não precisam de credenciais).

## Uso

```bash
# Arquivo local (voz: MP3 96 kbps mono)
python publish.py gravacao.wav --title "Episódio 1" --show "Meu Podcast" \
  --cover capa.jpg --license https://creativecommons.org/licenses/by/4.0/

# YouTube (título, descrição, capítulos e capa vêm do vídeo; --title sobrescreve)
python publish.py "https://www.youtube.com/watch?v=..." \
  --license https://creativecommons.org/licenses/by/4.0/ --transcribe

# Música: 128 kbps joint stereo
python publish.py faixa.m4a --title "Sessão ao vivo" --music --license <url>

# Testar sem enviar (arquivos ficam em ./out/<id>/)
python publish.py gravacao.wav --title "Teste" --license <url> --dry-run
```

| Opção | Efeito |
|---|---|
| `--license URL` | **Obrigatória.** Licença do conteúdo (ex.: CC BY 4.0). |
| `--title`, `--show`, `--description` | Metadados. `--title` é obrigatório em arquivos locais. |
| `--identifier slug` | Identificador no archive.org (sanitizado; recebe sufixo de data e, se já existir, `-2`, `-3`…). |
| `--cover img` | Capa; vira JPEG 1400×1400 (crop central). |
| `--music` | 128 kbps joint stereo em vez de voz 96 kbps mono. |
| `--transcribe` | Transcrição pt com faster-whisper; gera segmentos no JSON e um `.vtt`. |
| `--dry-run` | Faz tudo menos o upload e mostra o que seria enviado. |
| `--no-upload` | Igual ao dry-run, sem exigir credenciais; mantém os arquivos em `./out/<id>/`. |

> **Direitos autorais:** publique apenas conteúdo próprio ou com licença compatível com a
> informada em `--license`. O script imprime esse aviso ao receber URLs do YouTube.

## Etapas

1. Pré-checagem (ffmpeg, ffprobe, yt-dlp, `ia`, credenciais) → 2. licença → 3. download (yt-dlp) →
4. `loudnorm` em duas passadas (alvo −16 LUFS, TP −1.5, LRA 11) → 5. MP3 + ID3 + capa embutida →
6. capa 1400² e `accentColor` → 7. transcrição (opcional) → 8. identificador único →
9. upload com retry/backoff → 10. polling até a URL do MP3 responder 200.

Saída: a URL direta e o JSON do episódio em stdout (logs vão para stderr, então
`python publish.py ... > ep.json` captura só o JSON). Uma cópia fica em `./out/<id>.json`.

## Códigos de saída

| Código | Significado |
|---|---|
| 0 | Sucesso |
| 2 | Argumentos inválidos |
| 10 | Dependência ausente (ffmpeg, yt-dlp, `ia`, faster-whisper) |
| 11 | Credenciais do `ia` ausentes (`ia configure`) |
| 12 | Entrada inválida (arquivo/capa inexistente, licença inválida, falta `--title`) |
| 13 | Falha no download (yt-dlp) |
| 14 | Falha no ffmpeg (loudnorm/encode) |
| 15 | Falha ao processar a capa |
| 16 | Falha na transcrição |
| 17 | Falha no upload |
| 18 | MP3 não respondeu 200 em ~2 min (o item pode só estar demorando; tente a URL depois) |
| 130 | Interrompido (Ctrl+C) |

## Transcrições (`--transcribe` e `transcribe_backlog.py`)

`publish.py --transcribe [--whisper-model small] [--language pt]` transcreve com o faster-whisper (CPU, int8),
gera `<id>.vtt`, `<id>.txt` e `<id>.md` (o `.md` tem título, autor, licença, links e o tempo de cada parágrafo), envia
os três ao archive.org junto do MP3 e coloca `transcripts: {vtt, txt, md, language}` no JSON do episódio.

`transcribe_backlog.py` faz o mesmo para episódios já publicados e **pode ser interrompido e retomado**:
cada episódio concluído é gravado e registrado no `catalog.json` na hora; quem já tem arquivos só é registrado.

```bash
python pipeline/transcribe_backlog.py --dry-run --limit 5            # o que seria feito
python pipeline/transcribe_backlog.py --series "O Livro de Ruth"
python pipeline/transcribe_backlog.py --shortest-first --max-minutes 90   # orçamento de tempo
```

Os arquivos vão para `web/public/transcripts/` (padrão `--out`); com `--upload-own EMAIL` também são enviados ao
item do archive.org se ele foi enviado por esse e-mail (não testado com upload real: exige credenciais).
Testes (`python -m pytest pipeline/tests`) cobrem a geração de parágrafos, VTT/TXT/MD, escrita atômica e a seleção do backlog.

## Catálogo automático

Após um upload real, o episódio é gravado em `web/public/catalog.json` (inserido no fim de `episodes`, ou
substituído se o `id` já existir; escrita atômica). Se o arquivo estiver inválido, ele não é tocado e o
script só avisa — o JSON continua em `out/<id>.json` e no stdout. Opções: `--catalog ARQUIVO`, `--no-catalog`.
Depois: `git add web/public/catalog.json && git commit && git push` para publicar no site.

## Importar do Internet Archive (`import_archive.py`)

Traz para o catálogo obras que já estão no archive.org, sem baixar nem reenviar nada.

```bash
python pipeline/import_archive.py <identificador|URL> [...]          # itens específicos
python pipeline/import_archive.py --search --limit 10 --dry-run      # prévia do lote
python pipeline/import_archive.py --search --limit 10 --slim         # grava
```

| Opção | Efeito |
|---|---|
| `--search` / `--query Q` | busca (padrão `collection:librivoxaudio AND language:por`, mais baixados primeiro) e ignora o que já está no catálogo |
| `--limit N` | quantas obras novas importar na busca (10) |
| `--max-parts N`, `--max-hours H` | pula obras maiores que isso na busca (40 partes, sem limite de horas) |
| `--series NOME` | nome da obra (só com um identificador); padrão: título do item |
| `--slim` | partes 2..N com descrição curta; também encurta as obras já existentes |
| `--allow-unlicensed` | aceita item fora do LibriVox sem `licenseurl` (confirme os direitos!) |
| `--no-verify` | não verifica URLs (não recomendado) |
| `--dry-run` | mostra o plano e não grava |
| `--catalog ARQUIVO` | outro catalog.json |

Regras: precisa ser `mediatype: audio`; LibriVox é domínio público, os demais precisam de `licenseurl`;
cada parte é o melhor MP3 do arquivo (original antes de derivado); obra com uma parte só vira episódio
avulso (sem `series`); se alguma URL não responder 200 com `audio/*`, a obra inteira é ignorada (rode de
novo mais tarde: o archive.org falha às vezes). Reexecutar é seguro e preserva título, descrição,
capítulos e transcrição já curados.

## Schema do JSON

Contrato com o front (`web/src/lib/catalog.js`): `schemaVersion`, `id`, `title`, `show`,
`description`, `audioUrl`, `archiveId`, `cover`, `accentColor`, `duration`, `publishedAt`,
`license`, `source` e, opcionais, `chapters` (`[{start,title}]`), `transcripts` (`{vtt,txt,md,language}`) e
`transcript` (formato antigo: `[{start,end,text}]` dentro do catálogo). Detalhes no README da raiz.
