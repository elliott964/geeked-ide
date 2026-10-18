import { AnimatePresence, motion } from 'motion/react'
import { EFFORTS, getModel, getPermissionMode } from '@shared/models'
import { money, tokens } from '../lib/format'
import { useActiveChat, useStore } from '../state/store'
import { MODEL_ICONS } from './chat/Pickers'
import { Icon, Logo } from './ui'

function ContextRing({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(1, used / total) : 0
  const r = 5.5
  const c = 2 * Math.PI * r
  const color = pct > 0.85 ? 'var(--danger)' : pct > 0.6 ? 'var(--warn)' : 'var(--accent-2)'
  return (
    <svg className="ctx-ring" viewBox="0 0 14 14">
      <circle cx="7" cy="7" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      <motion.circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        transform="rotate(-90 7 7)"
      />
    </svg>
  )
}

export function StatusBar() {
  const project = useStore((s) => s.project)
  const chat = useActiveChat()
  const { setPalette, setUi } = useStore.getState()
  const running = useStore((s) => Object.values(s.chats).filter((c) => c.status === 'running').length)
  const browserBusy = useStore((s) => s.browserState.busy)
  const browserVisible = useStore((s) => s.browserVisible)
  const effort = chat ? EFFORTS.find((e) => e.key === chat.effort) : undefined
  const mode = chat ? getPermissionMode(chat.permissionMode) : undefined

  return (
    <div className="statusbar">
      <button className="status-item brand" onClick={() => setPalette('commands')} title="Geeked IDE — show all commands">
        <Logo size={13} /> Geeked
      </button>
      {project && (
        <button className="status-item" title={project.path} onClick={() => setUi({ sidebarView: 'explorer', sidebarVisible: true })}>
          <Icon name="folder" className="xs" /> {project.name}
        </button>
      )}
      {mode && (
        <button className="status-item" onClick={() => setPalette('mode')} title="Permission mode (Shift+Tab in the composer)">
          <Icon name={mode.icon} className="xs" /> {mode.label}
        </button>
      )}
      <AnimatePresence>
        {running > 0 && (
          <motion.span className="status-item" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <Icon name="loading" spin className="xs" /> {running === 1 ? 'GeekedGPT is working' : `${running} chats working`}
          </motion.span>
        )}
      </AnimatePresence>
      <span className="status-spacer" />
      <button
        className="status-item"
        onClick={() => setUi({ browserVisible: !browserVisible })}
        title={browserBusy ? `GeekedGPT is ${browserBusy.toLowerCase()} in the browser` : 'Toggle browser (Ctrl+Shift+B)'}
      >
        <Icon name="globe" className={`xs ${browserBusy ? 'spin' : ''}`} />
        <AnimatePresence mode="popLayout" initial={false}>
          {browserBusy && (
            <motion.span key="busy" className="shimmer-text" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              {browserBusy}…
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      {chat && chat.contextTokens > 0 && (
        <span className="status-item" title={`Context: ${chat.contextTokens.toLocaleString()} of ${chat.contextWindow ? chat.contextWindow.toLocaleString() : '?'} tokens`}>
          <ContextRing used={chat.contextTokens} total={chat.contextWindow || 1_000_000} />
          {tokens(chat.contextTokens)}
        </span>
      )}
      {chat && chat.costUsd > 0 && (
        <span className="status-item" title="Estimated cost of this chat">
          {money(chat.costUsd)}
        </span>
      )}
      {effort && (
        <button className="status-item" onClick={() => setPalette('effort')} title="Thinking effort">
          <Icon name={effort.key === 'ultracode' ? 'flame' : 'lightbulb'} className="xs" />
          <span className={effort.key === 'ultracode' ? 'ultra-text' : ''}>{effort.label}</span>
        </button>
      )}
      {chat && (
        <button className="status-item" onClick={() => setPalette('model')} title="Model">
          <Icon name={MODEL_ICONS[chat.model]} className="xs" />
          <span className={chat.model === 'ultra' ? 'ultra-text' : ''}>{getModel(chat.model).name}</span>
        </button>
      )}
      <button className="status-item" onClick={() => setUi({ panelVisible: true, panelTab: 'output' })} title="Agent output">
        <Icon name="bell" className="xs" />
      </button>
    </div>
  )
}
