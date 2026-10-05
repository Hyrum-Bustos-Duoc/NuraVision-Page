import { suscribir } from './suscribir.usecase'

describe('suscribir', () => {
  it('normaliza el correo antes de enviarlo', async () => {
    const repo = { suscribir: vi.fn().mockResolvedValue(undefined) }
    await suscribir(repo, '  Ana@Correo.CL ')
    expect(repo.suscribir).toHaveBeenCalledWith('ana@correo.cl')
  })

  it('no envia un correo invalido', async () => {
    const repo = { suscribir: vi.fn() }
    await expect(suscribir(repo, 'ana@')).rejects.toThrow('Revisa tu correo.')
    expect(repo.suscribir).not.toHaveBeenCalled()
  })
})
