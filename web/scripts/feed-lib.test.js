import { describe, expect, it } from 'vitest'
import { feedXml, itemXml, licenseName, podcastGuid, uuidV5 } from './feed-lib.mjs'
import { validateFeed } from './validate-feed.mjs'

const NOW = new Date('2026-11-01T12:00:00Z')
const ctx = { site: 'https://x.dev/ondas/', lengthOf: () => 12345, seasons: new Map([['Obra', 3]]), transcriptUrl: (ep) => (ep.id === 'a' ? 'https://x.dev/ondas/transcripts/a.vtt' : null), language: 'pt-br' }
const ep = (extra = {}) => ({ id: 'a', title: 'Título & <tag>', show: 'Autora', description: 'Texto **forte**', audioUrl: 'https://archive.org/download/a/a.mp3', duration: 3725, publishedAt: '2026-10-31T10:00:00Z', license: 'https://creativecommons.org/licenses/by-sa/4.0/', explicit: false, ...extra })
const channel = { title: 'Ondas', link: 'https://x.dev/ondas/', self: 'https://x.dev/ondas/feed.xml', description: 'Desc', author: 'Ondas', image: 'https://x.dev/ondas/cover.png', language: 'pt-br', explicit: false, category: 'Arts', subcategory: 'Books', locked: true, ownerName: 'Ondas' }

describe('uuid e podcast:guid', () => {
  it('UUIDv5 bate com os vetores de referência', () => {
    expect(uuidV5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d') // uuid.NAMESPACE_DNS (RFC 4122)
    expect(podcastGuid('https://podnews.net/rss')).toBe('9b024349-ccf0-5f69-a609-6b82873eab3c') // exemplo da especificação do Podcasting 2.0
  })
  it('ignora protocolo e barra final', () => {
    expect(podcastGuid('http://podnews.net/rss/')).toBe(podcastGuid('https://podnews.net/rss'))
  })
})

describe('licenseName', () => {
  it('nomes legíveis', () => {
    expect(licenseName('https://creativecommons.org/licenses/by-nc-sa/4.0/')).toBe('CC BY-NC-SA 4.0')
    expect(licenseName('https://creativecommons.org/publicdomain/zero/1.0/')).toBe('CC0 1.0')
    expect(licenseName('https://x.dev/licenca')).toBeNull()
  })
})

describe('itemXml', () => {
  const xml = itemXml(ep({ chapters: [{ start: 0, title: 'x' }], series: 'Obra', part: 2 }), ctx)
  it('escapa texto e traz as tags iTunes e Podcasting 2.0', () => {
    expect(xml).toContain('<title>Título &amp; &lt;tag&gt;</title>')
    expect(xml).toContain('<itunes:duration>01:02:05</itunes:duration>')
    expect(xml).toContain('<itunes:explicit>false</itunes:explicit>')
    expect(xml).toContain('<podcast:license url="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</podcast:license>')
    expect(xml).toContain('<podcast:chapters url="https://x.dev/ondas/chapters/a.json" type="application/json+chapters"/>')
    expect(xml).toContain('<podcast:transcript url="https://x.dev/ondas/transcripts/a.vtt" type="text/vtt" language="pt"/>')
    expect(xml).toContain('<itunes:season>3</itunes:season>')
    expect(xml).toContain('length="12345"')
    expect(xml).toContain('Licença: CC BY-SA 4.0')
  })
  it('episódio explícito e sem licença conhecida', () => {
    const x = itemXml(ep({ explicit: true, license: undefined, id: 'b' }), ctx)
    expect(x).toContain('<itunes:explicit>true</itunes:explicit>')
    expect(x).not.toContain('podcast:license')
    expect(x).not.toContain('podcast:transcript')
  })
})

describe('feedXml + validação', () => {
  const valid = feedXml(channel, [itemXml(ep(), ctx), itemXml(ep({ id: 'b', title: 'Outro' }), ctx)], NOW)
  it('o feed montado passa na validação', () => {
    expect(validateFeed(valid)).toEqual([])
    expect(valid).toContain(`<podcast:guid>${podcastGuid(channel.self)}</podcast:guid>`)
    expect(valid).toContain('<podcast:locked>yes</podcast:locked>')
    expect(valid).toContain('<itunes:category text="Arts"><itunes:category text="Books"/></itunes:category>')
    expect(valid).not.toContain('itunes:email') // e-mail do dono só se estiver configurado
  })
  it('e-mail do dono entra no owner e no locked quando configurado', () => {
    const x = feedXml({ ...channel, ownerEmail: 'dono@exemplo.com' }, [itemXml(ep(), ctx)], NOW)
    expect(x).toContain('<podcast:locked owner="dono@exemplo.com">yes</podcast:locked>')
    expect(x).toContain('<itunes:email>dono@exemplo.com</itunes:email>')
    expect(validateFeed(x)).toEqual([])
  })
  it('detecta feeds inválidos', () => {
    const swap = (a, b) => validateFeed(valid.replace(a, b))
    expect(validateFeed('<rss><channel>')[0]).toMatch(/mal formado/)
    expect(swap('<language>pt-br</language>', '')).toEqual(expect.arrayContaining([expect.stringMatching(/sem <language>/)]))
    expect(swap(/<enclosure[^>]*\/>/, '<enclosure url="http://x/a.mp3" length="0" type="audio/ogg"/>').join('|')).toMatch(/https obrigatório/)
    expect(swap('length="12345" type="audio/mpeg"', 'length="0" type="audio/mpeg"').join('|')).toMatch(/length > 0/)
    expect(swap('<guid isPermaLink="false">b</guid>', '<guid isPermaLink="false">a</guid>').join('|')).toMatch(/guid repetido/)
    expect(swap('<itunes:duration>01:02:05</itunes:duration>', '<itunes:duration>1h</itunes:duration>').join('|')).toMatch(/HH:MM:SS/)
    expect(swap(/<podcast:guid>[^<]*<\/podcast:guid>/, '<podcast:guid>00000000-0000-5000-8000-000000000000</podcast:guid>').join('|')).toMatch(/não corresponde/)
    expect(swap('<itunes:explicit>false</itunes:explicit>\n    <itunes:image', '<itunes:explicit>talvez</itunes:explicit>\n    <itunes:image').join('|')).toMatch(/true ou false/)
    expect(swap(/<pubDate>[^<]*<\/pubDate>/, '<pubDate>ontem</pubDate>').join('|')).toMatch(/RFC 822/)
  })
})
