import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, applyPrefs, resolveTheme, sanitize } from './prefs'

describe('sanitize', () => {
  it('devolve os padrões para lixo', () => {
    expect(sanitize(null)).toEqual(DEFAULT_PREFS)
    expect(sanitize('x')).toEqual(DEFAULT_PREFS)
  })
  it('aceita valores válidos e descarta inválidos', () => {
    const p = sanitize({ theme: 'light', textScale: 150, font: 'comic', motion: 'reduce', contrast: 'sim', mono: true })
    expect(p).toMatchObject({ theme: 'light', textScale: 150, font: 'default', motion: 'reduce', contrast: false, mono: true })
  })
})

describe('resolveTheme', () => {
  it('segue o sistema só quando theme = system', () => {
    expect(resolveTheme({ theme: 'system' }, true)).toBe('light')
    expect(resolveTheme({ theme: 'system' }, false)).toBe('dark')
    expect(resolveTheme({ theme: 'dark' }, true)).toBe('dark')
  })
})

describe('applyPrefs', () => {
  it('grava os atributos lidos pelo CSS', () => {
    const root = { dataset: {}, style: {} }
    applyPrefs({ ...DEFAULT_PREFS, theme: 'light', contrast: true, textScale: 200, font: 'atkinson', motion: 'reduce', spacing: true }, root)
    expect(root.dataset).toEqual({ theme: 'light', contrast: 'high', font: 'atkinson', motion: 'reduce', spacing: 'wide' })
    expect(root.style.fontSize).toBe('200%')
  })
})
