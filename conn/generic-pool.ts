import { delay } from '../deps.ts'
import { InvalidPoolState, TimeoutError } from '../errors.ts'
import { remove } from '../utils.ts'

export interface PoolOptions<T> {
  max: number
  create: () => Promise<T>
  destroy: (value: T) => Promise<void>
  timeout: number
}

interface Executor<T> {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

const enum State {
  Ready = 'R',
  ShuttingDown = 'S',
  Closed = 'C',
}

export class Pool<T> extends EventTarget {
  readonly #max: number
  readonly #create: () => Promise<T>
  readonly #destroy: (value: T) => Promise<void>
  readonly #timeout: number

  readonly #idle: T[]
  readonly #busy: T[]
  readonly #wait: Promise<T>[]
  readonly #queue: Executor<T>[]
  readonly #closing: Executor<T>[]
  #state: State

  constructor(options: PoolOptions<T>) {
    super()
    this.#max = options.max
    this.#create = options.create
    this.#destroy = options.destroy
    this.#timeout = options.timeout

    this.#idle = []
    this.#busy = []
    this.#wait = []
    this.#queue = []
    this.#state = State.Ready
    this.#closing = []
  }

  get idle() {
    return this.#idle.length
  }

  get busy() {
    return this.#busy.length
  }

  get wait() {
    return this.#wait.length
  }

  get elem() {
    return this.#idle.length + this.#busy.length + this.#wait.length
  }

  get queue() {
    return this.#queue.length
  }

  get state() {
    return this.#state
  }

  async acquire(): Promise<T> {
    if (this.#state !== State.Ready) {
      throw new InvalidPoolState(this.#state)
    }
    const idle = this.#idle.shift()
    if (idle) {
      this.#busy.push(idle)
      return idle
    }

    if (this.elem >= this.#max) {
      return new Promise((resolve, reject) => {
        this.#queue.push({ resolve, reject })
      })
    }

    let destroy: null | ((value: T) => void) = null

    function hijack(value: T): T {
      if (destroy) destroy(value)
      return value
    }

    const controller = new AbortController()
    const promise = this.#create().then(hijack)
    let raced
    this.#wait.push(promise)
    try {
      raced = await Promise.race([
        promise,
        delay(this.#timeout, { signal: controller.signal }),
      ])
    } finally {
      remove(this.#wait, promise)
    }
    if (!raced) {
      destroy = this.#destroy
      throw new TimeoutError(this.#timeout)
    }
    controller.abort()
    this.#busy.push(raced)
    this.dispatchEvent(new Event('acquire'))
    return raced
  }

  release(value: T) {
    const busy = remove(this.#busy, value)
    if (busy === null) {
      return
    }
    this.dispatchEvent(new Event('release'))

    if (this.#state === State.Ready) {
      this.#idle.push(busy)
      const queue = this.#queue.shift()
      if (queue) {
        const idle = this.#idle.shift() as T
        this.#busy.push(idle)
        queue.resolve(idle)
      }
    } else if (this.#state === State.ShuttingDown) {
      const queue = this.#queue.shift()
      if (queue) {
        queue.reject(new InvalidPoolState(this.#state))
      }
      const shutting = this.#closing.shift()
      if (shutting) {
        shutting.resolve(busy)
      }
    } else if (this.#state === State.Closed) {
      throw new InvalidPoolState(this.#state)
    }
  }

  async destroy(value: T) {
    const busy = remove(this.#busy, value)
    if (!busy) {
      return
    }
    this.dispatchEvent(new Event('destroy'))
    await this.#destroy(busy)

    const queue = this.#queue.shift()
    if (queue) {
      this.acquire().then(queue.resolve, queue.reject)
    }
  }

  async shutdown() {
    this.#state = State.ShuttingDown

    const promises: Promise<T>[] = [...this.#wait]
    for (const _ of this.#busy) {
      promises.push(
        new Promise<T>((resolve, reject) => {
          this.#closing.push({ resolve, reject })
        })
      )
    }

    try {
      const items: T[] = await Promise.all(promises)
      let idle = this.#idle.shift()
      while (idle) {
        items.push(idle)
        idle = this.#idle.shift()
      }

      for (const item of new Set(items)) {
        await this.#destroy(item)
      }
    } finally {
      this.#state = State.Closed
    }
  }
}
