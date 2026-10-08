import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectorFecha } from './SelectorFecha'

function Envoltorio({ inicial = null }: { inicial?: string | null }) {
  const [valor, setValor] = useState<string | null>(inicial)
  return (
    <>
      <SelectorFecha
        etiqueta="Cumpleaños"
        valor={valor}
        onCambio={setValor}
        minimo="1920-01-01"
        maximo="2026-10-08"
        sugerida="1996-10-08"
      />
      <output data-testid="valor">{valor ?? 'vacio'}</output>
    </>
  )
}

describe('SelectorFecha', () => {
  it('sin valor abre en los años y llega a un dia en tres pasos', async () => {
    const user = userEvent.setup()
    render(<Envoltorio />)

    await user.click(screen.getByRole('button', { name: 'Cumpleaños Elige una fecha' }))
    expect(screen.getByRole('dialog', { name: 'Cumpleaños' })).toBeInTheDocument()
    // El año sugerido queda enfocado.
    expect(screen.getByRole('button', { name: '1996' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '1990' }))
    await user.click(screen.getByRole('button', { name: 'Marzo 1990' }))
    await user.click(screen.getByRole('button', { name: 'domingo 4 de marzo de 1990' }))

    expect(screen.getByTestId('valor')).toHaveTextContent('1990-03-04')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // El nombre accesible incluye la fecha, no solo la etiqueta.
    expect(screen.getByRole('button', { name: 'Cumpleaños 4 de marzo, 1990' })).toHaveFocus()
  })

  it('las flechas mueven el dia, Enter elige y no deja pasar de hoy', async () => {
    const user = userEvent.setup()
    render(<Envoltorio inicial="2026-10-06" />)

    await user.click(screen.getByRole('button', { name: /Cumpleaños/ }))
    expect(screen.getByRole('grid', { name: 'Octubre 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'martes 6 de octubre de 2026' })).toHaveFocus()

    // Tres a la derecha seria el 9, que es futuro: se queda en hoy.
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('button', { name: 'jueves 8 de octubre de 2026' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'viernes 9 de octubre de 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()

    await user.keyboard('{ArrowUp}{Enter}')
    expect(screen.getByTestId('valor')).toHaveTextContent('2026-10-01')
  })

  it('PageUp cambia de mes y conserva el foco en la grilla', async () => {
    const user = userEvent.setup()
    render(<Envoltorio inicial="2026-03-31" />)

    await user.click(screen.getByRole('button', { name: /Cumpleaños/ }))
    await user.keyboard('{PageUp}')
    expect(screen.getByRole('grid', { name: 'Febrero 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'sábado 28 de febrero de 2026' })).toHaveFocus()
  })

  it('Escape devuelve el foco al campo; el clic fuera cierra sin forzarlo', async () => {
    const user = userEvent.setup()
    render(<Envoltorio inicial="1990-03-04" />)
    const campo = screen.getByRole('button', { name: /Cumpleaños/ })

    await user.click(campo)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(campo).toHaveFocus()

    await user.click(campo)
    await user.click(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(campo).not.toHaveFocus()
    expect(screen.getByTestId('valor')).toHaveTextContent('1990-03-04')
  })

  it('el boton de borrar deja el campo vacio', async () => {
    const user = userEvent.setup()
    render(<Envoltorio inicial="1990-03-04" />)

    await user.click(screen.getByRole('button', { name: 'Borrar la fecha' }))
    expect(screen.getByTestId('valor')).toHaveTextContent('vacio')
    expect(screen.getByRole('button', { name: 'Cumpleaños Elige una fecha' })).toHaveFocus()
  })

  it('el foco real de una celda pasa a ser el punto de partida de las flechas', async () => {
    const user = userEvent.setup()
    render(<Envoltorio inicial="1990-03-04" />)

    await user.click(screen.getByRole('button', { name: /Cumpleaños/ }))
    // Como haria el cursor virtual de un lector de pantalla.
    screen.getByRole('button', { name: 'jueves 15 de marzo de 1990' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'viernes 16 de marzo de 1990' })).toHaveFocus()
  })
})
