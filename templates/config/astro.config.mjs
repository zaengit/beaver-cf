import { defineConfig } from "astro/config"
import cloudflare from "@astrojs/cloudflare"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  output: "server",
  adapter: cloudflare({ imageService: "passthrough" }),
  compressHTML: true,
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      noExternal: ["@zbeaver/beaver-cf"],
    },
    build: {
      minify: false,
    },
  },
  integrations: [react()],
  server: { host: true },
  security: {
    checkOrigin: true,
  },
})
