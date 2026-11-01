// URL pública do site: SITE_URL, ou https://<dono>.github.io/<repo>/ no GitHub Actions (GITHUB_REPOSITORY).
const repo = process.env.GITHUB_REPOSITORY?.split('/')
export const site = (
  process.env.SITE_URL ||
  (repo ? `https://${repo[0].toLowerCase()}.github.io/${repo[1]}/` : 'https://jkfa.github.io/ondas-podcast/')
).replace(/\/?$/, '/')
