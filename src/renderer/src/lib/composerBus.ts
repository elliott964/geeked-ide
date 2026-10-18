// Lets other UI (starter cards, palette, explorer) put text into a chat's composer.
export type FillMode = 'replace' | 'append'
type Listener = (text: string, mode: FillMode) => void
const listeners = new Map<string, Set<Listener>>()

export function onComposerFill(chatId: string, fn: Listener): () => void {
  let set = listeners.get(chatId)
  if (!set) listeners.set(chatId, (set = new Set()))
  set.add(fn)
  return () => {
    set!.delete(fn)
    if (!set!.size) listeners.delete(chatId)
  }
}

export function fillComposer(chatId: string, text: string, mode: FillMode = 'replace'): void {
  listeners.get(chatId)?.forEach((fn) => fn(text, mode))
}
