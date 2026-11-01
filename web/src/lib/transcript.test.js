import { describe, expect, it } from 'vitest'
import { parseVtt } from './vtt'
import { buildMd, buildTxt, findActive, fold, highlight, resolveUrl, searchParagraphs, toParagraphs } from './transcript'

const seg = (start, end, text) => ({ start, end, text })

describe('parseVtt', () => {
  it('lê cabeçalho, identificadores, tags e horas', () => {
    const vtt = '﻿WEBVTT\n\nNOTE comentário\n\n1\n00:00:01.500 --> 00:00:03.000\n<i>Olá</i>, mundo\n\n01:02:03.250 --> 01:02:05.000\nSegunda\nlinha\n'
    expect(parseVtt(vtt)).toEqual([seg(1.5, 3, 'Olá, mundo'), seg(3723.25, 3725, 'Segunda linha')])
  })
  it('aceita vírgula decimal e ignora blocos sem tempo', () => {
    expect(parseVtt('WEBVTT\n\nlixo\n\n00:01.000 --> 00:02,000\nok')).toEqual([seg(1, 2, 'ok')])
  })
})

describe('toParagraphs (mesma regra do pipeline)', () => {
  it('quebra em pausas, tamanho e contagem', () => {
    const segs = [seg(0, 2, 'Olá.'), seg(2.2, 4, 'Tudo bem?'), seg(9, 11, 'Depois da pausa.')]
    expect(toParagraphs(segs).map((p) => p.text)).toEqual(['Olá. Tudo bem?', 'Depois da pausa.'])
    const many = Array.from({ length: 14 }, (_, i) => seg(i, i + 0.9, `f${i}`))
    expect(toParagraphs(many).map((p) => p.text.split(' ').length)).toEqual([6, 6, 2])
    expect(toParagraphs([seg(0, 1, 'a'.repeat(400)), seg(1.1, 2, 'b'.repeat(400))])).toHaveLength(2)
  })
})

describe('findActive', () => {
  const items = [seg(0, 5, 'a'), seg(5, 10, 'b'), seg(20, 25, 'c')]
  it('acha o item corrente por busca binária', () => {
    expect(findActive(items, -1)).toBe(-1)
    expect(findActive(items, 0)).toBe(0)
    expect(findActive(items, 4.9)).toBe(1) // folga de 0,2 s
    expect(findActive(items, 12)).toBe(1)
    expect(findActive(items, 99)).toBe(2)
    expect(findActive([], 3)).toBe(-1)
  })
})

describe('busca sem acento', () => {
  const paragraphs = [seg(0, 1, 'A filha de Naomi'), seg(1, 2, 'Capítulo três'), seg(2, 3, 'nada aqui')]
  it('ignora acentos e maiúsculas', () => {
    expect(fold('Capítulo ÇÃ')).toBe('capitulo ca')
    expect(searchParagraphs(paragraphs, 'capitulo')).toEqual([1])
    expect(searchParagraphs(paragraphs, 'NAOMI')).toEqual([0])
    expect(searchParagraphs(paragraphs, '  ')).toEqual([])
  })
  it('destaca as ocorrências preservando o texto original', () => {
    expect(highlight('Capítulo três, capítulo', 'capitulo')).toEqual([
      { text: 'Capítulo', hit: true }, { text: ' três, ', hit: false }, { text: 'capítulo', hit: true },
    ])
    expect(highlight('texto', '')).toEqual([{ text: 'texto', hit: false }])
  })
})

describe('exportação', () => {
  const paragraphs = [seg(0, 5, 'Primeiro.'), seg(65, 70, 'Segundo.')]
  it('txt: parágrafos separados por linha em branco', () => {
    expect(buildTxt(paragraphs)).toBe('Primeiro.\n\nSegundo.\n')
  })
  it('md: cabeçalho e tempos, com links opcionais', () => {
    const md = buildMd({ title: 'Título', author: 'Autora', license: 'https://l/', episodeUrl: 'https://x/ep' }, paragraphs, (t) => `https://x/ep?t=${t}`)
    expect(md.startsWith('# Título')).toBe(true)
    for (const s of ['Autora', '<https://l/>', '**[0:00](https://x/ep?t=0)** Primeiro.', '**[1:05](https://x/ep?t=65)** Segundo.']) expect(md).toContain(s)
  })
})

describe('resolveUrl', () => {
  it('mantém absolutas e resolve relativas na base do site', () => {
    expect(resolveUrl('https://archive.org/x.vtt', '/ondas/')).toBe('https://archive.org/x.vtt')
    expect(resolveUrl('transcripts/a.vtt', '/ondas/')).toBe('/ondas/transcripts/a.vtt')
    expect(resolveUrl('/transcripts/a.vtt', '/ondas/')).toBe('/ondas/transcripts/a.vtt')
  })
})
