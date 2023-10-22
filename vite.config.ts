import { sveltekit } from "@sveltejs/kit/vite"
import { defineConfig } from "vitest/config"
import { viteStaticCopy } from "vite-plugin-static-copy"
import type { Plugin } from "vite"

const viteServerConfig: Plugin = {
  name: "Add CORS headers",
  configureServer: (server) => {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*")
      res.setHeader("Access-Control-Allow-Methods", "GET")
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
      next()
    })
  },
}

export default defineConfig({
  plugins: [
    sveltekit(),
    viteServerConfig,
    viteStaticCopy({
      targets: [
        {
          src: "./node_modules/stockfish/src/stockfish-nnue-16.wasm",
          dest: "./_app/immutable/workers",
        },
      ],
    }),
  ],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
  },
})
