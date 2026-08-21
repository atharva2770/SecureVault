/**
 * Normalizes thrown values into Error instances safe to send over IPC.
 */
export function toIpcError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error(error.message)
  }
  return new Error(typeof error === 'string' ? error : 'Unexpected error')
}
