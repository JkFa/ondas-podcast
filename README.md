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

## Trazer obras que já estão no Internet Archive

Para encher a biblioteca com audiolivros e programas que **já existem** no archive.org (sem baixar nem
reenviar nada), use o importador. Um item do archive.org vira uma obra e cada MP3 vira uma parte:

```bash
source .venv/bin/activate        # ambiente do pipeline (ver pipeline/README.md)

# itens específicos: identificador ou URL da página
python pipeline/import_archive.py dom_casmurro_2102_librivox https://archive.org/details/senhora_0910_librivox

# em lote: os mais baixados do LibriVox em português que ainda não estão no catálogo
python pipeline/import_archive.py --search --limit 10 --dry-run   # só mostra o plano
python pipeline/import_archive.py --search --limit 10 --slim      # grava (sinopse só na parte 1)

git add web/public/catalog.json && git commit -m "feat: novas obras" && git push   # o deploy publica
```

Ele confere a licença (LibriVox = domínio público; fora dele exige `licenseurl`), verifica cada URL de
áudio e capa com HEAD, calcula a cor de destaque da capa e só grava obras completas. Obras muito longas
são puladas na busca (`--max-parts`, `--max-hours`); itens citados pelo nome entram sempre. Rodar de novo é
seguro: entradas existentes mantêm título, descrição, capítulos e transcrição. Outra consulta:
`--query 'collection:librivoxaudio AND language:eng'`. Detalhes em `pipeline/README.md`.

## Fluxo de publicação (conteúdo seu)

1. **Gravar** (ou escolher um vídeo seu no YouTube).
2. **Publicar:** `python pipeline/publish.py ... --license <url>` (instalação em `pipeline/README.md`).
3. **Adicionar ao catálogo:** depois de um upload real, o `publish.py` já insere o episódio em
   `web/public/catalog.json` (ou troca a entrada de mesmo `id`); basta fazer commit e push. Use `--no-catalog`
   para pular ou `--catalog ARQUIVO` para outro destino. `--dry-run` e `--no-upload` nunca mexem no catálogo.
   Sem o pipeline, dá para:
   - colar o JSON em `web/public/catalog.json` (dentro de `episodes`) e fazer commit — vale para todo mundo;
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
  "transcripts": { "vtt": "transcripts/<id>.vtt", "txt": "...", "md": "...", "language": "pt" },
  "transcript": [{ "start": 0.0, "end": 4.2, "text": "..." }],
  "license": "https://creativecommons.org/licenses/by/4.0/",
  "licenseName": "CC BY 4.0",
  "shortDescription": "uma ou duas frases (resumo do feed)",
  "category": "categoria do Apple Podcasts",
  "explicit": false,
  "language": "pt",
  "tags": ["tema", "assunto"],
  "sha256": "hash do MP3 publicado",
  "sourceSha256": "hash do áudio original (evita duplicatas)",
  "source": "youtube|local"
}
```

`chapters`, `transcripts` (URLs dos arquivos de transcrição, absolutas ou relativas ao site), `transcript` (formato antigo, com os segmentos dentro do catálogo), `series` (nome da obra, vira filtro no app) e `part` (ordem dentro da obra) são opcionais, assim como `licenseName`, `shortDescription`, `category`, `explicit`, `language`, `tags`, `sha256` e `sourceSha256` (gerados pelo pipeline a partir da Fase 6; os tipos são validados). O catálogo é `{ "schemaVersion": 1, "episodes": [...] }`.

Ao terminar um episódio, o player toca o próximo da fila; sem fila, segue para a próxima `part` da mesma `series` (audiolivros tocam em sequência). Na última parte, para.

Episódios inválidos são ignorados com um aviso no console; um episódio importado com o mesmo `id` sobrescreve o da base.

## Publicar sem terminal ("cole o link, o sistema faz o resto")

O site tem a página **Publique o seu episódio** (`#/publicar`): a pessoa cola o link do áudio (ou do YouTube), escolhe a licença
Creative Commons e envia. O formulário abre o GitHub com um pedido (Issue) já preenchido e o resto é automático:

