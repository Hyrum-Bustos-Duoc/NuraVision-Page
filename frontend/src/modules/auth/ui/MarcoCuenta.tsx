import type { ReactNode } from 'react'
import { useContenido } from '@/modules/contenido/ui/useContenido'
import { AppImage } from '@/shared/ui/ui'

/**
 * La composicion de las pantallas de cuenta: formulario a la izquierda, foto
 * con el testimonio a la derecha.
 *
 * Existe para que las pantallas de recuperacion se vean exactamente como
 * `Login` sin copiar su maqueta dos veces mas. La foto y el testimonio salen
 * del contenido editable, igual que en `Login`, asi que si el estudio los
 * cambia, cambian en las tres a la vez.
 *
 * `Login` todavia tiene la suya propia: no se toca aqui para no mezclar un
 * refactor de una pantalla que funciona con la funcionalidad nueva.
 */
export function MarcoCuenta({ children }: { children: ReactNode }) {
  const { contenido } = useContenido()

  return (
    <div className="grid min-h-screen bg-ivory md:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-20">{children}</div>

      {/* Fijo al alto de la pantalla, por el mismo motivo que en `Login`: la
          columna del formulario es mas alta y, estirado, el panel recortaba la
          foto y dejaba el testimonio fuera de la vista. */}
      <div className="relative hidden md:sticky md:top-0 md:block md:h-screen">
        <AppImage
          src={contenido.imagenes.login ?? undefined}
          alt=""
          className="h-full w-full"
          imageClassName="object-[50%_70%]"
        />
        <div className="absolute bottom-10 left-10 max-w-xs rounded-xl border border-line-soft bg-paper p-5 shadow-sm">
          <p className="font-serif-display text-xl italic leading-snug text-ink">
            {contenido.login.cita}
          </p>
          <p className="mt-3 text-xs text-muted">{contenido.login.firma}</p>
        </div>
      </div>
    </div>
  )
}
