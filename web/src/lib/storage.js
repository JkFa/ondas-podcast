// Persistência em localStorage com chaves versionadas. Nunca lança exceção:
// modo privado, cota cheia ou storage bloqueado simplesmente viram no-op.
const PREFIX = 'ondas:v1:'

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* sem espaço ou bloqueado: ignora */
  }
}
