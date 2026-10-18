import { AnimatePresence, motion, Reorder } from 'motion/react'
import { basename } from '../lib/format'
import { fileIcon } from '../lib/tools'
import { useStore } from '../state/store'
import type { Tab } from '../state/types'
import { ChatView } from './chat/ChatView'
import { FilePreview } from './FilePreview'
import { SettingsPage } from './SettingsPage'
import { Icon, Logo } from './ui'
import { WelcomePage } from './WelcomePage'

function TabLabel({ tab }: { tab: Tab }) {
  const chat = useStore((s) => (tab.kind === 'chat' ? s.chats[tab.id] : undefined))
  if (tab.kind === 'welcome') {
    return (
      <>
        <Logo size={14} />
        <span className="tab-title">Welcome</span>
      </>
    )
  }
  if (tab.kind === 'settings') {
    return (
      <>
        <Icon name="settings-gear" className="sm" />
        <span className="tab-title">Settings</span>
      </>
    )
  }
  if (tab.kind === 'file') {
    const fi = fileIcon(tab.path)
    return (
      <>
        <Icon name={fi.icon} className="sm" />
        <span className="tab-title" title={tab.path}>
          {basename(tab.path)}
        </span>
      </>
    )
  }
  const waiting = (chat?.permissions.length ?? 0) > 0
  const running = chat?.status === 'running'
  return (
    <>
      {waiting ? <span className="tab-dot attention" /> : running ? <span className="tab-dot" /> : <Icon name="comment-discussion" className="sm" />}
      <span className="tab-title" title={chat?.title}>
        {chat?.title ?? 'Chat'}
      </span>
    </>
  )
}

function TabBar() {
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)
  const { activateTab, closeTab, reorderTabs, newChat, setUi } = useStore.getState()
  const panelVisible = useStore((s) => s.panelVisible)
  const browserVisible = useStore((s) => s.browserVisible)

  return (
    <div className="tabbar">
      <Reorder.Group axis="x" values={tabs} onReorder={reorderTabs} className="tabs-scroll" as="div">
        <AnimatePresence initial={false}>
          {tabs.map((tab) => (
            <Reorder.Item
              key={tab.id}
              value={tab}
              as="div"
              className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              onMouseDown={(e) => {
                if (e.button === 0) activateTab(tab.id)
              }}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(tab.id)
              }}
              whileDrag={{ scale: 1.03, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', zIndex: 10 }}
            >
              {tab.id === activeTabId && <motion.span layoutId="tab-underline" className="tab-underline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <TabLabel tab={tab} />
              <button
                className="icon-btn tab-close"
                title="Close (Ctrl+W)"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                <Icon name="close" className="sm" />
              </button>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>
      <div className="tabbar-actions">
        <button className="icon-btn" title="New Chat (Ctrl+N)" onClick={() => newChat()}>
          <Icon name="add" />
        </button>
        <button className="icon-btn" title="Toggle Panel (Ctrl+J)" onClick={() => setUi({ panelVisible: !panelVisible })}>
          <Icon name="layout-panel" />
        </button>
        <button
          className="icon-btn"
          title="Toggle Browser (Ctrl+Shift+B)"
          style={browserVisible ? { color: 'var(--accent-strong)' } : undefined}
          onClick={() => setUi({ browserVisible: !browserVisible })}
        >
          <Icon name="globe" />
        </button>
      </div>
    </div>
  )
}

export function EditorArea() {
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)
  const active = tabs.find((t) => t.id === activeTabId)
  const chatTabs = tabs.filter((t) => t.kind === 'chat')

  return (
    <div className="editor-group">
      {tabs.length > 0 && <TabBar />}
      <div className="editor-content">
        {/* Chats stay mounted so scroll position and drafts survive tab switches. */}
        {chatTabs.map((t) => (
          <div key={t.id} className="editor-pane" style={{ visibility: t.id === activeTabId ? 'visible' : 'hidden', zIndex: t.id === activeTabId ? 1 : 0 }}>
            <ChatView chatId={t.id} active={t.id === activeTabId} />
          </div>
        ))}
        <AnimatePresence mode="wait" initial={false}>
          {active && active.kind !== 'chat' && (
            <motion.div
              key={active.id}
              className="editor-pane"
              style={{ zIndex: 2, background: 'var(--bg-editor)' }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            >
              {active.kind === 'welcome' && <WelcomePage />}
              {active.kind === 'settings' && <SettingsPage />}
              {active.kind === 'file' && <FilePreview path={active.path} />}
            </motion.div>
          )}
        </AnimatePresence>
        {!active && <EmptyEditor />}
      </div>
    </div>
  )
}

function EmptyEditor() {
  const project = useStore((s) => s.project)
  const { newChat, setDialog } = useStore.getState()
  return (
    <div className="chat-empty" style={{ position: 'absolute', inset: 0 }}>
      <Logo size={72} />
      <h2 style={{ opacity: 0.85 }}>Geeked IDE</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '8px 18px', color: 'var(--text-dim)', marginTop: 10 }}>
        <span>New chat</span>
        <span className="kbd">
          <kbd>Ctrl</kbd>
          <kbd>N</kbd>
        </span>
        <span>New project</span>
        <span className="kbd">
          <kbd>Ctrl</kbd>
          <kbd>Shift</kbd>
          <kbd>N</kbd>
        </span>
        <span>Command palette</span>
        <span className="kbd">
          <kbd>Ctrl</kbd>
          <kbd>Shift</kbd>
          <kbd>P</kbd>
        </span>
      </div>
      <button className="btn primary" style={{ marginTop: 16 }} onClick={() => (project ? newChat() : setDialog('newProject'))}>
        <Icon name="add" className="sm" /> {project ? 'New Chat' : 'New Project'}
      </button>
    </div>
  )
}
