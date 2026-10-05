import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'

type Tone = 'success' | 'error' | 'info'

interface Toast {
  id: number
  title: string
  description?: string
  tone: Tone
}

interface ToastContextValue {
  toast: (toast: { title: string; description?: string; tone?: Tone }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DURATION_MS = 3600

const COLOR_PUNTO: Record<Tone, string> = {
  success: 'bg-nv-online',
  error: 'bg-[#e8a08c]',
  info: 'bg-nv-faint2',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback<ToastContextValue['toast']>(
    ({ title, description, tone = 'success' }) => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, title, description, tone }])
      window.setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Sobre el launcher de Nuva (spec §4.3) para no taparlo. */}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-20 z-[99] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-[150px] sm:right-6"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-nv-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[9px] bg-nv-ink px-5 py-3.5 text-nv-tint3 shadow-toast"
          >
            <span
              aria-hidden="true"
              className={`mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full ${COLOR_PUNTO[t.tone]}`}
            />
            <div className="flex-1">
              <p className="text-[13.5px]">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-nv-faint2">{t.description}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar aviso"
              className="-mr-2 rounded-full p-1 text-nv-soft2 transition-colors hover:bg-nv-ink3 hover:text-nv-bg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider')
  return ctx
}
