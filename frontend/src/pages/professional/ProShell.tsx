import { DashboardShell, type NavItem } from '@/shared/components/DashboardChrome'
import { useMiFichaProfesional } from '@/modules/profesionales/ui/useMiFichaProfesional'
import { initialsFromName } from '@/shared/lib/format'

/**
 * Contenedor del panel de profesional.
 *
 * Existe para una sola cosa: que la tarjeta del pie del panel lateral diga de
 * quien es la agenda que se esta mirando. Antes salia «Camila Reyes» con su
 * «Nail artist» debajo, que son datos de ejemplo cableados en `AppState`: los
 * veia Berenice, los veia Nicol y los veia cualquiera que entrara por los
 * atajos del prototipo, mientras el resto del panel ya mostraba la ficha
 * correcta. La cabecera y el contenido se contradecian.
 *
 * Va aqui y no dentro de `DashboardShell` porque ese componente lo comparten
 * los dos paneles: resolver una ficha de profesional ahi obligaria al panel de
 * administracion a pedir datos que no necesita.
 *
 * La resolucion de la ficha es la misma que usan las paginas de dentro
 * (`useMiFichaProfesional`), asi que las dos no pueden discrepar.
 */
export function ProShell({
  sectionLabel,
  userSubtitle,
  navItems,
}: {
  sectionLabel: string
  userSubtitle: string
  navItems: NavItem[]
}) {
  const { profesional } = useMiFichaProfesional()

  return (
    <DashboardShell
      sectionLabel={sectionLabel}
      userSubtitle={userSubtitle}
      navItems={navItems}
      // Se sincroniza con cualquier ficha activa, tanto la declarada en
      // `app_metadata` como la elegida a mano en el navegador. En el segundo
      // caso podria parecer que la tarjeta afirma algo que no es —«soy
      // Berenice»—, pero el aviso de `FichaActiva` que hay sobre el contenido
      // ya dice que es una eleccion local; lo incoherente seria que el panel
      // mostrara una ficha y la cabecera otra.
      //
      // La subtitula su especialidad real en vez del «Nail artist» fijo, que
      // solo era cierto para dos de las ocho.
      identity={
        profesional
          ? {
              name: profesional.nombre,
              initials: initialsFromName(profesional.nombre),
              subtitle: profesional.especialidad,
            }
          : undefined
      }
    />
  )
}
