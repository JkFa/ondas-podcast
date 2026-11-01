// Verificações da Fase 6 (formulário "Publique o seu episódio") no navegador. Uso:
//   npm run build:fast && (npx vite preview --port 4173 &) && BASE_URL=http://localhost:4173/ npm run test:publish
// O GitHub NÃO é aberto de verdade: window.open é interceptado e a URL gerada é conferida.
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:4173/').replace(/\/?$/, '/')
const results = []
const rec = (g, n, ok, d = '') => { results.push({ g, n, ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} [${g}] ${n}${d ? ` — ${d}` : ''}`) }
const check = async (g, n, fn) => { try { const r = await fn(); rec(g, n, r === undefined || r === true || r?.ok !== false, r?.detail) } catch (e) { rec(g, n, false, String(e.message).split('\n')[0]) } }

const browser = await chromium.launch()
async function newPage({ width = 1000, height = 1000, theme = 'dark' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', serviceWorkers: 'block' })
  await ctx.route('https://abacus.jasoncameron.dev/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"value":1}' }))
  await ctx.addInitScript((t) => {
    try { localStorage.setItem('ondas:v1:a11y', JSON.stringify({ theme: t })) } catch { /* ignora */ }
    window.__opened = []
    window.open = (url, target, feat) => { window.__opened.push({ url, target, feat }); return null }
  }, theme)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => rec('erros', 'erro de JavaScript', false, e.message))
  await page.goto(`${BASE}#/publicar`)
  await page.waitForSelector('main h1')
  return page
}
const scan = async (page, label) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(150)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  rec('axe', label, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`).join(' | '))
}
const opened = (page) => page.evaluate(() => window.__opened)
const submit = (page) => page.getByRole('button', { name: 'Enviar para publicação' }).click()

{
  const page = await newPage()
  await check('página', 'título, passos e formulário nomeado', async () => {
    const h1 = await page.locator('main h1').textContent()
    const steps = await page.locator('ol li').count()
    const form = await page.getByRole('form', { name: 'Publique o seu episódio' }).count()
    return { ok: h1 === 'Publique o seu episódio' && steps === 4 && form === 1, detail: `${h1} / ${steps} passos` }
  })
  await check('página', 'título da aba', async () => ({ ok: (await page.title()).includes('Publique'), detail: await page.title() }))
  await check('página', 'início tem chamada que leva à página', async () => {
    await page.goto(`${BASE}#/`)
    await page.getByRole('link', { name: /Publicar um episódio/ }).first().click()
    await page.waitForSelector('form')
    return page.url().endsWith('#/publicar')
  })
  await scan(page, 'axe: formulário (tema escuro)')

  await check('validação', 'enviar vazio mostra os erros, move o foco e não abre o GitHub', async () => {
    await page.goto(`${BASE}#/publicar`)
    await page.waitForSelector('form')
    await submit(page)
    const alert = page.getByRole('alert')
    await alert.waitFor()
    const text = await alert.textContent()
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'alert', null, { timeout: 3000 }).catch(() => {})
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'))
    const invalid = await page.getByLabel('Link do áudio ou do YouTube').getAttribute('aria-invalid')
    return { ok: text.includes('2 campos') && text.includes('Informe o link') && text.includes('direitos') && focused === 'alert' && invalid === 'true' && (await opened(page)).length === 0, detail: text.slice(0, 120) }
  })
  await scan(page, 'axe: formulário com erros')
  await check('validação', 'link sem https:// é recusado com mensagem própria', async () => {
    await page.getByLabel('Link do áudio ou do YouTube').fill('http://exemplo.com/a.mp3')
    await page.getByLabel(/Sou a pessoa autora/).check()
    await submit(page)
    await page.getByRole('alert').waitFor()
    const t = await page.getByRole('alert').textContent()
    return { ok: t.includes('começar com https://') && (await opened(page)).length === 0, detail: t }
  })
  await check('validação', 'link que não é endereço é recusado', async () => {
    await page.getByLabel('Link do áudio ou do YouTube').fill('isso nao e link')
    await submit(page)
    return (await page.getByRole('alert').textContent()).includes('não parece um endereço')
  })
  await check('validação', 'o link do resumo de erros leva o foco ao campo', async () => {
    await page.getByRole('alert').getByRole('link').first().click()
    return page.evaluate(() => document.activeElement?.type === 'url')
  })
  await check('licença', 'cada licença mostra sua explicação em uma frase', async () => {
    const sel = page.getByLabel('Licença Creative Commons')
    const seen = []
    for (const v of ['cc0', 'by', 'by-sa', 'by-nc', 'by-nd', 'by-nc-sa', 'by-nc-nd']) {
      await sel.selectOption(v)
      seen.push(await page.locator('[id$="-license-explain"]').textContent())
    }
    return { ok: new Set(seen).size === 7 && seen.every((s) => s.length > 30 && s.length < 220), detail: seen[0].slice(0, 60) }
  })
  await check('envio', 'envio válido abre o GitHub (aba nova, noopener) com o formulário preenchido', async () => {
    await page.getByLabel('Link do áudio ou do YouTube').fill('https://exemplo.com/meu episodio.mp3?x=1&y=2')
    await page.getByLabel('Nome do programa').fill('Meu Programa')
    await page.getByLabel('Autoria').fill('Fulana & Cia')
    await page.getByLabel('Licença Creative Commons').selectOption('by-sa')
    await page.getByLabel('Observações').fill('Entrevista com a dona Maria #1')
    await submit(page)
    const [o] = await opened(page)
    const u = new URL(o.url)
    const q = u.searchParams
    const ok = u.origin + u.pathname === 'https://github.com/JkFa/ondas-podcast/issues/new' && q.get('template') === 'enviar-episodio.yml' &&
      q.get('title') === 'Episódio: Meu Programa' && q.get('link') === 'https://exemplo.com/meu episodio.mp3?x=1&y=2'
    return { ok: ok && q.get('programa') === 'Meu Programa' && q.get('autor') === 'Fulana & Cia' && q.get('licenca') === 'by-sa' && q.get('observacoes') === 'Entrevista com a dona Maria #1' && o.target === '_blank' && o.feat === 'noopener', detail: o.url.slice(0, 140) }
  })
  await check('envio', 'o envio é anunciado ao leitor de tela (status)', async () => {
    const t = await page.locator('main [role=status]').textContent()
    return { ok: t.includes('Formulário aberto no GitHub'), detail: t }
  })
  await check('envio', 'campos extras com caracteres especiais não quebram a URL', async () => {
    await page.getByLabel('Observações').fill('a'.repeat(1500) + ' ção & = ? # %')
    await submit(page)
    const list = await opened(page)
    const u = new URL(list.at(-1).url)
    return { ok: list.at(-1).url.length <= 7000 && u.searchParams.get('observacoes').startsWith('aaaa'), detail: `${list.at(-1).url.length} caracteres` }
  })
  await check('detalhes', 'linha de comando fica recolhida e o link de acompanhamento aponta para as Issues', async () => {
    const det = await page.locator('details').first().evaluate((d) => d.open)
    const href = await page.getByRole('link', { name: 'Acompanhar os pedidos' }).getAttribute('href')
    return { ok: det === false && href.startsWith('https://github.com/JkFa/ondas-podcast/issues?q=') && href.includes('enviar-episodio'), detail: href }
  })
  await page.context().close()
}

