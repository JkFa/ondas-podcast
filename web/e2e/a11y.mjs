// Verificações de acessibilidade no navegador (Playwright + axe-core). Uso:
//   npm run build:fast && (npx vite preview --port 4173 &) && BASE_URL=http://localhost:4173/ npm run test:a11y
// Sai com código 1 se houver violação axe "serious"/"critical" ou falha de comportamento.
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:4173/').replace(/\/?$/, '/')
const EPISODE = 'o-livro-de-ruth'
const results = []
let softSkips = 0
const record = (group, name, ok, detail = '') => {
  results.push({ group, name, ok, detail })
  console.log(`${ok ? 'OK  ' : 'FALHA'} [${group}] ${name}${detail ? ` — ${detail}` : ''}`)
}
const check = async (group, name, fn) => {
  try {
    const r = await fn()
    record(group, name, r === undefined || r === true || r?.ok !== false, typeof r === 'object' && r?.detail ? r.detail : '')
  } catch (e) {
    record(group, name, false, String(e.message).split('\n')[0])
  }
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const COMBOS = {
  escuro: {},
  claro: { theme: 'light' },
  'escuro+alto contraste': { contrast: true },
  'claro+alto contraste': { theme: 'light', contrast: true },
  'texto 200%': { textScale: 200 },
}

async function newPage(prefs = {}, { width = 390, height = 844, reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, colorScheme: 'dark' })
  await ctx.route('https://abacus.jasoncameron.dev/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"value":1}' }))
  // só semeia as preferências na primeira visita (recarregar não pode apagar o que a pessoa escolheu)
  await ctx.addInitScript((p) => { try { if (!localStorage.getItem('ondas:v1:a11y')) localStorage.setItem('ondas:v1:a11y', JSON.stringify(p)) } catch { /* ignora */ } }, prefs)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => record('erros', 'erro de JavaScript na página', false, e.message))
  return page
}
const open = async (page, hash = '') => {
  await page.goto(`${BASE}${hash}`)
  await page.waitForSelector('main h1, main h2')
  await page.waitForTimeout(400)
}
async function startPlaying(page) {
  // O archive.org às vezes demora ou responde 500: tenta duas vezes antes de pular os testes de áudio.
  for (let attempt = 0; attempt < 2; attempt++) {
    await open(page, `#/livro/${EPISODE}`)
    await page.getByRole('button', { name: /^(Ouvir|Continuar|Pausar)/ }).first().click()
    const ok = await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 0.5, null, { timeout: 30000 }).then(() => true, () => false)
    if (ok) return true
  }
  softSkips++
  return false
}