1. **Pedido:** a Issue do formulário `.github/ISSUE_TEMPLATE/enviar-episodio.yml` (precisa de conta no GitHub; o site não tem login próprio).
2. **Prévia** (`.github/workflows/episodio-previa.yml`): baixa o áudio, ajusta o volume (−16 LUFS), transcreve com Whisper, gera título,
   descrições, capítulos, tags e categoria e comenta tudo na Issue. Esta etapa **não** tem as chaves do Internet Archive.
3. **Aprovação:** quem mantém o projeto lê a prévia e aplica o rótulo `aprovado`. Para ajustar algo, comenta `/metadados` com o YAML
   corrigido (vale o último comentário de quem mantém o projeto).
4. **Publicação** (`.github/workflows/episodio-publicar.yml`): confere que quem aprovou tem permissão de escrita e que a Issue **não foi
   editada depois da prévia** (hash do pedido), envia ao Internet Archive, grava em `web/public/catalog.json`, dispara o deploy e responde
   na Issue com o link. Falhas viram um comentário explicando o motivo e o rótulo `erro-publicacao`.

### Configuração (uma vez)

```bash
gh secret set IA_ACCESS_KEY      # chaves S3 do archive.org (https://archive.org/account/s3.php)
gh secret set IA_SECRET_KEY
# opcional: IA para os metadados (sem isso, usa a heurística, que sempre funciona)
gh variable set AI_BASE_URL --body https://api.exemplo.com/v1
gh variable set AI_MODEL --body nome-do-modelo
gh secret set AI_API_KEY
gh label create enviar-episodio; gh label create aprovado; gh label create publicado; gh label create erro-publicacao
```

### Segurança

- O texto da Issue é tratado como **não confiável**: chega ao script por variável de ambiente (nunca dentro de `run:`), campos são
  limitados e sem caracteres de controle, e um `### Campo` falso digitado nas observações não vira outro campo.
- Só `https://`, portas 80/443, sem usuário na URL e **sem endereços de rede interna** (SSRF), conferido a cada redirecionamento;
  nas automações só YouTube e links diretos de áudio (`--restrict-sources`); limite de 800 MB e de 180 min.
- Rótulo `aprovado` de quem não tem permissão é desfeito e recusado; comentários de prévia só valem se forem do robô do Actions.
- As chaves do archive.org existem só no workflow de publicação, num único passo.

### Limites honestos

- **YouTube em servidores na nuvem** costuma ser bloqueado pelo próprio YouTube; link direto para arquivo de áudio é o caminho confiável.
  Quando o download falha, a Issue explica e sugere o terminal.
- Whisper `small` no runner gratuito roda perto de 2–3× o tempo real; acima de 90 min o episódio é publicado **sem transcrição**.
- O envio termina no GitHub (conta necessária): é uma escolha para continuar sem servidor, sem login próprio e sem custo.
- O fluxo completo (Issue → prévia → aprovação → upload real) depende dos secrets acima. As peças foram testadas localmente
  (`pytest`: leitura do pedido, hash, comentários, decisão de publicar, guardas dos workflows; prévia real rodada com um áudio do archive.org),
  mas o upload real pela Action só pode ser verificado depois de configurar os secrets.

### Pelo terminal

`python pipeline/publish.py <link ou arquivo> --license by --transcribe` faz as mesmas etapas e pede uma confirmação antes de enviar
(detalhes e códigos de saída em `pipeline/README.md`). Cada feed é validado em `npm run build` (`web/scripts/validate-feed.mjs`:
RSS 2.0, iTunes e Podcasting 2.0, incluindo `podcast:guid`, `podcast:locked`, licença, capítulos e transcrição). Dados do canal:
`config/channel.json`; licenças e explicações: `config/licenses.json` (usadas também pelo formulário do site).

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
descrição e idioma do canal em `CHANNEL` no script. Episódios com `chapters` ganham
`<podcast:chapters>` (Podcasting 2.0): o build gera `dist/chapters/<id>.json` e o feed aponta para ele,
e as transcrições viram `dist/transcripts/<id>.vtt` (`<podcast:transcript>`). Só apps com suporte a Podcasting 2.0 usam essas tags. Episódios com `series`/`part` saem com `<itunes:season>` (uma por obra, numerada pela data do primeiro episódio) e `<itunes:episode>` (a `part`). O app também expõe o feed via `<link rel="alternate">`.

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

