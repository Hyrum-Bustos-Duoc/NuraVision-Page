import type { Json } from '@/shared/types/supabase'
import { supabase } from '@/shared/infrastructure/supabase/client'
import { fileToStorableDataUrl } from '@/shared/lib/image'
import type { ContenidoGuardado, ContenidoRepository } from '../domain/contenido.repository'
import type { ContenidoSitio, DestinoFoto } from '../domain/contenido.types'

/** "Esa tabla no existe": 42P01 de Postgres, PGRST205 del cache de PostgREST. */
const SIN_TABLA = new Set(['42P01', 'PGRST205'])
const BUCKET = 'contenido'

export const SIN_MIGRACION =
  'El contenido todavía no se puede editar: falta aplicar la migración 0014_contenido_sitio.sql.'

/** data URL -> Blob, para subir la foto ya comprimida por `fileToStorableDataUrl`. */
async function aBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

export class SupabaseContenidoRepository implements ContenidoRepository {
  async obtener(): Promise<ContenidoGuardado | null> {
    const { data, error } = await supabase
      .from('contenido_sitio')
      .select('datos, actualizado_en')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      if (SIN_TABLA.has(error.code)) return null
      throw new Error(`No se pudo leer el contenido: ${error.message}`)
    }
    return { datos: data?.datos ?? {}, actualizadoEn: data?.actualizado_en ?? null }
  }

  async guardar(contenido: ContenidoSitio): Promise<ContenidoGuardado> {
    const { data, error } = await supabase
      .from('contenido_sitio')
      .update({ datos: contenido as unknown as Json })
      .eq('id', 1)
      .select('datos, actualizado_en')

    if (error) {
      if (SIN_TABLA.has(error.code)) throw new Error(SIN_MIGRACION)
      if (error.code === '23514') throw new Error('El contenido es demasiado grande para guardarse.')
      if (error.code === '42501') throw new Error('Se requiere una cuenta de personal del estudio (es_staff).')
      throw new Error(`No se pudo guardar el contenido: ${error.message}`)
    }
    // Un UPDATE que la RLS filtra responde 200 con la lista vacia.
    if (!data || data.length === 0) {
      throw new Error('La base de datos no aceptó el cambio. Se requiere una cuenta de personal del estudio (es_staff).')
    }
    return { datos: data[0].datos, actualizadoEn: data[0].actualizado_en }
  }

  async subirImagen(destino: DestinoFoto, archivo: File): Promise<string> {
    // Se comprime antes de subir: una foto de camara pesa varios MB y la
    // portada la descarga cada visitante.
    const comprimida = await aBlob(await fileToStorableDataUrl(archivo, { maxDimension: 2000, quality: 0.82 }))
    const extension = comprimida.type === 'image/png' ? 'png' : comprimida.type === 'image/webp' ? 'webp' : 'jpg'
    // Nombre nuevo en cada subida: una URL que no cambia quedaria en la cache
    // del navegador y del CDN mostrando la foto anterior. El sufijo aleatorio
    // cubre dos subidas en el mismo milisegundo (varias fotos de un carrusel):
    // con el mismo nombre, la segunda fallaria o pisaria a la primera.
    const ruta = `${destino}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`

    const { error } = await supabase.storage.from(BUCKET).upload(ruta, comprimida, {
      contentType: comprimida.type,
      cacheControl: '31536000',
    })
    if (error) {
      if (/bucket not found/i.test(error.message)) throw new Error(SIN_MIGRACION)
      if (/row-level security|unauthorized|403/i.test(error.message)) {
        throw new Error('Se requiere una cuenta de personal del estudio (es_staff) para subir fotos.')
      }
      throw new Error(`No se pudo subir la foto: ${error.message}`)
    }
    return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl
  }
}

export const contenidoRepository = new SupabaseContenidoRepository()
