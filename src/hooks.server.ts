import type { Handle } from "@sveltejs/kit"

export const handle: Handle = async ({ resolve, event }) => {
  const response = await resolve(event)
  response.headers.append("Access-Control-Allow-Origin", "*")
  response.headers.append("Access-Control-Allow-Methods", "GET")
  response.headers.append("Cross-Origin-Opener-Policy", "same-origin")
  response.headers.append("Cross-Origin-Embedder-Policy", "require-corp")

  return response
}
