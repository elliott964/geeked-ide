import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useActiveChat, useStore } from '../state/store'
import type { PanelTab } from '../state/types'
import { TodoList } from './chat/ToolCard'
import { Icon } from './ui'

export function Panel() {
  const tab = useStore((s) => s.panelTab)
  const setUi = useStore((s) => s.setUi)
  const output = useStore((s) => s.output)
  const clearOutput = useStore((s) => s.clearOutput)
  const chat = useActiveChat()
  const outRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tab === 'output' && outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight
  }, [output, tab])

  const todos = chat?.todos ?? []
  const tasks = chat?.backgroundTasks ?? []
  const tabs: { id: PanelTab; label: string; count?: number }[] = [
    { id: 'todos', label: 'Todos', count: todos.length || undefined },
    { id: 'tasks', label: 'Background tasks', count: tasks.length || undefined },
    { id: 'output', label: 'Output' }
  ]

  return (
    <>
      <div className="panel-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`panel-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setUi({ panelTab: t.id })}>
            {t.label}
            {t.count !== undefined && <span className="count">{t.count}</span>}
            {tab === t.id && <motion.span layoutId="panel-underline" className="underline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {tab === 'output' && (
          <button className="icon-btn" title="Clear output" onClick={clearOutput}>
            <Icon name="clear-all" className="sm" />
          </button>
        )}
        <button className="icon-btn" title="Close panel (Ctrl+J)" onClick={() => setUi({ panelVisible: false })}>
          <Icon name="close" className="sm" />
        </button>
      </div>
      <div className="panel-body" ref={outRef}>
        {tab === 'todos' &&
          (todos.length ? (
            <TodoList todos={todos} />
          ) : (
            <div className="empty-hint">
              <Icon name="checklist" />
              GeekedGPT's task list for the current chat shows up here.
            </div>
          ))}
        {tab === 'tasks' &&
          (tasks.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tasks.map((t) => (
                <div key={t.taskId} className="tree-row" style={{ height: 30, cursor: 'default' }}>
                  <Icon name="loading" spin className="sm" />
                  <span className="name">{t.description || t.taskId}</span>
                  <span className="muted">{t.type.replace(/_/g, ' ')}</span>
                  <button className="btn ghost sm" onClick={() => chat && useStore.getState().stopBackgroundTask(chat.id, t.taskId)}>
                    <Icon name="debug-stop" className="sm" /> Stop
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-hint">
              <Icon name="server-process" />
              No background shells, agents or workflows are running.
            </div>
          ))}
        {tab === 'output' &&
          (output.length ? (
            <div className="output-log selectable">{output.join('\n')}</div>
          ) : (
            <div className="empty-hint">
              <Icon name="output" />
              Diagnostic output from the agent engine appears here.
            </div>
          ))}
      </div>
    </>
  )
}
