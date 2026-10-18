// Model + effort catalogue shared by the main process and the UI.

export type ModelKey = 'mini' | 'standard' | 'plus' | 'ultra'

export interface ModelDef {
  key: ModelKey
  /** Claude model id sent to the Agent SDK. */
  id: string
  name: string
  tagline: string
  /** Hidden models only appear once unlocked. */
  hidden?: boolean
}

export const MODELS: readonly ModelDef[] = [
  { key: 'mini', id: 'claude-haiku-5-5', name: 'GeekedGPT mini', tagline: 'Fastest and lightest for quick tasks' },
  { key: 'standard', id: 'claude-sonnet-5-5', name: 'GeekedGPT', tagline: 'Smart and fast for everyday work' },
  { key: 'plus', id: 'claude-opus-5-5', name: 'GeekedGPT Plus', tagline: 'Most capable for complex work' },
  {
    key: 'ultra',
    id: 'claude-fable-5-1',
    name: 'GeekedGPT Ultra',
    tagline: 'Frontier reasoning for the hardest problems',
    hidden: true
  }
]

export function getModel(key: ModelKey): ModelDef {
  return MODELS.find((m) => m.key === key) ?? MODELS[1]
}

export function modelKeyFromId(id: string | undefined): ModelKey | undefined {
  if (!id) return undefined
  const lower = id.toLowerCase()
  const exact = MODELS.find((m) => m.id === lower)
  if (exact) return exact.key
  if (lower.includes('haiku')) return 'mini'
  if (lower.includes('sonnet')) return 'standard'
  if (lower.includes('opus')) return 'plus'
  if (lower.includes('fable')) return 'ultra'
  return undefined
}

/** The SDK's effort levels plus Ultracode, the dynamic-workflow mode on top of max. */
export type EffortKey = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultracode'
export type SdkEffort = Exclude<EffortKey, 'ultracode'>

export interface EffortDef {
  key: EffortKey
  label: string
  short: string
  description: string
}

export const EFFORTS: readonly EffortDef[] = [
  { key: 'low', label: 'Low', short: 'Low', description: 'Quick answers, minimal thinking' },
  { key: 'medium', label: 'Medium', short: 'Med', description: 'Balanced speed and depth' },
  { key: 'high', label: 'High', short: 'High', description: 'Thinks carefully before acting' },
  { key: 'xhigh', label: 'Extra high', short: 'XHigh', description: 'Deep reasoning for agentic coding' },
  { key: 'max', label: 'Max', short: 'Max', description: 'Maximum thinking, correctness over cost' },
  {
    key: 'ultracode',
    label: 'Ultracode',
    short: 'Ultra',
    description: 'Max effort plus dynamic multi-agent workflows'
  }
]

export function effortIndex(key: EffortKey): number {
  const i = EFFORTS.findIndex((e) => e.key === key)
  return i < 0 ? 2 : i
}

export function toSdkEffort(key: EffortKey): SdkEffort {
  return key === 'ultracode' ? 'max' : key
}

export type PermissionModeKey = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'

export interface PermissionModeDef {
  key: PermissionModeKey
  label: string
  description: string
  icon: string
}

export const PERMISSION_MODES: readonly PermissionModeDef[] = [
  { key: 'default', label: 'Ask permissions', description: 'Ask before edits and commands', icon: 'shield' },
  { key: 'acceptEdits', label: 'Accept edits', description: 'Auto-accept file edits, ask for commands', icon: 'edit' },
  { key: 'plan', label: 'Plan mode', description: 'Research and plan without making changes', icon: 'checklist' },
  { key: 'auto', label: 'Auto mode', description: 'A safety classifier approves routine actions', icon: 'sparkle' },
  {
    key: 'bypassPermissions',
    label: 'Bypass permissions',
    description: 'Never ask. Only use in a sandbox you trust',
    icon: 'warning'
  }
]

export function getPermissionMode(key: PermissionModeKey): PermissionModeDef {
  return PERMISSION_MODES.find((m) => m.key === key) ?? PERMISSION_MODES[0]
}
