// Verificações da Fase 7 (estatísticas pessoais + backup/troca de aparelho) no navegador. Uso:
//   npm run build:fast && (npx vite preview --port 4173 &) && BASE_URL=http://localhost:4173/ npm run test:mydata
// O áudio do archive.org é trocado por um WAV gerado aqui (rede estável e tempo de escuta conhecido).
import AxeBuilder from '@axe-core/playwright'
import jsQR from 'jsqr'
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = (process.env.BASE_URL || 'http://localhost:4173/').replace(/\/?$/, '/')
const results = []
const rec = (g, n, ok, d = '') => { results.push({ g, n, ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} [${g}] ${n}${d ? ` — ${d}` : ''}`) }
const check = async (g, n, fn) => { try { const r = await fn(); rec(g, n, r === undefined || r === true || r?.ok !== false, r?.detail) } catch (e) { rec(g, n, false, String(e.message).split('\n')[0]) } }

function wav(seconds = 20, rate = 8000) {
  const n = seconds * rate
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / 20) * 2000), 44 + i * 2)
  return buf
}
const WAV = wav()

const browser = await chromium.launch()
async function newPage({ width = 1000, height = 1000, theme = 'dark', seed = {}, stubAudio = true, ctxOpts = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, ...ctxOpts })
  await ctx.route('https://abacus.jasoncameron.dev/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"value":1}' }))
  if (stubAudio) await ctx.route(/archive\.org\/.*\.mp3/, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'none' }, body: WAV }))
  await ctx.addInitScript(({ t, seed }) => {
    try {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1')
        localStorage.setItem('ondas:v1:a11y', JSON.stringify({ theme: t }))
        for (const [k, v] of Object.entries(seed)) localStorage.setItem(`ondas:v1:${k}`, JSON.stringify(v))
      }
    } catch { /* ignora */ }
  }, { t: theme, seed })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => rec('erros', 'erro de JavaScript', false, e.message))
  return page
}
const go = async (page, hash) => { await page.goto(`${BASE}${hash}`); await page.waitForSelector('main h1') }
const ls = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(`ondas:v1:${k}`) ?? 'null'), key)
const scan = async (page, label) => {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(150)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  rec('axe', label, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0].target.join(' ')}`).join(' | '))
}
const tile = async (page, label) => (await page.locator('dl > div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd').textContent()).trim()
const localDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() - offset); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }

// ============================================================ estatísticas
{
  const page = await newPage()
  await go(page, '#/estatisticas')
  await check('estatísticas', 'sem dados: mensagem clara e botão de apagar desativado', async () => {
    const empty = await page.getByText(/Ainda não há nada para mostrar/).count()
    const disabled = await page.getByRole('button', { name: 'Apagar minhas estatísticas' }).isDisabled()
    return { ok: empty === 1 && disabled && (await tile(page, 'Tempo ouvido')) === 'nada' }
  })
  await check('estatísticas', 'aba e rótulos', async () => ({ ok: (await page.title()).startsWith('Minhas estatísticas') && (await page.locator('main h1').textContent()) === 'Minhas estatísticas' }))
  await page.context().close()
}
{
  const days = { [localDay(0)]: { c: 1800, w: 1500 }, [localDay(1)]: { c: 3600, w: 3600 }, [localDay(2)]: { c: 600, w: 300 } }
  const progress = { a: { pos: 100, dur: 100, at: 1 }, b: { pos: 10, dur: 100, at: 2 } }
  const page = await newPage({ seed: { stats: { since: localDay(2), days }, progress } })
  await go(page, '#/estatisticas')
  await check('estatísticas', 'números calculados dos dados locais', async () => {
    const v = { total: await tile(page, 'Tempo ouvido'), today: await tile(page, 'Hoje'), week: await tile(page, 'Últimos 7 dias'), active: await tile(page, 'Dias com escuta'), avg: await tile(page, 'Média por dia com escuta'), streak: await tile(page, 'Sequência atual'), speed: await tile(page, 'Velocidade média') }
    const ok = v.total === '1 h 40 min' && v.today === '30 min' && v.week === '1 h 40 min' && v.active === '3' && v.avg === '33 min' && v.streak === '3 dias' && v.speed === '1,11×'
    return { ok, detail: JSON.stringify(v) }
  })
  await check('estatísticas', 'últimos 7 dias em lista com texto (não só o gráfico)', async () => {
    const items = await page.locator('#week-h ~ ul li').allInnerTexts()
    return { ok: items.length === 7 && /1 h/.test(items[5]) && /30 min/.test(items[6]) && /nada/.test(items[0]), detail: items.map((s) => s.replace(/\s+/g, ' ')).join(' | ') }
  })
  await scan(page, 'axe: estatísticas (escuro)')
  await check('estatísticas', 'apagar pede confirmação, cancelar não apaga e confirmar zera só o tempo', async () => {
    await page.getByRole('button', { name: 'Apagar minhas estatísticas' }).click()
    await page.getByRole('button', { name: 'Cancelar' }).click()
    const still = (await ls(page, 'stats'))?.days
    await page.getByRole('button', { name: 'Apagar minhas estatísticas' }).click()
    await page.getByRole('button', { name: 'Sim, apagar' }).click()
    await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('ondas:v1:stats') || '{"days":{"x":1}}').days).length === 0)
    const prog = await ls(page, 'progress')
    return { ok: Object.keys(still).length === 3 && Object.keys(prog).length === 2 && (await tile(page, 'Tempo ouvido')) === 'nada' }
  })
  await page.context().close()
}
for (const theme of ['light', 'contrast']) {
  const page = await newPage({ theme, seed: { stats: { since: localDay(1), days: { [localDay(1)]: { c: 900, w: 900 } } } } })
  await go(page, '#/estatisticas')
  await scan(page, `axe: estatísticas (${theme})`)
  await page.context().close()
}
{
  const page = await newPage({ width: 360, height: 740, seed: { stats: { since: localDay(1), days: { [localDay(1)]: { c: 900, w: 900 } } } } })
  await go(page, '#/estatisticas')
  await check('estatísticas', '360 px: sem rolagem horizontal', async () => ({ ok: (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0 }))
  await scan(page, 'axe: estatísticas (360 px)')
  await page.context().close()
}
{
  // escuta de verdade: toca ~5 s e confere que o tempo foi contado; arrastar a barra não conta
  const page = await newPage()
  await go(page, '#/livro/o-livro-de-ruth')
  await check('escuta real', 'tocar 5 s soma ~5 s de tempo ouvido', async () => {
    await page.getByRole('button', { name: /^Ouvir$/ }).click()
    await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 5.2, null, { timeout: 15000 })
    await page.evaluate(() => document.querySelector('audio').pause())
    await page.waitForTimeout(300)
    await page.goto(`${BASE}#/estatisticas`)
    await page.waitForSelector('main h1')
    const total = await tile(page, 'Tempo ouvido')
    const sec = Number((total.match(/^(\d+) s$/) || [])[1])
    const st = await ls(page, 'stats')
    return { ok: sec >= 4 && sec <= 7, detail: `${total} · ${JSON.stringify(st?.days)}` }
  })
  await check('escuta real', 'pular dentro do áudio não conta como escuta', async () => {
    const before = (await ls(page, 'stats')).days[localDay(0)].c
    await page.goto(`${BASE}#/livro/o-livro-de-ruth`)
    await page.waitForSelector('main h1')
    await page.evaluate(() => { const a = document.querySelector('audio'); a.currentTime = 15; return a.play() })
    await page.waitForTimeout(400)
    await page.evaluate(() => { document.querySelector('audio').currentTime = 2 })
    await page.waitForTimeout(300)
    await page.evaluate(() => document.querySelector('audio').pause())
    await page.waitForTimeout(300)
    const after = (await ls(page, 'stats')).days[localDay(0)].c
    return { ok: after - before < 3, detail: `+${(after - before).toFixed(2)} s` }
  })
  await page.context().close()
}