for (const theme of ['light', 'contrast']) {
  const page = await newPage({ theme })
  await scan(page, `axe: formulário (tema ${theme})`)
  await page.context().close()
}
{
  const page = await newPage({ width: 360, height: 740 })
  await check('mobile', '360 px: sem rolagem horizontal e botão com 44 px ou mais', async () => {
    const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, h: document.querySelector('form button[type=submit]').getBoundingClientRect().height }))
    return { ok: m.over <= 0 && m.h >= 44, detail: JSON.stringify(m) }
  })
  await scan(page, 'axe: formulário (360 px)')
  await page.context().close()
}
{
  const page = await newPage({ width: 1000, height: 900 })
  await check('teclado', 'dá para preencher e enviar só com o teclado', async () => {
    await page.getByLabel('Link do áudio ou do YouTube').focus()
    await page.keyboard.type('https://exemplo.com/a.mp3')
    await page.getByLabel(/Sou a pessoa autora/).focus()
    await page.keyboard.press('Space')
    await page.getByRole('button', { name: 'Enviar para publicação' }).focus()
    await page.keyboard.press('Enter')
    return (await opened(page)).length === 1
  })
  await page.context().close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`)
if (failed.length) { console.log('FALHAS:'); failed.forEach((f) => console.log(` - [${f.g}] ${f.n}`)); process.exit(1) }
