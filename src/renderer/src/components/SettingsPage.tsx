import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { PERMISSION_MODES, getModel, type PermissionModeKey } from '@shared/models'
import { useStore } from '../state/store'
import { EffortSlider, ModelName, useVisibleModels, MODEL_ICONS } from './chat/Pickers'
import { Icon, Logo, Toggle } from './ui'
import { useLogoEasterEgg } from './WelcomePage'

function Setting({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <motion.div className="setting" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
      <div className="s-text">
        <div className="s-title">{title}</div>
        {desc && <div className="s-desc">{desc}</div>}
      </div>
      <div className="s-control">{children}</div>
    </motion.div>
  )
}

export function SettingsPage() {
  const settings = useStore((s) => s.settings)
  const version = useStore((s) => s.version)
  const { updateSettings, setSettings, toast } = useStore.getState()
  const models = useVisibleModels()
  const [key, setKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const onLogo = useLogoEasterEgg()

  if (!settings) return null

  const saveKey = async (value: string | null): Promise<void> => {
    setSavingKey(true)
    try {
      setSettings(await window.geeked.settings.setApiKey(value))
      setKey('')
      toast({ kind: 'success', title: value ? 'API key saved securely' : 'API key removed', detail: 'New chats will use it. Restart open chats to apply.' })
    } catch (err) {
      toast({ kind: 'error', title: "Couldn't save the key", detail: (err as Error).message })
    } finally {
      setSavingKey(false)
    }
  }

  return (
    <div className="settings">
      <div className="settings-inner">
        <h1>Settings</h1>
        <p className="subtitle">Tune Geeked IDE to the way you work.</p>

        <div className="settings-section">
          <h2>Projects</h2>
          <Setting
            title="Default projects folder"
            desc={
              <span className="selectable" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                {settings.projectsDir}
              </span>
            }
          >
            <button
              className="btn sm"
              onClick={async () => {
                const dir = await window.geeked.settings.chooseProjectsDir()
                if (dir) {
                  setSettings(await window.geeked.settings.get())
                  toast({ kind: 'success', title: 'Projects folder updated', detail: dir })
                }
              }}
            >
              <Icon name="folder-opened" className="sm" /> Change…
            </button>
          </Setting>
        </div>

        <div className="settings-section">
          <h2>Models</h2>
          <Setting title="Default model" desc="Used for new chats. You can switch models any time from the composer.">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {models.map((m) => (
                <button key={m.key} className={`chip ${settings.defaultModel === m.key ? 'open' : ''}`} style={settings.defaultModel === m.key ? { borderColor: 'var(--accent)' } : undefined} onClick={() => void updateSettings({ defaultModel: m.key })}>
                  <Icon name={MODEL_ICONS[m.key]} className="sm" />
                  <ModelName model={m.key} />
                </button>
              ))}
            </div>
          </Setting>
          <Setting title="Default thinking effort" desc="How hard GeekedGPT thinks in new chats. Ultracode adds dynamic multi-agent workflows on top of Max.">
            <EffortSlider value={settings.defaultEffort} onChange={(e) => void updateSettings({ defaultEffort: e })} />
          </Setting>
          {settings.ultraUnlocked && (
            <Setting title={'Show GeekedGPT Ultra'} desc={<>Keep <span className="ultra-text">GeekedGPT Ultra</span> ({getModel('ultra').tagline.toLowerCase()}) in your model menus.</>}>
              <Toggle
                label="Show GeekedGPT Ultra"
                on={settings.showUltra}
                onChange={(v) => void updateSettings(v ? { showUltra: true } : { showUltra: false, ...(settings.defaultModel === 'ultra' ? { defaultModel: 'plus' as const } : {}) })}
              />
            </Setting>
          )}
        </div>

        <div className="settings-section">
          <h2>Browser</h2>
          <Setting
            title="Built-in browser"
            desc="GeekedGPT can open pages in the browser pane, click, type, read pages, check the console and take screenshots. It uses its own profile, separate from your everyday browser."
          >
            <button className="btn sm" onClick={() => useStore.getState().setUi({ browserVisible: true })}>
              <Icon name="globe" className="sm" /> Open browser
            </button>
          </Setting>
          <Setting
            title="Claude in Chrome"
            desc={
              <>
                Also let GeekedGPT drive your own Chrome, with your sign-ins, through the Claude in Chrome extension (the same as{' '}
                <code>claude --chrome</code>). Needs the extension and a claude.ai sign-in, not an API key. Applies to chats you start or restart after changing it.
              </>
            }
          >
            <Toggle label="Claude in Chrome" on={settings.claudeInChrome} onChange={(v) => void updateSettings({ claudeInChrome: v })} />
          </Setting>
          <Setting title="Browsing data" desc="Sign out of all sites and clear the built-in browser's cookies, storage and cache.">
            <button
              className="btn sm"
              onClick={async () => {
                await window.geeked.browser.clearData()
                toast({ kind: 'success', title: 'Browsing data cleared' })
              }}
            >
              <Icon name="trash" className="sm" /> Clear data
            </button>
          </Setting>
        </div>

        <div className="settings-section">
          <h2>Permissions</h2>
          <Setting title="Default permission mode" desc="How new chats ask before editing files or running commands. Shift+Tab switches modes in a chat.">
            <select
              className="input"
              style={{ width: 220, height: 32 }}
              value={settings.defaultPermissionMode}
              onChange={(e) => void updateSettings({ defaultPermissionMode: e.target.value as PermissionModeKey })}
            >
              {PERMISSION_MODES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </Setting>
        </div>

        <div className="settings-section">
          <h2>Chat</h2>
          <Setting title="Press Enter to send" desc="When off, use Ctrl+Enter to send and Enter for new lines.">
            <Toggle label="Press Enter to send" on={settings.sendOnEnter} onChange={(v) => void updateSettings({ sendOnEnter: v })} />
          </Setting>
          <Setting title="Reduce motion" desc="Tone down animations across the app.">
            <Toggle label="Reduce motion" on={settings.reduceMotion} onChange={(v) => void updateSettings({ reduceMotion: v })} />
          </Setting>
        </div>

        <div className="settings-section">
          <h2>Account</h2>
          <Setting
            title="Anthropic API key"
            desc={
              settings.hasApiKey
                ? 'A key is stored, encrypted with Windows credential protection.'
                : 'Optional. Without a key, Geeked IDE uses your Claude Code sign-in or the ANTHROPIC_API_KEY environment variable.'
            }
          >
            {settings.hasApiKey ? (
              <button className="btn danger sm" disabled={savingKey} onClick={() => void saveKey(null)}>
                <Icon name="trash" className="sm" /> Remove key
              </button>
            ) : (
              <form
                style={{ display: 'flex', gap: 6 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  if (key.trim()) void saveKey(key)
                }}
              >
                <input className="input" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" style={{ width: 220, height: 30 }} value={key} onChange={(e) => setKey(e.target.value)} />
                <button className="btn primary sm" type="submit" disabled={!key.trim() || savingKey}>
                  Save
                </button>
              </form>
            )}
          </Setting>
        </div>

        <div className="settings-section">
          <h2>About</h2>
          <div className="setting">
            <motion.div whileTap={{ scale: 0.88, rotate: 10 }} onClick={onLogo} style={{ cursor: 'pointer' }}>
              <Logo size={44} />
            </motion.div>
            <div className="s-text">
              <div className="s-title">Geeked IDE {version}</div>
              <div className="s-desc">An agent development environment powered by the Claude Agent SDK.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
