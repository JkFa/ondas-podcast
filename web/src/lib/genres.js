// Gêneros por palavras-chave (config/genres.json), a partir das tags, do título e da série. A classificação é automática e
// aproximada: o archive.org não tem um campo de gênero, só assuntos digitados à mão por quem enviou o áudio.
import config from '../../../config/genres.json'
import { createGenres, norm } from './genres-core.js'

export { norm }
export const { GENRES, OTHER, genreById, genresOfBook, groupByGenre } = createGenres(config)
