import { Fragment } from 'react'
import { fragmentosConEnfasis } from '../application'

/**
 * Pinta un texto editable con su palabra destacada (*asi*) y sus saltos de
 * linea. El estilo del enfasis lo decide quien lo usa: en fondo claro es el
 * acento, en la banda oscura el acento medio.
 */
export function TextoConEnfasis({ texto, claseEnfasis }: { texto: string; claseEnfasis: string }) {
  return (
    <>
      {fragmentosConEnfasis(texto).map((f, i) => (
        <Fragment key={i}>
          {f.salto && <br />}
          {f.enfasis ? <em className={claseEnfasis}>{f.texto}</em> : f.texto}
        </Fragment>
      ))}
    </>
  )
}
