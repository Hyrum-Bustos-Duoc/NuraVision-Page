import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Permite exponer el dev server con `cloudflared tunnel --url http://localhost:5173`.
    // El punto inicial acepta cualquier subdominio: cada tunel rapido cambia de nombre.
    allowedHosts: ['.trycloudflare.com'],
  },
  test: {
    // `describe`, `it` y `expect` disponibles sin importarlos en cada archivo.
    globals: true,
    // Aun no hay tests escritos: sin esto `npm test` fallaria por no encontrar ninguno.
    passWithNoTests: true,
    // Navegador simulado en memoria: permite renderizar componentes sin abrir Chrome.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Los tests unitarios viven junto al código que prueban.
    include: ['src/**/*.test.{ts,tsx}'],
    // e2e/ es territorio de Playwright, Vitest no debe tocarlo.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
    },
  },
})
