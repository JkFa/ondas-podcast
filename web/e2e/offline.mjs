// Verificações da Fase 4 (offline / PWA) no navegador, usando o build de produção (com service worker). Uso:
//   npm run build:fast && (npx vite preview --port 4173 &) && BASE_URL=http://localhost:4173/ npm run test:offline
// Critério de aceite: em modo avião o app abre, lista os downloads e toca do início ao fim, com saltos funcionando.
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:4173/').replace(/\/?$/, '/')
// Episódio curto usado nos testes: O Livro de Ruth, capítulo 3 (~3:24, ~3,8 MB)
const SHORT_AUDIO = 'https://archive.org/download/livro_de_ruth_1811_librivox/ruth_3_almeida.mp3'
const results = []
const rec = (g, n, ok, d = '') => { results.push({ g, n, ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} [${g}] ${n}${d ? ` — ${d}` : ''}`) }
const check = async (g, n, fn) => { try { const r = await fn(); rec(g, n, r === undefined || r === true || r?.ok !== false, r?.detail) } catch (e) { rec(g, n, false, String(e.message).split('\n')[0]) } }

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
async function newContext({ prefs = {}, ua, width = 1100, height = 900, init } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', serviceWorkers: 'allow', ...(ua ? { userAgent: ua } : {}) })
  await ctx.route('https://abacus.jasoncameron.dev/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"value":1}' }))
  await ctx.addInitScript(({ p, extra }) => {
    try { if (!localStorage.getItem('ondas:v1:a11y')) localStorage.setItem('ondas:v1:a11y', JSON.stringify(p)) } catch { /* ignora */ }
    if (extra) new Function(extra)()
  }, { p: prefs, extra: init })
  return ctx
}
async function open(ctx, hash = '') {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => rec('erros', 'erro de JavaScript', false, e.message))
  await page.goto(`${BASE}${hash}`)
  await page.waitForSelector('main h1')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {})
  return page
}
const scan = async (page, label) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(150)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  rec('axe', label, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`).join(' | '))
}
const targets44 = (page) => page.evaluate(() => {
  const bad = []
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden])')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[inert]') || el.closest('.sr-only-focusable')) continue
    if (cs.display === 'inline' && el.tagName === 'A') continue
    if (el.closest('p, li, dd') && (cs.display === 'inline' || cs.display === 'inline-block')) continue // texto corrido: exceção do WCAG 2.5.8
    if (el.type === 'range') continue
    if (r.width < 43.5 || r.height < 43.5) bad.push(`${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}] ${Math.round(r.width)}×${Math.round(r.height)}`)
  }
  return bad
})
const bookPage = async (ctx) => { const p = await open(ctx, '#/livro/o-livro-de-ruth'); return p }
const cacheKeys = (page) => page.evaluate(async () => { const c = await caches.open('ondas-offline-v1'); return (await c.keys()).map((r) => r.url) })
const statusText = async (page) => { await page.waitForTimeout(350); return page.locator('[role=status][aria-label="Avisos"]').textContent() } // o aviso entra ~60 ms depois do evento

// ===================================================================== instalável e service worker
{
  const ctx = await newContext()
  const page = await open(ctx)
  await check('PWA', 'service worker ativo controlando a página, com o app e o catálogo pré-carregados', async () => {
    const st = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      const names = await caches.keys()
      const pre = names.find((n) => n.includes('precache'))
      const keys = pre ? (await (await caches.open(pre)).keys()).map((r) => new URL(r.url).pathname.split('/').pop()) : []
      return { active: reg.active?.state, scope: new URL(reg.scope).pathname, controlled: !!navigator.serviceWorker.controller, keys }
    })
    const need = ['index.html', 'catalog.json']
    return { ok: st.active === 'activated' && st.controlled && need.every((n) => st.keys.some((k) => k.startsWith(n.split('.')[0]) || k === n)) && st.keys.some((k) => k.endsWith('.js')) && st.keys.some((k) => k.endsWith('.woff2')), detail: `${st.keys.length} arquivos pré-carregados` }
  })
  await check('PWA', 'o navegador considera o app instalável (CDP: Page.getInstallabilityErrors)', async () => {
    const cdp = await ctx.newCDPSession(page)
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
    return { ok: installabilityErrors.length === 0, detail: JSON.stringify(installabilityErrors.map((e) => e.errorId)) }
  })
  await check('PWA', 'manifest: nome, início, modo standalone e ícones any + maskable', async () => {
    const m = await (await fetch(`${BASE}manifest.webmanifest`)).json()
    const purposes = m.icons.map((i) => i.purpose)
    return { ok: m.name === 'Ondas' && m.display === 'standalone' && purposes.includes('any') && purposes.includes('maskable') && m.icons.some((i) => i.sizes === '512x512'), detail: `${m.icons.length} ícones` }
  })
  await check('fontes', 'fontes auto-hospedadas (sem Google Fonts) carregam', async () => {
    const reqs = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name))
    const ok = await page.evaluate(() => document.fonts.check("16px 'Inter Variable'") && document.fonts.check("700 16px 'Bricolage Grotesque Variable'"))
    return { ok: ok && !reqs.some((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)), detail: `Inter/Bricolage ok=${ok}` }
  })
  await ctx.close()
}

