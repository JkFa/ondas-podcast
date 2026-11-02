import { describe, expect, it } from 'vitest'
import { applyData, backupFilename, buildBackup, cleanData, compact, decodeCompact, encodeCompact, parseBackup, qrLink, summarizeData } from './backup'

const ep = { schemaVersion: 1, id: 'x1', title: 'T', show: 'S', audioUrl: 'https://archive.org/download/x/x.mp3', duration: 10 }
const store = {
  progress: { a: { pos: 50, dur: 100, at: 2000 }, b: { pos: 100, dur: 100, at: 1000 } },
  favorites: ['a', 'b'],
  queue: ['c'],
  rate: 1.5,
  volume: 0.8,
  'transcript-on': true,
  a11y: { theme: 'dark', contrast: true, textScale: 150 },
  imported: [ep],
  stats: { since: '2026-11-01', days: { '2026-11-01': { c: 600, w: 500 } } },
  extra: 'não deve sair',
}
const read = (k, fb) => (k in store ? store[k] : fb)
const text = (o) => JSON.stringify(o)

describe('arquivo de backup', () => {
  it('exporta só as chaves conhecidas e reimporta igual', () => {
    const b = buildBackup(read, new Date('2026-11-02T10:00:00Z'))
    expect(b).toMatchObject({ app: 'ondas', kind: 'backup', version: 1, exportedAt: '2026-11-02T10:00:00.000Z' })
    expect(b.data.extra).toBeUndefined()
    const r = parseBackup(text(b))
    expect(r.ok).toBe(true)
    expect(r.data.progress).toEqual(store.progress)
    expect(r.data.a11y.textScale).toBe(150)
    expect(r.summary).toMatchObject({ progress: 2, favorites: 2, queue: 1, imported: 1, statsDays: 1, statsSeconds: 600, hasSettings: true })
    expect(backupFilename(new Date('2026-11-02T10:00:00Z'))).toBe('ondas-backup-2026-11-02.json')
  })
  it.each([
    ['', 'empty'],
    ['{não é json', 'json'],
    ['[]', 'notBackup'],
    [text({ app: 'outro', kind: 'backup', version: 1, data: {} }), 'notBackup'],
    [text({ app: 'ondas', kind: 'backup', version: 99, data: { favorites: ['a'] } }), 'newer'],
    [text({ app: 'ondas', kind: 'backup', version: 1, data: { favorites: 'a' } }), 'nothing'],
    ['x'.repeat(2 * 1024 * 1024 + 1), 'big'],
  ])('recusa %#', (input, error) => {
    expect(parseBackup(input)).toEqual({ ok: false, error })
  })
  it('descarta lixo campo a campo, sem derrubar o resto', () => {
    const evil = {
      progress: { good: { pos: 5, dur: 10 }, '__proto__': { pos: 1, dur: 2 }, neg: { pos: -1, dur: 2 }, zero: { pos: 1, dur: 0 }, str: { pos: '1', dur: 2 }, over: { pos: 99, dur: 10 }, 'bad\u0000id': { pos: 1, dur: 2 } },
      favorites: ['a', 'a', 3, '', 'x'.repeat(301), 'b'],
      rate: 9, volume: 5, 'transcript-on': 'sim',
      a11y: { theme: 'neon', textScale: 999, contrast: 'sim' },
      imported: [ep, { id: 'ruim' }, 'texto'],
      stats: { days: { '2026-11-01': { c: 5, w: 5 }, nope: { c: 1, w: 1 } } },
    }
    const d = cleanData(evil)
    expect(Object.keys(d.progress).sort()).toEqual(['good', 'over'])
    expect(d.progress.over.pos).toBe(10)
    expect(Object.getPrototypeOf(d.progress)).toBe(Object.prototype)
    expect({}.pos).toBeUndefined()
    expect(d.favorites).toEqual(['a', 'b'])
    expect('rate' in d || 'volume' in d || 'transcript-on' in d).toBe(false)
    expect(d.a11y.theme).toBe('system')
    expect(d.a11y.textScale).toBe(100)
    expect(d.imported).toEqual([ep])
    expect(Object.keys(d.stats.days)).toEqual(['2026-11-01'])
  })
  it('limita quantidade de itens', () => {
    const many = Object.fromEntries(Array.from({ length: 7000 }, (_, i) => [`e${i}`, { pos: 1, dur: 2 }]))
    expect(Object.keys(cleanData({ progress: many }).progress)).toHaveLength(6000)
  })
})