// ------------------------------------------------------------------ 1. axe
const PAGES = { início: '', biblioteca: '#/biblioteca', obra: `#/livro/${EPISODE}`, notas: '#/notas', salvos: '#/salvos' }
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
async function scan(page, label) {
  // Espera as animações de entrada terminarem: o axe mede o contraste com a opacidade do momento
  // (no CI, mais lento, ele pegava diálogos no meio do fade-in).
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
  await page.waitForTimeout(150)
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  const minor = violations.filter((v) => !['serious', 'critical'].includes(v.impact))
  record('axe', label, bad.length === 0,
    bad.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].target.join(' ')}`).join(' | ') || (minor.length ? `sem sérias; ${minor.length} menor(es): ${minor.map((v) => v.id).join(',')}` : ''))
}
for (const [combo, prefs] of Object.entries(COMBOS)) {
  const page = await newPage(prefs)
  for (const [name, hash] of Object.entries(PAGES)) {
    await open(page, hash)
    await scan(page, `${name} · ${combo}`)
  }
  if (combo === 'escuro' || combo === 'claro+alto contraste') {
    await open(page, '#/biblioteca')
    await page.getByRole('button', { name: 'Abrir painel de acessibilidade' }).click()
    await scan(page, `painel de acessibilidade · ${combo}`)
    await page.keyboard.press('Escape')
    await page.keyboard.press('?')
    await scan(page, `atalhos (?) · ${combo}`)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Publicar ou importar episódio' }).click()
    await scan(page, `importar · ${combo}`)
    await page.keyboard.press('Escape')
  }
  await page.context().close()
}
{
  const page = await newPage({})
  if (await startPlaying(page)) {
    await page.getByRole('button', { name: /^Abrir player/ }).click()
    await page.waitForTimeout(700)
    await scan(page, 'player aberto · escuro')
    await page.getByRole('button', { name: 'Soneca' }).click()
    await scan(page, 'player com timer de soneca · escuro')
  }
  await page.context().close()
}

// ------------------------------------------------------------ 2. estrutura
{
  const page = await newPage({})
  for (const [name, hash] of Object.entries(PAGES)) {
    await open(page, hash)
    await check('estrutura', `landmarks em ${name}`, async () => {
      const c = await page.evaluate(() => ({
        banner: document.querySelectorAll('body > div > div > div > header, header').length > 0,
        nav: document.querySelectorAll('nav[aria-label]').length,
        main: document.querySelectorAll('main').length,
        footer: document.querySelectorAll('footer').length,
      }))
      return { ok: c.banner && c.nav >= 1 && c.main === 1 && c.footer === 1, detail: JSON.stringify(c) }
    })
    await check('estrutura', `hierarquia de títulos em ${name}`, async () => {
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4')].filter((h) => h.offsetParent !== null).map((h) => +h.tagName[1]))
      const h1s = levels.filter((l) => l === 1).length
      const skips = levels.some((l, i) => i > 0 && l > levels[i - 1] + 1)
      return { ok: h1s === 1 && !skips, detail: `h1=${h1s} sequência=${levels.join('')}` }
    })
    await check('estrutura', `título da página em ${name}`, async () => ({ ok: /Ondas/.test(await page.title()), detail: await page.title() }))
  }
  await page.context().close()
}

// ------------------------------------------------------------ 3. teclado
{
  const page = await newPage({})
  await open(page, '')
  await check('teclado', 'primeiro Tab foca o link "Pular para o conteúdo" e Enter leva ao conteúdo', async () => {
    await page.keyboard.press('Tab')
    const first = await page.evaluate(() => document.activeElement?.textContent?.trim())
    await page.keyboard.press('Enter')
    const after = await page.evaluate(() => document.activeElement?.id)
    return { ok: first === 'Pular para o conteúdo' && after === 'conteudo', detail: `${first} → #${after}` }
  })
  await check('teclado', '"?" abre a ajuda de atalhos, Esc fecha e devolve o foco', async () => {
    await page.getByRole('link', { name: /Explorar a biblioteca/ }).focus()
    await page.keyboard.press('?')
    const opened = await page.getByRole('dialog', { name: 'Atalhos de teclado' }).isVisible()
    await page.keyboard.press('Escape')
    const closed = !(await page.getByRole('dialog').count())
    const back = await page.evaluate(() => document.activeElement?.textContent?.includes('Explorar a biblioteca'))
    return { ok: opened && closed && back, detail: `abriu=${opened} fechou=${closed} foco devolvido=${back}` }
  })
  await check('teclado', 'painel de acessibilidade prende o foco e Esc devolve ao botão', async () => {
    const btn = page.getByRole('button', { name: 'Abrir painel de acessibilidade' })
    await btn.focus(); await page.keyboard.press('Enter')
    let inside = true
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      inside &&= await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))
    }
    await page.keyboard.press('Escape')
    const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
    return { ok: inside && back === 'Abrir painel de acessibilidade', detail: `foco preso=${inside}, volta para="${back}"` }
  })
  await check('teclado', 'navegação completa por Tab alcança os controles da página inicial (sem armadilha)', async () => {
    const seen = new Set()
    for (let i = 0; i < 60; i++) { await page.keyboard.press('Tab'); seen.add(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 60))) }
    return { ok: seen.size > 15, detail: `${seen.size} elementos distintos em 60 Tabs` }
  })
  await page.context().close()
}

// ------------------------------------------------ 4. alvos de toque ≥ 44 px
{
  const page = await newPage({})
  const sizes = async () =>
    page.evaluate(() => {
      const bad = []
      const els = document.querySelectorAll('button, [role=button], a[href], input:not([type=hidden]), summary')
      for (const el of els) {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || el.closest('[inert]') || el.closest('.sr-only-focusable')) continue
        if (cs.display === 'inline' && el.tagName === 'A') continue // link no meio de um texto (exceção do WCAG 2.5.8)
        if (el.type === 'range') { if (r.height < 24) bad.push(`range ${Math.round(r.height)}px`); continue }
        if (r.width < 44 - 0.5 || r.height < 44 - 0.5) {
          if (el.closest('p, li, dd') && cs.display === 'inline-block') continue
          bad.push(`${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28)}] ${Math.round(r.width)}×${Math.round(r.height)}`)
        }
      }
      return bad
    })
  for (const [name, hash] of Object.entries(PAGES)) {
    await open(page, hash)
    await check('alvos 44px', name, async () => { const bad = await sizes(); return { ok: bad.length === 0, detail: bad.slice(0, 4).join(' | ') } })
  }
  await page.context().close()
}

