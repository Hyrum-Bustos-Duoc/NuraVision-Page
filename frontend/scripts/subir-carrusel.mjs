// Sube las fotos de frontend/public/carrusel/ al bucket publico `contenido`,
// bajo carrusel/<carpeta>/<archivo>. Es idempotente: volver a correrlo
// reemplaza los mismos nombres.
//
// Uso (desde frontend/):  npm run carrusel:subir
// Necesita en frontend/.env.local (archivo ignorado por git):
//   VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
// La service role salta la RLS: no la pongas en variables VITE_ ni la compartas.
import { createClient } from '@supabase/supabase-js'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const url = process.env.VITE_SUPABASE_URL
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !clave) {
  console.error('Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en frontend/.env.local')
  process.exit(1)
}

const supabase = createClient(url, clave, { auth: { persistSession: false } })
const RAIZ = new URL('../public/carrusel/', import.meta.url).pathname
let subidas = 0
let fallos = 0

for (const carpeta of await readdir(RAIZ)) {
  for (const archivo of (await readdir(join(RAIZ, carpeta))).filter((f) => /\.jpe?g$/i.test(f)).sort()) {
    const ruta = `carrusel/${carpeta}/${archivo}`
    const { error } = await supabase.storage
      .from('contenido')
      .upload(ruta, await readFile(join(RAIZ, carpeta, archivo)), {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: true,
      })
    if (error) {
      fallos++
      console.error(`FALLO ${ruta}: ${error.message}`)
    } else {
      subidas++
      console.log(`ok ${ruta}`)
    }
  }
}
console.log(`\n${subidas} subidas, ${fallos} fallos`)
process.exit(fallos ? 1 : 0)
