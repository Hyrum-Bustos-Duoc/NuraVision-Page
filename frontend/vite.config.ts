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
    /**
     * Entorno por defecto: Node, no jsdom.
     *
     * Lo que hay escrito prueba reglas, mappers y casos de uso —lógica pura que
     * no toca el DOM—, así que jsdom solo añadiría tiempo de arranque.
     *
     * Y hoy, además, NO ARRANCA: jsdom 30 exige html-encoding-sniffer 7, que
     * carga `@exodus/bytes` con require(). Ese paquete es ESM puro, y require()
     * de un módulo ESM solo está soportado desde Node 20.19 / 22.12. Aquí hay
     * 20.17 —el mismo Node por el que Vite avisa en cada build—, y no existe
     * versión que fijar: todo el rango 1.x de `@exodus/bytes` es `type: module`.
     *
     * Un test de componente pide su entorno en su propio archivo, poniendo
     * `// @vitest-environment jsdom` en la primera línea. Eso seguirá fallando
     * mientras no se suba Node: subirlo es el arreglo de verdad, no esta línea.
     */
    environment: 'node',
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
