# Relatório de acessibilidade — Fase 1

Meta: **WCAG 2.2 nível AA** em tudo que foi criado ou alterado. Data dos testes: 2026-10-31.

## Resumo

| Verificação | Resultado |
|---|---|
| Lighthouse Accessibility (início, biblioteca, obra, notas, salvos) | **100 / 100 / 100 / 100 / 100** (meta ≥ 95) |
| axe-core (WCAG 2.0/2.1/2.2 A e AA), 33 varreduras | **0 violações sérias ou críticas** |
| Contraste das paletas (texto ≥ 4,5:1, componentes ≥ 3:1) | **todos os pares OK** nos 4 temas |
| Comportamento no navegador (teclado, player, atalhos, preferências, 200%) | **88/88 verificações OK** |
| Testes unitários (vitest) | 14/14 |
| Orca 46 (leitor de tela do Linux) | testado em sessões reais, ver abaixo |
| NVDA, VoiceOver (iOS/macOS), TalkBack | **não testados** (ver "Limitações") |

Tudo roda no CI (`.github/workflows/ci.yml`): o build falha se o axe achar algo sério, se o Lighthouse ficar abaixo de 95 ou se um par de cores perder o contraste.

## Como reproduzir

```bash
cd web
npm ci
npm test                      # unitários
npm run test:contrast         # contraste das paletas (4 combinações de tema)
npm run build:fast && npx vite preview --port 4173 &
BASE_URL=http://localhost:4173/ npm run test:a11y   # axe + teclado + player + preferências
npm run lhci                  # Lighthouse (usa o Chrome do sistema ou CHROME_PATH)
```

## O que o `test:a11y` cobre

- **axe-core** em 5 páginas × 5 configurações (escuro, claro, escuro e claro com alto contraste, texto a 200%) mais painel de acessibilidade, ajuda de atalhos, janela de importação, player aberto e player com o timer de soneca.
- **Estrutura:** landmarks (`header`, `nav`, `main`, `footer`), um único `h1` por página sem pular níveis, título da página por rota.
- **Teclado:** link "Pular para o conteúdo"; `?` abre a ajuda, `Esc` fecha e devolve o foco; painéis prendem o foco; ausência de armadilha de teclado.
- **Alvos de toque ≥ 44×44 px** em todas as páginas (exceto links no meio de texto).
- **Player:** Media Session (título, autor, capa), aviso `aria-live` ("Tocando: …", "Pausado"), atalhos K/J/L/←/→/</>/M/T/Shift+↑↓, atalhos ignorados em campos de texto e desligáveis, velocidade de 0,5× a 2×, slider de posição, timer de soneca (inclusive "fim da parte"), áudio mono sem quebrar a reprodução.
- **Preferências:** persistência após recarregar, restaurar padrões, animações (sistema pede movimento reduzido → onda parada).
- **Texto a 200%** sem rolagem horizontal em 360 px e 1280 px.

## Fase 2 — transcrições (painel, busca, legenda)

`npm run test:transcripts` (23 verificações, no CI): sincronia do destaque, rolagem que acompanha e para de acompanhar,
clique que leva o áudio, busca sem acento, legenda, downloads, link com ponto, estado "em breve", erro de rede com
"Tentar de novo", e axe (escuro e claro) com o painel aberto, a legenda ligada e o estado "em breve".
Verificado explicitamente: o destaque **não move o foco** e **não muda a região `aria-live`**; a faixa de legenda é
`aria-hidden` (quem usa leitor de tela ouve o áudio); a lista de trechos é focável (rolável por teclado).

## Problemas que os testes encontraram (e foram corrigidos)

1. **O foco voltava ao primeiro botão do player 4 vezes por segundo enquanto o áudio tocava** (`useDialog` dependia de `onClose`, uma função nova a cada render). Quem usava teclado ou leitor de tela não conseguia navegar no player. Achado pelo Orca; há teste de regressão.
2. **O interruptor ("switch") do painel não respondia a cliques na trilha** (um elemento decorativo cobria o campo).
3. **O Orca lia "4 por cento… 15 por cento" durante a reprodução** por causa das barras de progresso decorativas (`role="progressbar"`). Viraram `aria-hidden`; a informação segue disponível em texto.
4. **O player criava um segundo landmark "banner"** (`<header>` dentro do diálogo). Virou `<div>`.
5. **Alvos de toque de 32–40 px** (cartões, links "Ver tudo", chips de filtro, capítulos, campo de busca) subiram para ≥ 44 px.
6. **Texto a 200%:** títulos longos e grades de capas empurravam o layout para os lados em telas de 360 px; as grades passaram a se adaptar (`auto-fill`) e os títulos quebram palavras longas.
7. **Foco visível:** o anel lima sumia sobre botões lima; agora é um anel de dois tons (claro + escuro) que funciona em qualquer fundo e nos 4 temas.
8. **Placeholders e textos pequenos** em `ink-500` (contraste 4,05:1, abaixo do mínimo de 4,5:1 para texto) passaram para `ink-400` (7,2:1).

