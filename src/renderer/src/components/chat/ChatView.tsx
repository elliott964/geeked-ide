import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { getModel } from '@shared/models'
import { fillComposer } from '../../lib/composerBus'
import { useStore } from '../../state/store'
import type { TodoItem } from '../../state/types'
import { Collapse, Icon, Logo } from '../ui'
import { AttentionCard } from './AttentionCards'
import { Composer } from './Composer'
import { ModelName } from './Pickers'
import { TodoList } from './ToolCard'
import { Transcript } from './Transcript'

const STARTERS = [
  { icon: 'rocket', title: 'Build something new', sub: 'Scaffold an app, feature, or script', prompt: 'Help me build ' },
  { icon: 'book', title: 'Explain this project', sub: 'A guided tour of the code', prompt: 'Give me a tour of this project: what it does, how it is organized, and where to start reading.' },
  { icon: 'bug', title: 'Find and fix a bug', sub: 'Describe what is going wrong', prompt: 'Something is broken: ' },
  { icon: 'beaker', title: 'Write tests', sub: 'Cover the code that matters most', prompt: 'Find the most important untested code in this project and add tests for it.' }
]

function TodoPill({ todos, running }: { todos: TodoItem[]; running: boolean }) {
  const [open, setOpen] = useState(false)
  const done = todos.filter((t) => t.status === 'completed').length
  const current = todos.find((t) => t.status === 'in_progress')
  const visible = todos.length > 0 && (done < todos.length || running)
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="todo-pill"
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          <button className="todo-pill-head" onClick={() => setOpen((o) => !o)}>
            <Icon name={done === todos.length ? 'pass-filled' : 'checklist'} className="sm" />
            <span className="tp-text">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={current?.id ?? 'none'}
                  style={{ display: 'inline-block' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className={current ? 'shimmer-text' : ''}
                >
                  {current ? current.activeForm || current.content : done === todos.length ? 'All tasks complete' : 'Tasks'}
                </motion.span>
              </AnimatePresence>
            </span>
            <span style={{ color: 'var(--text-faint)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {done}/{todos.length}
            </span>
            <span className="progress-track">
              <motion.span className="progress-fill" style={{ display: 'block' }} animate={{ width: `${(done / todos.length) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
            </span>
            <Icon name={open ? 'chevron-down' : 'chevron-up'} className="xs" />
          </button>
          <Collapse open={open}>
            <div className="todo-pill-body">
              <TodoList todos={todos} />
            </div>
          </Collapse>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function EmptyState({ chatId, model, projectName }: { chatId: string; model: Parameters<typeof getModel>[0]; projectName?: string }) {
  return (
    <div className="chat-empty">
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}>
          <Logo size={64} />
        </motion.div>
      </motion.div>
      <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        What are we building{projectName ? ` in ${projectName}` : ''}?
      </motion.h2>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }}>
        <ModelName model={model} /> can read and edit files, run commands, search the web, and plan with you.
      </motion.p>
      <div className="starter-grid">
        {STARTERS.map((s, i) => (
          <motion.button
            key={s.title}
            className="starter"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 + i * 0.05, type: 'spring', stiffness: 400, damping: 30 }}
            onClick={() => fillComposer(chatId, s.prompt)}
          >
            <div className="st-title">
              <Icon name={s.icon} className="sm" />
              {s.title}
            </div>
            <div className="st-sub">{s.sub}</div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

export function ChatView({ chatId, active }: { chatId: string; active: boolean }) {
  const chat = useStore((s) => s.chats[chatId])
  const project = useStore((s) => s.project)
  if (!chat) return null
  const empty = chat.items.length === 0 && !chat.loadingHistory && !chat.live && chat.permissions.length === 0
  const respond = useStore.getState().respondPermission

  return (
    <div className="chat">
      {chat.loadingHistory && chat.items.length === 0 ? (
        <div className="chat-empty">
          <span className="orbit" style={{ width: 28, height: 28 }}>
            <span />
            <span />
          </span>
          <p className="shimmer-text">Loading conversation…</p>
        </div>
      ) : empty ? (
        <EmptyState chatId={chatId} model={chat.model} projectName={project?.name} />
      ) : (
        <Transcript chat={chat} root={project?.path}>
          <AnimatePresence>
            {chat.permissions.map((req) => (
              <motion.div
                key={req.requestId}
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              >
                <AttentionCard req={req} root={project?.path} respond={(r) => respond(chatId, req.requestId, r)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </Transcript>
      )}
      <div className="chat-bottom">
        <div className="chat-bottom-inner">
          <TodoPill todos={chat.todos} running={chat.status === 'running'} />
          <Composer chatId={chatId} active={active} />
        </div>
      </div>
    </div>
  )
}
