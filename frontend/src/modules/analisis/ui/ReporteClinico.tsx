import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { rotuloUna, type ResultadoAnalisis } from '../domain/analisis.types'
import {
  avisoClinicoDe,
  clinicoDe,
  mensajeMotivoClinico,
  resumenClinico,
  type ResumenMano,
} from '../domain/clinico'

/**
 * Reporte clinico orientativo tras un solo boton para toda la seccion (no uno por
 * una). El bloque se monta solo al expandir: antes del click ningun nombre de
 * senal, texto ni aviso existe en el DOM, no solo oculto por CSS.
 *
 * Nunca pinta confianzas: el numero es lo que se lee como diagnostico. El estado de
 * abierto/cerrado vive solo aqui y en memoria; nada se persiste en el navegador.
 */
export function ReporteClinico({ resultado }: { resultado: ResultadoAnalisis }) {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  const panel = `${id}-reporte-clinico`
  const { unas } = resultado
  const variasManos = resultado.manos > 1

  if (unas.length === 0) return null
  const resumen = resumenClinico(unas)

  return (
    <div className="mt-6 rounded-2xl border border-line-soft bg-paper">
      <h3>
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={panel}
          onClick={() => setAbierto((a) => !a)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left text-sm font-medium text-ink transition-colors hover:bg-ivory focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-600"
        >
          Ver reporte clínico
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-muted transition-transform ${abierto ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>

      {abierto && (
        <div id={panel} className="space-y-4 border-t border-line-soft px-5 py-4" data-testid="reporte-clinico">
          {!resumen.disponible ? (
            <p className="text-sm text-ink">El reporte clínico aún no está disponible.</p>
          ) : (
            <>
              <p className="rounded-xl bg-ivory px-4 py-3 text-xs text-ink" role="note">
                {avisoClinicoDe(resultado.aviso_clinico)}
              </p>

              <div className="space-y-1 text-sm text-ink" data-testid="resumen-clinico">
                {resumen.manos.map((m) => (
                  <p key={m.mano ?? 'sin-mano'}>
                    {variasManos && <span className="font-medium">Mano {m.mano}: </span>}
                    {fraseResumen(m)}
                  </p>
                ))}
              </div>

              <ul className="space-y-3">
                {unas.map((u) => {
                  const c = clinicoDe(u)
                  const rotulo = rotuloUna(u, variasManos)
                  return (
                    <li
                      key={`${u.mano}-${u.dedo}`}
                      className="rounded-xl border border-line-soft px-4 py-3"
                      data-testid="clinico-una"
                    >
                      {/* Sin dedo (primer_plano) no hay rotulo: mejor nada que una etiqueta vacia. */}
                      {rotulo && <p className="mb-1 text-xs uppercase tracking-wide text-muted">{rotulo}</p>}
                      {c.estado === 'ok' ? (
                        <div className="space-y-2 text-sm text-ink">
                          <p className="font-serif text-[20px] font-light">{c.reporte.nombre}</p>
                          <p>{c.reporte.descripcion}</p>
                          {c.reporte.asociaciones.length > 0 && (
                            <div>
                              <p className="text-xs text-muted">Se ha asociado a</p>
                              <ul className="list-disc pl-5">
                                {c.reporte.asociaciones.map((a, k) => (
                                  <li key={`${k}-${a}`}>{a}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <p className="font-medium">{c.reporte.recomendacion}</p>
                          {/* En sin_senales no hay alternativas: sugerir "podria ser una
                              linea oscura" justo despues de "no vemos senales" confunde. */}
                          {c.clase !== 'sin_senales' && c.alternativas.length > 0 && (
                            <p className="text-xs text-muted">
                              Otras señales parecidas: {c.alternativas.map((a) => a.nombre).join(' y ')}.
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-ink">{mensajeMotivoClinico(c.motivo)}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function fraseResumen({ total, conSenal, sinSenales, noConcluyentes }: ResumenMano): string {
  const unas = total === 1 ? '1 uña' : `${total} uñas`
  const senal = `${conSenal} ${conSenal === 1 ? 'muestra' : 'muestran'} una señal para consultar`
  const sin = `${sinSenales} no ${sinSenales === 1 ? 'muestra' : 'muestran'} señales reconocidas`
  const nc = `${noConcluyentes} no ${noConcluyentes === 1 ? 'fue concluyente' : 'fueron concluyentes'}`
  return `De ${unas}, ${senal}, ${sin} y ${nc}.`
}
