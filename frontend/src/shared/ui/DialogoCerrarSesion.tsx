import { ConfirmDialog } from './Modal'

/**
 * Confirmacion antes de cerrar sesion. La comparten el sitio y los paneles:
 * el boton queda cerca de otros enlaces y un toque accidental sacaba a la
 * persona de su cuenta sin aviso.
 */
export function DialogoCerrarSesion({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="¿Cerrar sesión?"
      description="Tendrás que volver a ingresar con tu correo y contraseña para ver tus reservas y tus pedidos."
      confirmLabel="Cerrar sesión"
      tone="default"
    />
  )
}