// ===================================================================== baixar um episódio
const ctx = await newContext()
let page = await bookPage(ctx)
await page.waitForFunction(() => navigator.onLine)
await check('download', 'baixar um episódio: mostra progresso, termina, avisa e o botão vira "Remover"', async () => {
  const btn = page.getByRole('button', { name: /^Baixar O Livro de Ruth — Capitulo 3 para ouvir offline$/ })
  await btn.click()
  await page.getByRole('button', { name: /^Remover o download de O Livro de Ruth — Capitulo 3$/ }).waitFor({ timeout: 90000 })
  const said = await statusText(page)
  return { ok: /Baixado para ouvir offline: O Livro de Ruth — Capitulo 3/.test(said), detail: said }
})
await check('download', 'o Cache Storage guarda o MP3, a capa e a transcrição; o tamanho fica registrado', async () => {
  const keys = await cacheKeys(page)
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('ondas:v1:downloads') || '{}'))
  const m = meta['livro-de-ruth-1811-03']
  return { ok: keys.includes(SHORT_AUDIO) && keys.some((k) => /\.jpg$/i.test(k)) && keys.some((k) => /transcripts\/livro-de-ruth-1811-03\.vtt$/.test(k)) && m?.bytes > 1e6, detail: `${keys.length} itens, ${(m?.bytes / 1e6).toFixed(1)} MB` }
})
await check('download', '"Disponível offline" aparece no episódio e na obra ("1 de 4 baixadas")', async () => {
  const row = await page.getByText('Disponível offline').count()
  const status = await page.getByText('1 de 4 baixadas').count()
  return { ok: row >= 1 && status === 1 }
})
await check('download', 'alvos de toque ≥ 44 px com os botões de download', async () => { const bad = await targets44(page); return { ok: bad.length === 0, detail: bad.slice(0, 3).join(' | ') } })
await scan(page, 'obra com downloads · escuro')

await check('Meus downloads', 'a página lista o episódio, o tamanho e o espaço usado, e mostra Online', async () => {
  await page.goto(`${BASE}#/downloads`)
  await page.getByRole('heading', { name: 'Meus downloads' }).waitFor()
  const body = await page.locator('main').innerText()
  return { ok: /1 episódio baixado/.test(body) && /Capitulo 3/.test(body) && /Online/.test(body) && /usados pelo Ondas|Armazenamento/.test(body), detail: body.split('\n').filter((l) => /baixado|usados/.test(l)).join(' | ') }
})
await scan(page, 'Meus downloads (com item) · escuro')

