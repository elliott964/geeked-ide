import { motion } from 'motion/react'
import { useRef } from 'react'
import { timeAgo } from '../lib/format'
import { useStore } from '../state/store'
import { Icon, Logo } from './ui'

const TIPS = [
  { icon: 'sparkle', title: 'Pick your brain power', body: 'GeekedGPT mini is lightning fast, GeekedGPT handles everyday work, and GeekedGPT Plus takes on the hardest jobs.' },
  { icon: 'lightbulb', title: 'Dial the thinking effort', body: 'Slide from Low to Max, or all the way to Ultracode for multi-agent workflows on big tasks.' },
  { icon: 'shield', title: 'Stay in control', body: 'Approve edits and commands as they happen, or press Shift+Tab to switch to auto-accept or plan mode.' },
  { icon: 'globe', title: 'Everything Claude Code can do', body: 'Web search, todo lists, subagents, skills, MCP servers, slash commands, file checkpoints and more.' }
]

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }
const child = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 380, damping: 30 } } }

export function useLogoEasterEgg(): () => void {
  const clicks = useRef<number[]>([])
  return () => {
    const now = Date.now()
    clicks.current = [...clicks.current.filter((t) => now - t < 2500), now]
    if (clicks.current.length >= 7) {
      clicks.current = []
      useStore.getState().unlockUltra()
    }
  }
}

export function WelcomePage() {
  const settings = useStore((s) => s.settings)
  const project = useStore((s) => s.project)
  const { setDialog, openProjectDialog, openProjectPath, newChat } = useStore.getState()
  const onLogo = useLogoEasterEgg()
  const recents = settings?.recentProjects ?? []

  return (
    <div className="welcome">
      <motion.div className="welcome-inner" variants={container} initial="hidden" animate="show">
        <motion.div className="welcome-hero" variants={child}>
          <motion.div whileHover={{ rotate: -6, scale: 1.05 }} whileTap={{ scale: 0.9, rotate: 8 }} onClick={onLogo} style={{ cursor: 'pointer' }}>
            <Logo size={84} />
          </motion.div>
          <div>
            <h1>
              Geeked <span className="grad">IDE</span>
            </h1>
            <p>Your agent development environment. Describe it, and GeekedGPT builds it.</p>
          </div>
        </motion.div>

        <div>
          <motion.h3 variants={child}>Start</motion.h3>
          <div className="start-actions">
            <motion.button variants={child} className="start-card primary" onClick={() => setDialog('newProject')}>
              <span className="sc-icon">
                <Icon name="add" />
              </span>
              <span>
                <div className="sc-title">New Project</div>
                <div className="sc-sub">Just give it a name. Saved in {settings?.projectsDir ?? 'your projects folder'}</div>
              </span>
            </motion.button>
            <motion.button variants={child} className="start-card" onClick={() => void openProjectDialog()}>
              <span className="sc-icon">
                <Icon name="folder-opened" />
              </span>
              <span>
                <div className="sc-title">Open Project</div>
                <div className="sc-sub">Work in any folder on your computer</div>
              </span>
            </motion.button>
            {project && (
              <motion.button variants={child} className="start-card" onClick={() => newChat()}>
                <span className="sc-icon">
                  <Icon name="comment-discussion" />
                </span>
                <span>
                  <div className="sc-title">New Chat in {project.name}</div>
                  <div className="sc-sub">Ctrl+N from anywhere</div>
                </span>
              </motion.button>
            )}
          </div>

          <motion.h3 variants={child} style={{ marginTop: 32 }}>
            Recent
          </motion.h3>
          <motion.div variants={child} className="recent-list">
            {recents.length === 0 && <div style={{ color: 'var(--text-faint)' }}>Projects you open show up here.</div>}
            {recents.slice(0, 8).map((r) => (
              <div key={r.path} className="recent-item" role="button" tabIndex={0} onClick={() => void openProjectPath(r.path)} onKeyDown={(e) => e.key === 'Enter' && void openProjectPath(r.path)} style={{ cursor: 'pointer' }}>
                <Icon name="folder" className="sm" />
                <span className="r-name">{r.name}</span>
                <span className="r-path" title={r.path}>
                  {r.path}
                </span>
                <span style={{ color: 'var(--text-faint)', fontSize: 11.5, flex: 'none' }}>{timeAgo(r.lastOpened)}</span>
                <button
                  className="icon-btn r-remove"
                  title="Remove from recent"
                  onClick={(e) => {
                    e.stopPropagation()
                    void window.geeked.projects.removeRecent(r.path).then((s) => useStore.getState().setSettings(s))
                  }}
                >
                  <Icon name="close" className="xs" />
                </button>
              </div>
            ))}
          </motion.div>
        </div>

        <div>
          <motion.h3 variants={child}>Get the most out of it</motion.h3>
          <div className="tips">
            {TIPS.map((t) => (
              <motion.div key={t.title} variants={child} className="tip" whileHover={{ x: 3 }}>
                <Icon name={t.icon} />
                <div>
                  <b>{t.title}</b>
                  <p>{t.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
