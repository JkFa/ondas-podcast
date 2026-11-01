// Preferências de acessibilidade: estado global pequeno (useSyncExternalStore) salvo em
// localStorage ('ondas:v1:a11y') e aplicado como atributos em <html>, que o CSS lê.
import { load, save } from './storage'

export const DEFAULT_PREFS = {
  theme: 'system', // 'system' | 'light' | 'dark'
  contrast: false,
  textScale: 100, // 100 | 125 | 150 | 200
  font: 'default', // 'default' | 'atkinson' | 'opendyslexic'
  motion: 'system', // 'system' | 'reduce' | 'full'
  spacing: false,
  mono: false,
  shortcuts: true,
  captions: false,
  vlibras: false,
}

const TEXT_SCALES = [100, 125, 150, 200]

/** Aceita só valores conhecidos (o localStorage pode ter lixo ou versões antigas). */
export function sanitize(raw) {
  const p = { ...DEFAULT_PREFS }
  if (!raw || typeof raw !== 'object') return p
  if (['system', 'light', 'dark'].includes(raw.theme)) p.theme = raw.theme
  if (TEXT_SCALES.includes(raw.textScale)) p.textScale = raw.textScale
  if (['default', 'atkinson', 'opendyslexic'].includes(raw.font)) p.font = raw.font
  if (['system', 'reduce', 'full'].includes(raw.motion)) p.motion = raw.motion
  for (const k of ['contrast', 'spacing', 'mono', 'shortcuts', 'vlibras', 'captions']) if (typeof raw[k] === 'boolean') p[k] = raw[k]
  return p
}

export const resolveTheme = (prefs, prefersLight) => (prefs.theme === 'system' ? (prefersLight ? 'light' : 'dark') : prefs.theme)

const prefersLight = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches

export function applyPrefs(prefs, root = document.documentElement) {
  const theme = resolveTheme(prefs, prefersLight())
  root.dataset.theme = theme
  root.dataset.contrast = prefs.contrast ? 'high' : 'normal'
  root.dataset.font = prefs.font
  root.dataset.motion = prefs.motion
  root.dataset.spacing = prefs.spacing ? 'wide' : 'normal'
  root.style.fontSize = `${prefs.textScale}%`
  const meta = root.ownerDocument?.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', prefs.contrast ? (theme === 'light' ? '#ffffff' : '#000000') : theme === 'light' ? '#f6f6fc' : '#0b0b14')
}

let state = sanitize(load('a11y', null))
const listeners = new Set()

export const getPrefs = () => state
export const subscribePrefs = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setPrefs(patch) {
  state = sanitize({ ...state, ...(typeof patch === 'function' ? patch(state) : patch) })
  save('a11y', state)
  applyPrefs(state)
  listeners.forEach((fn) => fn())
}

export const resetPrefs = () => setPrefs({ ...DEFAULT_PREFS })

/** Chamar uma vez antes de renderizar (evita piscar o tema errado) e ao mudar o tema do sistema. */
export function initPrefs() {
  applyPrefs(state)
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => state.theme === 'system' && applyPrefs(state))
  }
}
