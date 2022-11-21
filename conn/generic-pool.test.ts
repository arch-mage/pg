import {
  FakeTime,
  assertEquals,
  assertRejects,
  spy,
  assertSpyCalls,
  assertSpyCallArg,
} from '../testing.ts'
import { delay } from '../deps.ts'
import { Pool } from './generic-pool.ts'
import { InvalidPoolState, TimeoutError } from '../errors.ts'
import { noop } from '../utils.ts'

function* seed(): Generator<number, never, void> {
  let num = 0
  for (;;) {
    yield ++num
  }
}

Deno.test('pool state', async () => {
  const gen = seed()
  const pool = new Pool({
    max: 2,
    create: () => Promise.resolve(gen.next().value),
    destroy: noop,
  })
  const prom1 = pool.acquire()
  const prom2 = pool.acquire()
  assertEquals(pool.idle, 0)
  assertEquals(pool.busy, 0)
  assertEquals(pool.wait, 2)
  assertEquals(pool.elem, 2)
  assertEquals(await prom1, 1)
  assertEquals(pool.idle, 0)
  assertEquals(pool.busy, 2)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
  pool.release(1)
  assertEquals(pool.idle, 1)
  assertEquals(pool.busy, 1)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
  assertEquals(await prom2, 2)
  pool.release(1)
  assertEquals(pool.idle, 1)
  assertEquals(pool.busy, 1)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
  pool.release(2)
  assertEquals(pool.idle, 2)
  assertEquals(pool.busy, 0)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
  pool.destroy(1)
  pool.destroy(2)
  assertEquals(pool.idle, 2)
  assertEquals(pool.busy, 0)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
  assertEquals(await pool.acquire(), 1)
  assertEquals(pool.idle, 1)
  assertEquals(pool.busy, 1)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
  assertEquals(await pool.acquire(), 2)
  assertEquals(pool.idle, 0)
  assertEquals(pool.busy, 2)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
})

Deno.test('destroy', async () => {
  const gen = seed()
  const destroy = spy(async () => {})

  const pool = new Pool({
    max: 2,
    create: () => Promise.resolve(gen.next().value),
    destroy,
  })
  await pool.acquire()
  await pool.acquire()
  pool.release(1)
  pool.release(2)
  pool.destroy(1)
  pool.destroy(2)
  assertSpyCalls(destroy, 0)
  await pool.acquire()
  await pool.acquire()
  pool.destroy(1)
  pool.destroy(2)
  assertSpyCallArg(destroy, 0, 0, 1)
  assertSpyCallArg(destroy, 1, 0, 2)
  assertEquals(pool.idle, 0)
  assertEquals(pool.busy, 0)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 0)
})

Deno.test('timeout', async () => {
  const gen = seed()
  const time = new FakeTime()
  const destroy = spy(async () => {})

  try {
    const pool = new Pool({
      max: 2,
      create: async () => {
        await delay(2000)
        return gen.next().value
      },
      destroy,
      acquireTimeout: 1000,
    })
    const ret = pool.acquire()
    await time.tickAsync(3000)
    await assertRejects(
      () => ret,
      TimeoutError,
      'timeout of 1000ms is exceeded'
    )
    assertSpyCallArg(destroy, 0, 0, 1)
    assertEquals(pool.idle, 0)
    assertEquals(pool.busy, 0)
    assertEquals(pool.wait, 0)
    assertEquals(pool.elem, 0)
  } finally {
    time.restore()
  }
})

Deno.test('queue', async () => {
  const gen = seed()
  const pool = new Pool({
    max: 2,
    create: () => Promise.resolve(gen.next().value),
    destroy: noop,
  })

  await pool.acquire()
  await pool.acquire()
  assertEquals(pool.idle, 0)
  assertEquals(pool.busy, 2)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)

  const queue = [pool.acquire(), pool.acquire(), pool.acquire()]
  assertEquals(pool.queue, 3)
  assertEquals(pool.idle, 0)
  assertEquals(pool.busy, 2)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
  pool.release(2)
  assertEquals(pool.queue, 2)
  assertEquals(pool.idle, 0)
  assertEquals(pool.busy, 2)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
  pool.release(1)
  assertEquals(pool.queue, 1)
  assertEquals(pool.idle, 0)
  assertEquals(pool.busy, 2)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
  assertEquals(await queue[0], 2)
  assertEquals(await queue[1], 1)
  await pool.destroy(2)
  assertEquals(pool.queue, 0)
  assertEquals(pool.idle, 0)
  assertEquals(pool.busy, 1)
  assertEquals(pool.wait, 1)
  assertEquals(pool.elem, 2)
  assertEquals(await queue[2], 3)
  assertEquals(pool.queue, 0)
  assertEquals(pool.idle, 0)
  assertEquals(pool.busy, 2)
  assertEquals(pool.wait, 0)
  assertEquals(pool.elem, 2)
})