## Ouça no seu app (assinar o feed)

A página **Ouça no seu app** (`#/assinar`, também no rodapé e na seção "Leve para o seu app" da página inicial) e a
seção **Assinar só esta obra no seu app** (em cada obra) mostram botões que abrem o app de podcasts já assinando o
feed. O sistema é detectado (iPhone/iPad, Android, Mac, computador) e os apps certos aparecem primeiro; o último app
usado vira **"Assinar no … de novo"** em um toque; se o app não abrir em ~1,5 s, aparece o plano B (loja do app,
**Copiar link do feed**, passo a passo). Há também **QR code** do feed (gerado no navegador, sem serviço externo) e o
botão **Compartilhar o catálogo** (usa a janela da Fase 3, com a página `/assinar/` e sua prévia).

**Feeds por obra:** além do feed geral (`feed.xml`), o build gera um RSS por obra em `feeds/<obra>.xml` (71 hoje; partes em
ordem, `itunes:type serial`, datas escalonadas de 1 min porque todas as partes de uma obra têm a mesma data). A página
tem um seletor "O que assinar" e os mesmos botões funcionam por obra.

### Como cada app é aberto (conferido em 2026-11-01 nas páginas oficiais de cada app)

| App | Mecanismo | Fonte |
|---|---|---|
| Overcast (iOS) | `overcast://x-callback-url/add?url=<feed codificado>` (oficial) | overcast.fm/podcasterinfo |
| Pocket Casts (iOS) | `pktc://subscribe/<feed sem http://>` (oficial; documentado só para iOS) | support.pocketcasts.com |
| AntennaPod (Android) | `https://antennapod.org/deeplink/subscribe?url=<feed>&title=<nome>` (oficial; abre o app se instalado, senão mostra instruções) | antennapod.org/documentation |
| Apple Podcasts (iOS/Mac) | `podcast://<feed sem https://>`: **funciona (relatos em macOS 12 e iOS 16), mas a Apple não documenta**; depois de cadastrar o feed no Apple Podcasts Connect, preencha `applePodcasts` em `config/platforms.json` para usar o link do diretório | relatos da comunidade |
| Castro, Podcast Addict, Castbox, Podverse, Fountain | **sem link de assinatura documentado**: passo a passo (colar o feed na busca do app, ou "adicionar por RSS"), botão da loja e copiar o feed; o Fountain só aceita feeds que estão no Podcast Index (podcastindex.org/add) | ajuda de cada app |

Diferenças em relação à tabela original do projeto, descobertas na verificação (nada foi inventado): o esquema
`antennapod-subscribe://` **não está documentado** (usamos o link web oficial); `castros://subscribe/` e
`podcastaddict://` **não aparecem em nenhuma documentação**; para o Pocket Casts no Android não há link documentado. O
código marca a data de verificação e a fonte de cada esquema (`web/src/lib/podcastApps.js`), com testes.
**Não testei o toque em um celular real com o app instalado**: os testes automáticos conferem a URL enviada ao sistema,
a detecção de plataforma, o plano B (quando a página não perde o foco em 1,5 s) e os feeds.

### Spotify, YouTube Music, Amazon Music e Deezer

Essas plataformas **não deixam o ouvinte assinar um RSS qualquer**: o dono do projeto cadastra o feed **uma vez** em cada
uma. Depois de cadastrado, cole o link público do podcast em `config/platforms.json`; campo preenchido = o botão aparece
em "Também no…"; campo vazio = fica oculto. Passo a passo (conferido em 2026-11-01; os rótulos podem mudar):

