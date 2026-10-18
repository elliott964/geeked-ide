import { basename, hostOf, relPath, truncate } from './format'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Input = Record<string, any>

export interface ToolMeta {
  icon: string
  /** Label while running, e.g. "Reading". */
  active: string
  /** Label when finished, e.g. "Read". */
  done: string
  summary: string
  accent?: 'web' | 'edit' | 'run' | 'agent' | 'plan' | 'mcp'
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

const BROWSER_TOOL = /^mcp__(geeked_browser|claude-in-chrome)__(.+)$/

/** The browser action ("navigate", "computer", …) when this is a browser tool. */
export function browserAction(name: string): { action: string; chrome: boolean } | null {
  const m = BROWSER_TOOL.exec(name)
  return m ? { action: m[2], chrome: m[1] === 'claude-in-chrome' } : null
}

function at(input: Input): string {
  if (typeof input.ref === 'string') return input.ref
  return Array.isArray(input.coordinate) ? `(${input.coordinate.join(', ')})` : ''
}

function browserMeta(action: string, input: Input, chrome: boolean): ToolMeta {
  const where = chrome ? ' · Chrome' : ''
  const m = (icon: string, active: string, done: string, summary: string): ToolMeta => ({ icon, active, done, summary: summary + where, accent: 'web' })
  switch (action) {
    case 'navigate': {
      const url = str(input.url)
      return m('globe', 'Opening', 'Opened', url === 'back' || url === 'forward' ? url : url.replace(/^https?:\/\//, ''))
    }
    case 'computer':
      switch (str(input.action)) {
        case 'screenshot': return m('device-camera', 'Taking screenshot', 'Took screenshot', '')
        case 'zoom': return m('zoom-in', 'Zooming in', 'Zoomed in', Array.isArray(input.region) ? `[${input.region.join(', ')}]` : '')
        case 'left_click': return m('target', 'Clicking', 'Clicked', at(input))
        case 'right_click': return m('target', 'Right-clicking', 'Right-clicked', at(input))
        case 'double_click': return m('target', 'Double-clicking', 'Double-clicked', at(input))
        case 'triple_click': return m('target', 'Triple-clicking', 'Triple-clicked', at(input))
        case 'type': return m('keyboard', 'Typing', 'Typed', truncate(str(input.text), 70))
        case 'key': return m('keyboard', 'Pressing', 'Pressed', str(input.text))
        case 'scroll': return m(input.scroll_direction === 'up' ? 'arrow-up' : 'arrow-down', 'Scrolling', 'Scrolled', str(input.scroll_direction) || 'down')
        case 'scroll_to': return m('arrow-down', 'Scrolling to', 'Scrolled to', str(input.ref))
        case 'hover': return m('target', 'Hovering', 'Hovered', at(input))
        case 'left_click_drag': return m('target', 'Dragging', 'Dragged', at(input))
        case 'wait': return m('clock', 'Waiting', 'Waited', `${input.duration ?? 1}s`)
        default: return m('browser', 'Using the page', 'Used the page', str(input.action))
      }
    case 'read_page': return m('list-tree', 'Reading page', 'Read page', str(input.filter) || 'interactive')
    case 'find': return m('search', 'Finding', 'Found', str(input.query))
    case 'get_page_text': return m('file-text', 'Reading page text', 'Read page text', '')
    case 'form_input': return m('edit', 'Filling', 'Filled', `${str(input.ref)} = ${truncate(String(input.value ?? ''), 40)}`)
    case 'javascript_tool': return m('code', 'Running script', 'Ran script', truncate(str(input.text).split('\n')[0], 70))
    case 'read_console_messages': return m('debug-console', 'Checking console', 'Checked console', input.onlyErrors ? 'errors' : '')
    case 'read_network_requests': return m('pulse', 'Checking network', 'Checked network', str(input.urlPattern))
    case 'tabs_context': return m('browser', 'Listing tabs', 'Listed tabs', '')
    case 'tabs_create': return m('browser', 'Opening tab', 'Opened tab', str(input.url))
    case 'tabs_select': return m('browser', 'Switching tab', 'Switched tab', str(input.tabId))
    case 'tabs_close': return m('browser', 'Closing tab', 'Closed tab', str(input.tabId))
    case 'resize_window':
      return m(input.preset === 'mobile' ? 'device-mobile' : 'screen-normal', 'Resizing viewport', 'Resized viewport', str(input.preset) || `${input.width ?? ''}×${input.height ?? ''}`)
    case 'browser_batch': return m('run-all', 'Running browser steps', 'Ran browser steps', `${Array.isArray(input.actions) ? input.actions.length : 0} steps`)
    default: return m('browser', action.replace(/_/g, ' '), action.replace(/_/g, ' '), '')
  }
}

export function toolMeta(name: string, input: Input, root?: string): ToolMeta {
  const file = (p: unknown): string => relPath(str(p), root)
  const browser = browserAction(name)
  if (browser) return browserMeta(browser.action, input, browser.chrome)
  switch (name) {
    case 'Read':
      return { icon: 'eye', active: 'Reading', done: 'Read', summary: file(input.file_path) }
    case 'Write':
      return { icon: 'new-file', active: 'Writing', done: 'Wrote', summary: file(input.file_path), accent: 'edit' }
    case 'Edit':
      return { icon: 'pencil', active: 'Editing', done: 'Edited', summary: file(input.file_path), accent: 'edit' }
    case 'MultiEdit':
      return { icon: 'pencil', active: 'Editing', done: 'Edited', summary: file(input.file_path), accent: 'edit' }
    case 'NotebookEdit':
      return { icon: 'notebook', active: 'Editing notebook', done: 'Edited notebook', summary: file(input.notebook_path), accent: 'edit' }
    case 'Bash':
      return { icon: 'terminal', active: 'Running', done: 'Ran', summary: str(input.description) || truncate(str(input.command), 90), accent: 'run' }
    case 'PowerShell':
      return { icon: 'terminal-powershell', active: 'Running', done: 'Ran', summary: str(input.description) || truncate(str(input.command), 90), accent: 'run' }
    case 'Glob':
      return { icon: 'files', active: 'Finding files', done: 'Found files', summary: str(input.pattern) }
    case 'Grep':
      return { icon: 'search', active: 'Searching', done: 'Searched', summary: str(input.pattern) }
    case 'WebSearch':
      return { icon: 'globe', active: 'Searching the web', done: 'Searched the web', summary: str(input.query), accent: 'web' }
    case 'WebFetch':
      return { icon: 'link-external', active: 'Fetching', done: 'Fetched', summary: hostOf(str(input.url)), accent: 'web' }
    case 'TodoWrite':
      return { icon: 'checklist', active: 'Updating todos', done: 'Updated todos', summary: `${(input.todos ?? []).length} items`, accent: 'plan' }
    case 'TaskCreate':
      return { icon: 'tasklist', active: 'Adding task', done: 'Added task', summary: str(input.subject), accent: 'plan' }
    case 'TaskUpdate':
      return { icon: 'tasklist', active: 'Updating task', done: 'Updated task', summary: str(input.status) || str(input.subject), accent: 'plan' }
    case 'TaskList':
    case 'TaskGet':
      return { icon: 'tasklist', active: 'Checking tasks', done: 'Checked tasks', summary: '', accent: 'plan' }
    case 'Agent':
    case 'Task':
      return { icon: 'hubot', active: 'Running agent', done: 'Agent finished', summary: str(input.description), accent: 'agent' }
    case 'AskUserQuestion':
      return { icon: 'question', active: 'Asking', done: 'Asked', summary: `${(input.questions ?? []).length} question(s)`, accent: 'plan' }
    case 'ExitPlanMode':
      return { icon: 'milestone', active: 'Presenting plan', done: 'Plan', summary: '', accent: 'plan' }
    case 'EnterPlanMode':
      return { icon: 'milestone', active: 'Entering plan mode', done: 'Entered plan mode', summary: '', accent: 'plan' }
    case 'Skill':
      return { icon: 'book', active: 'Using skill', done: 'Used skill', summary: str(input.skill) || str(input.command) }
    case 'ToolSearch':
      return { icon: 'tools', active: 'Loading tools', done: 'Loaded tools', summary: str(input.query) }
    case 'Workflow':
      return { icon: 'run-all', active: 'Running workflow', done: 'Workflow finished', summary: str(input.description) || str(input.name), accent: 'agent' }
    case 'Monitor':
      return { icon: 'pulse', active: 'Monitoring', done: 'Monitored', summary: str(input.description), accent: 'run' }
    case 'TaskStop':
      return { icon: 'debug-stop', active: 'Stopping task', done: 'Stopped task', summary: str(input.task_id) }
    case 'ListMcpResourcesTool':
    case 'ReadMcpResourceTool':
      return { icon: 'plug', active: 'Reading resource', done: 'Read resource', summary: str(input.uri) || str(input.server), accent: 'mcp' }
    case 'LSP':
      return { icon: 'symbol-misc', active: 'Querying code intelligence', done: 'Queried code intelligence', summary: file(input.file_path) }
    case 'EnterWorktree':
    case 'ExitWorktree':
      return { icon: 'git-branch', active: 'Switching worktree', done: 'Switched worktree', summary: str(input.name) }
    case 'CronCreate':
    case 'CronDelete':
    case 'CronList':
    case 'ScheduleWakeup':
      return { icon: 'clock', active: 'Scheduling', done: 'Scheduled', summary: str(input.prompt) ? truncate(str(input.prompt), 60) : '' }
    case 'web_search':
      return { icon: 'globe', active: 'Searching the web', done: 'Searched the web', summary: str(input.query), accent: 'web' }
    case 'web_fetch':
      return { icon: 'link-external', active: 'Fetching', done: 'Fetched', summary: hostOf(str(input.url)), accent: 'web' }
    default: {
      if (name.startsWith('mcp__')) {
        const [, server, ...tool] = name.split('__')
        return { icon: 'plug', active: `${server} · ${tool.join('__')}`, done: `${server} · ${tool.join('__')}`, summary: '', accent: 'mcp' }
      }
      const firstString = Object.values(input).find((v) => typeof v === 'string') as string | undefined
      return { icon: 'tools', active: name, done: name, summary: firstString ? truncate(firstString, 80) : '' }
    }
  }
}

export function fileName(p: string): string {
  return basename(p)
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', cs: 'csharp', cpp: 'cpp', cc: 'cpp',
  c: 'c', h: 'c', hpp: 'cpp', php: 'php', swift: 'swift', json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml',
  toml: 'ini', ini: 'ini', html: 'xml', xml: 'xml', svg: 'xml', css: 'css', scss: 'scss', less: 'less', sh: 'bash',
  bash: 'bash', ps1: 'powershell', sql: 'sql', lua: 'lua', dart: 'dart', r: 'r', vue: 'xml', dockerfile: 'dockerfile'
}

export function langForPath(p: string): string | undefined {
  const name = basename(p).toLowerCase()
  if (name === 'dockerfile') return 'dockerfile'
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  return EXT_LANG[ext]
}

const EXT_ICON: Record<string, { icon: string; color: string }> = {
  ts: { icon: 'file-code', color: '#3b82f6' },
  tsx: { icon: 'file-code', color: '#38bdf8' },
  js: { icon: 'file-code', color: '#facc15' },
  jsx: { icon: 'file-code', color: '#38bdf8' },
  py: { icon: 'file-code', color: '#60a5fa' },
  json: { icon: 'json', color: '#fbbf24' },
  md: { icon: 'markdown', color: '#a78bfa' },
  css: { icon: 'file-code', color: '#60a5fa' },
  html: { icon: 'file-code', color: '#fb923c' },
  png: { icon: 'file-media', color: '#c084fc' },
  jpg: { icon: 'file-media', color: '#c084fc' },
  jpeg: { icon: 'file-media', color: '#c084fc' },
  gif: { icon: 'file-media', color: '#c084fc' },
  svg: { icon: 'file-media', color: '#fb923c' },
  pdf: { icon: 'file-pdf', color: '#f87171' },
  zip: { icon: 'file-zip', color: '#a3a3a3' }
}

export function fileIcon(p: string): { icon: string; color: string } {
  const name = basename(p).toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  return EXT_ICON[ext] ?? { icon: 'file', color: 'var(--text-dim)' }
}
