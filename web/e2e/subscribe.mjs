// Verificações da Fase 5 (assinar no app) no navegador. Uso:
//   npm run build:fast && (npx vite preview --port 4173 &) && BASE_URL=http://localhost:4173/ npm run test:subscribe
// O toque no app instalado em um celular real NÃO é testável aqui: os esquemas (podcast://, overcast://, pktc://)
// são conferidos na URL enviada ao sistema e no plano B quando o app não abre.
import AxeBuilder from '@axe-core/playwright'
import jsQR from 'jsqr'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:4173/').replace(/\/?$/, '/')
const FEED = `${BASE}feed.xml`
const results = []
const rec = (g, n, ok, d = '') => { results.push({ g, n, ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} [${g}] ${n}${d ? ` — ${d}` : ''}`) }
const check = async (g, n, fn) => { try { const r = await fn(); rec(g, n, r === undefined || r === true || r?.ok !== false, r?.detail) } catch (e) { rec(g, n, false, String(e.message).split('\n')[0]) } }

const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
}
const browser = await chromium.launch()
async function newPage({ ua, stub = true, theme = 'dark', width = 1000, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'], ...(ua ? { userAgent: ua } : {}) })
  await ctx.route('https://abacus.jasoncameron.dev/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"value":1}' }))
  await ctx.addInitScript(({ s, t }) => {
    try { if (!localStorage.getItem('ondas:v1:a11y')) localStorage.setItem('ondas:v1:a11y', JSON.stringify({ theme: t })) } catch { /* ignora */ }
    window.__opened = []
    window.open = (url) => { window.__opened.push(['web', url]); return null }
    if (s) window.__ondasLaunch = (url) => { window.__opened.push(['scheme', url]) } // emenda de teste (ver lib/launch.js)
  }, { s: stub, t: theme })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => rec('erros', 'erro de JavaScript', false, e.message))
  return page
}
const go = async (page, hash = '#/assinar') => { await page.goto(`${BASE}${hash}`); await page.waitForSelector('main h1') }
const opened = (page) => page.evaluate(() => window.__opened)
const scan = async (page, label) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(150)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  rec('axe', label, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`).join(' | '))
}
const names = (page, sel) => page.locator(sel).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.textContent.trim()))
const oneTapNames = (page) => names(page, 'section[aria-label="Abrir com um toque"] button')
const manualNames = (page) => names(page, 'section[aria-label="Outros apps (passo a passo)"] summary')

// ============================================================ detecção do sistema
for (const [plat, expectOne, expectManualHas, expectManualNot] of [
  ['ios', ['Assinar no Apple Podcasts', 'Assinar no Overcast', 'Assinar no Pocket Casts'], ['Castro', 'Castbox', 'Podverse', 'Fountain'], ['AntennaPod', 'Podcast Addict']],
  ['android', ['Assinar no AntennaPod'], ['Pocket Casts', 'Podcast Addict', 'Castbox'], ['Castro', 'Overcast']],
  ['mac', ['Assinar no Apple Podcasts'], ['Pocket Casts', 'Castro'], []],
]) {
  const page = await newPage({ ua: UA[plat] })
  await go(page)
  await check('detecção', `${plat}: apps de um toque na ordem certa e os demais com passo a passo`, async () => {
    const one = await oneTapNames(page)
    const man = await manualNames(page)
    return { ok: JSON.stringify(one) === JSON.stringify(expectOne) && expectManualHas.every((n) => man.includes(n)) && expectManualNot.every((n) => !man.includes(n)), detail: `${one.join(', ')} | manual: ${man.join(', ')}` }
  })
  await page.context().close()
}
{
  const page = await newPage()
  await go(page)
  await check('detecção', 'computador: AntennaPod (link web) como um toque e o resto com passo a passo', async () => ({ ok: JSON.stringify(await oneTapNames(page)) === JSON.stringify(['Assinar no AntennaPod']) && (await manualNames(page)).length >= 5 }))
  await page.context().close()
}

