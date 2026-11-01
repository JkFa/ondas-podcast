import { describe, expect, it } from 'vitest'
import { APPS, appsFor, detectPlatform, feedUrl, visiblePlatforms } from './podcastApps'

const FEED = 'https://jkfa.github.io/ondas-podcast/feed.xml'
const app = (id) => APPS.find((a) => a.id === id)

describe('esquemas de assinatura (conferidos em 2026-11-01)', () => {
  it('Apple Podcasts: podcast:// + feed sem https://', () => {
    expect(app('applepodcasts').href(FEED)).toBe('podcast://jkfa.github.io/ondas-podcast/feed.xml')
    expect(app('applepodcasts').official).toBe(false)
  })
  it('Overcast: x-callback-url/add com o feed codificado', () => {
    expect(app('overcast').href(FEED)).toBe(`overcast://x-callback-url/add?url=${encodeURIComponent(FEED)}`)
  })
  it('Pocket Casts: pktc://subscribe/ + feed sem http(s)://', () => {
    expect(app('pocketcasts').href(FEED)).toBe('pktc://subscribe/jkfa.github.io/ondas-podcast/feed.xml')
  })
  it('AntennaPod: link web oficial com url e title codificados (não o esquema não documentado)', () => {
    expect(app('antennapod').href(FEED, 'O Livro de Ruth')).toBe(`https://antennapod.org/deeplink/subscribe?url=${encodeURIComponent(FEED)}&title=O%20Livro%20de%20Ruth`)
  })
  it('todo app tem data de verificação e fonte', () => {
    for (const a of APPS) {
      expect(a.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(a.source).toBeTruthy()
      expect(a.kind === 'link' ? typeof a.href : a.steps?.length).toBeTruthy()
    }
  })
  it('apps sem link documentado não inventam esquema', () => {
    for (const id of ['castro', 'podcastaddict', 'castbox', 'podverse', 'fountain']) expect(app(id).href).toBeUndefined()
  })
})

describe('plataforma e ordem', () => {
  it('detecta iOS, Android, Mac e desktop', () => {
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' })).toBe('ios')
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios') // iPadOS
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe('android')
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe('mac')
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' })).toBe('desktop')
  })
  it('iOS mostra Apple Podcasts e Overcast primeiro; Android mostra AntennaPod; resto vai para o passo a passo', () => {
    expect(appsFor('ios').oneTap.map((a) => a.id)).toEqual(['applepodcasts', 'overcast', 'pocketcasts'])
    expect(appsFor('ios').manual.map((a) => a.id)).toEqual(['castro', 'castbox', 'podverse', 'fountain'])
    expect(appsFor('android').oneTap.map((a) => a.id)).toEqual(['antennapod'])
    expect(appsFor('android').manual.map((a) => a.id)).toEqual(['pocketcasts', 'podcastaddict', 'castbox', 'podverse', 'fountain'])
    expect(appsFor('mac').oneTap.map((a) => a.id)).toEqual(['applepodcasts'])
    expect(appsFor('desktop').oneTap.map((a) => a.id)).toEqual(['antennapod'])
    expect(appsFor('desktop').manual.length).toBeGreaterThan(4)
  })
})

describe('feeds e plataformas', () => {
  it('feed geral e por obra', () => {
    expect(feedUrl('https://x.dev/ondas', '')).toBe('https://x.dev/ondas/feed.xml')
    expect(feedUrl('https://x.dev/ondas/', 'o-livro-de-ruth')).toBe('https://x.dev/ondas/feeds/o-livro-de-ruth.xml')
  })
  it('plataformas só aparecem com link https preenchido', () => {
    expect(visiblePlatforms({ spotify: '', youtubeMusic: '  ', deezer: 'http://inseguro', amazonMusic: undefined })).toEqual([])
    expect(visiblePlatforms({ spotify: 'https://open.spotify.com/show/x', deezer: 'https://www.deezer.com/show/1' }).map((p) => p.id)).toEqual(['spotify', 'deezer'])
  })
})