// ===================================================================== MODO AVIÃO
await ctx.setOffline(true)
await page.evaluate(() => window.dispatchEvent(new Event('offline')))
await check('modo avião', 'a faixa "Sem conexão. Você pode ouvir os episódios baixados." aparece e é anunciada', async () => {
  await page.getByTestId('offline-banner').waitFor({ timeout: 5000 })
  return { ok: /Sem conexão/.test(await statusText(page)) }
})
await page.reload()
await check('modo avião', 'o app ABRE sem internet (reload offline) e o catálogo carrega (71 obras)', async () => {
  await page.waitForSelector('main h1', { timeout: 15000 })
  await page.goto(`${BASE}#/biblioteca`)
  await page.waitForSelector('a[href^="#/livro/"]', { timeout: 15000 })
  const n = await page.locator('a[href^="#/livro/"]').count()
  return { ok: n === 71, detail: `${n} obras` }
})
await check('modo avião', 'fontes continuam as do app (sem recorrer à rede)', async () => ({ ok: await page.evaluate(() => document.fonts.check("16px 'Inter Variable'")) }))
await check('modo avião', 'filtro "Baixados" mostra só a obra com download, com o selo Offline', async () => {
  await page.getByRole('button', { name: 'Baixados' }).click()
  const cards = await page.locator('a[href^="#/livro/"]').count()
  const badge = await page.getByText('Offline 1/4').count()
  return { ok: cards === 1 && badge === 1, detail: `${cards} obra(s)` }
})
await check('modo avião', 'a página Meus downloads lista os itens e mostra Offline', async () => {
  await page.goto(`${BASE}#/downloads`)
  await page.getByRole('heading', { name: 'Meus downloads' }).waitFor()
  const body = await page.locator('main').innerText()
  return { ok: /Capitulo 3/.test(body) && /Offline/.test(body) }
})
await scan(page, 'Meus downloads · offline · escuro')
await check('modo avião', 'episódios NÃO baixados ficam desabilitados com "Indisponível offline"', async () => {
  await page.goto(`${BASE}#/livro/o-livro-de-ruth`)
  await page.waitForSelector('main h1')
  const blocked = page.getByRole('button', { name: /^Tocar O Livro de Ruth — Capitulo 1.*Indisponível offline$/ })
  const ok = page.getByRole('button', { name: /^Tocar O Livro de Ruth — Capitulo 3\. Disponível offline$/ })
  return { ok: (await blocked.isDisabled()) && (await ok.isEnabled()) && (await page.getByRole('button', { name: /^Baixar O Livro de Ruth — Capitulo 1 para ouvir offline$/ }).isDisabled()) }
})
await scan(page, 'obra · offline · escuro')

let playedFully = false
await check('modo avião', 'toca o episódio baixado a partir do cache (início ao fim) e a posição avança', async () => {
  await page.getByRole('button', { name: /^Tocar O Livro de Ruth — Capitulo 3/ }).click()
  await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 1.5, null, { timeout: 30000 })
  const st = await page.evaluate(() => { const a = document.querySelector('audio'); return { t: a.currentTime, dur: a.duration, err: a.error?.code ?? null, src: a.src.split('/').pop() } })
  return { ok: !st.err && st.dur > 190 && /ruth_3/.test(st.src), detail: JSON.stringify(st) }
})
await check('modo avião', 'SALTOS funcionam com o arquivo local (Range): para 1:40, para o fim e de volta ao começo', async () => {
  const jump = async (t) => {
    await page.evaluate((t) => { document.querySelector('audio').currentTime = t }, t)
    await page.waitForFunction((t) => { const a = document.querySelector('audio'); return !a.seeking && Math.abs(a.currentTime - t) < 2 }, t, { timeout: 15000 })
    return page.evaluate(() => document.querySelector('audio').currentTime)
  }
  const a = await jump(100)
  const dur = await page.evaluate(() => document.querySelector('audio').duration)
  const b = await jump(dur - 20)
  const c = await jump(2)
  const err = await page.evaluate(() => document.querySelector('audio').error?.code ?? null)
  return { ok: Math.abs(a - 100) < 2 && Math.abs(b - (dur - 20)) < 2 && c < 6 && !err, detail: `100→${a.toFixed(1)}; fim-20→${b.toFixed(1)}; 2→${c.toFixed(1)}` }
})
await check('modo avião', 'barra de posição (slider) também salta offline', async () => {
  await page.getByRole('button', { name: /^Abrir player/ }).click(); await page.waitForTimeout(600)
  const slider = page.getByRole('slider', { name: 'Posição do episódio' })
  await slider.focus(); await page.keyboard.press('End'); await page.waitForTimeout(1500)
  const t = await page.evaluate(() => document.querySelector('audio').currentTime)
  await page.keyboard.press('Escape')
  return { ok: t > 150, detail: `t=${t.toFixed(1)}` }
})
await check('modo avião', 'toca do início ao fim: chega a "ended" sem erro (velocidade 4x para o teste ser rápido)', async () => {
  await page.evaluate(() => { const a = document.querySelector('audio'); a.currentTime = 0 })
  await page.waitForFunction(() => document.querySelector('audio').currentTime < 3, null, { timeout: 10000 })
  await page.evaluate(() => { window.__ended = false; const a = document.querySelector('audio'); a.addEventListener('ended', () => { window.__ended = true }); a.playbackRate = 4; a.play() })
  await page.waitForFunction(() => window.__ended === true, null, { timeout: 120000 })
  playedFully = true
  const err = await page.evaluate(() => document.querySelector('audio').error?.code ?? null)
  return { ok: !err }
})
await check('modo avião', 'transcrição do episódio baixado abre offline', async () => {
  await page.getByRole('button', { name: /^Abrir player/ }).click(); await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Ver transcrição' }).click()
  await page.getByRole('list', { name: 'Trechos da transcrição' }).waitFor({ timeout: 8000 })
  const n = await page.locator('ol[aria-label="Trechos da transcrição"] > li').count()
  await page.keyboard.press('Escape')
  return { ok: n > 3, detail: `${n} parágrafos` }
})
await check('modo avião', 'capas aparecem offline (a baixada e as vistas antes)', async () => {
  await page.goto(`${BASE}#/livro/o-livro-de-ruth`)
  await page.waitForSelector('main h1')
  await page.waitForTimeout(1500)
  const ok = await page.evaluate(() => [...document.images].filter((i) => i.src.includes('archive.org')).every((i) => i.complete && i.naturalWidth > 0))
  return { ok }
})

