// Confere o contraste WCAG (AA) das paletas definidas em src/index.css (@theme) e src/themes.css,
// para as 4 combinações: escuro, claro, escuro+alto contraste, claro+alto contraste.
// Uso: node scripts/contrast.mjs   (sai com código 1 se algum par falhar)
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')
const themes = await readFile(new URL('../src/themes.css', import.meta.url), 'utf8')

const decls = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const base = decls(css.match(/@theme\s*\{([^}]*)\}/)[1])
const blocks = [...themes.matchAll(/(:root[^{]*)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), vars: decls(m[2]) }))
const block = (sel) => blocks.find((b) => b.sel === sel)?.vars ?? {}

const COMBOS = {
  'escuro': { ...base, ...block(':root') },
  'claro': { ...base, ...block(':root'), ...block(":root[data-theme='light']") },
  'escuro + alto contraste': { ...base, ...block(':root'), ...block(":root[data-contrast='high']") },
  'claro + alto contraste': { ...base, ...block(':root'), ...block(":root[data-theme='light']"), ...block(":root[data-contrast='high']"), ...block(":root[data-theme='light'][data-contrast='high']") },
}

function parseColor(v) {
  v = v.trim()
  let m = v.match(/^#([0-9a-f]{6})$/i)
  if (m) return { rgb: [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)), a: 1 }
  m = v.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/)
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] }
  throw new Error(`cor não reconhecida: ${v}`)
}
const over = (fg, bg) => fg.rgb.map((c, i) => Math.round(c * fg.a + bg.rgb[i] * (1 - fg.a)))
const lum = (rgb) => {
  const [r, g, b] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

// [descrição, primeiro plano, fundo, mínimo]
const PAIRS = [
  ['texto principal / fundo', '--color-ink-50', '--color-ink-950', 4.5],
  ['texto principal / cartões', '--color-ink-50', '--color-ink-900', 4.5],
  ['texto secundário (ink-200) / fundo', '--color-ink-200', '--color-ink-950', 4.5],
  ['texto secundário (ink-300) / fundo', '--color-ink-300', '--color-ink-950', 4.5],
  ['texto discreto (ink-400) / fundo', '--color-ink-400', '--color-ink-950', 4.5],
  ['texto discreto (ink-400) / cartões', '--color-ink-400', '--color-ink-900', 4.5],
  ['texto discreto (ink-400) / ink-800', '--color-ink-400', '--color-ink-800', 4.5],
  ['links e destaques (signal) / fundo', '--color-signal', '--color-ink-950', 4.5],
  ['links e destaques (signal) / cartões', '--color-signal', '--color-ink-900', 4.5],
  ['texto do botão primário / signal', '--color-ink-950', '--color-signal', 4.5],
  ['texto do botão primário / signal (hover)', '--color-ink-950', '--color-signal-hover', 4.5],
  ['erro (rose-300) / fundo', '--color-rose-300', '--color-ink-950', 4.5],
  ['sucesso (emerald-300) / fundo', '--color-emerald-300', '--color-ink-950', 4.5],
  ['anel de foco / fundo (1.4.11)', '--focus-a', '--color-ink-950', 3],
  // O anel tem 2px de afastamento (outline-offset), então ele nunca encosta no botão signal: o vizinho é o fundo.
  ['anel externo de foco / anel interno', '--focus-b', '--focus-a', 3],
  ['contorno de campos e botões / fundo (1.4.11)', '--control-line', '--color-ink-950', 3],
  ['contorno de campos e botões / cartões (1.4.11)', '--control-line', '--color-ink-900', 3],
]

let failures = 0
for (const [name, vars] of Object.entries(COMBOS)) {
  console.log(`\n${name}`)
  for (const [label, fgVar, bgVar, min] of PAIRS) {
    const get = (v) => vars[v] ?? base[v]
    if (get(fgVar) === undefined) { console.log(`  --  ${label}: (variável ${fgVar} não definida neste tema; usa o padrão do Tailwind)`); continue }
    const bg = parseColor(get(bgVar))
    const fg = parseColor(get(fgVar))
    const r = ratio(over(fg, bg), bg.rgb)
    const ok = r >= min
    if (!ok) failures++
    console.log(`  ${ok ? 'OK ' : 'FALHA'} ${r.toFixed(2).padStart(5)}:1 (mín. ${min})  ${label}`)
  }
}
console.log(failures ? `\n${failures} par(es) abaixo do mínimo.` : '\nTodos os pares atendem ao WCAG AA.')
process.exit(failures ? 1 : 0)
