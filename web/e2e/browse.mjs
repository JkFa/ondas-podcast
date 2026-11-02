// Verificações da Fase 7 (busca com transcrições, páginas de autor e de gênero) no navegador. Uso:
//   npm run build:fast && (npx vite preview --port 4173 &) && BASE_URL=http://localhost:4173/ npm run test:browse
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:4173/').replace(/\/?$/, '/')
const results = []
const rec = (g, n, ok, d = '') => { results.push({ g, n, ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} [${g}] ${n}${d ? ` — ${d}` : ''}`) }
const check = async (g, n, fn) => { try { const r = await fn(); rec(g, n, r === undefined || r === true || r?.ok !== false, r?.detail) } catch (e) { rec(g, n, false, String(e.message).split('\n')[0]) } }

const browser = await chromium.launch()
async function newPage({ width = 1100, height = 1000, theme = 'dark', blockIndex = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', serviceWorkers: 'block' })
  await ctx.route('https://abacus.jasoncameron.dev/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"value":1}' }))
  if (blockIndex) await ctx.route('**/search-index.json', (r) => r.abort('failed'))
  await ctx.addInitScript((t) => { try { localStorage.setItem('ondas:v1:a11y', JSON.stringify({ theme: t })) } catch { /* ignora */ } }, theme)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => rec('erros', 'erro de JavaScript', false, e.message))
  return page
}
const go = async (page, hash) => { await page.goto(`${BASE}${hash}`); await page.waitForSelector('main h1') }
const scan = async (page, label) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(150)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  rec('axe', label, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`).join(' | '))
}
const box = (page) => page.getByRole('searchbox', { name: 'Buscar na biblioteca' })
const bookCards = (page) => page.locator('main section[aria-labelledby="lib-h"] a[href^="#/livro/"]')
const status = (page) => page.locator('[role=status][aria-label="Avisos"]')