// ============================================================ links enviados ao sistema
{
  const page = await newPage({ ua: UA.ios })
  await go(page)
  const enc = encodeURIComponent(FEED)
  const host = FEED.replace(/^https?:\/\//, '')
  await check('esquemas', 'Apple Podcasts abre podcast://<feed sem https://>', async () => {
    await page.getByRole('button', { name: 'Assinar no Apple Podcasts' }).click()
    const o = await opened(page)
    return { ok: o.at(-1)?.[1] === `podcast://${host}`, detail: o.at(-1)?.[1] }
  })
  await check('esquemas', 'Overcast abre overcast://x-callback-url/add?url=<feed codificado>', async () => {
    await page.getByRole('button', { name: 'Assinar no Overcast' }).click()
    return { ok: (await opened(page)).at(-1)?.[1] === `overcast://x-callback-url/add?url=${enc}` }
  })
  await check('esquemas', 'Pocket Casts abre pktc://subscribe/<feed sem https://>', async () => {
    await page.getByRole('button', { name: 'Assinar no Pocket Casts' }).click()
    return { ok: (await opened(page)).at(-1)?.[1] === `pktc://subscribe/${host}` }
  })
  await page.context().close()
}
{
  const page = await newPage({ ua: UA.android })
  await go(page)
  await check('esquemas', 'AntennaPod abre o link web oficial /deeplink/subscribe?url=…&title=Ondas', async () => {
    await page.getByRole('button', { name: 'Assinar no AntennaPod' }).click()
    const o = (await opened(page)).at(-1) ?? []
    return { ok: o[1] === `https://antennapod.org/deeplink/subscribe?url=${encodeURIComponent(FEED)}&title=Ondas`, detail: o[1] }
  })
  await page.context().close()
}

// ============================================================ último app e plano B
{
  const page = await newPage({ ua: UA.ios })
  await go(page)
  await check('último app', 'depois de assinar, volta a oferecer "Assinar no Overcast de novo" em um toque (e lembra após recarregar)', async () => {
    await page.getByRole('button', { name: 'Assinar no Overcast' }).click()
    await page.reload(); await page.waitForSelector('main h1')
    const again = page.getByRole('button', { name: 'Assinar no Overcast de novo' })
    const first = await page.locator('main button').evaluateAll((els) => els.map((e) => e.textContent.trim()).find((t) => /de novo/.test(t)))
    await again.click()
    const o = await opened(page)
    return { ok: (await again.count()) === 1 && /^overcast:\/\//.test(o.at(-1)?.[1]) && !!first, detail: first }
  })
  await page.context().close()
}
{
  // sem a emenda de teste: o navegador sem app para o esquema deixa a página visível → plano B em ~1,5 s
  const page = await newPage({ ua: UA.ios, stub: false })
  await go(page)
  await check('plano B', 'se o app não abrir em ~1,5 s mostra loja do app, copiar feed e passo a passo', async () => {
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Assinar no Overcast' }).click()
    const alert = page.getByRole('alert')
    await alert.waitFor({ timeout: 6000 })
    const dt = Date.now() - t0
    const text = await alert.innerText()
    const store = await alert.getByRole('link', { name: /Baixar o Overcast \(App Store\)/ }).getAttribute('href')
    return { ok: dt >= 1400 && dt < 3500 && /Overcast não abriu/.test(text) && store === 'https://apps.apple.com/br/app/overcast/id888422857' && (await alert.getByRole('button', { name: 'Copiar link do feed' }).count()) === 1, detail: `${dt} ms` }
  })
  await scan(page, 'plano B (app não abriu) · iPhone')
  await page.context().close()
}
{
  // se o app abre, a página perde o foco/fica oculta e o plano B NÃO aparece
  const page = await newPage({ ua: UA.ios, stub: false })
  await go(page)
  await check('plano B', 'quando o app abre (a página perde o foco), o aviso de falha não aparece', async () => {
    await page.getByRole('button', { name: 'Assinar no Pocket Casts' }).click()
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await page.waitForTimeout(2200)
    return { ok: (await page.getByRole('alert').count()) === 0 }
  })
  await page.context().close()
}

// ============================================================ copiar feed, QR, passo a passo
{
  const page = await newPage({ ua: UA.android })
  await go(page)
  await check('feed', 'copiar link do feed copia a URL do feed e avisa', async () => {
    await page.getByRole('button', { name: 'Copiar link do feed' }).first().click()
    await page.waitForTimeout(350)
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    return { ok: clip === FEED && /Link do feed copiado/.test(await page.locator('[role=status][aria-label="Avisos"]').textContent()), detail: clip }
  })
  await check('QR', 'o QR code decodifica para o endereço do feed (jsQR) e tem descrição acessível', async () => {
    await page.getByRole('button', { name: 'Mostrar QR code' }).click()
    const svg = page.getByRole('img', { name: /^QR code com o endereço do feed/ })
    await svg.waitFor()
    const px = await page.evaluate(async () => {
      const el = document.querySelector('svg[aria-label^="QR code"]')
      const xml = new XMLSerializer().serializeToString(el)
      const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
      await img.decode()
      const c = document.createElement('canvas'); c.width = 448; c.height = 448
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 448, 448)
      return { data: Array.from(ctx.getImageData(0, 0, 448, 448).data), w: 448, h: 448 }
    })
    const res = jsQR(Uint8ClampedArray.from(px.data), px.w, px.h)
    return { ok: res?.data === FEED, detail: res?.data }
  })
  await check('passo a passo', 'apps sem link mostram o passo a passo e a loja (Podcast Addict, Android)', async () => {
    await page.getByText('Podcast Addict', { exact: true }).click()
    const steps = await page.getByRole('list', { name: 'Como assinar no Podcast Addict' }).innerText()
    const store = await page.getByRole('link', { name: /Baixar o Podcast Addict \(Google Play\)/ }).getAttribute('href')
    return { ok: /Adicionar um podcast/.test(steps) && store === 'https://play.google.com/store/apps/details?id=com.bambuna.podcastaddict', detail: store }
  })
  await check('plataformas', 'Spotify, YouTube Music, Amazon Music e Deezer ficam ocultos com config/platforms.json vazio', async () => ({ ok: (await page.getByRole('link', { name: /^Ouvir no (Spotify|YouTube Music|Amazon Music|Deezer)/ }).count()) === 0 && (await page.getByRole('heading', { name: 'Também no' }).count()) === 0 }))
  await scan(page, 'assinar · Android · QR e passo a passo abertos · escuro')
  await check('alvos 44px', 'botões e campos com ≥ 44 px', async () => {
    const bad = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, summary')) {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
        if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('.sr-only-focusable') || el.closest('[inert]')) continue
        if (el.closest('p, li') && (cs.display === 'inline' || cs.display === 'inline-block')) continue // texto corrido (WCAG 2.5.8)
        if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28)}] ${Math.round(r.width)}×${Math.round(r.height)}`)
      }
      return out
    })
    return { ok: bad.length === 0, detail: bad.slice(0, 4).join(' | ') }
  })
  await page.context().close()
}

// ============================================================ feeds por obra
{
  const page = await newPage({ ua: UA.ios })
  await go(page)
  await check('por obra', 'escolher uma obra troca o feed (feeds/<obra>.xml) e o título enviado ao app', async () => {
    await page.getByLabel('O que assinar').selectOption({ label: 'O Livro de Ruth' })
    await page.waitForTimeout(200)
    const feed = await page.locator('#feed-url').inputValue()
    await page.getByRole('button', { name: 'Assinar no Overcast' }).click()
    const url = (await opened(page)).at(-1)?.[1]
    return { ok: feed === `${BASE}feeds/o-livro-de-ruth.xml` && url === `overcast://x-callback-url/add?url=${encodeURIComponent(feed)}`, detail: feed }
  })
  await check('por obra', 'o feed da obra é um RSS válido: 4 partes em ordem, serial, com enclosures de áudio', async () => {
    const info = await page.evaluate(async (u) => {
      const doc = new DOMParser().parseFromString(await (await fetch(u)).text(), 'application/xml')
      if (doc.querySelector('parsererror')) return { err: 'xml inválido' }
      const items = [...doc.querySelectorAll('item')]
      const ns = 'http://www.itunes.com/dtds/podcast-1.0.dtd'
      return {
        title: doc.querySelector('channel > title').textContent,
        type: doc.getElementsByTagNameNS(ns, 'type')[0]?.textContent,
        n: items.length,
        dates: items.map((i) => Date.parse(i.querySelector('pubDate').textContent)),
        types: [...new Set(items.map((i) => i.querySelector('enclosure').getAttribute('type')))],
        guids: new Set(items.map((i) => i.querySelector('guid').textContent)).size,
        self: doc.getElementsByTagName('atom:link')[0]?.getAttribute('href'),
        eps: items.map((i) => i.getElementsByTagNameNS(ns, 'episode')[0]?.textContent),
      }
    }, `${BASE}feeds/o-livro-de-ruth.xml`)
    const ascending = info.dates?.every((d, i) => i === 0 || d > info.dates[i - 1])
    return { ok: info.title === 'O Livro de Ruth' && info.type === 'serial' && info.n === 4 && ascending && info.guids === 4 && info.types[0] === 'audio/mpeg' && info.eps.join() === '1,2,3,4' && /feeds\/o-livro-de-ruth\.xml$/.test(info.self), detail: JSON.stringify({ n: info.n, type: info.type, eps: info.eps }) }
  })
  await check('por obra', 'os 71 feeds por obra existem e são XML válido (amostra de 10 + o geral)', async () => {
    const cat = await (await fetch(`${BASE}catalog.json`)).json()
    const slugs = [...new Set(cat.episodes.map((e) => (e.series || e.title).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')))]
    const sample = slugs.filter((_, i) => i % 7 === 0).slice(0, 10)
    const bad = []
    for (const s of sample) {
      const r = await fetch(`${BASE}feeds/${encodeURIComponent(s)}.xml`)
      const ok = r.status === 200 && (await page.evaluate(async (t) => !new DOMParser().parseFromString(t, 'application/xml').querySelector('parsererror'), await r.text()))
      if (!ok) bad.push(s)
    }
    const gen = await fetch(FEED)
    return { ok: bad.length === 0 && gen.status === 200 && slugs.length === 71, detail: `${slugs.length} obras; falhas: ${bad.join(',') || 'nenhuma'}` }
  })
  await page.context().close()
}
{
  const page = await newPage({ ua: UA.android })
  await go(page, '#/livro/o-livro-de-ruth')
  await check('por obra', 'a página da obra tem "Assinar só esta obra no seu app" com o feed da obra e os botões', async () => {
    await page.getByText('Assinar só esta obra no seu app').click()
    const feed = await page.locator('#feed-url').inputValue()
    await page.getByRole('button', { name: 'Assinar no AntennaPod' }).click()
    const url = (await opened(page)).at(-1)?.[1]
    return { ok: feed === `${BASE}feeds/o-livro-de-ruth.xml` && /title=O%20Livro%20de%20Ruth$/.test(url), detail: url }
  })
  await scan(page, 'obra com assinatura aberta · Android · escuro')
  await page.context().close()
}

// ============================================================ compartilhar o catálogo (Fase 3)
{
  const page = await newPage({ ua: UA.ios })
  await go(page)
  await check('compartilhar', '"Compartilhar o catálogo" abre a janela com o link da página de assinatura (/assinar/)', async () => {
    await page.getByRole('button', { name: 'Compartilhar o catálogo' }).click()
    await page.getByRole('dialog', { name: 'Compartilhar' }).waitFor()
    const link = await page.getByLabel('Link para compartilhar').inputValue()
    return { ok: link === `${BASE}assinar/`, detail: link }
  })
  await check('compartilhar', 'a página estática /assinar/ tem prévia (Open Graph) e redireciona para #/assinar', async () => {
    const html = await (await fetch(`${BASE}assinar/`)).text()
    const og = (p) => new RegExp(`<meta property="${p}" content="([^"]*)"`).exec(html)?.[1]
    const p2 = await newPage()
    await p2.goto(`${BASE}assinar/`)
    await p2.getByRole('heading', { name: 'Ouça no seu app' }).first().waitFor({ timeout: 10000 })
    const hash = await p2.evaluate(() => location.hash)
    await p2.context().close()
    return { ok: og('og:title') === 'Ouça no seu app' && /podcasts/.test(og('og:description')) && /cover-1400\.png$/.test(og('og:image')) && hash === '#/assinar', detail: hash }
  })
  await page.context().close()
}

// ============================================================ acessibilidade e layout
for (const [ua, theme, label] of [[UA.ios, 'dark', 'iPhone · escuro'], [UA.ios, 'light', 'iPhone · claro'], [null, 'dark', 'computador · escuro'], [null, 'light', 'computador · claro']]) {
  const page = await newPage({ ua, theme, width: ua ? 390 : 1000, height: ua ? 844 : 900 })
  await go(page)
  await scan(page, `assinar · ${label}`)
  if (ua && theme === 'dark') await check('layout', 'sem rolagem horizontal em 390 px', async () => ({ ok: !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) }))
  await page.context().close()
}
{
  const page = await newPage({ ua: UA.ios, width: 390, height: 844 })
  await page.context().addInitScript(() => { try { localStorage.setItem('ondas:v1:a11y', JSON.stringify({ textScale: 200 })) } catch { /* ignora */ } })
  await go(page)
  await check('layout', 'texto a 200%: sem rolagem horizontal', async () => {
    const o = await page.evaluate(() => { const m = document.querySelector('[class*="overflow-y-auto"]'); return { doc: document.documentElement.scrollWidth - innerWidth, main: m.scrollWidth - m.clientWidth } })
    return { ok: o.doc <= 1 && o.main <= 1, detail: JSON.stringify(o) }
  })
  await page.context().close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`)
process.exit(failed.length ? 1 : 0)