## Orca (Linux)

Rodei o Orca 46 de verdade, num ambiente isolado (Xvfb + barramento D-Bus próprio, sem placa de som), com o Chromium com acessibilidade ligada e o Playwright dirigindo a página. O Orca escreve tudo o que falaria no log de depuração; o resultado completo está em [`orca-fala.txt`](orca-fala.txt). Trechos:

```
Pular para o conteúdo link.                       ← primeiro Tab
main content Conteúdo principal.                  ← Enter no link
Avisos Tocando: O Livro de Ruth — Capitulo 1      ← região aria-live ao tocar
Avisos Pausado                                    ← tecla K
Atalhos de teclado dialog / Fechar atalhos push button.   ← tecla ?
Acessibilidade dialog / Fechar painel de acessibilidade push button.
Tema panel. Sistema. selected radio button
Alto contraste switch off.
Tamanho do texto panel. 100% selected radio button
Player: O Livro de Ruth — Capitulo 1 dialog
Posição do episódio horizontal slider 0 minutos de 4.
Soneca collapsed push button. → expanded → Desligado. selected radio button
```

Limitações deste teste: sem gerenciador de janelas e com as teclas enviadas por CDP (não pelo X11), então ele valida o que o Orca *fala* ao receber foco, mudanças de estado e regiões ao vivo, não o uso das teclas do próprio Orca (setas no modo de navegação, teclas de lista de elementos etc.). Não substitui o teste de uma pessoa que usa o leitor no dia a dia.

## Limitações conhecidas (honestidade técnica)

- **NVDA e JAWS (Windows), VoiceOver (macOS/iOS) e TalkBack (Android) não foram testados por mim**: não há esses sistemas neste ambiente. Roteiro para quem puder testar, em cada um deles: (1) Tab até "Pular para o conteúdo" e Enter; (2) navegar por landmarks e títulos; (3) abrir a obra "O Livro de Ruth" e tocar a parte 1 e ouvir "Tocando: …"; (4) abrir o player, mover o slider de posição e ouvir o valor falado; (5) abrir "Acessibilidade", trocar tema e tamanho do texto; (6) ativar o soneca "Fim da parte".
- **Atalhos de letra (K, J, L, T, M, ?, < >)** podem colidir com leitores de tela ou comandos de voz; por isso há o interruptor "Atalhos de teclado" no painel (WCAG 2.1.4). ↑/↓ só mexem no volume com o player aberto ou com Shift, para não tirar a rolagem por teclado.
- **Áudio mono** depende de CORS no servidor do áudio (o archive.org envia). Se um áudio de outro servidor ficar mudo, o app volta ao estéreo sozinho e avisa. Não dá para "desfazer" o roteamento do Web Audio: desligar o mono apenas volta o nó para estéreo.
- **VLibras** é um widget de terceiros (governo federal): só é carregado se a pessoa ativar, e a acessibilidade dele não foi auditada por mim. Desativar recarrega a página (o widget não tem como ser descarregado).
- **Textos centralizados em `src/strings.js`:** cobrem navegação, player, atalhos, painel, soneca, anúncios, rodapé e títulos de página. As telas de conteúdo (biblioteca, obra, importação) ainda têm textos dentro dos componentes e serão migradas nas próximas fases, junto com cada tela que for alterada.
- **Tema claro:** o verde-limão não tem contraste sobre fundo claro, então o claro usa um verde escuro (`#3d6600`). Cores de destaque vindas das capas só tingem o fundo, nunca texto.
- **Transições de página:** ao navegar, o foco vai para o conteúdo principal e o título da página muda; não há anúncio extra de "página carregada".
