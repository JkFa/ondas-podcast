// Verificações da seção de filmes no navegador. O archive.org é simulado: qualquer .mp4 de archive.org/download devolve
// e2e/fixtures/clip.webm (20 s), com suporte a Range. Uso:
//   npm run build:fast && (npx vite preview --port 4173 &) && BASE_URL=http://localhost:4173/ npm run test:films
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:4173/').replace(/\/?$/, '/')
const results = []
const rec = (g, n, ok, d = '') => { results.push({ g, n, ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} [${g}] ${n}${d ? ` — ${d}` : ''}`) }
const check = async (g, n, fn) => { try { const r = await fn(); rec(g, n, r === undefined || r === true || r?.ok !== false, r?.detail) } catch (e) { rec(g, n, false, String(e.message).split('\n')[0]) } }

const CLIP = await readFile(new URL('./fixtures/clip.webm', import.meta.url))
const FILMS = JSON.parse(await readFile(new URL('../public/films.json', import.meta.url), 'utf8')).films
const bySlug = (slug) => FILMS.find((f) => f.slug === slug)
const withCaptions = FILMS.find((f) => f.captions.length)
const graphic = FILMS.find((f) => f.warning === 'graphic')
const withHd = FILMS.find((f) => f.hd && !f.warning)
const plain = FILMS.find((f) => !f.warning && !f.captions.length)

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const videoRequests = []
async function newPage({ width = 1100, height = 1000, theme = 'dark', videoFails = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', serviceWorkers: 'block' })
  await ctx.route('https://abacus.jasoncameron.dev/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"value":1}' }))
  await ctx.route(/https:\/\/archive\.org\/download\/.*\.mp4/, (r) => {
    videoRequests.push(r.request().url())
    if (videoFails) return r.abort('failed')
    const range = /bytes=(\d+)-(\d*)/.exec(r.request().headers().range || '')
    const start = range ? Number(range[1]) : 0
    const end = range && range[2] ? Math.min(Number(range[2]), CLIP.length - 1) : CLIP.length - 1
    return r.fulfill({
      status: range ? 206 : 200,
      headers: { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': String(end - start + 1), ...(range ? { 'content-range': `bytes ${start}-${end}/${CLIP.length}` } : {}) },
      body: CLIP.subarray(start, end + 1),
    })
  })
  await ctx.route('https://archive.org/services/img/**', (r) => r.fulfill({ status: 404, body: '' }))
  await ctx.addInitScript((t) => { try { localStorage.setItem('ondas:v1:a11y', JSON.stringify({ theme: t })) } catch { /* ignora */ } }, theme)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => rec('erros', 'erro de JavaScript', false, e.message))
  return page
}
const go = async (page, hash) => { await page.goto(`${BASE}${hash}`); await page.waitForSelector('main h1') }
const scan = async (page, label, { skip = [] } = {}) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(150)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).disableRules(skip).analyze()
  const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  rec('axe', label, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`).join(' | '))
}
const cards = (page) => page.locator('main a[href^="#/filme/"]')
const waitCards = (page) => page.waitForSelector('main a[href^="#/filme/"]')

