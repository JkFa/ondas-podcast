// Verificações da Fase 3 (compartilhamento) no navegador. Uso:
//   npm run build:fast && (npx vite preview --port 4173 &) && BASE_URL=http://localhost:4173/ npm run test:share
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:4173/').replace(/\/?$/, '/')
const results = []
const rec = (g, n, ok, d = '') => { results.push({ g, n, ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} [${g}] ${n}${d ? ` — ${d}` : ''}`) }
const check = async (g, n, fn) => { try { const r = await fn(); rec(g, n, r === undefined || r === true || r?.ok !== false, r?.detail) } catch (e) { rec(g, n, false, String(e.message).split('\n')[0]) } }

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
async function newPage({ prefs = {}, nativeShare = false, width = 1100, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.route('https://abacus.jasoncameron.dev/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"value":1}' }))
  await ctx.addInitScript(({ p, native }) => {
    try { if (!localStorage.getItem('ondas:v1:a11y')) localStorage.setItem('ondas:v1:a11y', JSON.stringify(p)) } catch { /* ignora */ }
    if (native) { // simula o menu nativo do celular e registra a chamada
      window.__shared = []
      navigator.share = async (data) => { window.__shared.push(data) }
      navigator.canShare = () => true
    } else { delete Navigator.prototype.share; delete navigator.share }
  }, { p: prefs, native: nativeShare })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => rec('erros', 'erro de JavaScript', false, e.message))
  return page
}
const scan = async (page, label) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(150)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  rec('axe', label, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`).join(' | '))
}
const openBookShare = async (page) => {
  await page.goto(`${BASE}#/livro/o-livro-de-ruth`); await page.waitForSelector('main h1')
  await page.getByRole('button', { name: 'Compartilhar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Compartilhar' }).waitFor()
}
const NAMES = ['WhatsApp', 'X', 'Facebook', 'Telegram', 'Threads', 'Bluesky', 'LinkedIn']

// ----------------------------------------------------------------- obra
{
  const page = await newPage()
  await openBookShare(page)
  await check('rótulos', 'cada rede tem rótulo acessível "Compartilhar no …" e abre em nova aba com noopener', async () => {
    for (const n of NAMES) {
      const a = page.getByRole('link', { name: `Compartilhar no ${n}`, exact: true })
      if ((await a.count()) !== 1) return { ok: false, detail: `${n}: ${await a.count()} link(s)` }
      if ((await a.getAttribute('target')) !== '_blank' || !/noopener/.test(await a.getAttribute('rel'))) return { ok: false, detail: `${n} sem noopener` }
    }
    return { ok: (await page.getByRole('link', { name: 'Compartilhar por e-mail' }).count()) === 1 }
  })
  await check('links', 'hrefs das redes carregam o link da obra codificado', async () => {
    const link = await page.getByLabel('Link para compartilhar').inputValue()
    const enc = encodeURIComponent(link)
    const hrefs = {}
    for (const n of NAMES) hrefs[n] = await page.getByRole('link', { name: `Compartilhar no ${n}`, exact: true }).getAttribute('href')
    const ok = link.endsWith('/obra/o-livro-de-ruth/') && hrefs.WhatsApp.startsWith('https://wa.me/?text=') && hrefs.WhatsApp.includes(enc) && hrefs.X.startsWith('https://x.com/intent/post?') && hrefs.X.includes(`url=${enc}`) &&
      hrefs.Facebook === `https://www.facebook.com/sharer/sharer.php?u=${enc}` && hrefs.Telegram.startsWith('https://t.me/share/url?') && hrefs.Threads.startsWith('https://www.threads.com/intent/post?') &&
      hrefs.Bluesky.startsWith('https://bsky.app/intent/compose?text=') && hrefs.LinkedIn === `https://www.linkedin.com/sharing/share-offsite/?url=${enc}`
    return { ok, detail: link }
  })
  await check('ícones', 'ícones de marca vêm do simple-icons (SVG decorativo, texto visível ao lado)', async () => {
    const n = await page.locator('a[aria-label^="Compartilhar no"] svg[aria-hidden="true"] path').count()
    return { ok: n >= 6, detail: `${n} ícones` }
  })
  await check('web share', 'sem navigator.share o botão "Compartilhar…" não aparece (os botões das redes são o caminho)', async () => ({ ok: (await page.getByRole('button', { name: 'Compartilhar…' }).count()) === 0 }))
  await check('link', 'copiar link copia a URL da página estática e avisa', async () => {
    await page.getByRole('button', { name: 'Copiar link' }).click()
    await page.waitForTimeout(300)
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    const said = await page.locator('[role=status][aria-label="Avisos"]').textContent()
    return { ok: clip === (await page.getByLabel('Link para compartilhar').inputValue()) && /Link copiado/.test(said), detail: clip }
  })
  await check('Stories', 'Instagram: copia o link, gera o card 1080×1920 e avisa "cole no seu Story"', async () => {
    await page.getByRole('button', { name: 'Compartilhar no Instagram (Story)' }).click()
    await page.getByRole('img', { name: /^Prévia do card para Stories/ }).waitFor({ timeout: 15000 })
    const dim = await page.evaluate(async () => {
      const img = document.querySelector('img[alt^="Prévia do card"]')
      await img.decode()
      return [img.naturalWidth, img.naturalHeight]
    })
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    const said = await page.locator('[role=status][aria-label="Avisos"]').textContent()
    const note = await page.locator('dialog, [role=dialog]').getByRole('status').filter({ hasText: /Story/ }).count()
    return { ok: dim[0] === 1080 && dim[1] === 1920 && /\/obra\/o-livro-de-ruth\//.test(clip) && /cole no seu Story/.test(said) && note >= 1, detail: `${dim.join('×')}; aviso "${said}"` }
  })
  await check('Stories', 'TikTok usa o mesmo fluxo e o card pode ser baixado como PNG', async () => {
    await page.getByRole('button', { name: 'Compartilhar no TikTok (Story)' }).click()
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar imagem (PNG)' }).click()])
    return { ok: /^ondas-.*\.png$/.test(d.suggestedFilename()), detail: d.suggestedFilename() }
  })
  await scan(page, 'janela de compartilhar (obra, com card) · escuro')
  await check('teclado', 'foco preso na janela e Esc fecha devolvendo o foco ao botão', async () => {
    let inside = true
    for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); inside &&= await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')) }
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    const closed = (await page.getByRole('dialog', { name: 'Compartilhar' }).count()) === 0
    const back = await page.evaluate(() => document.activeElement?.textContent?.trim())
    return { ok: inside && closed && back === 'Compartilhar', detail: `preso=${inside} fechou=${closed} foco="${back}"` }
  })
  await page.context().close()
}
{
  const page = await newPage({ prefs: { theme: 'light' } })
  await openBookShare(page)
  await scan(page, 'janela de compartilhar (obra) · claro')
  await page.context().close()
}

