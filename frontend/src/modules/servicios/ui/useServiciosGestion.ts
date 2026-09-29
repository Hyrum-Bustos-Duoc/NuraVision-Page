import { useCallback, useEffect, useState } from 'react'
import {
  actualizarServicio,
  contarProfesionalesPorServicio,
  crearServicio,
  eliminarServicio,
  listarTodosLosServicios,
  type DatosServicio,
  type Servicio,
} from '../application'
import { servicioRepository } from '../infrastructure/supabase-servicio.repository'

interface EstadoServiciosGestion {
  /** Catalogo completo: activos e inactivos. */
  servicios: Servicio[]
  cargando: boolean
  error: string | null
  guardando: boolean
  /**
   * Cuantos profesionales realizan cada servicio, por id.
   *
   * El panel avisa de los que nadie ofrece: aparecen en el catalogo y no se
   * pueden reservar porque no hay con quien.
   */
  profesionalesPorServicio: Record<string, number>
  /** Devuelven el motivo del fallo, o `null` si salio bien. */
  crear: (datos: DatosServicio) => Promise<string | null>
  actualizar: (id: string, datos: DatosServicio) => Promise<string | null>
  eliminar: (id: string) => Promise<string | null>
  recargar: () => void
}

/**
 * Catalogo de servicios para el panel de administracion.
 *
 * Lista TODOS, no solo los activos: quien gestiona el catalogo tiene que poder
 * ver un servicio dado de baja para reactivarlo, y filtrarlo aqui lo volveria
 * inalcanzable desde la unica pantalla que puede tocarlo.
 *
 * Las mutaciones devuelven el motivo del fallo en vez de lanzarlo: la pantalla
 * tiene que decidir si cierra el modal y que dice el toast, y un `try/catch` en
 * cada sitio de llamada solo añadiria ruido.
 */
export function useServiciosGestion(): EstadoServiciosGestion {
  const [intento, setIntento] = useState(0)
  const [resuelto, setResuelto] = useState<{
    intento: number
    servicios: Servicio[]
    cuenta: Record<string, number>
    error: string | null
  }>({ intento: -1, servicios: [], cuenta: {}, error: null })

  useEffect(() => {
    let cancelado = false

    // Las dos consultas van en paralelo: son independientes y en serie
    // duplicarian la espera de la primera pintada.
    Promise.all([
      listarTodosLosServicios(servicioRepository),
      contarProfesionalesPorServicio(servicioRepository),
    ])
      .then(([servicios, cuenta]) => {
        if (!cancelado) setResuelto({ intento, servicios, cuenta, error: null })
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setResuelto({
          intento,
          servicios: [],
          cuenta: {},
          error: e instanceof Error ? e.message : 'No se pudieron cargar los servicios.',
        })
      })

    return () => {
      cancelado = true
    }
  }, [intento])

  const recargar = useCallback(() => setIntento((n) => n + 1), [])

  const [guardando, setGuardando] = useState(false)

  const crear = useCallback(async (datos: DatosServicio): Promise<string | null> => {
    setGuardando(true)
    try {
      const creado = await crearServicio(servicioRepository, datos)
      // Se inserta la fila devuelta por la base y se reordena por nombre, que es
      // el orden de la consulta. Recargar entero costaria una peticion de mas y
      // haria parpadear la tabla.
      setResuelto((previo) => ({
        ...previo,
        servicios: [...previo.servicios, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      }))
      return null
    } catch (e: unknown) {
      return e instanceof Error ? e.message : 'No se pudo crear el servicio.'
    } finally {
      setGuardando(false)
    }
  }, [])

  const actualizar = useCallback(
    async (id: string, datos: DatosServicio): Promise<string | null> => {
      setGuardando(true)
      try {
        const guardado = await actualizarServicio(servicioRepository, id, datos)
        setResuelto((previo) => ({
          ...previo,
          servicios: previo.servicios
            .map((s) => (s.id === guardado.id ? guardado : s))
            .sort((a, b) => a.nombre.localeCompare(b.nombre)),
        }))
        return null
      } catch (e: unknown) {
        return e instanceof Error ? e.message : 'No se pudo guardar el servicio.'
      } finally {
        setGuardando(false)
      }
    },
    [],
  )

  const eliminar = useCallback(async (id: string): Promise<string | null> => {
    setGuardando(true)
    try {
      await eliminarServicio(servicioRepository, id)
      setResuelto((previo) => ({
        ...previo,
        servicios: previo.servicios.filter((s) => s.id !== id),
      }))
      return null
    } catch (e: unknown) {
      return e instanceof Error ? e.message : 'No se pudo eliminar el servicio.'
    } finally {
      setGuardando(false)
    }
  }, [])

  const alDia = resuelto.intento === intento

  return {
    servicios: alDia ? resuelto.servicios : [],
    profesionalesPorServicio: alDia ? resuelto.cuenta : {},
    cargando: !alDia,
    error: alDia ? resuelto.error : null,
    guardando,
    crear,
    actualizar,
    eliminar,
    recargar,
  }
}
