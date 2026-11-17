// @vitest-environment jsdom
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResultadoAnalisis } from '@/modules/analisis/domain/analisis.types'
import AIAnalysis from './AIAnalysis'

vi.mock('@/shared/state/AppState', () => ({
  useAppState: () => ({
    siteContent: { aiFocusOptions: [{ id: 'f1', label: 'Forma', tips: [], recommendedServiceIds: [] }] },
    activeServices: [],
  }),
}))
vi.mock('@/modules/tienda/ui/useCatalogo', () => ({ useCatalogo: () => ({ porSlug: () => undefined }) }))
vi.mock('@/modules/contenido/ui/useContenido', () => ({ useContenido: () => ({ contenido: { analisis: {} } }) }))
vi.mock('@/modules/tienda/ui/ProductGrid', () => ({ ProductGrid: () => null }))
vi.mock('@/modules/analisis/ui/ResultadoUnas', () => ({ ResultadoUnas: () => <p>resultado-viejo</p> }))

// La peticion se controla a mano: cada test decide cuando (y si) responde.
const api = vi.hoisted(() => ({
  analizarFoto: vi.fn<(foto: File, senal?: AbortSignal) => Promise<unknown>>(),
}))
vi.mock('@/modules/analisis/infrastructure/analisis.api', async (original) => ({
  ...(await original<typeof import('@/modules/analisis/infrastructure/analisis.api')>()),
  analizarFoto: api.analizarFoto,
}))

function pagina() {
  render(
    <MemoryRouter>
      <AIAnalysis />
    </MemoryRouter>,
  )
}

async function irASubir() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  return user
}

const foto = (nombre = 'mano.png', type = 'image/png') => new File(['x'], nombre, { type })
const zona = () => screen.getByText(/máx. 10 MB/).closest('label')!
const soltar = (files: File[]) => fireEvent.drop(zona(), { dataTransfer: { files } })
const vistaPrevia = () => screen.queryByAltText('Vista previa de tu fotografía')
const botonAnalizar = () => screen.getByRole('button', { name: /Analiz/ })
const inputFoto = () => zona().querySelector('input[type="file"]') as HTMLInputElement

const resultadoOk = { estado: 'ok' } as unknown as ResultadoAnalisis

/** Peticion que no responde hasta que el test la resuelve; ignora el abort a proposito. */
function peticionPendiente() {
  let resolver!: (r: ResultadoAnalisis) => void
  let senal: AbortSignal | undefined
  api.analizarFoto.mockImplementationOnce((_f, s) => {
    senal = s
    return new Promise((r) => (resolver = r))
  })
  return { responder: (r: ResultadoAnalisis) => resolver(r), senal: () => senal }
}

/** Vacia la cola de microtareas para que la respuesta resuelta llegue al componente. */
const dejarLlegarRespuestas = () => act(() => new Promise((r) => setTimeout(r, 0)))

