/** Combines AbortSignals so a keystroke cancel and a React Query cancel both stop the fetch. */
export function mergeAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
  const list = signals.filter((s): s is AbortSignal => Boolean(s))
  if (!list.length) return undefined
  if (list.length === 1) return list[0]

  const controller = new AbortController()
  const abort = (): void => controller.abort()
  for (const signal of list) {
    if (signal.aborted) {
      controller.abort()
      return controller.signal
    }
    signal.addEventListener('abort', abort, { once: true })
  }
  return controller.signal
}
