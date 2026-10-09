import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { boton, tamanoBoton } from '@/shared/ui/nv-estilos'

/**
 * Atrapa los errores de render de lo que envuelve.
 *
 * ----------------------------------------------------------------------------
 * POR QUE EXISTE
 * ----------------------------------------------------------------------------
 * Cuando un componente lanza durante el render, React DESMONTA TODO EL ARBOL.
 * El resultado no es un mensaje de error: es una pagina completamente en blanco,
 * sin cabecera ni forma de salir, y el unico rastro queda en la consola del
 * navegador.
 *
 * Eso es malo en cualquier pantalla y es inaceptable en la de un pago: quien
 * acaba de entregar los datos de su tarjeta y ve una pagina vacia no sabe si le
 * cobraron, y lo razonable que hara es pagar otra vez.
 *
 * Es una clase porque no existe equivalente con hooks: `componentDidCatch` y
 * `getDerivedStateFromError` solo estan disponibles en componentes de clase.
 */

interface Props {
  children: ReactNode
  /** Que se dice cuando algo falla. Cambia segun lo que envuelva. */
  titulo?: string
  mensaje?: string
}

interface Estado {
  fallo: Error | null
}

export class ErrorBoundary extends Component<Props, Estado> {
  state: Estado = { fallo: null }

  static getDerivedStateFromError(error: Error): Estado {
    return { fallo: error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Al registro del navegador, que es donde se puede diagnosticar. El texto
    // del error NO se muestra en pantalla: puede contener detalles internos y no
    // le dice nada util a quien esta comprando.
    console.error('Error de render atrapado:', error, info.componentStack)
  }

  render() {
    if (this.state.fallo === null) return this.props.children

    return (
      <div className="mx-auto w-full max-w-[560px] px-4 py-20 text-center sm:py-24">
        <h1 className="font-serif text-3xl font-light text-nv-ink">
          {this.props.titulo ?? 'Algo se rompió en esta pantalla'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-nv-muted1">
          {this.props.mensaje ??
            'No pudimos mostrar esta página. Lo que hayas hecho antes no se perdió.'}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {/* Recargar es lo primero que resuelve un fallo transitorio, y la
              pantalla de pago es idempotente: volver a entrar con el mismo token
              devuelve el comprobante, no un segundo cobro. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={`${boton.primario} ${tamanoBoton.medio}`}
          >
            Volver a intentar
          </button>
          <Link to="/" className={`${boton.secundario} ${tamanoBoton.medio} inline-block`}>
            Ir al inicio
          </Link>
        </div>
      </div>
    )
  }
}