let contadorUrl = 0
beforeEach(() => {
  contadorUrl = 0
  URL.createObjectURL = vi.fn(() => `blob:prueba-${++contadorUrl}`)
  URL.revokeObjectURL = vi.fn()
  api.analizarFoto.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('AIAnalysis: arrastrar y quitar foto', () => {
  it('al soltar una imagen la muestra, habilita Analizar y permite quitarla', async () => {
    pagina()
    const user = await irASubir()
    expect(botonAnalizar()).toBeDisabled()
    soltar([foto()])
    expect(vistaPrevia()).toBeTruthy()
    expect(botonAnalizar()).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /Quitar foto/ }))
    expect(vistaPrevia()).toBeNull()
    expect(screen.getByText(/Arrastra tu foto/)).toBeTruthy()
  })

  it('rechaza un archivo que no es imagen y no deja foto elegida', async () => {
    pagina()
    await irASubir()
    soltar([new File(['x'], 'a.pdf', { type: 'application/pdf' })])
    expect(vistaPrevia()).toBeNull()
    expect(screen.getByText(/no es una imagen/)).toBeTruthy()
    expect(botonAnalizar()).toBeDisabled()
  })

  it('un no-imagen sobre una foto ya elegida la descarta y libera su URL', async () => {
    pagina()
    await irASubir()
    soltar([foto()])
    soltar([new File(['x'], 'notas.txt', { type: 'text/plain' })])
    expect(vistaPrevia()).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prueba-1')
    expect(botonAnalizar()).toBeDisabled()
  })

  it('soltar una imagen valida despues del error lo limpia', async () => {
    pagina()
    await irASubir()
    soltar([new File(['x'], 'a.pdf', { type: 'application/pdf' })])
    soltar([foto()])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(vistaPrevia()).toBeTruthy()
  })

  it('Quitar foto revoca la URL de objeto, deshabilita Analizar y vacia el input', async () => {
    pagina()
    const user = await irASubir()
    await user.upload(inputFoto(), foto())
    expect(vistaPrevia()).toHaveAttribute('src', 'blob:prueba-1')
    expect(inputFoto().files).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /Quitar foto/ }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prueba-1')
    expect(botonAnalizar()).toBeDisabled()
    expect(inputFoto().value).toBe('')
    expect(inputFoto().files).toHaveLength(0)
  })

  it('soltar otra imagen libera la URL de la anterior', async () => {
    pagina()
    await irASubir()
    soltar([foto('a.png')])
    soltar([foto('b.png')])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prueba-1')
    expect(vistaPrevia()).toHaveAttribute('src', 'blob:prueba-2')
  })

  it('con varios archivos usa solo el primero', async () => {
    pagina()
    await irASubir()
    soltar([foto('primera.png'), foto('segunda.png')])
    expect(screen.getByText('primera.png')).toBeTruthy()
    expect(screen.queryByText('segunda.png')).toBeNull()
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('soltar sin archivos (texto o lista vacia) no rompe ni toca la foto elegida', async () => {
    pagina()
    await irASubir()
    soltar([foto()])
    soltar([])
    fireEvent.drop(zona(), { dataTransfer: { files: [], types: ['text/plain'] } })
    expect(vistaPrevia()).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('el resaltado se enciende al arrastrar y se apaga al salir o al soltar', async () => {
    pagina()
    await irASubir()
    fireEvent.dragOver(zona())
    expect(zona().className).toContain('bg-olive-50/50')
    fireEvent.dragLeave(zona())
    expect(zona().className).not.toContain('bg-olive-50/50')
    fireEvent.dragOver(zona())
    soltar([])
    expect(zona().className).not.toContain('bg-olive-50/50')
  })
})

describe('AIAnalysis: cambiar de foto durante un analisis', () => {
  // Control: sin cambiar de foto la respuesta SI llega. Sin este caso, los de
  // abajo pasarian igual si la espera fuera demasiado corta.
  it('control: sin tocar la foto, la respuesta lleva al resultado', async () => {
    pagina()
    const user = await irASubir()
    soltar([foto()])
    const p = peticionPendiente()
    await user.click(botonAnalizar())
    p.responder(resultadoOk)
    await dejarLlegarRespuestas()
    expect(screen.getByText('resultado-viejo')).toBeTruthy()
  })

  it('Quitar foto aborta la peticion y la respuesta tardia no deja resultado', async () => {
    pagina()
    const user = await irASubir()
    soltar([foto()])
    const p = peticionPendiente()
    await user.click(botonAnalizar())
    expect(screen.getByText('Analizando tu fotografía…')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Quitar foto/ }))
    expect(p.senal()?.aborted).toBe(true)
    p.responder(resultadoOk)
    await dejarLlegarRespuestas()
    expect(screen.queryByText('resultado-viejo')).toBeNull()
    expect(screen.queryByText('Analizando tu fotografía…')).toBeNull()
    expect(screen.getByText('Sube tu fotografía')).toBeTruthy()
  })

  it('soltar otra foto aborta la peticion vieja y su respuesta no se muestra', async () => {
    pagina()
    const user = await irASubir()
    soltar([foto('vieja.png')])
    const vieja = peticionPendiente()
    await user.click(botonAnalizar())
    soltar([foto('nueva.png')])
    expect(vieja.senal()?.aborted).toBe(true)
    expect(botonAnalizar()).toBeEnabled()
    vieja.responder(resultadoOk)
    await dejarLlegarRespuestas()
    expect(screen.queryByText('resultado-viejo')).toBeNull()
    expect(screen.getByText('nueva.png')).toBeTruthy()
  })

  it('la respuesta vieja que llega durante el analisis nuevo no apaga su spinner', async () => {
    pagina()
    const user = await irASubir()
    soltar([foto('vieja.png')])
    const vieja = peticionPendiente()
    await user.click(botonAnalizar())
    soltar([foto('nueva.png')])
    peticionPendiente()
    await user.click(botonAnalizar())
    vieja.responder(resultadoOk)
    await dejarLlegarRespuestas()
    expect(screen.getByText('Analizando tu fotografía…')).toBeTruthy()
    expect(screen.queryByText('resultado-viejo')).toBeNull()
  })

  it('soltar un no-imagen durante el analisis lo aborta y muestra el error', async () => {
    pagina()
    const user = await irASubir()
    soltar([foto()])
    const p = peticionPendiente()
    await user.click(botonAnalizar())
    soltar([new File(['x'], 'a.pdf', { type: 'application/pdf' })])
    expect(p.senal()?.aborted).toBe(true)
    expect(screen.getByText(/no es una imagen/)).toBeTruthy()
    expect(screen.queryByText('Analizando tu fotografía…')).toBeNull()
  })

  it('soltar sin archivos durante el analisis no lo cancela', async () => {
    pagina()
    const user = await irASubir()
    soltar([foto()])
    const p = peticionPendiente()
    await user.click(botonAnalizar())
    soltar([])
    expect(p.senal()?.aborted).toBe(false)
    expect(screen.getByText('Analizando tu fotografía…')).toBeTruthy()
  })
})

describe('AIAnalysis: defectos que encontró QA (ya corregidos)', () => {
  it('soltar un no-imagen tras elegir con el selector vacia el input', async () => {
    // Sin vaciarlo, volver a elegir ese mismo archivo con el selector no dispara
    // onChange (es lo que el propio quitarFoto explica en su comentario).
    pagina()
    const user = await irASubir()
    await user.upload(inputFoto(), foto())
    soltar([new File(['x'], 'a.pdf', { type: 'application/pdf' })])
    expect(vistaPrevia()).toBeNull()
    expect(inputFoto().files).toHaveLength(0)
  })

  it('soltar una imagen tras elegir con el selector no deja el archivo viejo en el input', async () => {
    pagina()
    const user = await irASubir()
    await user.upload(inputFoto(), foto('a.png'))
    soltar([foto('b.png')])
    expect(screen.getByText('b.png')).toBeTruthy()
    expect(inputFoto().files).toHaveLength(0)
  })

  it('pasar sobre un hijo de la zona no apaga el resaltado', async () => {
    pagina()
    await irASubir()
    fireEvent.dragOver(zona())
    // El navegador emite dragleave en la label al entrar en el span/icono de dentro.
    // jsdom no tiene DragEvent y descarta relatedTarget del init: se fija a mano.
    const evento = createEvent.dragLeave(zona())
    Object.defineProperty(evento, 'relatedTarget', { value: screen.getByText(/máx. 10 MB/) })
    fireEvent(zona(), evento)
    expect(zona().className).toContain('bg-olive-50/50')
  })
})