// ----------------------------------------------------------------- Web Share API
{
  const page = await newPage({ nativeShare: true, width: 390, height: 800 })
  await openBookShare(page)
  await check('web share', 'com navigator.share o botão nativo aparece primeiro e envia título, texto e link', async () => {
    await page.getByRole('button', { name: 'Compartilhar…' }).click()
    const shared = await page.evaluate(() => window.__shared)
    return { ok: shared.length === 1 && shared[0].title === 'O Livro de Ruth' && /Ouça “O Livro de Ruth”/.test(shared[0].text) && /\/obra\/o-livro-de-ruth\/$/.test(shared[0].url), detail: JSON.stringify(shared[0]).slice(0, 140) }
  })
  await check('web share', 'os botões individuais continuam como alternativa', async () => ({ ok: (await page.getByRole('link', { name: 'Compartilhar no WhatsApp' }).count()) === 1 }))
  await check('web share', 'card de Stories: "Compartilhar imagem" usa o menu nativo com o arquivo PNG', async () => {
    await page.getByRole('button', { name: 'Compartilhar no Instagram (Story)' }).click()
    await page.getByRole('button', { name: 'Compartilhar imagem' }).waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: 'Compartilhar imagem' }).click()
    const files = await page.evaluate(() => window.__shared.filter((s) => s.files).map((s) => s.files.map((f) => `${f.type} ${f.size > 1000}`)))
    return { ok: files.length === 1 && files[0][0] === 'image/png true', detail: JSON.stringify(files) }
  })
  await check('layout', 'sem rolagem horizontal em 390 px', async () => ({ ok: !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) }))
  await page.context().close()
}