// ------------------------------------------------ 5. player, atalhos, avisos
{
  const page = await newPage({})
  const started = await startPlaying(page)
  const audio = (fn) => page.evaluate(fn)
  if (!started) {
    record('player', 'áudio do archive.org iniciou (testes de player pulados)', false, 'rede do archive.org indisponível agora; rode de novo')
  } else {
    await check('player', 'Media Session com título, autor e capa', async () => {
      const m = await page.evaluate(() => ({ title: navigator.mediaSession?.metadata?.title, artist: navigator.mediaSession?.metadata?.artist, art: navigator.mediaSession?.metadata?.artwork?.length }))
      return { ok: /Livro de Ruth/.test(m.title || '') && !!m.artist && m.art > 0, detail: JSON.stringify(m) }
    })
    await check('avisos', 'região aria-live anuncia "Tocando: …"', async () => {
      const text = await page.locator('[role=status]').textContent()
      return { ok: /Tocando:/.test(text), detail: text }
    })
    await page.keyboard.press('Escape')
    await check('atalhos', 'K pausa e depois retoma; aviso "Pausado"', async () => {
      await page.keyboard.press('k'); await page.waitForTimeout(500)
      const paused = await audio(() => document.querySelector('audio').paused)
      const said = await page.locator('[role=status]').textContent()
      await page.keyboard.press('k'); await page.waitForTimeout(500)
      const playing = await audio(() => !document.querySelector('audio').paused)
      return { ok: paused && playing && /Pausado/.test(said), detail: `pausou=${paused} retomou=${playing} aviso="${said}"` }
    })
    await check('atalhos', 'L avança e J volta 15 s', async () => {
      await audio(() => { document.querySelector('audio').currentTime = 60 })
      await page.waitForTimeout(300)
      await page.keyboard.press('l'); await page.waitForTimeout(300)
      const a = await audio(() => document.querySelector('audio').currentTime)
      await page.keyboard.press('j'); await page.waitForTimeout(300)
      const b = await audio(() => document.querySelector('audio').currentTime)
      return { ok: a >= 74 && a < 80 && b >= 59 && b < 66, detail: `após L=${a.toFixed(1)} após J=${b.toFixed(1)}` }
    })
    await check('atalhos', '> e < mudam a velocidade em passos de 0,25×', async () => {
      await page.keyboard.press('>'); await page.keyboard.press('>')
      const up = await audio(() => document.querySelector('audio').playbackRate)
      await page.keyboard.press('<')
      const down = await audio(() => document.querySelector('audio').playbackRate)
      await page.keyboard.press('<')
      return { ok: up === 1.5 && down === 1.25, detail: `${up}x → ${down}x` }
    })
    await check('atalhos', 'M silencia e reativa; aviso de som', async () => {
      await page.keyboard.press('m')
      const muted = await audio(() => document.querySelector('audio').muted)
      await page.keyboard.press('m')
      return { ok: muted && !(await audio(() => document.querySelector('audio').muted)) }
    })
    await check('atalhos', 'Shift+↑/↓ muda o volume; ↑ sozinha não é interceptada com o player fechado', async () => {
      await page.keyboard.press('Shift+ArrowDown')
      const v1 = await audio(() => document.querySelector('audio').volume)
      const prevented = await page.evaluate(() => new Promise((res) => {
        const h = (e) => { res(e.defaultPrevented); window.removeEventListener('keydown', h) }
        window.addEventListener('keydown', h) // roda depois do handler do app (mesmo alvo, ordem de registro)
        setTimeout(() => res('sem evento'), 1000)
      }).then((r) => r))
      void prevented
      const before = await audio(() => document.querySelector('audio').volume)
      await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200)
      const after = await audio(() => document.querySelector('audio').volume)
      await page.keyboard.press('Shift+ArrowUp')
      return { ok: v1 < 1 && before === after, detail: `Shift+↓ → ${v1}; ↑ sem Shift manteve ${before}→${after}` }
    })
    await check('atalhos', 'T abre o player na transcrição e fecha na segunda vez', async () => {
      await page.keyboard.press('t'); await page.waitForTimeout(500)
      // A folha fechada continua no DOM (fora da tela, com `inert`): "aberta" = sem inert.
      const sheetOpen = () => page.evaluate(() => { const d = document.querySelector('[role=dialog][aria-label^="Player:"]'); return !!d && !d.inert })
      const open1 = await sheetOpen()
      await page.keyboard.press('t'); await page.waitForTimeout(600)
      const open2 = await sheetOpen()
      return { ok: open1 && !open2, detail: `abriu=${open1} depois=${open2}` }
    })
    await check('atalhos', 'teclas de letra não agem dentro de campo de texto', async () => {
      await open(page, '#/biblioteca')
      await page.getByLabel('Buscar na biblioteca').focus()
      const before = await audio(() => document.querySelector('audio').paused)
      await page.keyboard.type('kkk')
      const after = await audio(() => document.querySelector('audio').paused)
      return { ok: before === after && (await page.getByLabel('Buscar na biblioteca').inputValue()) === 'kkk' }
    })
    await check('atalhos', 'interruptor "Atalhos de teclado" desliga as teclas de letra', async () => {
      await page.evaluate(() => document.activeElement?.blur())
      await page.getByRole('button', { name: 'Abrir painel de acessibilidade' }).click()
      await page.getByRole('switch', { name: 'Atalhos de teclado' }).uncheck()
      await page.keyboard.press('Escape')
      const before = await audio(() => document.querySelector('audio').paused)
      await page.keyboard.press('k'); await page.waitForTimeout(300)
      const same = (await audio(() => document.querySelector('audio').paused)) === before
      await page.getByRole('button', { name: 'Abrir painel de acessibilidade' }).click()
      await page.getByRole('switch', { name: 'Atalhos de teclado' }).check()
      await page.keyboard.press('Escape')
      return { ok: same }
    })
    // sheet: velocidade, soneca, mono
    await page.getByRole('button', { name: /^Abrir player/ }).click()
    await page.waitForTimeout(700)
    await check('player', 'foco não é roubado enquanto o áudio toca (regressão: useDialog) e o painel da soneca vem logo após o botão', async () => {
      await page.getByRole('button', { name: 'Soneca' }).focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(2500) // vários ticks de timeupdate
      const stayed = await page.evaluate(() => document.activeElement?.textContent?.includes('Soneca'))
      await page.keyboard.press('Tab')
      const next = await page.evaluate(() => document.activeElement?.closest('#sleep-panel') ? 'painel' : (document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName))
      await page.getByRole('button', { name: 'Soneca' }).click() // recolhe
      return { ok: stayed && next === 'painel', detail: `foco manteve=${stayed}, Tab leva a: ${next}` }
    })
    await check('player', 'botões − / + de velocidade (0,5× a 2×) e rótulos', async () => {
      const plus = page.getByRole('button', { name: 'Aumentar a velocidade' })
      for (let i = 0; i < 8; i++) if (await plus.isEnabled()) await plus.click()
      const max = await audio(() => document.querySelector('audio').playbackRate)
      const minus = page.getByRole('button', { name: 'Diminuir a velocidade' })
      for (let i = 0; i < 10; i++) if (await minus.isEnabled()) await minus.click()
      const min = await audio(() => document.querySelector('audio').playbackRate)
      await plus.click(); await plus.click() // volta para 1x
      return { ok: max === 2 && min === 0.5, detail: `máx=${max} mín=${min}` }
    })
    await check('player', 'barra de posição é um slider rotulado com valor falado', async () => {
      const s = page.getByRole('slider', { name: 'Posição do episódio' })
      return { ok: (await s.getAttribute('aria-valuetext')) !== null && (await s.getAttribute('aria-valuenow')) !== null || (await s.evaluate((el) => el.type === 'range')) }
    })
    await check('player', 'timer de soneca: 15 min liga e mostra o rótulo; "Desligado" limpa', async () => {
      await page.getByRole('button', { name: 'Soneca' }).click()
      await page.getByRole('radio', { name: '15 min' }).check()
      const on = await page.getByRole('button', { name: /^Soneca: 15 min/ }).count()
      await page.getByRole('radio', { name: 'Desligado' }).check()
      const off = await page.getByRole('button', { name: 'Soneca', exact: true }).count()
      return { ok: on === 1 && off === 1, detail: `ligado=${on} desligado=${off}` }
    })
    await check('player', 'soneca "fim da parte": pausa ao terminar e NÃO avança', async () => {
      await page.getByRole('radio', { name: 'Fim da parte' }).check()
      await audio(() => { const a = document.querySelector('audio'); a.playbackRate = 1; a.currentTime = a.duration - 2 })
      await page.waitForFunction(() => document.querySelector('audio').paused, null, { timeout: 20000 }).catch(() => {}) // rede lenta pode atrasar o fim
      await page.waitForTimeout(1500) // dá tempo de um avanço indevido aparecer
      const st = await audio(() => ({ src: document.querySelector('audio').src.split('/').pop(), paused: document.querySelector('audio').paused }))
      return { ok: st.paused && /ruth_1/.test(st.src), detail: JSON.stringify(st) }
    })
    await check('player', 'áudio mono: liga sem quebrar a reprodução (CORS) e desliga', async () => {
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Abrir painel de acessibilidade' }).click()
      await page.getByRole('switch', { name: /^Áudio mono/ }).check()
      await page.keyboard.press('Escape')
      if (await audio(() => document.querySelector('audio').paused)) await page.keyboard.press('k')
      // ligar o mono recarrega a faixa com CORS; espera voltar a tocar
      await page.waitForFunction(() => document.querySelector('audio').readyState >= 3, null, { timeout: 20000 }).catch(() => {})
      const t0 = await audio(() => document.querySelector('audio').currentTime)
      await page.waitForTimeout(4000)
      const st = await audio(() => ({ t: document.querySelector('audio').currentTime, cors: document.querySelector('audio').crossOrigin, err: document.querySelector('audio').error?.code ?? null }))
      const still = await page.evaluate(() => JSON.parse(localStorage.getItem('ondas:v1:a11y')).mono)
      return { ok: st.t > t0 + 1 && st.cors === 'anonymous' && !st.err && still === true, detail: `t ${t0.toFixed(1)}→${st.t.toFixed(1)} crossOrigin=${st.cors} erro=${st.err} mono=${still}` }
    })
  }
  await page.context().close()
}

