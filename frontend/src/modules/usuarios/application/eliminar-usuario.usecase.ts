import type { CuentasRepository, UsuarioRepository } from '../domain/usuario.repository'

/**
 * Elimina a alguien del sistema, cuenta de acceso incluida.
 *
 * El orden importa. Primero la cuenta y despues el perfil, porque:
 *
 *   · Si fallara el borrado de la cuenta, el perfil sigue ahi y la lista del
 *     panel lo sigue mostrando. El estado es consistente y se puede reintentar.
 *   · Al reves, un fallo dejaria una cuenta capaz de iniciar sesion y sin
 *     perfil: invisible en el panel y con acceso. Ese es el mal fallo.
 *
 * El borrado del perfil puede no hacer nada si `perfiles.id` tiene clave foranea
 * a `auth.users` con borrado en cascada, porque ya habra caido solo. No se
 * trata como error por eso mismo.
 */
export async function eliminarUsuario(
  cuentas: CuentasRepository,
  perfiles: UsuarioRepository,
  userId: string,
): Promise<void> {
  await cuentas.eliminar(userId)

  try {
    await perfiles.eliminarPerfil(userId)
  } catch {
    // La cuenta ya no existe, que era el objetivo. Si el perfil sigue en pie es
    // un residuo sin acceso, no un problema de seguridad, y la siguiente carga
    // de la lista lo delata.
  }
}