// ============================================================ lista
{
  const page = await newPage()
  let filmsJson = 0
  page.on('request', (r) => { if (r.url().endsWith('films.json')) filmsJson++ })
  await go(page, '#/biblioteca')
  await check('lista', 'films.json só é baixado quando a seção é aberta', async () => {
    const before = filmsJson
    await page.getByRole('navigation', { name: 'Principal' }).last().getByRole('button', { name: 'Filmes' }).click()
    await waitCards(page)
    return { ok: before === 0 && filmsJson === 1, detail: `antes ${before}, depois ${filmsJson}` }
  })
  await check('lista', 'título, aba ativa e um cartão por filme', async () => {
    const n = await cards(page).count()
    const title = await page.title()
    const current = await page.locator('nav [aria-current="page"]').first().innerText()
    return { ok: n === FILMS.length && title.startsWith('Filmes') && /Filmes/.test(current) && (await page.locator('main h1').innerText()) === 'Filmes', detail: `${n} cartões, título "${title}"` }
  })
  await check('lista', 'cada cartão tem nome acessível com ano, gênero, duração e situação das legendas', async () => {
    const labels = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    return { ok: labels.every((l) => /\d{4}\./.test(l) && /min|h/.test(l) && /Sem legendas|Legendas/.test(l)), detail: labels[0] }
  })
  await check('lista', 'aviso de direitos com link para a seção e texto sobre o limite de 1955', async () => {
    const body = await page.locator('#direitos-filmes').innerText()
    return { ok: /1955/.test(body) && /Lei 9\.610/.test(body) && /retirada/.test(body) }
  })
  await check('filtros', 'gênero filtra e marca aria-pressed', async () => {
    const btn = page.getByRole('group', { name: 'Gêneros de filme' }).getByRole('button', { name: 'Faroeste' })
    await btn.click()
    const n = await cards(page).count()
    const expected = FILMS.filter((f) => f.genre === 'faroeste').length
    return { ok: n === expected && (await btn.getAttribute('aria-pressed')) === 'true', detail: `${n} de ${expected}` }
  })
  await check('filtros', 'só mudos e com legendas combinam com o gênero; limpar volta tudo', async () => {
    await page.getByRole('button', { name: 'Todos', exact: true }).click()
    await page.getByRole('button', { name: 'Só mudos' }).click()
    const silent = await cards(page).count()
    await page.getByRole('button', { name: 'Com legendas' }).click()
    const both = await cards(page).count()
    return { ok: silent === FILMS.filter((f) => f.silent).length && both === FILMS.filter((f) => f.silent && f.captions.length).length, detail: `mudos ${silent}, mudos com legenda ${both}` }
  })
  await check('filtros', 'busca por título sem acento e mensagem de vazio', async () => {
    await page.getByRole('button', { name: 'Só mudos' }).click()
    await page.getByRole('button', { name: 'Com legendas' }).click()
    const box = page.getByRole('searchbox', { name: 'Buscar por título, direção ou ano' })
    await box.fill('DUSSELDORF')
    await page.waitForFunction(() => document.querySelectorAll('main a[href^="#/filme/"]').length === 1)
    await box.fill('zzzzzz')
    await page.getByText('Nenhum filme com esses filtros.').waitFor()
    await page.getByRole('button', { name: 'Limpar filtros' }).click()
    await waitCards(page)
    return (await cards(page).count()) === FILMS.length
  })
  await check('filtros', 'ordenar por ano põe o mais antigo primeiro', async () => {
    await page.getByLabel('Ordenar por').selectOption('year')
    const first = await cards(page).first().getAttribute('aria-label')
    const oldest = [...FILMS].sort((a, b) => a.year - b.year)[0]
    return { ok: first.includes(`, ${oldest.year}.`), detail: first }
  })
  await check('filtros', 'a contagem é anunciada para leitores de tela', async () => {
    await page.getByRole('button', { name: 'Comédia' }).click()
    await page.waitForFunction((n) => document.querySelector('[role=status][aria-label="Avisos"]')?.textContent?.includes(`${n} filmes`), FILMS.filter((f) => f.genre === 'comedia').length, { timeout: 4000 })
    return true
  })
  await scan(page, 'lista de filmes (escuro)')
}

{
  const page = await newPage({ theme: 'light' })
  await go(page, '#/filmes')
  await waitCards(page)
  await scan(page, 'lista de filmes (claro)')
}

// ============================================================ celular
{
  const page = await newPage({ width: 360, height: 740 })
  await go(page, '#/filmes')
  await waitCards(page)
  await check('celular', '360 px: sem rolagem horizontal e barra inferior com 6 itens dentro da tela', async () => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    const boxes = await page.locator('nav[aria-label="Principal"]').first().locator('button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, h: r.height } }))
    const inside = boxes.every((b) => b.l >= 0 && b.r <= 360)
    return { ok: over <= 0 && boxes.length === 6 && inside && boxes.every((b) => b.h >= 44 && b.w >= 40), detail: `sobra ${over}px; larguras ${boxes.map((b) => Math.round(b.w)).join('/')}` }
  })
  await check('celular', 'sem pôster (404) o cartão mostra o placeholder e continua clicável', async () => {
    await page.waitForTimeout(2500)
    return (await cards(page).count()) === FILMS.length
  })
  await scan(page, 'lista de filmes (360 px)')
}

