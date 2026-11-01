// Compartilhado entre o service worker (src/sw.js) e o gerenciador de downloads (lib/downloads.js).
export const AUDIO_CACHE = 'ondas-offline-v1' // áudio, capas e transcrições BAIXADOS pela pessoa (só ela remove)
export const COVER_CACHE = 'ondas-covers-v1' // capas vistas na navegação (limitado, pode ser descartado)
export const META_KEY = 'downloads' // metadados no localStorage (ondas:v1:downloads)