// -------------------------------------------------------- 6. preferências
{
  const page = await newPage({})
  await open(page, '')
  await check('preferências', 'tamanho 150%, tema claro e fonte Atkinson persistem após recarregar', async () => {
    await page.getByRole('button', { name: 'Abrir painel de acessibilidade' }).click()
    await page.getByRole('radio', { name: '150%' }).check()
    await page.getByRole('radio', { name: 'Claro' }).check()
    await page.getByRole('radio', { name: /^Atkinson/ }).check()
    await page.keyboard.press('Escape')
    await page.reload(); await page.waitForSelector('main h1')
    const s = await page.evaluate(() => ({ size: document.documentElement.style.fontSize, theme: document.documentElement.dataset.theme, font: getComputedStyle(document.body).fontFamily }))
    return { ok: s.size === '150%' && s.theme === 'light' && /Atkinson/.test(s.font), detail: JSON.stringify(s) }
  })
  await check('preferências', 'restaurar padrões', async () => {
    await page.getByRole('button', { name: 'Abrir painel de acessibilidade' }).click()
    await page.getByRole('button', { name: 'Restaurar padrões' }).click()
    const s = await page.evaluate(() => ({ size: document.documentElement.style.fontSize, theme: document.documentElement.dataset.theme }))
    await page.keyboard.press('Escape')
    return { ok: s.size === '100%' && s.theme === 'dark', detail: JSON.stringify(s) }
  })
  await page.context().close()
  for (const [label, reducedMotion, motionPref, expectAnimated] of [
    ['sistema pede movimento reduzido → onda parada (padrão)', 'reduce', 'system', false],
    ['preferência "Reduzir" → onda parada', 'no-preference', 'reduce', false],
    ['sem restrição → onda animada', 'no-preference', 'system', true],
  ]) {
    const p = await newPage({ motion: motionPref }, { reducedMotion })
    await open(p, '')
    await check('animações', label, async () => {
      const name = await p.evaluate(() => getComputedStyle(document.querySelector('.wave-a')).animationName)
      return { ok: expectAnimated ? name === 'drift' : name === 'none', detail: `animation-name=${name}` }
    })
    await p.context().close()
  }
}

// --------------------------------------- 7. 200% de texto sem quebrar layout
{
  for (const width of [360, 1280]) {
    const page = await newPage({ textScale: 200 }, { width, height: 800 })
    for (const [name, hash] of Object.entries(PAGES)) {
      await open(page, hash)
      await check('texto 200%', `${name} sem rolagem horizontal em ${width}px`, async () => {
        const o = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, main: (() => { const m = document.querySelector('[class*="overflow-y-auto"]'); return m ? m.scrollWidth - m.clientWidth : 0 })() }))
        return { ok: o.doc <= 1 && o.main <= 1, detail: JSON.stringify(o) }
      })
    }
    await page.context().close()
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações OK${softSkips ? ` (${softSkips} teste(s) de áudio não rodaram por falta de rede)` : ''}`)
if (failed.length) { console.log('FALHAS:'); failed.forEach((f) => console.log(` - [${f.group}] ${f.name}: ${f.detail}`)) }
process.exit(failed.length ? 1 : 0)
