import type { GeekedApi } from '../shared/ipc'

declare global {
  interface Window {
    geeked: GeekedApi
  }
}

export {}
