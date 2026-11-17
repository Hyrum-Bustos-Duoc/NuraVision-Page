// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AIAnalysis from './AIAnalysis'

vi.mock('@/shared/state/AppState', () => ({
  useAppState: () => ({
    siteContent: { aiFocusOptions: [{ id: 'f1', label: 'Forma', tips: [] }] },
    activeServices: [],
  }),
}))
vi.mock('@/modules/tienda/ui/useCatalogo', () => ({ useCatalogo: () => ({ porSlug: () => undefined }) }))
vi.mock('@/modules/contenido/ui/useContenido', () => ({ useContenido: () => ({ contenido: { analisis: {} } }) }))
vi.mock('@/modules/tienda/ui/ProductGrid', () => ({ ProductGrid: () => null }))

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

const foto = () => new File(['x'], 'mano.png', { type: 'image/png' })

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:prueba')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('AIAnalysis: arrastrar y quitar foto', () => {
  it('al soltar una imagen la muestra y permite quitarla', async () => {
    pagina()
    const user = await irASubir()
    const zona = screen.getByText(/Arrastra tu foto/).closest('label')!
    fireEvent.drop(zona, { dataTransfer: { files: [foto()] } })
    expect(screen.getByAltText('Vista previa de tu fotografía')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Quitar foto/ }))
    expect(screen.queryByAltText('Vista previa de tu fotografía')).toBeNull()
    expect(screen.getByText(/Arrastra tu foto/)).toBeTruthy()
  })

  it('rechaza un archivo que no es imagen y no deja foto elegida', async () => {
    pagina()
    await irASubir()
    const zona = screen.getByText(/Arrastra tu foto/).closest('label')!
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    fireEvent.drop(zona, { dataTransfer: { files: [pdf] } })
    expect(screen.queryByAltText('Vista previa de tu fotografía')).toBeNull()
    expect(screen.getByText(/no es una imagen/)).toBeTruthy()
  })
})