Deno.test('sane shutting down', async () => {
  const gen = seed()
  const destroy = spy(async () => {})
  const pool = new Pool({
    max: 4,
    create: () => Promise.resolve(gen.next().value),
    destroy,
    acquireTimeout: 1000,
  })

  await pool.acquire()
  await pool.acquire()
  await pool.acquire()
  await pool.acquire()

  pool.release(1)
  assertEquals(pool.state, 'R')
  pool.destroy(2)
  assertEquals(pool.state, 'R')
  const promise = pool.shutdown()

  assertEquals(pool.state, 'S')
  pool.release(3)
  assertEquals(pool.state, 'S')
  pool.release(4)
  assertEquals(pool.state, 'S')
  await promise
  assertEquals(pool.state, 'C')
  assertEquals(pool.elem, 0)
  assertSpyCalls(destroy, 4)
})

Deno.test('queue on shutting down', async () => {
  const gen = seed()
  const destroy = spy(async () => {})
  const pool = new Pool({
    max: 2,
    create: () => Promise.resolve(gen.next().value),
    destroy,
    acquireTimeout: 1000,
  })

  await pool.acquire()
  await pool.acquire()

  const q1 = pool.acquire()
  const q2 = pool.acquire()
  const promise = pool.shutdown()

  assertEquals(pool.state, 'S')
  pool.release(1)
  assertEquals(pool.state, 'S')
  pool.release(2)
  assertEquals(pool.state, 'S')
  await promise
  assertEquals(pool.state, 'C')
  assertEquals(pool.elem, 0)
  assertSpyCalls(destroy, 2)

  assertRejects(() => q1, InvalidPoolState)
  assertRejects(() => q2, InvalidPoolState)
})

Deno.test('acquire on shutting down', async () => {
  const gen = seed()
  const destroy = spy(async () => {})
  const pool = new Pool({
    max: 4,
    create: () => Promise.resolve(gen.next().value),
    destroy,
    acquireTimeout: 1000,
  })

  pool.shutdown()
  await assertRejects(() => pool.acquire(), InvalidPoolState)
})

Deno.test('wait on shutting down', async () => {
  const gen = seed()
  const destroy = spy(async () => {})
  const pool = new Pool({
    max: 2,
    create: () => Promise.resolve(gen.next().value),
    destroy,
    acquireTimeout: 1000,
  })

  const a1 = pool.acquire()
  const a2 = pool.acquire()
  const promise = pool.shutdown()

  await a1
  await a2
  assertEquals(pool.state, 'S')
  pool.release(1)
  assertEquals(pool.state, 'S')
  pool.release(2)
  assertEquals(pool.state, 'S')
  await promise
  assertEquals(pool.state, 'C')
  assertEquals(pool.elem, 0)
  assertSpyCalls(destroy, 2)
})

Deno.test('idle timeout', async () => {
  const time = new FakeTime()

  try {
    const gen = seed()
    const destroy = spy(async () => {})
    const pool = new Pool({
      max: 2,
      create: () => Promise.resolve(gen.next().value),
      destroy,
      idleTimeout: 1000,
    })

    const a1 = await pool.acquire()
    const a2 = await pool.acquire()
    pool.release(a1)
    assertEquals(pool.idle, 1)
    assertEquals(pool.busy, 1)
    assertEquals(pool.elem, 2)
    await time.tickAsync(2000)
    assertSpyCalls(destroy, 1)
    assertSpyCallArg(destroy, 0, 0, 1)
    assertEquals(pool.idle, 0)
    assertEquals(pool.busy, 1)
    assertEquals(pool.elem, 1)
    pool.release(a2)
    assertEquals(pool.idle, 1)
    assertEquals(pool.busy, 0)
    assertEquals(pool.elem, 1)
    await time.tickAsync(2000)
    assertSpyCalls(destroy, 2)
    assertSpyCallArg(destroy, 1, 0, 2)
    assertEquals(pool.idle, 0)
    assertEquals(pool.busy, 0)
    assertEquals(pool.elem, 0)

    let a3
    a3 = await pool.acquire()
    pool.release(a3)
    await time.tickAsync(500)
    a3 = await pool.acquire()
    assertEquals(a3, 3)
    await time.tickAsync(2000)
    assertSpyCalls(destroy, 2)
    assertEquals(pool.idle, 0)
    assertEquals(pool.busy, 1)
    assertEquals(pool.elem, 1)
  } finally {
    time.restore()
  }
})
