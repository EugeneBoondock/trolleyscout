import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: false,
    alias: {
      // `cloudflare:workers` only exists inside workerd. Without this, any
      // test that transitively imports the catalogue Workflow fails to load.
      'cloudflare:workers': new URL(
        './test/stubs/cloudflareWorkers.ts',
        import.meta.url,
      ).pathname,
    },
  },
})
