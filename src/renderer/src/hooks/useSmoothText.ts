import { useEffect, useRef, useState } from 'react'

/**
 * Reveals streamed text at an even, eased pace so chunky network deltas
 * read like smooth typing. Once `active` turns false the full text shows.
 */
export function useSmoothText(target: string, active: boolean): string {
  const [shown, setShown] = useState(active ? '' : target)
  const len = useRef(active ? 0 : target.length)

  useEffect(() => {
    if (!active) {
      len.current = target.length
      setShown(target)
      return
    }
    if (len.current > target.length) len.current = target.length
    let raf = 0
    const tick = (): void => {
      const remaining = target.length - len.current
      if (remaining <= 0) return
      // Catch up over ~8 frames, never slower than 2 chars per frame.
      len.current += Math.max(2, Math.ceil(remaining / 8))
      if (len.current > target.length) len.current = target.length
      setShown(target.slice(0, len.current))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active])

  return active ? shown : target
}
