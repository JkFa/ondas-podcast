// Contador de acessos via Abacus (https://v2.jasoncameron.dev/abacus): API pública,
// sem cadastro, CORS liberado. Conta uma visita por sessão do navegador e por chave;
// em localhost só lê (não incrementa). Falhas de rede resultam em `null` (o contador some).
const BASE = 'https://abacus.jasoncameron.dev'
const NAMESPACE = 'ondas-jkfa'
const TIMEOUT_MS = 8000

const isLocal = () => /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname)
const cache = new Map()

const seen = (key) => {
  try { return sessionStorage.getItem(`ondas:v1:hit:${key}`) === '1' } catch { return false }
}
const markSeen = (key) => {
  try { sessionStorage.setItem(`ondas:v1:hit:${key}`, '1') } catch { /* ignora */ }
}

/** Chave válida no Abacus: [A-Za-z0-9_.-], 3 a 64 caracteres. */
export const viewKey = (kind, slug) => `${kind}-${slug}`.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 64)

async function request(mode, key) {
  try {
    const res = await fetch(`${BASE}/${mode}/${NAMESPACE}/${key}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 404) return 0 // ainda ninguém contou
    if (!res.ok) return null
    const { value } = await res.json()
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** Registra o acesso (uma vez por sessão) e devolve o total; reutiliza a promessa em memória. */
export function trackViews(key) {
  if (!cache.has(key)) {
    const hit = !seen(key) && !isLocal()
    cache.set(
      key,
      request(hit ? 'hit' : 'get', key).then((value) => {
        if (hit && value !== null) markSeen(key)
        else if (value === null) cache.delete(key) // permite nova tentativa depois
        return value
      }),
    )
  }
  return cache.get(key)
}