// ============================================================ backup
const SEED = {
  progress: { 'ep-a': { pos: 40, dur: 100, at: 5000 }, 'ep-b': { pos: 100, dur: 100, at: 4000 } },
  favorites: ['ep-a', 'ep-b'], queue: ['ep-c'], rate: 1.5, volume: 0.7,
  stats: { since: localDay(1), days: { [localDay(1)]: { c: 900, w: 900 } } },
}
const backupJson = (data, extra = {}) => JSON.stringify({ app: 'ondas', kind: 'backup', version: 1, exportedAt: '2026-10-01T12:00:00Z', data, ...extra })
const file = (page, content, name = 'backup.json') => page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) })

{
  const page = await newPage({ seed: SEED })
  await go(page, '#/backup')
  await check('backup', 'resume o que vai ser exportado', async () => {
    const t = await page.getByText(/^Inclui progresso de/).textContent()
    return { ok: /2 episódios/.test(t) && /2 favoritos/.test(t) && /1 na fila/.test(t) && /1 dia de estatísticas/.test(t), detail: t }
  })
  await scan(page, 'axe: backup (escuro)')
  await check('exportar', 'baixa um .json legível com as chaves conhecidas, sem nada extra', async () => {
    await page.evaluate(() => localStorage.setItem('ondas:v1:segredo', '"não exportar"'))
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar arquivo de backup' }).click()])
    const text = fs.readFileSync(await dl.path(), 'utf8')
    const j = JSON.parse(text)
    return { ok: /^ondas-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()) && j.app === 'ondas' && j.version === 1 && j.data.favorites.join() === 'ep-a,ep-b' && j.data.progress['ep-a'].pos === 40 && !('segredo' in j.data) && text.includes('\n  '), detail: dl.suggestedFilename() }
  })
  await check('exportar', 'o status anuncia o download', async () => (await page.locator('[role=status][aria-label="Avisos"]').textContent()).includes('baixado'))
  await page.context().close()
}
{
  // importar mesclando; os dados antigos continuam e as preferências não mudam
  const page = await newPage({ seed: { ...SEED, a11y: { theme: 'dark', textScale: 125 } } })
  await go(page, '#/backup')
  const incoming = backupJson({
    progress: { 'ep-a': { pos: 90, dur: 100, at: 9000 }, 'ep-b': { pos: 1, dur: 100, at: 1 }, 'ep-new': { pos: 7, dur: 70, at: 100 } },
    favorites: ['ep-z', 'ep-a'], queue: ['ep-q'], rate: 2, a11y: { theme: 'light', textScale: 200 },
  })
  await check('importar', 'prévia mostra o que vai entrar e foca nela', async () => {
    await file(page, incoming, 'meu-backup.json')
    await page.getByRole('heading', { name: 'Arquivo: meu-backup.json' }).waitFor()
    const t = await page.locator('section', { has: page.getByRole('heading', { name: /^Arquivo:/ }) }).innerText()
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    return { ok: /progresso de 3 episódios/.test(t) && /2 favoritos/.test(t) && /Exportado em 1 de outubro de 2026/.test(t) && /preferências/.test(t) && focused === 'SECTION', detail: t.replace(/\s+/g, ' ').slice(0, 160) }
  })
  await scan(page, 'axe: backup com prévia')
  await check('importar', 'mesclar: registro mais recente vence, listas somam, preferências ficam', async () => {
    await page.getByRole('button', { name: 'Importar', exact: true }).click()
    await page.waitForURL(/#\/backup\?ok=1/)
    await page.getByText('Backup importado').waitFor()
    const [prog, fav, queue, a11y, rate] = [await ls(page, 'progress'), await ls(page, 'favorites'), await ls(page, 'queue'), await ls(page, 'a11y'), await ls(page, 'rate')]
    return { ok: prog['ep-a'].pos === 90 && prog['ep-b'].pos === 100 && prog['ep-new'].pos === 7 && fav.join() === 'ep-a,ep-b,ep-z' && queue.join() === 'ep-c,ep-q' && a11y.textScale === 125 && rate === 1.5, detail: JSON.stringify({ fav, queue, rate }) }
  })
  await check('importar', 'importar o mesmo arquivo de novo não duplica nada', async () => {
    await file(page, incoming)
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Importar', exact: true }).click()])
    await page.getByText('Backup importado').waitFor()
    const fav = await ls(page, 'favorites'); const queue = await ls(page, 'queue')
    return { ok: fav.join() === 'ep-a,ep-b,ep-z' && queue.join() === 'ep-c,ep-q' }
  })
  await check('importar', 'depois de importar, o app já mostra os dados (favoritos na tela Salvos)', async () => {
    await page.goto(`${BASE}#/salvos`); await page.waitForSelector('main h1')
    return (await page.locator('#queue-h').count()) === 1
  })
  await page.context().close()
}
{
  // substituir troca também as preferências
  const page = await newPage({ seed: { ...SEED, a11y: { theme: 'dark' } } })
  await go(page, '#/backup')
  await file(page, backupJson({ favorites: ['so-este'], rate: 2, a11y: { theme: 'light', textScale: 150 } }))
  await page.getByLabel(/Substituir tudo/).check()
  await page.getByRole('button', { name: 'Importar', exact: true }).click()
  await page.waitForURL(/ok=1/)
  await check('importar', 'substituir: favoritos, velocidade e acessibilidade vêm do backup; o que ele não traz fica', async () => {
    const [fav, rate, a11y, prog] = [await ls(page, 'favorites'), await ls(page, 'rate'), await ls(page, 'a11y'), await ls(page, 'progress')]
    const theme = await page.evaluate(() => document.documentElement.dataset.theme)
    return { ok: fav.join() === 'so-este' && rate === 2 && a11y.textScale === 150 && theme === 'light' && Object.keys(prog).length === 2 }
  })
  await page.context().close()
}
{
  // o app antigo ainda está na memória (tocando): ao descarregar, ele não pode sobrescrever o que acabou de entrar
  const page = await newPage()
  await go(page, '#/livro/o-livro-de-ruth')
  await page.getByRole('button', { name: /^Ouvir$/ }).click()
  await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 1.5, null, { timeout: 15000 })
  const id = await page.evaluate(async () => { document.querySelector('audio').pause(); await new Promise((r) => setTimeout(r, 300)); return Object.keys(JSON.parse(localStorage.getItem('ondas:v1:progress')))[0] })
  await page.evaluate(() => document.querySelector('audio').play())
  await page.goto(`${BASE}#/backup`)
  await page.waitForSelector('main h1')
  await file(page, backupJson({ progress: { [id]: { pos: 3, dur: 100, at: Date.now() + 1e9 } } }))
  await page.getByRole('button', { name: 'Importar', exact: true }).click()
  await page.waitForURL(/ok=1/)
  await page.waitForTimeout(500)
  await check('importar', 'a posição do áudio que estava tocando não sobrescreve o backup importado', async () => {
    const p = (await ls(page, 'progress'))[id]
    return { ok: p.pos === 3 && p.dur === 100, detail: JSON.stringify(p) }
  })
  await page.context().close()
}
{
  const page = await newPage()
  await go(page, '#/backup')
  for (const [name, content, msg] of [
    ['vazio.json', '', 'está vazio'],
    ['ruim.json', '{nao json', 'não é um JSON válido'],
    ['outro.json', JSON.stringify({ app: 'outro', kind: 'backup', version: 1, data: {} }), 'não é um backup do Ondas'],
    ['novo.json', backupJson({ favorites: ['a'] }, { version: 7 }), 'versão mais nova'],
    ['nada.json', backupJson({ favorites: 'texto', rate: 99 }), 'nenhum dado que o Ondas reconheça'],
  ]) {
    await check('arquivo inválido', `${name}: mensagem clara e nada é gravado`, async () => {
      await file(page, content, name)
      await page.getByRole('alert').filter({ hasText: msg }).waitFor({ timeout: 4000 })
      return (await page.getByRole('button', { name: 'Importar', exact: true }).count()) === 0 && (await ls(page, 'favorites')) === null
    })
  }
  await check('arquivo inválido', 'arquivo grande demais é recusado sem ler', async () => {
    await page.locator('input[type=file]').setInputFiles({ name: 'grande.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 32) })
    await page.getByRole('alert').filter({ hasText: 'limite de 2 MB' }).waitFor({ timeout: 4000 })
  })
  await check('arquivo inválido', 'dados maliciosos são filtrados (__proto__, tipos errados) e o app segue funcionando', async () => {
    await file(page, '{"app":"ondas","kind":"backup","version":1,"data":{"progress":{"__proto__":{"pos":1,"dur":2},"ok":{"pos":1,"dur":2}},"favorites":["<img src=x onerror=alert(1)>"],"a11y":{"theme":"<script>"}}}')
    await page.getByRole('button', { name: 'Importar', exact: true }).click()
    await page.waitForURL(/ok=1/)
    const prog = await ls(page, 'progress'); const fav = await ls(page, 'favorites')
    const polluted = await page.evaluate(() => ({}).pos)
    return { ok: Object.keys(prog).join() === 'ok' && fav.length === 1 && polluted === undefined && (await page.locator('main h1').textContent()) === 'Levar para outro aparelho' }
  })
  await page.context().close()
}

// ------------------------------------------------------------ QR: gera no aparelho A, "escaneia" e importa no aparelho B
{
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`serie-${(i * 2654435761 >>> 0).toString(36)}-parte-${i}-20261101`, { pos: 100 + i, dur: 900, at: 1_700_000_000_000 + i * 60000 }]))
  const newest = Object.keys(many).at(-1)
  const oldest = Object.keys(many)[0]
  const a = await newPage({ seed: { progress: many, favorites: ['f1'], queue: ['q1'], rate: 1.25 } })
  await go(a, '#/backup')
  let link = ''
  await check('QR', 'mostra um QR com descrição acessível e explica o limite', async () => {
    await a.getByRole('button', { name: 'Mostrar QR code' }).click()
    const svg = a.getByRole('img', { name: 'QR code com o link do backup compacto' })
    await svg.waitFor()
    const note = await a.getByText(/Cabe pouco num QR/).textContent()
    return { ok: /dos \d+ episódios mais recentes \(de 60\)/.test(note), detail: note.slice(0, 110) }
  })
  await check('QR', 'o QR decodifica (jsQR) para o mesmo link copiado e cabe no tamanho combinado', async () => {
    await a.getByRole('button', { name: 'Copiar o link' }).click()
    link = await a.evaluate(() => navigator.clipboard.readText())
    const px = await a.evaluate(async () => {
      const el = document.querySelector('svg[aria-label^="QR code"]')
      const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(el))}`
      await img.decode()
      const c = document.createElement('canvas'); c.width = 1400; c.height = 1400
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 1400, 1400)
      return { data: Array.from(ctx.getImageData(0, 0, 1400, 1400).data), w: 1400, h: 1400 }
    })
    const res = jsQR(Uint8ClampedArray.from(px.data), px.w, px.h)
    return { ok: res?.data === link && link.length <= 1100 && link.includes('#/backup?d='), detail: `${link.length} caracteres` }
  })
  await scan(a, 'axe: backup com QR')
  await a.context().close()

  const b = await newPage({ seed: { favorites: ['ja-tinha'], progress: { 'so-aqui': { pos: 5, dur: 50, at: 1 } } } })
  await go(b, link.slice(link.indexOf('#')))
  await check('QR', 'no outro aparelho o link abre a prévia e nada é gravado antes de confirmar', async () => {
    await b.getByRole('heading', { name: 'Dados recebidos pelo QR code' }).waitFor()
    return { ok: (await ls(b, 'favorites')).join() === 'ja-tinha' && /progresso de \d+ episódios/.test(await b.locator('section ul').first().innerText()) }
  })
  await check('QR', 'confirmar importa os mais recentes e preserva o que já existia', async () => {
    await b.getByRole('button', { name: 'Importar', exact: true }).click()
    await b.waitForURL(/ok=1/)
    const prog = await ls(b, 'progress')
    const n = Object.keys(prog).length
    return { ok: prog[newest]?.pos === 159 && !(oldest in prog) && prog['so-aqui'] && n > 5 && (await ls(b, 'favorites')).join() === 'ja-tinha,f1' && (await ls(b, 'queue')).join() === 'q1', detail: `${n - 1} episódios` }
  })
  await b.context().close()
  const c = await newPage()
  await go(c, '#/backup?d=lixo-que-nao-e-base64')
  await check('QR', 'link corrompido mostra erro claro', async () => ({ ok: (await c.getByRole('alert').filter({ hasText: 'Não consegui ler os dados deste link' }).count()) === 1 }))
  await c.context().close()
}
for (const theme of ['light', 'contrast']) {
  const page = await newPage({ theme, seed: SEED })
  await go(page, '#/backup')
  await file(page, backupJson({ favorites: ['x'] }))
  await page.getByRole('heading', { name: /^Arquivo:/ }).waitFor()
  await scan(page, `axe: backup com prévia (${theme})`)
  await page.context().close()
}
{
  const page = await newPage({ width: 360, height: 740, seed: SEED })
  await go(page, '#/backup')
  await file(page, backupJson({ favorites: ['x'] }))
  await page.getByRole('heading', { name: /^Arquivo:/ }).waitFor()
  await check('backup', '360 px: sem rolagem horizontal e botões com 44 px ou mais', async () => {
    const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, small: [...document.querySelectorAll('main button, main a')].filter((e) => e.getBoundingClientRect().height < 44 && e.offsetParent).map((e) => e.textContent.trim().slice(0, 30)) }))
    return { ok: m.over <= 0 && m.small.length === 0, detail: JSON.stringify(m) }
  })
  await scan(page, 'axe: backup (360 px)')
  await page.context().close()
}
{
  const page = await newPage({ seed: SEED })
  await go(page, '#/salvos')
  await check('navegação', 'Salvos tem atalhos para estatísticas e backup; o rodapé também', async () => {
    const main = await page.locator('main').getByRole('link', { name: /Minhas estatísticas|Backup e troca de aparelho/ }).count()
    const foot = await page.locator('footer').getByRole('link', { name: /Minhas estatísticas|Backup e troca de aparelho/ }).count()
    await page.locator('main').getByRole('link', { name: /Minhas estatísticas/ }).click()
    await page.waitForSelector('main h1')
    return { ok: main === 2 && foot === 2 && page.url().endsWith('#/estatisticas') }
  })
  await check('navegação', 'a navegação principal destaca "Salvos" nas duas páginas', async () => {
    const cur = await page.locator('nav [aria-current="page"]').allInnerTexts()
    return { ok: cur.some((x) => /Salvos/.test(x)), detail: cur.join(',') }
  })
  await page.context().close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`)
if (failed.length) { console.log('FALHAS:'); failed.forEach((f) => console.log(` - [${f.g}] ${f.n}`)); process.exit(1) }
