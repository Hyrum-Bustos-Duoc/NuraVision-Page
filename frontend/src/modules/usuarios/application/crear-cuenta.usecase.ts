import type { CuentasRepository } from '../domain/usuario.repository'
import type { NuevaCuenta } from '../domain/usuario.types'
import { motivoParaNoCrearCuenta } from '../domain/usuario.reglas'

/**
 * Da de alta una cuenta de acceso.
 *
 * No crea la fila de `perfiles`: la crea el trigger `perfil_al_crear_cuenta` de
 * 0010, en la base. Hacerlo tambien aqui abriria la puerta a que las dos
 * versiones discrepasen, y la del trigger es la que cubre TODAS las vias de
 * alta, no solo esta.
 */
export async function crearCuenta(
  repo: CuentasRepository,
  datos: NuevaCuenta,
): Promise<string> {
  const motivo = motivoParaNoCrearCuenta(datos)
  if (motivo !== null) throw new Error(motivo)

  return repo.crear(datos)
}