// ===================================================================== voltou a conexão
await ctx.setOffline(false)
await page.evaluate(() => window.dispatchEvent(new Event('online')))
await check('modo avião', 'ao voltar a conexão a faixa some e o aviso "Conexão restabelecida" é dado', async () => {
  await page.getByTestId('offline-banner').waitFor({ state: 'detached', timeout: 5000 })
  return { ok: /Conexão restabelecida/.test(await statusText(page)) }
})

// ===================================================================== mono + cache (resposta do SW com CORS)
{
  const c2 = await newContext({ prefs: { mono: true } })
  const p2 = await bookPage(c2)
  await p2.getByRole('button', { name: /^Baixar O Livro de Ruth — Capitulo 3 para ouvir offline$/ }).click()
  await p2.getByRole('button', { name: /^Remover o download de/ }).waitFor({ timeout: 90000 })
  await c2.setOffline(true)
  await check('mono', 'áudio mono (Web Audio + CORS) também toca o arquivo baixado, offline', async () => {
    await p2.getByRole('button', { name: /^Tocar O Livro de Ruth — Capitulo 3/ }).click()
    await p2.waitForFunction(() => document.querySelector('audio')?.currentTime > 1.5, null, { timeout: 30000 })
    const st = await p2.evaluate(() => ({ cors: document.querySelector('audio').crossOrigin, err: document.querySelector('audio').error?.code ?? null, mono: JSON.parse(localStorage.getItem('ondas:v1:a11y')).mono }))
    return { ok: st.cors === 'anonymous' && !st.err && st.mono === true, detail: JSON.stringify(st) }
  })
  await c2.close()
}

// ===================================================================== remover, obra inteira, cancelar, erro, espaço
await page.goto(`${BASE}#/livro/o-livro-de-ruth`); await page.waitForSelector('main h1')
await check('remover', 'remover o download apaga o arquivo do cache e o registro', async () => {
  await page.getByRole('button', { name: /^Remover o download de O Livro de Ruth — Capitulo 3$/ }).click()
  await page.getByRole('button', { name: /^Baixar O Livro de Ruth — Capitulo 3 para ouvir offline$/ }).waitFor({ timeout: 5000 })
  const keys = await cacheKeys(page)
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('ondas:v1:downloads') || '{}'))
  return { ok: !keys.includes(SHORT_AUDIO) && !keys.some((k) => /\.jpg$/i.test(k)) && Object.keys(meta).length === 0, detail: `${keys.length} itens restantes` }
})
await check('obra inteira', 'baixar a obra inteira (4 partes): acompanha "n de 4", termina e libera "Remover downloads da obra"', async () => {
  await page.getByRole('button', { name: /^Baixar a obra inteira \(4 partes, cerca de/ }).click()
  await page.getByText(/^Baixando \d de 4/).first().waitFor({ timeout: 15000 })
  await page.getByText('4 de 4 baixadas').waitFor({ timeout: 180000 })
  const keys = (await cacheKeys(page)).filter((k) => /\.mp3$/.test(k))
  return { ok: keys.length === 4, detail: `${keys.length} MP3 no cache` }
})
await check('obra inteira', 'remover os downloads da obra apaga tudo', async () => {
  await page.getByRole('button', { name: 'Remover downloads da obra' }).click()
  await page.getByRole('button', { name: /^Baixar a obra inteira/ }).waitFor({ timeout: 8000 })
  return { ok: (await cacheKeys(page)).length === 0 }
})
await check('cancelar', 'cancelar um download em andamento não deixa arquivo nem registro', async () => {
  // episódio longo (Esaú e Jacó, parte 1) para dar tempo de cancelar
  await page.goto(`${BASE}#/livro/esau-e-jaco`); await page.waitForSelector('main h1')
  await page.getByRole('button', { name: /^Baixar Esaú e Jacó — Advertência.* para ouvir offline$/ }).click()
  const cancel = page.getByRole('button', { name: /^Cancelar o download de Esaú e Jacó — Advertência/ })
  await cancel.waitFor({ timeout: 10000 })
  await cancel.click()
  await page.getByRole('button', { name: /^Baixar Esaú e Jacó — Advertência.* para ouvir offline$/ }).waitFor({ timeout: 8000 })
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('ondas:v1:downloads') || '{}'))
  return { ok: Object.keys(meta).length === 0 && (await cacheKeys(page)).filter((k) => /\.mp3$/.test(k)).length === 0 }
})
await ctx.close()

