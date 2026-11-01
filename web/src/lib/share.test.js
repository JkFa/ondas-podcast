import { describe, expect, it } from 'vitest'
import { NETWORKS, bookShareUrl, embedCode, embedUrl, episodeShareUrl, parseTimeToken, shareText, timeToken } from './share'

const BASE = 'https://jkfa.github.io/ondas-podcast/'

describe('timeToken / parseTimeToken', () => {
  it('formata 12m30s, horas e segundos soltos', () => {
    expect(timeToken(750)).toBe('12m30s')
    expect(timeToken(3725)).toBe('1h2m5s')
    expect(timeToken(60)).toBe('1m')
    expect(timeToken(3600)).toBe('1h')
    expect(timeToken(45)).toBe('45s')
    expect(timeToken(0)).toBe('0s')
    expect(timeToken(750.9)).toBe('12m30s')
  })
  it('lê de volta (e aceita segundos puros)', () => {
    for (const sec of [0, 45, 60, 750, 3600, 3725]) expect(parseTimeToken(timeToken(sec))).toBe(sec)
    expect(parseTimeToken('750')).toBe(750)
    expect(parseTimeToken('12M30S')).toBe(750)
    expect(parseTimeToken('abc')).toBeNull()
    expect(parseTimeToken('')).toBeNull()
  })
})

describe('URLs de compartilhamento', () => {
  it('episódio e obra apontam para as páginas estáticas com prévia', () => {
    expect(episodeShareUrl(BASE, 'livro-de-ruth-1811-02', 750)).toBe(`${BASE}episodio/livro-de-ruth-1811-02/#t=12m30s`)
    expect(episodeShareUrl(BASE, 'x', 0)).toBe(`${BASE}episodio/x/`)
    expect(episodeShareUrl('https://a.b/c', 'x', 5)).toBe('https://a.b/c/episodio/x/#t=5s')
    expect(bookShareUrl(BASE, 'o-livro-de-ruth')).toBe(`${BASE}obra/o-livro-de-ruth/`)
    expect(embedUrl(BASE, 'a b')).toBe(`${BASE}embed/?ep=a%20b`)
  })
  it('código do iframe escapa aspas e aponta para o embed', () => {
    const code = embedCode(BASE, { id: 'ep-1', title: 'Título "com aspas" & <tags>' })
    expect(code).toContain(`src="${BASE}embed/?ep=ep-1"`)
    expect(code).toContain('title="Ondas: Título &quot;com aspas&quot; &amp; &lt;tags&gt;"')
    expect(code.startsWith('<iframe')).toBe(true)
    expect(code).toContain('loading="lazy"')
  })
})

describe('redes', () => {
  const ctx = { url: `${BASE}obra/x/#a`, text: 'Ouça “Olá & tchau”', title: 'Título' }
  const href = (id) => NETWORKS.find((n) => n.id === id).build(ctx)
  it('monta cada URL no padrão oficial, com tudo codificado', () => {
    const u = encodeURIComponent(ctx.url)
    const t = encodeURIComponent(ctx.text)
    expect(href('whatsapp')).toBe(`https://wa.me/?text=${encodeURIComponent(`${ctx.text} ${ctx.url}`)}`)
    expect(href('x')).toBe(`https://x.com/intent/post?text=${t}&url=${u}`)
    expect(href('facebook')).toBe(`https://www.facebook.com/sharer/sharer.php?u=${u}`)
    expect(href('telegram')).toBe(`https://t.me/share/url?url=${u}&text=${t}`)
    expect(href('threads')).toBe(`https://www.threads.com/intent/post?text=${encodeURIComponent(`${ctx.text} ${ctx.url}`)}`)
    expect(href('bluesky')).toBe(`https://bsky.app/intent/compose?text=${encodeURIComponent(`${ctx.text} ${ctx.url}`)}`)
    expect(href('linkedin')).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${u}`)
    expect(href('email')).toBe(`mailto:?subject=${encodeURIComponent('Título')}&body=${encodeURIComponent(`${ctx.text}\n\n${ctx.url}`)}`)
  })
  it('lista exatamente as redes com URL web (Instagram e TikTok ficam de fora)', () => {
    expect(NETWORKS.map((n) => n.id)).toEqual(['whatsapp', 'x', 'facebook', 'telegram', 'threads', 'bluesky', 'linkedin', 'email'])
  })
})

describe('shareText', () => {
  it('descreve obra, parte e ponto de partida', () => {
    expect(shareText({ kind: 'site' })).toMatch(/^Ondas:/)
    expect(shareText({ kind: 'book', title: 'Iracema', author: 'José de Alencar' })).toBe('Ouça “Iracema”, de José de Alencar no Ondas.')
    expect(shareText({ kind: 'episode', title: 'Iracema', author: 'JA', part: 'Capítulos 6 a 10', startSec: 750 })).toBe('Ouça “Iracema”, de JA — Capítulos 6 a 10 (a partir de 12 min 30 s) no Ondas.')
  })
})