// ============================================================ busca
{
  const page = await newPage()
  let fetched = 0
  page.on('request', (r) => { if (r.url().endsWith('search-index.json')) fetched++ })
  await go(page, '#/biblioteca')
  await page.waitForSelector('main section[aria-labelledby="lib-h"] a')
  await check('busca', 'o índice só é baixado quando a pessoa foca a busca', async () => {
    const before = fetched
    await box(page).focus()
    await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.endsWith('search-index.json')))
    return { ok: before === 0 && fetched === 1, detail: `antes ${before}, depois ${fetched}` }
  })
  await check('busca', 'título (sem acento e em maiúsculas): a obra aparece primeiro', async () => {
    await box(page).fill('ALIENISTA')
    await page.waitForFunction(() => document.querySelector('main section[aria-labelledby="lib-h"] a')?.getAttribute('aria-label')?.startsWith('O Alienista'))
    return true
  })
  await check('busca', 'tolera erro de digitação', async () => {
    await box(page).fill('alienitsa')
    await page.waitForFunction(() => [...document.querySelectorAll('main section[aria-labelledby="lib-h"] a')].some((a) => a.getAttribute('aria-label')?.startsWith('O Alienista')))
    return true
  })
  await check('busca', 'por autor, sem acento', async () => {
    await box(page).fill('jose de alencar')
    await page.waitForFunction(() => document.querySelectorAll('main section[aria-labelledby="lib-h"] a').length > 0)
    const labels = await bookCards(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    const byAuthor = labels.filter((l) => /Jos[ée] de Alencar/.test(l)).length
    return { ok: byAuthor >= 5 && /Jos[ée] de Alencar/.test(labels[0]) && /Jos[ée] de Alencar/.test(labels[4]), detail: `${byAuthor} de ${labels.length} obras são dele; as dele vêm primeiro` }
  })
  await check('busca', 'trecho falado: acha o episódio e leva ao segundo certo', async () => {
    await box(page).fill('naomi sogra')
    const item = page.locator('#pass-h ~ ol a').first()
    await item.waitFor()
    const href = await item.getAttribute('href')
    const text = await item.innerText()
    const marks = await item.locator('mark').allInnerTexts()
    return { ok: /^#\/livro\/o-livro-de-ruth\?ep=livro-de-ruth-1811-\d+&t=\d+$/.test(href) && /Trecho falado/.test(text) && marks.length > 0, detail: `${href} · marcado: ${marks.join(',')}` }
  })
  await check('busca', 'clicar no trecho abre a obra, carrega o episódio e posiciona o áudio', async () => {
    const item = page.locator('#pass-h ~ ol a').first()
    const t = Number((await item.getAttribute('href')).match(/t=(\d+)/)[1])
    await item.click()
    await page.waitForSelector('main h1')
    await page.waitForFunction(() => /pronto para tocar a partir de/.test(document.querySelector('[role=status][aria-label="Avisos"]')?.textContent || ''), null, { timeout: 15000 })
    const live = await status(page).textContent()
    const src = await page.evaluate(() => document.querySelector('audio').src)
    return { ok: src.includes('ruth_3_almeida') && live.includes(`a partir de ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`), detail: live }
  })
  await go(page, '#/biblioteca')
  await check('busca', 'aviso de cobertura honesto (poucas transcrições)', async () => {
    await box(page).fill('naomi')
    const note = await page.getByText(/episódios têm transcrição/).textContent()
    return { ok: /^\d+ de \d+ episódios têm transcrição; nos demais/.test(note), detail: note.slice(0, 70) }
  })
  await check('busca', 'o total é anunciado ao leitor de tela depois de digitar', async () => {
    await box(page).fill('machado')
    await page.waitForFunction(() => /\d+ obras?( e \d+ trechos?)? encontrad/.test(document.querySelector('[role=status][aria-label="Avisos"]')?.textContent || ''), null, { timeout: 5000 })
    return true
  })
  await check('busca', 'sem resultado: mensagem e aviso', async () => {
    await box(page).fill('xyzzyqwv')
    await page.getByText('Nada encontrado para “xyzzyqwv”.').first().waitFor()
    await page.waitForFunction(() => /Nada encontrado/.test(document.querySelector('[role=status][aria-label="Avisos"]')?.textContent || ''), null, { timeout: 5000 })
    return true
  })
  await check('busca', 'filtros continuam valendo junto com a busca (Concluídos sem nada concluído)', async () => {
    await box(page).fill('machado')
    await page.getByRole('button', { name: 'Concluídos' }).click()
    await page.getByText(/Nenhuma obra nesta seção|Nada encontrado/).first().waitFor()
    await page.getByRole('button', { name: 'Todos' }).click()
    return (await bookCards(page).count()) > 0
  })
  await box(page).fill('naomi sogra')
  await page.locator('#pass-h ~ ol a').first().waitFor()
  await scan(page, 'axe: busca com trechos (escuro)')
  await page.context().close()
}
{
  const page = await newPage({ blockIndex: true })
  await go(page, '#/biblioteca')
  await check('busca', 'sem o índice: avisa e continua filtrando por título e autor', async () => {
    await box(page).fill('alienista')
    await page.getByText('A busca avançada não carregou').waitFor()
    const labels = await bookCards(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    return { ok: labels.some((l) => l.startsWith('O Alienista')), detail: `${labels.length} obras (sem ordem de relevância)` }
  })
  await page.context().close()
}

// ============================================================ gêneros
{
  const page = await newPage()
  await go(page, '#/biblioteca')
  await check('gêneros', 'a Biblioteca mostra os gêneros com a contagem e o atalho para os autores', async () => {
    const nav = page.getByRole('navigation', { name: 'Gêneros' })
    const names = await nav.getByRole('link').allInnerTexts()
    return { ok: names.length >= 6 && names.some((n) => /^Poesia\s*\d+/.test(n)) && names.some((n) => /todos os autores/.test(n)), detail: names.map((n) => n.replace(/\s+/g, ' ')).join(' | ') }
  })
  await check('gêneros', 'abrir "Poesia": título, obras e aba do navegador', async () => {
    await page.getByRole('navigation', { name: 'Gêneros' }).getByRole('link', { name: /^Poesia/ }).click()
    await page.waitForSelector('main h1')
    const h1 = await page.locator('main h1').textContent()
    const n = await page.locator('main section a[href^="#/livro/"]').count()
    const lead = await page.locator('main header p').last().textContent()
    return { ok: h1 === 'Poesia' && n >= 2 && (await page.title()) === 'Poesia — Ondas' && /classificação é automática/.test(lead) && page.url().endsWith('#/genero/poesia'), detail: `${n} obras · ${await page.title()}` }
  })
  await scan(page, 'axe: página de gênero (escuro)')
  await check('gêneros', 'compartilhar abre o diálogo com o link da página estática do gênero', async () => {
    await page.getByRole('button', { name: 'Compartilhar', exact: true }).click()
    const dlg = page.getByRole('dialog')
    await dlg.waitFor()
    const txt = await dlg.innerText()
    const val = await dlg.locator('input[readonly], input[type=text], input[type=url]').first().inputValue().catch(() => '')
    await page.keyboard.press('Escape')
    return { ok: /genero\/poesia\//.test(val + txt), detail: val }
  })
  await check('gêneros', 'gênero inexistente: mensagem e volta à biblioteca', async () => {
    await go(page, '#/genero/nao-existe')
    await page.getByText('Não encontramos esta página.').waitFor()
    return (await page.getByRole('link', { name: 'Biblioteca' }).count()) >= 1
  })
  await page.context().close()
}

// ============================================================ autores
{
  const page = await newPage()
  await go(page, '#/autores')
  await check('autores', 'índice com dezenas de autores em ordem alfabética', async () => {
    const names = await page.locator('main ul li a').evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent))
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return { ok: names.length >= 30 && JSON.stringify(names) === JSON.stringify(sorted) && (await page.title()) === 'Autores — Ondas', detail: `${names.length} autores` }
  })
  await scan(page, 'axe: índice de autores')
  await check('autores', 'abrir um autor mostra só as obras dele', async () => {
    await page.getByRole('link', { name: /^José de Alencar/ }).click()
    await page.waitForSelector('main h1')
    await page.waitForFunction(() => document.title === 'José de Alencar — Ondas')
    const h1 = await page.locator('main h1').textContent()
    const labels = await page.locator('main section a[href^="#/livro/"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    return { ok: h1 === 'José de Alencar' && labels.length >= 5 && labels.every((l) => /Jos[ée] de Alencar/.test(l)) && (await page.title()) === 'José de Alencar — Ondas', detail: `${labels.length} obras` }
  })
  await scan(page, 'axe: página de autor (escuro)')
  await check('autores', 'da página da obra: o autor é um link e os gêneros também', async () => {
    await go(page, '#/livro/iracema')
    const a = page.locator('main header').getByRole('link', { name: /José de Alencar/ })
    const href = await a.getAttribute('href')
    const chips = await page.getByRole('list', { name: 'Gêneros' }).getByRole('link').allInnerTexts()
    return { ok: href === '#/autor/jose-de-alencar' && chips.length >= 1, detail: `${href} · ${chips.join(', ')}` }
  })
  await check('autores', 'a página estática do autor tem prévia social e leva ao app', async () => {
    const html = await (await page.request.get(`${BASE}autor/jose-de-alencar/`)).text()
    await page.goto(`${BASE}autor/jose-de-alencar/`)
    await page.waitForURL(/#\/autor\/jose-de-alencar$/)
    return { ok: /og:title" content="José de Alencar/.test(html) && /og:image/.test(html) }
  })
  await check('autores', 'autor inexistente: mensagem clara', async () => {
    await go(page, '#/autor/ninguem')
    await page.getByText('Não encontramos esta página.').waitFor()
  })
  await page.context().close()
}
for (const theme of ['light', 'contrast']) {
  const page = await newPage({ theme })
  await go(page, '#/biblioteca')
  await box(page).fill('naomi')
  await page.locator('#pass-h ~ ol a').first().waitFor()
  await scan(page, `axe: busca com trechos (${theme})`)
  await go(page, '#/genero/romance')
  await scan(page, `axe: página de gênero (${theme})`)
  await page.context().close()
}
{
  const page = await newPage({ width: 360, height: 740 })
  await go(page, '#/biblioteca')
  await box(page).fill('naomi')
  await page.locator('#pass-h ~ ol a').first().waitFor()
  await check('mobile', '360 px: busca com trechos sem rolagem horizontal e alvos de 44 px', async () => {
    const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, small: [...document.querySelectorAll('main a, main button')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44 && !e.closest('[aria-hidden]')).map((e) => (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24)) }))
    return { ok: m.over <= 0 && m.small.length === 0, detail: JSON.stringify(m) }
  })
  await scan(page, 'axe: busca (360 px)')
  await go(page, '#/autor/jose-de-alencar')
  await check('mobile', '360 px: página de autor sem rolagem horizontal', async () => ({ ok: (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0 }))
  await page.context().close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`)
if (failed.length) { console.log('FALHAS:'); failed.forEach((f) => console.log(` - [${f.g}] ${f.n}`)); process.exit(1) }
