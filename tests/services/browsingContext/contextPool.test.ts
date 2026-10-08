import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import { createTempContextPool } from "~/services/browsingContext/tempPage/contextPool"
import { type TempContext } from "~/services/browsingContext/tempPage/contracts"
import { logger } from "~/services/browsingContext/tempPage/diagnostics"

vi.mock("~/services/browsingContext/tempPage/diagnostics", () => ({
  logger: { error: vi.fn() },
  logTempWindow: vi.fn(),
}))

/** Creates one browser context owned by the pool under test. */
function context(id: number, window = false): TempContext {
  const shared = {
    id,
    tabId: id + 100,
    origin: "https://pool.invalid",
    activeRequestIds: new Set<string>(),
    lastUsed: 0,
  }
  return window
    ? {
        ...shared,
        type: TEMP_CONTEXT_MODES.Window,
        mode: TEMP_CONTEXT_MODES.Window,
        ownerWindowId: id,
      }
    : { ...shared, type: TEMP_CONTEXT_MODES.Tab, mode: TEMP_CONTEXT_MODES.Tab }
}

/** Keeps a second request active so the released context retires individually. */
function createBusyPool(window = false) {
  const cleanup = vi.fn().mockResolvedValue(undefined)
  const pool = createTempContextPool({
    cleanup,
    isAlive: vi.fn().mockResolvedValue(true),
  })
  const released = context(1, window)
  const busy = context(2)
  for (const item of [released, busy]) pool.registerContext(item.origin, item)
  pool.attachRequestToContext("released", released)
  pool.attachRequestToContext("busy", busy)
  return { pool, cleanup, released, busy }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})

it.each([
  [true, 3000],
  [false, 5000],
] as const)(
  "retires an idle context while another same-origin task stays active (window=%s)",
  async (window, timeout) => {
    const { pool, cleanup, released, busy } = createBusyPool(window)
    await pool.releaseTempContext("released")
    await vi.advanceTimersByTimeAsync(2000 + timeout - 1)
    expect(cleanup).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(cleanup).toHaveBeenCalledWith(released, { reason: "idleTimeout" })
    expect(pool.hasContext(released.id)).toBe(false)
    expect(pool.getByTabId(released.tabId)).toBeUndefined()
    expect(pool.hasRequest("busy")).toBe(true)
    expect(await pool.getReusableContext(busy.origin)).toBe(busy)
  },
)

it("cancels pending retirement when a new task reuses the idle context", async () => {
  const { pool, cleanup, released } = createBusyPool(true)
  await pool.releaseTempContext("released")
  await vi.advanceTimersByTimeAsync(2000)
  pool.attachRequestToContext("new-task", released)
  await vi.advanceTimersByTimeAsync(5000)
  expect(cleanup).not.toHaveBeenCalled()
  expect(pool.hasRequest("new-task")).toBe(true)
})

it("checks new ownership after idle cleanup waits for an origin lock", async () => {
  const { pool, cleanup, released } = createBusyPool(true)
  await pool.releaseTempContext("released")
  await vi.advanceTimersByTimeAsync(2000)
  let unlock!: () => void
  const locked = pool.withOriginLock(
    released.origin,
    () =>
      new Promise<void>((resolve) => {
        unlock = resolve
      }),
  )
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(3000)
  pool.attachRequestToContext("new-task", released)
  unlock()
  await locked
  await vi.advanceTimersByTimeAsync(0)
  expect(cleanup).not.toHaveBeenCalled()
  expect(pool.hasContext(released.id)).toBe(true)
})

it("does not clean an already-destroyed context after waiting for an origin lock", async () => {
  const { pool, cleanup, released } = createBusyPool(true)
  await pool.releaseTempContext("released")
  await vi.advanceTimersByTimeAsync(2000)
  let unlock!: () => void
  const locked = pool.withOriginLock(
    released.origin,
    () =>
      new Promise<void>((resolve) => {
        unlock = resolve
      }),
  )
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(3000)
  await pool.destroyContext(released)
  unlock()
  await locked
  await vi.advanceTimersByTimeAsync(0)
  expect(cleanup).toHaveBeenCalledTimes(1)
})

it("keeps active tasks tracked when external idle cleanup rejects", async () => {
  const { pool, cleanup, released, busy } = createBusyPool(true)
  cleanup.mockRejectedValueOnce(new Error("browser removal failed"))
  await pool.releaseTempContext("released")
  await vi.advanceTimersByTimeAsync(5000)
  expect(pool.contexts).toEqual([busy])
  expect(pool.hasRequest("busy")).toBe(true)
  expect(logger.error).toHaveBeenCalledWith(
    "Failed to destroy idle temp context",
    expect.any(Error),
  )
  await pool.destroyContext(released)
  expect(cleanup).toHaveBeenCalledTimes(1)
})

it("moves request ownership and removes stale mappings after a browser id is reused", () => {
  const { pool, released, busy } = createBusyPool()
  pool.attachRequestToContext("released", busy)
  expect(released.activeRequestIds.size).toBe(0)
  expect(busy.activeRequestIds.has("released")).toBe(true)
  const replacement = context(busy.id)
  pool.registerContext(replacement.origin, replacement)
  pool.attachRequestToContext("replacement", replacement)
  expect(pool.clearStaleTempRequestMappings()).toBe(2)
  expect(busy.activeRequestIds.size).toBe(0)
  expect(pool.hasRequest("replacement")).toBe(true)
})
