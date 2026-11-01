// Pedido de publicação: valida o formulário do site e monta a URL da Issue do GitHub já preenchida.
// Os campos de texto de um formulário de Issue podem ser preenchidos por parâmetros da URL com o `id` do campo
// (documentação do GitHub); menus e caixas de marcar não: por isso a licença é um campo de texto (código) e a
// confirmação de direitos é marcada de novo no GitHub.
import licenses from '../../../config/licenses.json'

export const REPO = 'JkFa/ondas-podcast'
export const TEMPLATE = 'enviar-episodio.yml'
export const LICENSES = Object.entries(licenses).map(([code, v]) => ({ code, ...v }))

export const issueUrl = (path = 'new') => `https://github.com/${REPO}/issues/${path}`

/** Devolve { campo: chave de erro } (vazio = válido). */
export function validateRequest({ link = '', confirmed = false }) {
  const errors = {}
  const v = link.trim()
  if (!v) errors.link = 'link'
  else {
    let url
    try { url = new URL(v) } catch { errors.link = 'linkFormat' }
    if (url && url.protocol !== 'https:') errors.link = 'linkHttps'
  }
  if (!confirmed) errors.confirm = 'confirm'
  return errors
}

const MAX_URL = 7000 // o GitHub devolve 414 para URLs muito longas

/** URL de "nova Issue" com o formulário preenchido: template, título e os campos de texto. */
export function buildIssueUrl({ link, program = '', author = '', license = 'by', notes = '' }) {
  const host = (() => { try { return new URL(link.trim()).hostname.replace(/^www\./, '') } catch { return '' } })()
  const build = (n) => {
    const q = new URLSearchParams({
      template: TEMPLATE,
      title: `Episódio: ${program.trim() || host || 'novo'}`,
      link: link.trim(),
      programa: program.trim(),
      autor: author.trim(),
      licenca: license,
      observacoes: n,
    })
    return `${issueUrl('new')}?${q}`
  }
  let n = notes.trim().slice(0, 1500)
  let url = build(n)
  while (url.length > MAX_URL && n.length > 0) {
    n = n.slice(0, Math.max(0, n.length - 300))
    url = build(n)
  }
  return url
}