// ----------------------------------------------------------------- episódio no player, link com ponto, incorporar
{
  const page = await newPage()
  await page.goto(`${BASE}#/livro/o-livro-de-ruth`); await page.waitForSelector('main h1')
  await page.getByRole('button', { name: /^Tocar O Livro de Ruth — Capitulo 2$/ }).click()
  const playing = await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 0.5, null, { timeout: 30000 }).then(() => true, () => false)
  if (!playing) rec('episódio', 'áudio do archive.org iniciou', false, 'rede indisponível agora')
  else {
    await page.evaluate(() => { const a = document.querySelector('audio'); a.pause(); a.currentTime = 150 })
    await page.waitForFunction(() => { const a = document.querySelector('audio'); return !a.seeking && Math.abs(a.currentTime - 150) < 1 }, null, { timeout: 25000 })
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: /^Abrir player/ }).click(); await page.waitForTimeout(600)
    const sheetShare = page.getByRole('dialog', { name: /^Player:/ }).getByRole('button', { name: 'Compartilhar', exact: true })
    await sheetShare.click()
    await page.getByRole('dialog', { name: 'Compartilhar' }).waitFor()
    await check('episódio', 'a janela abre sobre o player sem roubar o foco (pilha de diálogos) e Esc fecha só ela', async () => {
      const inShare = await page.evaluate(() => !!document.activeElement?.closest('[aria-labelledby="share-title"]'))
      for (let i = 0; i < 25; i++) await page.keyboard.press('Tab')
      const stillShare = await page.evaluate(() => !!document.activeElement?.closest('[aria-labelledby="share-title"]'))
      await page.keyboard.press('Escape'); await page.waitForTimeout(300)
      const sheetStays = await page.evaluate(() => { const d = document.querySelector('[role=dialog][aria-label^="Player:"]'); return !!d && !d.inert })
      await sheetShare.click()
      await page.getByRole('dialog', { name: 'Compartilhar' }).waitFor()
      return { ok: inShare && stillShare && sheetStays, detail: `foco inicial=${inShare} após 25 Tabs=${stillShare} player aberto=${sheetStays}` }
    })
    await check('link', 'caixa "Compartilhar a partir de 2:30" muda o link para .../episodio/<id>/#t=2m30s', async () => {
      const box = page.getByRole('checkbox', { name: /^Compartilhar a partir de 2:3\d$/ })
      const before = await page.getByLabel('Link para compartilhar').inputValue()
      await box.check()
      const after = await page.getByLabel('Link para compartilhar').inputValue()
      const wa = await page.getByRole('link', { name: 'Compartilhar no WhatsApp' }).getAttribute('href')
      return { ok: /\/episodio\/livro-de-ruth-1811-02\/$/.test(before) && /\/episodio\/livro-de-ruth-1811-02\/#t=2m3\ds$/.test(after) && wa.includes(encodeURIComponent(after)), detail: after }
    })
    await check('incorporar', 'mostra o código <iframe> e copia', async () => {
      const code = await page.getByLabel('Código para incorporar').inputValue()
      await page.getByRole('button', { name: 'Copiar código' }).click(); await page.waitForTimeout(300)
      const clip = await page.evaluate(() => navigator.clipboard.readText())
      return { ok: /^<iframe src="[^"]+\/embed\/\?ep=livro-de-ruth-1811-02"/.test(code) && clip === code, detail: code.slice(0, 80) }
    })
    await scan(page, 'janela de compartilhar (episódio, com incorporar) · escuro')
    await page.getByRole('checkbox').check()
    const link = await page.getByLabel('Link para compartilhar').inputValue()
    await page.context().close()

    // abrir o link compartilhado (página estática) leva ao app, no episódio e no ponto certos
    const p2 = await newPage()
    await check('prévia', 'abrir o link com ponto redireciona para o app e carrega o episódio no ponto', async () => {
      await p2.goto(link)
      await p2.getByRole('button', { name: /^Abrir player/ }).waitFor({ timeout: 15000 })
      await p2.waitForFunction(() => document.querySelector('audio')?.readyState >= 1, null, { timeout: 30000 }).catch(() => {})
      const st = await p2.evaluate(() => ({ t: document.querySelector('audio').currentTime, paused: document.querySelector('audio').paused, hash: location.hash, src: document.querySelector('audio').src.split('/').pop() }))
      return { ok: Math.abs(st.t - Number(link.match(/t=(\d+)m(\d+)s/)[1]) * 60 - Number(link.match(/t=(\d+)m(\d+)s/)[2])) < 2 && st.paused && /ruth_2/.test(st.src), detail: JSON.stringify(st) }
    })
    await p2.context().close()
  }
}

