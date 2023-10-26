import type { PageLoad } from "./$types"

export const load: PageLoad = (event) => {
  const { params } = event
  const { fen } = params

  return {
    fen,
  }
}
