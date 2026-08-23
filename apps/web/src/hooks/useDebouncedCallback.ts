import { useEffect, useMemo, useRef } from 'react'

type Debounced<Args extends unknown[]> = ((...args: Args) => void) & {
  flush: () => void
  cancel: () => void
  pending: () => boolean
}

/**
 * Trailing debounce with flush/cancel — lodash-style, React-safe.
 * Latest callback is always invoked (ref), so callers need not memoize `callback`.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
  options: { flushOnUnmount?: boolean } = {}
): Debounced<Args> {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const delayRef = useRef(delayMs)
  delayRef.current = delayMs

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const argsRef = useRef<Args | null>(null)
  const flushOnUnmount = options.flushOnUnmount ?? false

  const cancel = useRef(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }).current

  const invoke = useRef(() => {
    const args = argsRef.current
    argsRef.current = null
    cancel()
    if (args) callbackRef.current(...args)
  }).current

  const flush = useRef(() => {
    if (timerRef.current == null) return
    invoke()
  }).current

  const pending = useRef(() => timerRef.current != null).current

  const debounced = useMemo(() => {
    const fn = ((...args: Args) => {
      argsRef.current = args
      cancel()
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        invoke()
      }, delayRef.current)
    }) as Debounced<Args>
    fn.flush = flush
    fn.cancel = cancel
    fn.pending = pending
    return fn
  }, [cancel, flush, invoke, pending])

  useEffect(
    () => () => {
      if (flushOnUnmount) flush()
      else cancel()
    },
    [cancel, flush, flushOnUnmount]
  )

  return debounced
}
