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

// Durante a restauração de um backup a página recarrega em seguida; escritas do app antigo (posição do áudio, preferências)
// não podem sobrescrever o que acabou de ser importado.
let frozen = false
export const freezeWrites = () => { frozen = true }

export function save(key, value, { force = false } = {}) {
  if (frozen && !force) return
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* sem espaço ou bloqueado: ignora */
  }
}