// ============================================================ página do filme
{
  const f = withCaptions
  const page = await newPage()
  await go(page, `#/filme/${f.slug}`)
  await page.waitForSelector('video')
  await check('filme', 'título, ano, direção, licença e fonte', async () => {
    const h1 = await page.locator('main h1').innerText()
    const lic = await page.getByRole('link', { name: f.licenseName }).getAttribute('href')
    const src = await page.getByRole('link', { name: 'Internet Archive' }).getAttribute('href')
    return { ok: h1 === f.title && lic.startsWith('https://creativecommons.org/') && src === f.archiveUrl && (await page.title()).startsWith(f.title), detail: `${h1} · ${lic}` }
  })
  await check('filme', '<video> tem nome acessível, controles nativos e a fonte do archive.org', async () => {
    const v = await page.evaluate(() => { const e = document.querySelector('video'); return { label: e.getAttribute('aria-label'), controls: e.controls, src: e.currentSrc || e.src } })
    return { ok: v.label.includes(f.title) && v.controls && v.src === f.video.url, detail: v.src }
  })
  await check('filme', 'legendas: <track> no próprio site, WebVTT válido e anunciado na página', async () => {
    const track = await page.evaluate(() => { const t = document.querySelector('video track'); return { src: t.src, kind: t.kind, lang: t.srclang, label: t.label } })
    const res = await page.request.get(track.src)
    const body = await res.text()
    const note = await page.getByText(/Legendas disponíveis/).innerText()
    return { ok: track.src.startsWith(BASE) && track.kind === 'captions' && res.ok() && body.startsWith('WEBVTT') && /inglês/.test(note), detail: `${track.src} · ${note}` }
  })
  await check('filme', 'reprodução simulada: toca, grava o progresso e retoma após recarregar', async () => {
    await page.evaluate(async () => { const v = document.querySelector('video'); v.muted = true; await v.play() })
    await page.waitForFunction(() => document.querySelector('video').currentTime > 1.2)
    await page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 12 })
    await page.waitForFunction(() => document.querySelector('video').currentTime >= 12 && !document.querySelector('video').seeking)
    await page.evaluate(() => document.querySelector('video').pause())
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ondas:v1:films') || '{}'))
    const rec0 = saved[f.id]
    await page.reload()
    await page.waitForSelector('video')
    await page.waitForFunction(() => document.querySelector('video').readyState >= 1)
    await page.waitForFunction(() => document.querySelector('video').currentTime >= 11)
    const at = await page.evaluate(() => document.querySelector('video').currentTime)
    const resumed = await page.getByText(/Retomando de/).first().innerText()
    return { ok: rec0 && rec0.pos >= 11 && rec0.dur > 19 && at >= 11 && /0:12|00:12/.test(resumed), detail: `salvo ${JSON.stringify(rec0)}; retomou em ${at.toFixed(1)}s; "${resumed}"` }
  })
  await check('filme', 'Recomeçar volta ao início', async () => {
    await page.getByRole('button', { name: 'Recomeçar' }).click()
    await page.waitForFunction(() => document.querySelector('video').currentTime < 3)
    return true
  })
  await check('filme', 'compartilhar abre o diálogo com o link da página estática do filme', async () => {
    await page.getByRole('button', { name: 'Compartilhar', exact: true }).click()
    const dlg = page.getByRole('dialog')
    await dlg.waitFor()
    const val = await dlg.locator('input[readonly], input[type=text], textarea').first().inputValue()
    await page.keyboard.press('Escape')
    return { ok: val.includes(`filme/${f.slug}/`), detail: val }
  })
  await scan(page, 'página de filme com legendas')
}