// ----------------------------------------------------------------- páginas com prévia (Open Graph) e embed
{
  const page = await newPage()
  const meta = async (url) => {
    const html = await (await fetch(url)).text()
    const get = (p) => new RegExp(`<meta (?:property|name)="${p}" content="([^"]*)"`).exec(html)?.[1]
    return { html, og: { title: get('og:title'), description: get('og:description'), image: get('og:image'), audio: get('og:audio'), url: get('og:url'), card: get('twitter:card') } }
  }
  await check('prévia', 'página do episódio tem og:title, og:description, og:image e og:audio corretos', async () => {
    const { og } = await meta(`${BASE}episodio/livro-de-ruth-1811-02/`)
    return { ok: og.title === 'O Livro de Ruth — Capitulo 2' && /Parte 2 de 4/.test(og.description) && /^https:\/\/archive\.org\/download\/.*\.jpg$/.test(og.image) && /ruth_2_almeida\.mp3$/.test(og.audio) && /\/episodio\/livro-de-ruth-1811-02\/$/.test(og.url) && og.card === 'summary', detail: JSON.stringify(og).slice(0, 200) }
  })
  await check('prévia', 'página da obra tem prévia da obra (título, autor, partes, duração)', async () => {
    const { og } = await meta(`${BASE}obra/o-livro-de-ruth/`)
    return { ok: og.title === 'O Livro de Ruth' && /4 partes/.test(og.description) && /João Ferreira de Almeida/.test(og.description) && !!og.image, detail: og.description }
  })
  await check('prévia', 'a página tem texto e botão "Ouvir no Ondas" mesmo sem JavaScript', async () => {
    const { html } = await meta(`${BASE}episodio/livro-de-ruth-1811-02/`)
    return { ok: /<h1>O Livro de Ruth — Capitulo 2<\/h1>/.test(html) && /href="[^"]+#\/livro\/o-livro-de-ruth\?ep=livro-de-ruth-1811-02">Ouvir no Ondas/.test(html) && /<noscript><meta http-equiv="refresh"/.test(html) }
  })
  await check('prévia', 'redireciona também com #t=12m30s, ?t=750 e sem tempo', async () => {
    const out = []
    for (const [suffix, want] of [['#t=12m30s', '&t=750'], ['?t=750', '&t=750'], ['', '']]) {
      await page.goto(`${BASE}episodio/livro-de-ruth-1811-02/${suffix}`)
      await page.getByRole('button', { name: /^Abrir player/ }).waitFor({ timeout: 15000 })
      out.push((await page.evaluate(() => location.hash)).endsWith(`?ep=livro-de-ruth-1811-02${want}`))
    }
    return { ok: out.every(Boolean), detail: out.join(',') }
  })
  await check('prévia', 'todas as obras e episódios do catálogo têm página (1 por item)', async () => {
    const cat = await (await fetch(`${BASE}catalog.json`)).json()
    const ids = cat.episodes.map((e) => e.id)
    const sample = [ids[0], ids[Math.floor(ids.length / 2)], ids.at(-1)]
    const codes = await Promise.all(sample.map(async (id) => (await fetch(`${BASE}episodio/${encodeURIComponent(id)}/`)).status))
    return { ok: codes.every((c) => c === 200), detail: `${ids.length} episódios; amostra ${codes.join(',')}` }
  })
  await check('incorporar', 'página /embed/ mostra capa, título e player nativo no episódio pedido', async () => {
    await page.goto(`${BASE}embed/?ep=livro-de-ruth-1811-02&t=30`)
    await page.locator('audio').waitFor({ timeout: 10000 })
    const st = await page.evaluate(() => ({ title: document.querySelector('h1').textContent, src: document.querySelector('audio').src.split('/').pop(), controls: document.querySelector('audio').controls, label: document.querySelector('audio').getAttribute('aria-label'), alt: document.querySelector('img').alt, link: document.querySelector('a').href }))
    return { ok: st.title === 'O Livro de Ruth — Capitulo 2' && /ruth_2/.test(st.src) && st.controls && /^Player:/.test(st.label) && /^Capa de/.test(st.alt) && /\/episodio\/livro-de-ruth-1811-02\/$/.test(st.link), detail: JSON.stringify(st).slice(0, 160) }
  })
  await scan(page, 'player incorporado · escuro')
  await check('incorporar', 'episódio inexistente mostra mensagem (sem quebrar)', async () => {
    await page.goto(`${BASE}embed/?ep=nao-existe`)
    await page.getByText('Episódio não encontrado.').waitFor({ timeout: 8000 })
    return true
  })
  await page.context().close()
}

// ----------------------------------------------------------------- site + rodapé
{
  const page = await newPage()
  await page.goto(BASE); await page.waitForSelector('main h1')
  await check('site', '"Compartilhar o Ondas" no rodapé abre a janela com o link do site', async () => {
    await page.getByRole('button', { name: 'Compartilhar o Ondas' }).click()
    const dlg = page.getByRole('dialog', { name: 'Compartilhar' })
    await dlg.waitFor()
    const link = await page.getByLabel('Link para compartilhar').inputValue()
    return { ok: new URL(link).pathname === new URL(BASE).pathname && (await page.getByLabel('Código para incorporar').count()) === 0, detail: link }
  })
  await scan(page, 'compartilhar o site · escuro')
  await page.context().close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`)
process.exit(failed.length ? 1 : 0)
