// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasoAbono } from './PasoAbono'

function pintar(props: Partial<Parameters<typeof PasoAbono>[0]> = {}) {
  const onPagar = vi.fn()
  render(
    <PasoAbono
      servicioNombre="Manicura Completa"
      profesionalNombre="Camila Reyes"
      dateISO="2026-10-20"
      time="10:00"
      precio={18000}
      abono={5000}
      guardando={false}
      abriendoPago={false}
      errorAlGuardar={null}
      errorDePago={null}
      onBack={() => {}}
      onPagar={onPagar}
      {...props}
    />,
  )
  return { onPagar }
}

describe('PasoAbono', () => {
  it('muestra total, abono hoy con Webpay, saldo en el local y politica', () => {
    pintar()
    expect(screen.getByText('Total del servicio').nextSibling).toHaveTextContent('$18.000')
    expect(screen.getByText('Abono hoy con Webpay').nextSibling).toHaveTextContent('$5.000')
    expect(screen.getByText('Saldo a pagar en el local').nextSibling).toHaveTextContent(
      '$13.000',
    )
    expect(screen.getByText(/El abono se descuenta del total/)).toHaveTextContent(
      'con menos de 24 horas, no es reembolsable.',
    )
  })

  // Con abono el pago es obligatorio: no hay forma de reservar sin Webpay.
  it('no ofrece pagar en el estudio ni pide datos de tarjeta', () => {
    pintar()
    expect(screen.queryByText(/pagar en el estudio/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('el boton lleva a pagar con Webpay', async () => {
    const usuario = userEvent.setup()
    const { onPagar } = pintar()
    await usuario.click(screen.getByRole('button', { name: 'Pagar abono con Webpay' }))
    expect(onPagar).toHaveBeenCalledTimes(1)
  })

  it('si la reserva falla, avisa que no hubo cobro y permite reintentar', async () => {
    const usuario = userEvent.setup()
    const { onPagar } = pintar({
      errorAlGuardar: 'La opción elegida ya no existe en el servicio.',
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La opción elegida ya no existe en el servicio.',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No se realizó ningún cobro.')

    await usuario.click(screen.getByRole('button', { name: 'Pagar abono con Webpay' }))
    expect(onPagar).toHaveBeenCalledTimes(1)
  })

  it('si Webpay no abre, dice que la hora quedo registrada y ofrece reintentar el pago', async () => {
    const usuario = userEvent.setup()
    const { onPagar } = pintar({ errorDePago: 'La pasarela no respondió.' })
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('La pasarela no respondió.')
    expect(alerta).toHaveTextContent('Tu hora quedó registrada')
    expect(alerta).not.toHaveTextContent('No se realizó ningún cobro.')

    await usuario.click(screen.getByRole('button', { name: 'Reintentar el pago del abono' }))
    expect(onPagar).toHaveBeenCalledTimes(1)
  })

  it('deshabilita el boton mientras se guarda la reserva', () => {
    pintar({ guardando: true })
    expect(screen.getByRole('button', { name: 'Reservando…' })).toBeDisabled()
  })

  it('deshabilita el boton mientras se abre Webpay', () => {
    pintar({ abriendoPago: true })
    expect(screen.getByRole('button', { name: 'Redirigiendo a Webpay…' })).toBeDisabled()
  })
})