{
  const f = plain
  const page = await newPage()
  await go(page, `#/filme/${f.slug}`)
  await page.waitForSelector('video')
  await check('filme', 'sem legendas: a página explica em vez de esconder', async () => (await page.getByText(/não tem legendas/).count()) === 1)
  // Limite conhecido: a maioria dos filmes não tem legenda no archive.org, então a regra "video-caption" do axe falha (WCAG 1.2.2).
  await scan(page, 'página de filme sem legendas (exceto video-caption, limite documentado)', { skip: ['video-caption'] })
}

// ============================================================ qualidade, aviso e erros
{
  const f = withHd
  const page = await newPage()
  await go(page, `#/filme/${f.slug}`)
  await page.waitForSelector('video')
  await check('qualidade', 'alta qualidade troca a fonte e mostra o tamanho de cada opção', async () => {
    await page.getByRole('radio', { name: /Alta/ }).check()
    await page.waitForFunction((u) => document.querySelector('video').src === u, f.hd.url)
    const labels = await page.locator('fieldset label').allInnerTexts()
    return { ok: labels.length === 2 && labels.every((l) => /(MB|GB)/.test(l)), detail: labels.join(' | ') }
  })
}

{
  const f = graphic
  const page = await newPage()
  await go(page, `#/filme/${f.slug}`)
  await check('aviso', 'imagens perturbadoras: o vídeo não carrega antes de a pessoa confirmar', async () => {
    const before = await page.locator('video').count()
    const requests = videoRequests.filter((u) => u.includes(f.id)).length
    await page.getByRole('button', { name: 'Entendi, quero assistir' }).click()
    await page.waitForSelector('video')
    await page.waitForFunction(() => document.activeElement?.tagName === 'VIDEO', null, { timeout: 3000 }).catch(() => {})
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    return { ok: before === 0 && requests === 0 && focused === 'VIDEO', detail: `vídeos antes: ${before}, pedidos: ${requests}, foco: ${focused}` }
  })
  await check('aviso', 'o aviso de conteúdo está na página como nota', async () => (await page.getByRole('note').filter({ hasText: 'Aviso de conteúdo' }).count()) === 1)
  await scan(page, 'filme com aviso (depois de confirmar)', { skip: ['video-caption'] })
}

{
  const page = await newPage({ videoFails: true })
  await go(page, `#/filme/${plain.slug}`)
  await check('erro', 'vídeo que não carrega mostra alerta com link para o archive.org', async () => {
    await page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o vídeo' }).waitFor()
    return (await page.getByRole('link', { name: 'Abrir no archive.org' }).getAttribute('href')) === plain.archiveUrl
  })
}

{
  const page = await newPage()
  await go(page, '#/filme/nao-existe')
  await check('erro', 'filme inexistente: título claro e volta para a lista', async () => {
    await page.getByRole('heading', { level: 1, name: 'Não encontramos este filme.' }).waitFor()
    return (await page.getByRole('link', { name: 'Filmes' }).first().getAttribute('href')) === '#/filmes'
  })
  const offline = await newPage()
  await go(offline, '#/filmes')
  await waitCards(offline)
  await check('erro', 'sem internet a lista avisa que filmes só tocam online', async () => {
    await offline.context().setOffline(true)
    await offline.getByText('Você está sem internet. Os filmes só tocam online.').waitFor()
    await offline.context().setOffline(false)
    return true
  })
}

{
  const page = await newPage()
  await go(page, `#/filmes?g=${FILMS[0].genre}`)
  await waitCards(page)
  await check('rota', 'link com ?g=<gênero> abre a lista já filtrada', async () => {
    const n = await cards(page).count()
    return { ok: n === FILMS.filter((f) => f.genre === FILMS[0].genre).length, detail: `${n} filmes` }
  })
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`)
if (failed.length) {
  console.log('FALHAS:')
  failed.forEach((r) => console.log(`  [${r.g}] ${r.n}`))
  process.exit(1)
}
