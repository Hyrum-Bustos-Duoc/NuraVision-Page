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
      errorAlGuardar={null}
      onBack={() => {}}
      onPagar={onPagar}
      {...props}
    />,
  )
  return { onPagar }
}

async function completarTarjeta(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText('Nombre del titular'), 'Ana Pérez')
  await usuario.type(screen.getByLabelText('Número de tarjeta'), '4242424242424242')
  await usuario.type(screen.getByLabelText('Vencimiento'), '1299')
  await usuario.type(screen.getByLabelText('CVV'), '123')
}

describe('PasoAbono', () => {
  afterEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('muestra abono, saldo, aviso de demostracion y politica', () => {
    pintar()
    expect(screen.getByText('Abono hoy').nextSibling).toHaveTextContent('$5.000')
    expect(screen.getByText('Saldo a pagar en el estudio').nextSibling).toHaveTextContent(
      '$13.000',
    )
    expect(screen.getByRole('note')).toHaveTextContent('no se realiza ningún cobro')
    expect(screen.getByText(/El abono se descuenta del total/)).toHaveTextContent(
      'con menos de 24 horas, no es reembolsable.',
    )
  })

  it('con la tarjeta vacia no paga, marca los errores y enfoca el primero', async () => {
    const usuario = userEvent.setup()
    const { onPagar } = pintar()
    await usuario.click(screen.getByRole('button', { name: 'Pagar abono y reservar' }))

    expect(onPagar).not.toHaveBeenCalled()
    const titular = screen.getByLabelText('Nombre del titular')
    expect(titular).toHaveFocus()
    expect(titular).toHaveAttribute('aria-invalid', 'true')
    expect(titular).toHaveAccessibleDescription('Escribe el nombre como aparece en la tarjeta.')
  })

  it('formatea el numero y paga una vez con datos validos', async () => {
    const usuario = userEvent.setup()
    const { onPagar } = pintar()
    await completarTarjeta(usuario)

    expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('4242 4242 4242 4242')
    expect(screen.getByLabelText('Vencimiento')).toHaveValue('12/99')

    await usuario.click(screen.getByRole('button', { name: 'Pagar abono y reservar' }))
    expect(onPagar).toHaveBeenCalledTimes(1)
  })

  it('no deja la tarjeta en el almacenamiento del navegador', async () => {
    const usuario = userEvent.setup()
    pintar()
    await completarTarjeta(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Pagar abono y reservar' }))

    const guardado = [window.localStorage, window.sessionStorage].flatMap((almacen) =>
      Array.from({ length: almacen.length }, (_, i) => {
        const clave = almacen.key(i) ?? ''
        return `${clave}=${almacen.getItem(clave) ?? ''}`
      }),
    )
    expect(guardado.join('\n')).not.toContain('4242')
  })

  it('valida el campo al salir de el, no antes', async () => {
    const usuario = userEvent.setup()
    pintar()
    const numero = screen.getByLabelText('Número de tarjeta')
    await usuario.type(numero, '4242')
    expect(numero).not.toHaveAttribute('aria-invalid')
    await usuario.tab()
    expect(numero).toHaveAttribute('aria-invalid', 'true')
  })

  it('si la reserva falla, avisa que no hubo cobro y conserva la tarjeta', async () => {
    const usuario = userEvent.setup()
    const { onPagar } = pintar({ errorAlGuardar: 'Ese bloque ya está tomado.' })
    await completarTarjeta(usuario)

    expect(screen.getByRole('alert')).toHaveTextContent('Ese bloque ya está tomado.')
    expect(screen.getByRole('alert')).toHaveTextContent('No se realizó ningún cobro.')

    await usuario.click(screen.getByRole('button', { name: 'Pagar abono y reservar' }))
    expect(onPagar).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('4242 4242 4242 4242')
  })

  it('deshabilita el boton mientras se guarda', () => {
    pintar({ guardando: true })
    expect(screen.getByRole('button', { name: 'Reservando…' })).toBeDisabled()
  })
})
