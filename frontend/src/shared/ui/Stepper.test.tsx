import { render, screen } from '@testing-library/react'
import { Stepper } from './Stepper'

const PASOS = ['Servicio', 'Opción', 'Profesional', 'Fecha', 'Hora', 'Confirmación', 'Abono']

/**
 * jsdom no tiene layout ni ResizeObserver: se simula uno que mide al observar,
 * con la fila natural de 900 px y el contenedor del ancho que se pida.
 */
function simularAncho(contenedor: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(contenedor)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      avisar: () => void
      constructor(avisar: () => void) {
        this.avisar = avisar
      }
      observe() {
        this.avisar()
      }
      disconnect() {}
    },
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Stepper', () => {
  it('sin poder medir usa la linea compacta, que nunca desborda', () => {
    render(<Stepper currentIndex={6} labels={PASOS} />)
    expect(screen.getByText(/Paso 7 de 7/)).toHaveTextContent('Paso 7 de 7 · Abono')
  })

  it('compacta cuando la fila no cabe en el contenedor', () => {
    simularAncho(768)
    render(<Stepper currentIndex={6} labels={PASOS} />)
    expect(screen.getByText(/Paso 7 de 7/)).toBeInTheDocument()
    // Un solo paso actual: la copia de medida no lo marca.
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1)
  })

  it('muestra la fila completa cuando cabe y marca el paso actual', () => {
    simularAncho(1000)
    render(<Stepper currentIndex={3} labels={PASOS} />)
    expect(screen.queryByText(/Paso 4 de 7/)).toBeNull()
    const actuales = document.querySelectorAll('[aria-current="step"]')
    expect(actuales).toHaveLength(1)
    expect(actuales[0]).toHaveTextContent('Fecha')
  })
})
