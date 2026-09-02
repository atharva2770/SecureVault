import { cpus } from 'node:os'

/*
  Bounded concurrency gate for Argon2 work.

  POST /api/auth/login performs a 64 MiB Argon2id derivation BEFORE it has
  authenticated anything — correct for timing equalisation, but it means an
  unauthenticated caller controls a 64 MiB allocation and several hundred ms of
  multi-threaded CPU per request. Without a gate, memory scales with request
  count and the libuv threadpool saturates permanently.

  The queue is deliberately bounded. An unbounded queue is the same denial of
  service with extra steps: the allocations simply move from "in flight" to
  "pending" and the process still dies.
*/

/** Thrown when the queue is already at its cap. Callers map this to HTTP 503. */
export class CapacityError extends Error {
  /** Seconds a client should wait before retrying. */
  readonly retryAfterSeconds: number

  constructor(label: string, retryAfterSeconds = 2) {
    super(`${label} is at capacity. Please try again shortly.`)
    this.name = 'CapacityError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface SemaphoreOptions {
  /** Permits handed out concurrently. */
  limit: number
  /** Waiters allowed to queue before acquire() rejects. */
  maxQueue: number
  /** Used in the error message; never include user input. */
  label?: string
}

type Waiter = {
  resolve: (release: () => void) => void
  reject: (error: Error) => void
}

export class Semaphore {
  private readonly limit: number
  private readonly maxQueue: number
  private readonly label: string

  private inFlight = 0
  private readonly waiters: Waiter[] = []

  constructor(options: SemaphoreOptions) {
    this.limit = Math.max(1, Math.floor(options.limit))
    this.maxQueue = Math.max(0, Math.floor(options.maxQueue))
    this.label = options.label ?? 'Server'
  }

  /** Permits currently held. */
  get active(): number {
    return this.inFlight
  }

  /** Callers waiting for a permit. */
  get queued(): number {
    return this.waiters.length
  }

  /**
   * Takes a permit, queueing if all are held. Rejects with {@link CapacityError}
   * once the queue is full rather than growing without bound.
   *
   * The returned release function is idempotent — calling it twice must not
   * hand out a second permit.
   */
  acquire(): Promise<() => void> {
    if (this.inFlight < this.limit) {
      this.inFlight += 1
      return Promise.resolve(this.releaser())
    }

    if (this.waiters.length >= this.maxQueue) {
      return Promise.reject(new CapacityError(this.label))
    }

    return new Promise<() => void>((resolve, reject) => {
      this.waiters.push({ resolve, reject })
    })
  }

  /** Runs `task` holding a permit, releasing it however the task settles. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    const release = await this.acquire()
    try {
      return await task()
    } finally {
      release()
    }
  }

  private releaser(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.handOff()
    }
  }

  /**
   * Passes the freed permit straight to the next waiter, so `inFlight` never
   * dips below the limit while work is queued and a permit can never be lost.
   */
  private handOff(): void {
    const next = this.waiters.shift()
    if (next) {
      next.resolve(this.releaser())
      return
    }
    this.inFlight -= 1
  }
}

/** Permits for Argon2 work, shared by every caller in this process. */
function defaultKdfConcurrency(): number {
  const configured = Number(process.env.VAULT_KDF_CONCURRENCY)
  if (Number.isInteger(configured) && configured > 0) return configured

  // Argon2id runs with parallelism 4 and 64 MiB per hash. Half the cores keeps
  // the box responsive while still using it, and the floor of 2 stops a
  // single-core container from serialising logins completely.
  const cores = cpus().length || 1
  return Math.max(2, Math.floor(cores / 2))
}

/** Waiters allowed to queue for a KDF permit before requests are shed. */
export const KDF_MAX_QUEUE = 50

/**
 * Process-global gate. Module-level on purpose: a per-instance limiter would
 * let each service allocate its own budget and defeat the bound.
 */
export const kdfSemaphore = new Semaphore({
  limit: defaultKdfConcurrency(),
  maxQueue: KDF_MAX_QUEUE,
  label: 'Authentication'
})
