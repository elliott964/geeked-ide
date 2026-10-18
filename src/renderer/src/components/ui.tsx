import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export function Icon({ name, className = '', spin, title }: { name: string; className?: string; spin?: boolean; title?: string }) {
  return <i className={`codicon codicon-${name} ${spin ? 'spin' : ''} ${className}`} title={title} aria-hidden={!title} />
}

export function Logo({ size = 24, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-label="Geeked IDE">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b6cff" />
          <stop offset="0.55" stopColor="#5c8dff" />
          <stop offset="1" stopColor="#3dd6f5" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#g${id})`} />
      <path d="M44.5 23.5 A14.5 14.5 0 1 0 46.5 36 H33" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M49 9.5 l1.6 3.9 3.9 1.6 -3.9 1.6 -1.6 3.9 -1.6 -3.9 -3.9 -1.6 3.9 -1.6z" fill="#fff" opacity="0.95" />
    </svg>
  )
}

export function Kbd({ keys }: { keys: string }) {
  return (
    <span className="kbd">
      {keys.split('+').map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  )
}

export function Spinner() {
  return <Icon name="loading" spin />
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <motion.span className="knob" animate={{ x: on ? 16 : 0 }} transition={{ type: 'spring', stiffness: 600, damping: 32 }} />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="seg-bg" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A floating panel anchored to an element, rendered in a portal. */
export function Popover({
  open,
  anchor,
  onClose,
  placement = 'top',
  align = 'start',
  className = 'popover',
  children,
  width
}: {
  open: boolean
  anchor: RefObject<HTMLElement | null>
  onClose: () => void
  placement?: 'top' | 'bottom'
  align?: 'start' | 'end'
  className?: string
  children: ReactNode
  width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const place = (): void => {
      const a = anchor.current!.getBoundingClientRect()
      const el = ref.current
      const w = el?.offsetWidth ?? width ?? 300
      const h = el?.offsetHeight ?? 200
      let left = align === 'start' ? a.left : a.right - w
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
      let top = placement === 'top' ? a.top - h - 8 : a.bottom + 6
      if (top < 8) top = a.bottom + 6
      if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 8)
      setPos({ left, top })
    }
    place()
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
    }
  }, [open, anchor, placement, align, width])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, onClose, anchor])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className={className}
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width }}
          initial={{ opacity: 0, y: placement === 'top' ? 8 : -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: placement === 'top' ? 6 : -6, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export function Modal({ open, onClose, children, className = 'modal' }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            className={className}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: -14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/** Animated height container for expand/collapse. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.8, opacity: { duration: 0.18 } }}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