describe('aplicar', () => {
  const current = {
    progress: { a: { pos: 10, dur: 100, at: 3000 }, b: { pos: 20, dur: 100, at: 500 }, only: { pos: 1, dur: 5, at: 1 } },
    favorites: ['z', 'a'], queue: ['q1'], imported: [ep], rate: 1,
    stats: { since: '2026-11-02', days: { '2026-11-02': { c: 100, w: 100 } } },
  }
  const incoming = cleanData(store)
  it('mesclar: progresso mais recente vence, listas unidas, configurações intactas', () => {
    const out = applyData(current, incoming, 'merge')
    expect(out.progress.a.pos).toBe(10) // o daqui é mais recente (at 3000 > 2000)
    expect(out.progress.b.pos).toBe(100) // o do backup é mais recente (1000 > 500)
    expect(out.progress.only).toBeDefined()
    expect(out.favorites).toEqual(['z', 'a', 'b'])
    expect(out.queue).toEqual(['q1', 'c'])
    expect(out.imported).toHaveLength(1)
    expect(out.stats.days).toMatchObject({ '2026-11-01': { c: 600, w: 500 }, '2026-11-02': { c: 100, w: 100 } })
    expect('rate' in out || 'volume' in out || 'a11y' in out).toBe(false)
  })
  it('mesclar é idempotente', () => {
    const once = applyData(current, incoming, 'merge')
    const twice = applyData({ ...current, ...once }, incoming, 'merge')
    expect(twice).toEqual(once)
  })
  it('substituir troca tudo o que o backup traz e deixa o resto', () => {
    const out = applyData(current, { favorites: ['n'], rate: 2 }, 'replace')
    expect(out).toEqual({ favorites: ['n'], rate: 2 })
  })
})

describe('QR compacto', () => {
  // ids parecidos com os reais, mas pouco repetitivos (a compressão não pode "ajudar" o teste)
  const id = (i) => `${(i * 2654435761 >>> 0).toString(36)}-${(i * 40503 + 7).toString(36)}-parte-${i}-20261101`
  const data = cleanData({
    progress: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [id(i), { pos: 100 + i, dur: 900, at: 1_700_000_000_000 + i * 60000 }])),
    favorites: [id(1)], queue: [], rate: 1.25,
  })
  it('vai e volta com os dados', async () => {
    const back = await decodeCompact(await encodeCompact(compact(data, 3)))
    expect(Object.keys(back.progress)).toHaveLength(3)
    expect(back.progress[id(79)]).toMatchObject({ pos: 179, dur: 900, at: 1_700_004_740_000 })
    expect(back.favorites).toEqual([id(1)])
    expect(back.rate).toBe(1.25)
  })
  it('qrLink cabe no limite e leva os mais recentes primeiro', async () => {
    const r = await qrLink(data, 'https://x.github.io/ondas-podcast/', 1100)
    expect(r.url.length).toBeLessThanOrEqual(1100)
    expect(r.count).toBeGreaterThan(5)
    expect(r.count).toBeLessThan(r.total)
    expect(r.url.startsWith('https://x.github.io/ondas-podcast/#/backup?d=')).toBe(true)
    const back = await decodeCompact(r.url.split('d=')[1])
    expect(Object.keys(back.progress)).toHaveLength(r.count)
    expect(back.progress[id(79)]).toBeDefined() // o mais recente entrou
    expect(back.progress[id(0)]).toBeUndefined()
  })
  it('rejeita lixo sem lançar exceção', async () => {
    for (const bad of ['', 'aaaa', '%%%', 'x'.repeat(30000), await encodeCompact({ v: 2, p: [] }), await encodeCompact({ v: 1, p: 'x' })]) expect(await decodeCompact(bad)).toBeNull()
  })
  it('resumo de dados vazios', () => {
    expect(summarizeData({})).toMatchObject({ progress: 0, hasSettings: false })
  })
})
