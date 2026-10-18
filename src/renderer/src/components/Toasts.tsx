import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../state/store'
import { Icon } from './ui'

const ICONS = { info: 'info', success: 'pass-filled', warn: 'warning', error: 'error', ultra: 'flame' } as const

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  // Keep clear of the native browser view, which would cover the toasts.
  const offset = useStore((s) => (s.browserVisible ? s.browserWidth : 0))
  return (
    <div className="toasts" style={{ right: 16 + offset }}>
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast ${t.kind}`}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <motion.span
              className="t-icon"
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.05 }}
            >
              <Icon name={ICONS[t.kind]} />
            </motion.span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={`t-title ${t.kind === 'ultra' ? 'ultra-text' : ''}`}>{t.title}</div>
              {t.detail && <div className="t-detail">{t.detail}</div>}
              {t.action && (
                <button
                  className="btn sm"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    t.action!.run()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <Icon name="close" className="xs" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
