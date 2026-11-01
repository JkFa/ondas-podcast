import { describe, expect, it } from 'vitest'
import { validateEpisode } from './catalog'

const base = { schemaVersion: 1, id: 'a', title: 'T', show: 'S', audioUrl: 'https://archive.org/download/a/a.mp3', duration: 10 }

describe('validateEpisode (campos opcionais da Fase 6)', () => {
  it('aceita episódio antigo e episódio com os metadados novos', () => {
    expect(validateEpisode(base)).toEqual([])
    expect(validateEpisode({ ...base, shortDescription: 'x', licenseName: 'CC BY 4.0', category: 'Arts', language: 'pt', explicit: false, tags: ['a', 'b'], sha256: 'ab', sourceSha256: 'cd' })).toEqual([])
  })
  it.each([
    [{ explicit: 'não' }, 'explicit'],
    [{ tags: 'a,b' }, 'tags'],
    [{ tags: ['a', ''] }, 'tags'],
    [{ shortDescription: 3 }, 'shortDescription'],
    [{ sha256: {} }, 'sha256'],
  ])('recusa tipo errado %j', (extra, campo) => {
    expect(validateEpisode({ ...base, ...extra }).join()).toContain(campo)
  })
})