{
  const c3 = await newContext()
  let fail = true
  await c3.route('**/ruth_3_almeida.mp3', (r) => (fail ? r.abort('failed') : r.continue()))
  const p3 = await bookPage(c3)
  await check('erros', 'falha de rede no download mostra erro com "Tentar baixar … de novo" e recupera', async () => {
    await p3.getByRole('button', { name: /^Baixar O Livro de Ruth — Capitulo 3 para ouvir offline$/ }).click()
    const retry = p3.getByRole('button', { name: /^Tentar baixar O Livro de Ruth — Capitulo 3 de novo$/ })
    await retry.waitFor({ timeout: 20000 })
    fail = false
    await retry.click()
    await p3.getByRole('button', { name: /^Remover o download de O Livro de Ruth — Capitulo 3$/ }).waitFor({ timeout: 90000 })
    return { ok: (await p3.evaluate(() => (JSON.parse(localStorage.getItem('ondas:v1:downloads') || '{}'))['livro-de-ruth-1811-03']?.bytes)) > 1e6 }
  })
  await c3.close()
}
{
  const c4 = await newContext({ init: "const e = navigator.storage.estimate.bind(navigator.storage); navigator.storage.estimate = async () => ({ usage: 1e6, quota: 2e6 })" })
  const p4 = await bookPage(c4)
  await check('erros', 'sem espaço no aparelho: avisa "Espaço insuficiente" em vez de baixar pela metade', async () => {
    await p4.getByRole('button', { name: /^Baixar O Livro de Ruth — Capitulo 3 para ouvir offline$/ }).click()
    await p4.getByRole('button', { name: /^Tentar baixar O Livro de Ruth — Capitulo 3 de novo$/ }).waitFor({ timeout: 15000 })
    const title = await p4.getByRole('button', { name: /^Tentar baixar/ }).getAttribute('title')
    const said = await statusText(p4)
    return { ok: /Espaço insuficiente/.test(title) && /Não foi possível baixar/.test(said), detail: `${title} | ${said}` }
  })
  await c4.close()
}
{
  const c5 = await newContext({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', width: 390, height: 844 })
  const p5 = await open(c5, '#/downloads')
  await check('iOS', 'no Safari do iPhone a página explica a limitação e como instalar (Adicionar à Tela de Início)', async () => {
    await p5.getByRole('heading', { name: 'No iPhone e iPad' }).waitFor({ timeout: 5000 })
    return { ok: /Adicionar à Tela de Início/.test(await p5.locator('main').innerText()) }
  })
  await scan(p5, 'Meus downloads (iPhone, vazio) · escuro')
  await check('layout', 'sem rolagem horizontal em 390 px', async () => ({ ok: !(await p5.evaluate(() => document.documentElement.scrollWidth > innerWidth)) }))
  await c5.close()
}
{
  const c6 = await newContext({ prefs: { theme: 'light' } })
  const p6 = await bookPage(c6)
  await scan(p6, 'obra com botões de download · claro')
  await p6.goto(`${BASE}#/downloads`); await p6.getByRole('heading', { name: 'Meus downloads' }).waitFor()
  await scan(p6, 'Meus downloads (vazio) · claro')
  await c6.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações OK${playedFully ? '' : ' (reprodução completa offline NÃO verificada)'}`)
process.exit(failed.length ? 1 : 0)