1. **Spotify** (Spotify for Creators, antes Spotify for Podcasters): entre em [creators.spotify.com](https://creators.spotify.com)
   com uma conta Spotify → menu do avatar → **Adicionar novo programa** → **Encontrar um programa existente** →
   **Em outro lugar** → cole o feed (`https://jkfa.github.io/ondas-podcast/feed.xml`) → o Spotify envia um código de 8 dígitos ao e-mail
   que está **dentro do feed** → informe país, idioma e categoria → envie. Guia oficial:
   [support.spotify.com](https://support.spotify.com/us/creators/article/claiming-your-podcast-on-spotify-for-creators/).
2. **YouTube Music** (YouTube Studio): no [YouTube Studio](https://studio.youtube.com), **Criar → Novo podcast → Enviar feed RSS** →
   aceite os termos da ferramenta de ingestão → cole o feed → (pode pedir verificação de identidade) → depois de alguns
   dias, em **Conteúdo → Podcasts**, publique. O feed precisa ter ao menos um episódio publicado; os episódios viram vídeos
   com a capa estática. Guia oficial: [support.google.com/youtube/answer/13973017](https://support.google.com/youtube/answer/13973017).
3. **Amazon Music e Audible**: em [podcasters.amazon.com](https://podcasters.amazon.com) entre com uma conta Amazon →
   **Adicionar ou reivindicar seu podcast** → cole o feed e escolha o país → confirme o e-mail que está no feed →
   aceite o contrato de licença; pode levar até 24 h. (Não achei guia oficial da Amazon; os passos vêm de guias de
   hospedagens.)
4. **Deezer**: em [podcasters.deezer.com](https://podcasters.deezer.com) → **Publish my podcast** → cole o feed →
   informe o código enviado ao e-mail do feed → preencha as informações do programa. (Passos de guias de hospedagens.)
5. **Apple Podcasts** (opcional, para o link do diretório): no [Apple Podcasts Connect](https://podcastsconnect.apple.com),
   adicione o feed. O Apple exige capa de 1400 a 3000 px: o feed geral usa `cover-1400.png`, mas os **feeds por obra usam a
   capa do LibriVox, que é pequena** (limitação; use só o feed geral para o diretório da Apple).

Observação: o feed é de conteúdo de terceiros em domínio público (LibriVox). Antes de listar em diretórios, confirme que
isso é permitido pelas regras de cada plataforma e use a licença/autoria informadas em cada episódio.

## Ouvir sem internet (PWA)

O Ondas é um app instalável (manifest + service worker com Workbox) e abre sem conexão: o aplicativo, as fontes
(auto-hospedadas, sem Google Fonts) e o catálogo ficam pré-carregados. **Baixar para ouvir offline** (botão em cada
parte e **Baixar a obra inteira**) guarda o MP3 completo, a capa e a transcrição no Cache Storage do navegador, com
progresso, cancelamento e aviso por leitor de tela. O player usa o arquivo local quando existe: o service worker
responde as requisições `Range` (saltos na barra de progresso funcionam offline). **Meus downloads** (`#/downloads`,
também no rodapé e em Salvos) mostra o espaço usado, remove itens ou tudo, pede ao navegador para **não apagar** os
downloads (`navigator.storage.persist()`), e mostra o botão de instalar. Sem rede aparece a faixa "Sem conexão. Você
pode ouvir os episódios baixados.", as partes não baixadas ficam indisponíveis e a "próxima parte" só avança para o
que foi baixado. Há o filtro **Baixados** na biblioteca e o selo "Disponível offline". Quando sai uma versão nova, o
app avisa e só atualiza quando você clicar (não interrompe o episódio).

Verificado no archive.org em 2026-10-31: os arquivos têm CORS aberto (`access-control-allow-origin: *`, inclusive no
redirecionamento para o servidor do arquivo) e aceitam `Range` (206), então o download direto funciona e as respostas
guardadas não são "opacas" (que gastariam ~7 MB de cota por arquivo). Capas também pedem CORS pelo mesmo motivo.

Limitações: **iPhone/iPad (Safari)** limita e pode apagar dados de sites que ficam dias sem uso; a proteção
`persist()` não é garantida lá, então a página orienta a instalar o app ("Adicionar à Tela de Início"), que não sofre
essa limpeza. Obras longas ocupam muito espaço (Os Sertões tem ~24 h; a estimativa de tamanho aparece antes de baixar,
e o app recusa baixar se faltar espaço). Downloads interrompidos recomeçam do zero (não há retomada parcial). Um MP3 é
carregado inteiro na memória ao baixar e ao saltar offline (arquivos de dezenas de MB; em celulares muito modestos pode
pesar). Os downloads ficam só neste navegador: limpar os dados do site os apaga.

## Compartilhamento

Botão **Compartilhar** na página de cada obra, no player (para o episódio, com a opção "Compartilhar a partir de
12:30") e no rodapé (para o site). A janela oferece:

- **Menu nativo do aparelho** (Web Share API) como primeira opção quando o navegador tem `navigator.share`
  (celulares e alguns desktops); os botões das redes ficam como alternativa.
- **WhatsApp, X, Facebook, Telegram, Threads, Bluesky, LinkedIn e e-mail**, com ícones do
  [Simple Icons](https://simpleicons.org) (CC0; as marcas são dos donos; usamos a versão de uma cor, permitida pelas
  diretrizes, para manter contraste). LinkedIn não existe no pacote e fica com ícone genérico. Cada botão tem rótulo
  "Compartilhar no …". As URLs de compartilhamento foram verificadas em 2026-10-31 (ver `web/src/lib/share.js`).
- **Instagram e TikTok** não têm URL web de compartilhamento: o botão copia o link e gera um **card vertical
  1080×1920** (capa, título, autor, onda e endereço) para baixar ou compartilhar como Story, com o aviso "Link copiado,
  cole no seu Story".
- **Link com ponto:** `…/episodio/<id>/#t=12m30s` abre o episódio já naquele ponto (também aceita `?t=750`).
- **Prévias bonitas (Open Graph / Twitter Card):** o GitHub Pages só serve arquivos estáticos, então o build gera uma
  página HTML por obra (`/obra/<slug>/`) e por episódio (`/episodio/<id>/`) com `og:title`, `og:description`,
  `og:image` (a capa) e `og:audio`, que redireciona para a rota do app (`scripts/build-share-pages.mjs`, roda em
  `npm run build` e `build:fast`; ~1.740 páginas, sem usar a rede).
- **Player incorporável:** o código `<iframe>` (aba "Incorporar em um site" da janela do episódio) aponta para
  `/embed/?ep=<id>`, uma página leve em HTML puro com o `<audio controls>` nativo.

Limitações: **não testei em WhatsApp, X ou Telegram de verdade** (só valido as meta tags, o redirecionamento e o formato
das URLs); essas redes guardam prévias em cache, então uma capa nova pode demorar a aparecer. A prévia usa a capa
quadrada do archive.org (`twitter:card=summary`), sem imagem própria por obra.

## Transcrições

No player, o botão **Ver transcrição** (desligado por padrão; a escolha é lembrada; tecla `T`) mostra o texto
sincronizado com o áudio: o trecho atual fica destacado e a lista acompanha a fala (**Parar de seguir** ou
rolar à mão pausa o acompanhamento, e **Voltar ao trecho atual** retoma). Clicar num trecho pula o áudio para ele.
Também há **busca** na transcrição (sem acento e sem diferenciar maiúsculas, com contagem e navegação),
**modo legenda** (a frase atual em fonte grande numa faixa sobre o player, útil para pessoas surdas; também no
painel Acessibilidade), **download em .txt e .md** (o .md traz título, autor, licença, links e o tempo de cada
parágrafo) e **Copiar trecho com link**, que copia a citação com um link que abre o episódio no ponto certo
(`…/episodio/<id>/#t=12m30s`, a página de compartilhamento descrita abaixo). Episódio sem transcrição mostra "Transcrição em breve". O destaque nunca move o foco nem
dispara avisos do leitor de tela.

Como a transcrição chega ao catálogo (campo `transcripts`, ver o schema abaixo):

- **Episódio novo:** `python pipeline/publish.py ... --transcribe` roda o faster-whisper local (modelo
  `--whisper-model small`, idioma `--language pt`), gera `.vtt`, `.txt` e `.md`, envia os três ao archive.org junto
  do MP3 e registra as URLs no catálogo.
- **Episódios já publicados:** `python pipeline/transcribe_backlog.py` (com retomada). Para obras de terceiros
  (LibriVox etc.) não dá para enviar arquivos ao item de outra pessoa no archive.org, então os arquivos ficam
  em `web/public/transcripts/` e vão para o site no deploy. `--upload-own EMAIL` envia ao archive.org apenas
  os itens enviados por esse e-mail. Mede-se cerca de 2× o tempo real no CPU com o modelo `small`
  (4 episódios do Livro de Ruth, 17 min de áudio, levaram ~6 min); por isso o script tem `--limit`,
  `--max-minutes`, `--shortest-first` e `--series`: transcrever as ~315 h do catálogo inteiro levaria dias.
  Hoje só O Livro de Ruth (4 partes) e o trecho de exemplo de O Alienista têm transcrição.
- O feed RSS ganha `<podcast:transcript>` (VTT) para cada episódio que tiver o arquivo.
- Os arquivos baixados são gerados no navegador a partir do texto carregado; **funcionar offline** depende de o
  episódio estar baixado (Fase 4), que também vai guardar o `.vtt` em cache.

## Acessibilidade (WCAG 2.2 AA)

Botão fixo no canto superior direito abre o painel **Acessibilidade** (salvo só no aparelho): tema
claro/escuro/sistema, alto contraste, texto de 100% a 200%, fonte Atkinson Hyperlegible ou OpenDyslexic
(auto-hospedadas), animações (sistema/reduzir/permitir), espaçamento ampliado, áudio mono, atalhos de
teclado ligados/desligados e tradução em Libras (VLibras, só carrega se você ativar).

- **Teclado:** `Espaço`/`K` toca e pausa · `J`/`L` ou `←`/`→` ∓15 s · `<` `>` velocidade · `M` mudo ·
  `T` transcrição · `Shift+↑/↓` volume (só `↑/↓` com o player aberto) · `?` ajuda · `Esc` fecha painéis.
  Link "Pular para o conteúdo", landmarks, foco visível em dois tons e foco preso em janelas.
- **Player:** velocidade de 0,5× a 2× em passos de 0,25×, timer de soneca (15/30/60 min ou fim da parte),
  avisos por leitor de tela ("Tocando: …", "Pausado") e Media Session (tela de bloqueio, fones, carro).
- **Testes:** `npm test` · `npm run test:contrast` · `npm run test:a11y` (axe + teclado + player) · `npm run lhci`,
  todos no CI. Relatório completo, incluindo a sessão real com o Orca e o que **não** foi testado
  (NVDA, VoiceOver, TalkBack): [`docs/acessibilidade.md`](docs/acessibilidade.md).
- Textos da interface em [`web/src/strings.js`](web/src/strings.js) (migração em andamento, ver o relatório).

## Biblioteca e contador de acessos

A **página principal** (`#/`) apresenta o projeto (“Áudios e podcasts indies arquivados e prontos para ouvir.”), com números do catálogo, atalho para continuar, obras para começar, o endereço do feed RSS e como publicar. A **biblioteca** (`#/biblioteca`) é uma grade de obras: episódios com o mesmo `series` viram um livro (capa,
autor, nº de partes, duração, progresso); episódios sem `series` aparecem como obra de uma parte.
Cada obra tem página própria (`#/livro/<slug>`, link compartilhável) com sinopse, partes numeradas,
progresso por parte e um botão que leva ao ponto certo (Ouvir / Continuar / próxima parte / de novo).

Os acessos ao site e a cada obra são contados pelo [Abacus](https://v2.jasoncameron.dev/abacus)
(API pública gratuita, sem cadastro; namespace `ondas-jkfa`, chaves `site` e `livro-<slug>`):
conta **uma visita por sessão do navegador** e por página, e em `localhost` só lê o número. O
serviço não pede nem guarda dados pessoais além do que qualquer requisição HTTP já expõe (IP).
Se estiver fora do ar, o contador simplesmente não aparece. Para trocar de provedor, edite
`web/src/lib/views.js`.

## Limitações conhecidas

- **O contador é só indicativo:** qualquer pessoa que conheça a URL do Abacus pode incrementar um
  contador; não há como separar robôs de pessoas nem contar visitantes únicos de verdade. O
  serviço apaga contadores sem acesso por 6 meses.

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
