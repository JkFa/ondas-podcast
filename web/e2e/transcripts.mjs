// Verificações da Fase 2 (transcrições) no navegador. Uso:
//   npm run build:fast && (npx vite preview --port 4173 &) && BASE_URL=http://localhost:4173/ npm run test:transcripts
// Usa o Livro de Ruth (transcrição real gerada com faster-whisper, em web/public/transcripts/) e
// obras sem transcrição. O áudio vem do archive.org; se ele não responder, os testes de áudio são pulados.
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:4173/').replace(/\/?$/, '/')
const EP = 'livro-de-ruth-1811-01' // id do episódio com transcrição
const results = []
const rec = (group, name, ok, detail = '') => { results.push({ group, name, ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} [${group}] ${name}${detail ? ` — ${detail}` : ''}`) }
const check = async (g, n, fn) => { try { const r = await fn(); rec(g, n, r === undefined || r === true || r?.ok !== false, r?.detail) } catch (e) { rec(g, n, false, String(e.message).split('\n')[0]) } }

// VTT local → parágrafos (mesma regra do app) para comparar com o que a tela mostra
const vtt = await readFile(new URL(`../public/transcripts/${EP}.vtt`, import.meta.url), 'utf8')
const segs = [...vtt.matchAll(/(\d+):(\d\d):(\d\d)\.(\d{3}) --> (\d+):(\d\d):(\d\d)\.(\d{3})\n([^\n]+)/g)].map((m) => ({ start: +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, end: +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000, text: m[9] }))
const paragraphs = []
for (const s of segs) {
  const c = paragraphs.at(-1)
  if (c && s.start - c.end <= 1.5 && c.text.length + s.text.length <= 600 && c.n < 6) { c.text += ` ${s.text}`; c.end = s.end; c.n++ } else paragraphs.push({ start: s.start, end: s.end, text: s.text, n: 1 })
}
const mmss = (t) => { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
async function newPage(prefs = {}, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, colorScheme: 'dark', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], ...extra })
  await ctx.route('https://abacus.jasoncameron.dev/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"value":1}' }))
  await ctx.addInitScript((p) => { try { if (!localStorage.getItem('ondas:v1:a11y')) localStorage.setItem('ondas:v1:a11y', JSON.stringify(p)) } catch { /* ignora */ } }, prefs)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => rec('erros', 'erro de JavaScript', false, e.message))
  return page
}
const playBook = async (page, slug, partName) => {
  for (let i = 0; i < 2; i++) {
    await page.goto(`${BASE}#/livro/${slug}`); await page.waitForSelector('main h1')
    await page.getByRole('button', { name: partName }).first().click()
    if (await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 0.5, null, { timeout: 30000 }).then(() => true, () => false)) return true
  }
  return false
}
// Pausa e vai para t; espera o navegador concluir o salto (em trechos ainda não baixados ele busca o áudio na rede).
const seekPaused = async (page, t) => {
  await page.evaluate((t) => { const a = document.querySelector('audio'); a.pause(); a.currentTime = t }, t)
  await page.waitForFunction((t) => { const a = document.querySelector('audio'); return !a.seeking && a.readyState >= 2 && Math.abs(a.currentTime - t) < 0.5 }, t, { timeout: 25000 })
  await page.waitForTimeout(500) // deixa o React atualizar a posição
}
const openPlayer = async (page) => { await page.getByRole('button', { name: /^Abrir player/ }).click(); await page.waitForTimeout(600) }
const toggle = (page) => page.getByRole('button', { name: /^(Ver|Ocultar) transcrição$/ })
const scan = async (page, label) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(150)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  rec('axe', label, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`).join(' | '))
}

// ---------------------------------------------------------------- sem transcrição
{
  const page = await newPage()
  if (await playBook(page, 'auto-da-barca-do-inferno', /^Tocar Auto da Barca/)) {
    await openPlayer(page)
    await check('estados', 'desligada por padrão (botão "Ver transcrição", sem painel)', async () => ({
      ok: (await toggle(page).getAttribute('aria-pressed')) === 'false' && (await page.getByRole('list', { name: 'Trechos da transcrição' }).count()) === 0,
    }))
    await check('estados', 'episódio sem transcrição mostra "Transcrição em breve" (sem erro)', async () => {
      await toggle(page).click()
      await page.getByText('Transcrição em breve').waitFor({ timeout: 3000 })
      return { ok: (await page.getByRole('alert').count()) === 0 }
    })
    await scan(page, 'transcrição em breve · escuro')
  } else rec('estados', 'áudio do archive.org iniciou', false, 'rede indisponível agora')
  await page.context().close()
}

// ---------------------------------------------------------------- com transcrição
{
  const page = await newPage()
  const ok = await playBook(page, 'o-livro-de-ruth', /^Tocar O Livro de Ruth — Capitulo 1$/)
  if (!ok) rec('player', 'áudio do archive.org iniciou', false, 'rede indisponível agora')
  else {
    await openPlayer(page)
    await toggle(page).click()
    await page.getByRole('list', { name: 'Trechos da transcrição' }).waitFor({ timeout: 8000 })
    await check('transcrição', `lista ${paragraphs.length} parágrafos iguais ao VTT`, async () => {
      const n = await page.locator('ol[aria-label="Trechos da transcrição"] > li').count()
      return { ok: n === paragraphs.length && n > 3, detail: `tela=${n} vtt=${paragraphs.length}` }
    })
    await check('sincronia', 'o parágrafo destacado acompanha o tempo do áudio', async () => {
      const target = paragraphs[Math.min(3, paragraphs.length - 1)]
      await seekPaused(page, target.start + 0.5)
      const cur = await page.locator('[aria-current="true"]').first().textContent()
      return { ok: cur.includes(mmss(target.start)) && cur.includes(target.text.slice(0, 20)), detail: `esperado ${mmss(target.start)}, tela: ${cur.slice(0, 40)}` }
    })
    await check('foco', 'o destaque não rouba o foco nem dispara avisos do leitor de tela', async () => {
      await page.getByRole('button', { name: 'Soneca' }).focus()
      const before = await page.locator('[role=status][aria-label="Avisos"]').textContent()
      await page.evaluate(() => { document.querySelector('audio').currentTime += 14 })
      await page.waitForTimeout(3500)
      const stay = await page.evaluate(() => document.activeElement?.textContent?.includes('Soneca'))
      const after = await page.locator('[role=status][aria-label="Avisos"]').textContent()
      return { ok: stay && before === after, detail: `foco mantido=${stay}; aviso "${before}" → "${after}"` }
    })
    await check('sincronia', 'rolagem manual para de seguir; "Voltar ao trecho atual" retoma', async () => {
      await page.getByRole('list', { name: 'Trechos da transcrição' }).hover()
      await page.mouse.wheel(0, 300); await page.waitForTimeout(300)
      const stopped = (await page.getByRole('button', { name: 'Seguir o áudio' }).getAttribute('aria-pressed')) === 'false'
      const back = page.getByRole('button', { name: 'Voltar ao trecho atual' })
      const shown = await back.count()
      if (shown) await back.click()
      return { ok: stopped && shown === 1 && (await page.getByRole('button', { name: 'Parar de seguir' }).count()) === 1 }
    })
    await check('sincronia', 'clicar num trecho leva o áudio para aquele momento', async () => {
      const t = paragraphs[Math.min(5, paragraphs.length - 1)].start
      await page.locator('ol[aria-label="Trechos da transcrição"] > li button').nth(Math.min(5, paragraphs.length - 1)).click()
      await page.waitForTimeout(800)
      const now = await page.evaluate(() => document.querySelector('audio').currentTime)
      return { ok: Math.abs(now - t) < 2, detail: `alvo=${t.toFixed(1)} atual=${now.toFixed(1)}` }
    })
    await check('busca', 'busca sem acento: conta, destaca e navega entre resultados', async () => {
      const word = (paragraphs.find((p) => /[áâãéêíóôõúç]/i.test(p.text))?.text.match(/\p{L}*[áâãéêíóôõúç]\p{L}*/iu) ?? [paragraphs[0].text.split(' ')[0]])[0]
      const plain = word.normalize('NFD').replace(/\p{M}/gu, '')
      await page.getByLabel('Buscar na transcrição').fill(plain)
      await page.waitForTimeout(300)
      const status = await page.locator('[role=status][aria-live=polite]').filter({ hasText: /Resultado|Nenhum/ }).first().textContent()
      const marks = await page.locator('mark').count()
      await page.getByRole('button', { name: 'Próximo resultado' }).click()
      return { ok: /Resultado \d+ de \d+/.test(status) && marks > 0, detail: `"${plain}" → ${status}; ${marks} destaque(s)` }
    })
    await check('busca', 'palavra inexistente mostra "Nenhum resultado"', async () => {
      await page.getByLabel('Buscar na transcrição').fill('zzzqqq')
      await page.waitForTimeout(200)
      return { ok: (await page.getByText('Nenhum resultado').count()) === 1 }
    })
    await page.getByLabel('Buscar na transcrição').fill('')
    await scan(page, 'painel de transcrição aberto · escuro')
    await check('legenda', 'modo legenda mostra a frase atual em fonte grande (também com o player fechado)', async () => {
      await page.getByRole('button', { name: 'Legendas (frase atual)' }).click()
      const seg = segs[Math.min(4, segs.length - 1)]
      await seekPaused(page, seg.start + 0.3) // pausado: a frase não muda durante o teste
      const bar = page.getByTestId('caption-bar')
      const text = (await bar.textContent())?.trim()
      const size = await bar.locator('p').evaluate((p) => parseFloat(getComputedStyle(p).fontSize))
      await page.getByRole('button', { name: 'Fechar player' }).click(); await page.waitForTimeout(700)
      const stillThere = await page.getByTestId('caption-bar').count()
      await openPlayer(page)
      return { ok: text === seg.text && size >= 20 && stillThere === 1, detail: `"${text?.slice(0, 30)}" ${size}px; com player fechado=${stillThere}` }
    })
    await check('legenda', 'a faixa de legenda é invisível para leitor de tela (aria-hidden)', async () => ({ ok: (await page.getByTestId('caption-bar').getAttribute('aria-hidden')) === 'true' }))
    await scan(page, 'legendas ligadas · escuro')
    await check('downloads', 'baixar .txt tem os parágrafos da transcrição', async () => {
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar .txt' }).click()])
      const text = await readFile(await d.path(), 'utf8')
      return { ok: d.suggestedFilename().endsWith('.txt') && text.startsWith(paragraphs[0].text.slice(0, 30)) && text.trim().split('\n\n').length === paragraphs.length, detail: d.suggestedFilename() }
    })
    await check('downloads', 'baixar .md tem título, licença, links e tempos', async () => {
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar .md' }).click()])
      const text = await readFile(await d.path(), 'utf8')
      return { ok: text.startsWith('# O Livro de Ruth') && /Licença/.test(text) && /\*\*\[0:00\]\(http/.test(text) && /archive\.org\/details/.test(text), detail: d.suggestedFilename() }
    })
    let copied = ''
    await check('link', 'copiar trecho com link gera citação + link com ep e t', async () => {
      await page.locator('ol[aria-label="Trechos da transcrição"] > li button').nth(2).click()
      await page.getByRole('button', { name: 'Copiar trecho com link' }).click()
      await page.waitForTimeout(400)
      copied = await page.evaluate(() => navigator.clipboard.readText())
      return { ok: /\/episodio\/livro-de-ruth-1811-01\/#t=[\dhms]+/.test(copied) && copied.includes(paragraphs[2].text.slice(0, 25)), detail: copied.split('\n').at(-1) }
    })
    await check('link', 'abrir o link carrega o episódio no ponto indicado (sem tocar sozinho)', async () => {
      const link = copied.split('\n').at(-1)
      const tok = /#t=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(link)
      const t = (+tok[1] || 0) * 3600 + (+tok[2] || 0) * 60 + (+tok[3] || 0)
      const p2 = await newPage()
      await p2.goto(link)
      await p2.getByRole('button', { name: /^Abrir player/ }).waitFor({ timeout: 10000 })
      await p2.waitForFunction(() => document.querySelector('audio')?.readyState >= 1, null, { timeout: 30000 }).catch(() => {})
      const st = await p2.evaluate(() => ({ t: document.querySelector('audio').currentTime, paused: document.querySelector('audio').paused }))
      await p2.context().close()
      return { ok: Math.abs(st.t - t) < 2 && st.paused, detail: `t=${t} → ${st.t.toFixed(1)} pausado=${st.paused}` }
    })
    await check('estados', 'preferência "Ver transcrição" é lembrada após recarregar', async () => {
      await page.reload(); await page.waitForSelector('main h1')
      await page.getByRole('button', { name: /^Tocar O Livro de Ruth — Capitulo 1$/ }).click()
      await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 0.3, null, { timeout: 30000 }).catch(() => {})
      await openPlayer(page)
      return { ok: (await toggle(page).getAttribute('aria-pressed')) === 'true' }
    })
    await check('teclado', 'T alterna a transcrição pelo teclado', async () => {
      await page.keyboard.press('Escape'); await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press('t'); await page.waitForTimeout(500)
      const off = await toggle(page).getAttribute('aria-pressed')
      await page.keyboard.press('t'); await page.waitForTimeout(500)
      return { ok: off === 'false' && (await toggle(page).getAttribute('aria-pressed')) === 'true' }
    })
    await page.context().close()
  }
}

// ---------------------------------------------------------------- formato antigo (segmentos no catálogo)
{
  const page = await newPage()
  if (await playBook(page, 'o-alienista', /^Tocar O Alienista — Capítulo 1 \/ Capítulo 2$/)) {
    await openPlayer(page)
    await toggle(page).click()
    await check('legado', 'transcrição inline do catálogo (O Alienista) continua funcionando', async () => {
      await page.getByRole('list', { name: 'Trechos da transcrição' }).waitFor({ timeout: 5000 })
      const n = await page.locator('ol[aria-label="Trechos da transcrição"] > li').count()
      return { ok: n >= 2, detail: `${n} parágrafos` } // 14 segmentos curtos → 3 parágrafos
    })
  } else rec('legado', 'áudio do archive.org iniciou', false, 'rede indisponível agora')
  await page.context().close()
}

// ---------------------------------------------------------------- tema claro e erro de rede
{
  const page = await newPage({ theme: 'light' })
  await playBook(page, 'o-livro-de-ruth', /^Tocar O Livro de Ruth — Capitulo 1$/)
  await openPlayer(page)
  await toggle(page).click()
  await page.getByRole('list', { name: 'Trechos da transcrição' }).waitFor({ timeout: 8000 }).catch(() => {})
  await scan(page, 'painel de transcrição · claro')
  await page.context().close()
}
{
  const page = await newPage()
  let fail = true
  await page.route('**/transcripts/*.vtt', (r) => (fail ? r.fulfill({ status: 500, body: 'x' }) : r.continue()))
  await playBook(page, 'o-livro-de-ruth', /^Tocar O Livro de Ruth — Capitulo 1$/)
  await openPlayer(page)
  await toggle(page).click()
  await check('erros', 'falha ao carregar mostra alerta com "Tentar de novo" e recupera', async () => {
    await page.getByRole('alert').waitFor({ timeout: 5000 })
    fail = false
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await page.getByRole('list', { name: 'Trechos da transcrição' }).waitFor({ timeout: 8000 })
    return true
  })
  await page.context().close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`)
process.exit(failed.length ? 1 : 0)
