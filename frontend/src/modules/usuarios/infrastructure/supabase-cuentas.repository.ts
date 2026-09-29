import { supabase } from '@/shared/infrastructure/supabase/client'
import type { CuentasRepository } from '../domain/usuario.repository'
import type { NuevaCuenta } from '../domain/usuario.types'

/**
 * Crear y eliminar cuentas, via la Edge Function `admin-cuentas`.
 *
 * No hay forma de hacerlo desde el navegador: las dos operaciones exigen la
 * service_role key, que salta todas las politicas de RLS y por eso no puede
 * viajar en el bundle. La funcion la guarda como secreto del proyecto y
 * comprueba `es_staff` antes de actuar.
 *
 * Ver `supabase/functions/admin-cuentas/index.ts`, que ademas explica el
 * despliegue.
 */
const FUNCION = 'admin-cuentas'

/**
 * Traduce el fallo de `functions.invoke` a algo que se pueda leer en pantalla.
 *
 * El caso que importa es el primero: mientras la funcion no este desplegada, la
 * respuesta es un 404 y el mensaje de la libreria no dice nada util. Alguien
 * podria pasar una tarde revisando permisos por un problema de despliegue.
 */
async function motivo(error: unknown, respuesta: unknown): Promise<string> {
  // La funcion devuelve { error: "..." } en todos sus fallos controlados.
  if (respuesta !== null && typeof respuesta === 'object' && 'error' in respuesta) {
    const dentro = (respuesta as { error: unknown }).error
    if (typeof dentro === 'string' && dentro !== '') return dentro
  }

  const texto = error instanceof Error ? error.message : String(error)

  if (/not found|404/i.test(texto)) {
    return (
      'La función admin-cuentas no está desplegada en Supabase. ' +
      'Ejecuta «supabase functions deploy admin-cuentas» para habilitar la ' +
      'creación y eliminación de cuentas.'
    )
  }
  return texto === '' ? 'No se pudo completar la operación.' : texto
}

class EdgeCuentasRepository implements CuentasRepository {
  async crear(datos: NuevaCuenta): Promise<string> {
    const { data, error } = await supabase.functions.invoke<{ userId: string | null }>(FUNCION, {
      body: {
        accion: 'crear',
        email: datos.email,
        password: datos.password,
        nombre: datos.nombre,
        telefono: datos.telefono,
        rol: datos.rol,
        // El id viaja como numero porque es lo que espera `app_metadata` y lo
        // que compara la politica de 0007 tras el cast.
        profesionalId: datos.profesionalId ? Number(datos.profesionalId) : undefined,
      },
    })

    if (error) throw new Error(await motivo(error, data))
    if (!data?.userId) throw new Error('La cuenta no se creó: el servidor no devolvió su id.')

    return data.userId
  }

  async eliminar(userId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke(FUNCION, {
      body: { accion: 'eliminar', userId },
    })

    if (error) throw new Error(await motivo(error, data))
  }
}

export const cuentasRepository: CuentasRepository = new EdgeCuentasRepository()
