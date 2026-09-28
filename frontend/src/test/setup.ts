import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Desmonta lo renderizado tras cada test para que no se filtre al siguiente.
afterEach(() => {
  cleanup()
})
