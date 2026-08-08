import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createNewApiOwnedSessionLifecycle,
  NEW_API_OWNED_SESSION_ALARM_NAME,
  type NewApiOwnedSessionLifecycleDependencies,
} from "~/services/managedSites/newApiOwnedSession/lifecycle"

const ORIGIN = "https://managed.example"
const NOW = 1_800_000_000_000
const OWNED_RECEIPT_KEY = `${ORIGIN}\nowned-session-placeholder`

function createHarness() {
  let stored: unknown
  let currentNow = NOW
  let alarmListener: ((alarm: { name: string }) => void) | undefined
  const dependencies: NewApiOwnedSessionLifecycleDependencies = {
    now: () => currentNow,
    readStoredReceipts: vi.fn(async () => stored),
    writeStoredReceipts: vi.fn(async (value) => {
      stored = value
    }),
    createAlarm: vi.fn(async () => {}),
    clearAlarm: vi.fn(async () => true),
    onAlarm: vi.fn((listener) => {
      alarmListener = listener
      return () => {}
    }),
    reportError: vi.fn(),
    revokeSession: vi.fn(async () => ({ status: "cleaned" as const })),
  }

  return {
    dependencies,
    getStored: () => stored,
    setNow: (value: number) => {
      currentNow = value
    },
    setStored: (value: unknown) => {
      stored = value
    },
    fireAlarm: () =>
      alarmListener?.({ name: NEW_API_OWNED_SESSION_ALARM_NAME }),
  }
}

const freshBundle = (overrides: Record<string, unknown> = {}) => ({
  baseUrl: `${ORIGIN}/`,
  sessionId: "owned-session-placeholder",
  accessToken: "owned-token-placeholder",
  accessExpiresAt: Math.floor((NOW + 15 * 60_000) / 1000),
  ...overrides,
})

describe("NewApiOwnedSessionLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("persists only a fresh login bundle and schedules exact-session cleanup", async () => {
    const harness = createHarness()
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)

    await lifecycle.capture(freshBundle())

    expect(harness.getStored()).toEqual({
      version: 1,
      receipts: {
        [OWNED_RECEIPT_KEY]: expect.objectContaining({
          origin: ORIGIN,
          sessionId: "owned-session-placeholder",
          accessToken: "owned-token-placeholder",
        }),
      },
    })
    expect(harness.dependencies.createAlarm).toHaveBeenCalledWith(
      NEW_API_OWNED_SESSION_ALARM_NAME,
      { when: NOW + 10 * 60_000 },
    )
  })

  it("updates a refreshed credential only when its SID is already owned", async () => {
    const harness = createHarness()
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)
    await lifecycle.capture(freshBundle())

    await expect(
      lifecycle.refresh(
        freshBundle({
          sessionId: "borrowed-session-placeholder",
          accessToken: "borrowed-token-placeholder",
        }),
      ),
    ).resolves.toEqual({ owned: false })

    await expect(
      lifecycle.refresh(
        freshBundle({ accessToken: "rotated-token-placeholder" }),
      ),
    ).resolves.toEqual({ owned: true })
    expect(harness.getStored()).toEqual({
      version: 1,
      receipts: {
        [OWNED_RECEIPT_KEY]: expect.objectContaining({
          sessionId: "owned-session-placeholder",
          accessToken: "rotated-token-placeholder",
        }),
      },
    })
  })

  it("restores the desired alarm and cleans a due receipt after worker restart", async () => {
    const harness = createHarness()
    const firstWorker = createNewApiOwnedSessionLifecycle(harness.dependencies)
    await firstWorker.capture(freshBundle())

    const restartedDependencies = {
      ...harness.dependencies,
      now: () => NOW + 11 * 60_000,
    }
    const restartedWorker = createNewApiOwnedSessionLifecycle(
      restartedDependencies,
    )
    const initializePromise = restartedWorker.initialize()

    expect(restartedDependencies.onAlarm).toHaveBeenCalledTimes(1)
    await initializePromise
    harness.fireAlarm()
    await vi.waitFor(() => {
      expect(restartedDependencies.revokeSession).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: ORIGIN,
          sessionId: "owned-session-placeholder",
        }),
      )
    })
    await vi.waitFor(() => {
      expect(harness.getStored()).toEqual({ version: 1, receipts: {} })
    })
  })

  it("offers manual cleanup only for an owned origin and never broadens the target", async () => {
    const harness = createHarness()
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)
    await lifecycle.capture(freshBundle())

    await expect(lifecycle.getStatus(ORIGIN)).resolves.toEqual({ owned: true })
    await expect(lifecycle.cleanup(ORIGIN)).resolves.toEqual({
      status: "cleaned",
    })
    expect(harness.dependencies.revokeSession).toHaveBeenCalledTimes(1)
    expect(harness.dependencies.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "owned-session-placeholder" }),
    )
    await expect(lifecycle.getStatus(ORIGIN)).resolves.toEqual({ owned: false })
  })

  it("retains and cleans every extension-owned SID for the same origin", async () => {
    const harness = createHarness()
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)
    await lifecycle.capture(freshBundle())
    await lifecycle.capture(
      freshBundle({ sessionId: "second-owned-session-placeholder" }),
    )

    await expect(lifecycle.cleanup(ORIGIN)).resolves.toEqual({
      status: "cleaned",
    })
    expect(harness.dependencies.revokeSession).toHaveBeenCalledTimes(2)
    expect(harness.dependencies.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "owned-session-placeholder" }),
    )
    expect(harness.dependencies.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "second-owned-session-placeholder",
      }),
    )
  })

  it("retains a failed cleanup briefly for a bounded best-effort retry", async () => {
    const harness = createHarness()
    vi.mocked(harness.dependencies.revokeSession).mockResolvedValue({
      status: "retry",
    })
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)
    await lifecycle.capture(freshBundle())

    await expect(lifecycle.cleanup(ORIGIN)).resolves.toEqual({
      status: "failed",
    })
    expect(harness.getStored()).toEqual({
      version: 1,
      receipts: {
        [OWNED_RECEIPT_KEY]: expect.objectContaining({
          cleanupAt: NOW + 60_000,
        }),
      },
    })
  })

  it.each([
    ["a non-http origin", { baseUrl: "ftp://managed.example" }],
    ["a malformed origin", { baseUrl: "not a valid URL" }],
    ["an empty SID", { sessionId: "  " }],
    ["an empty access token", { accessToken: "  " }],
    ["a non-finite expiry", { accessExpiresAt: Number.NaN }],
  ])("ignores %s without mutating storage", async (_label, overrides) => {
    const harness = createHarness()
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)

    await lifecycle.capture(freshBundle(overrides))

    expect(harness.dependencies.writeStoredReceipts).not.toHaveBeenCalled()
    expect(harness.getStored()).toBeUndefined()
  })

  it("normalizes invalid persisted state before scheduling", async () => {
    const harness = createHarness()
    harness.setStored({ version: 2, receipts: { stale: {} } })
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)

    await lifecycle.initialize()

    expect(harness.dependencies.clearAlarm).toHaveBeenCalledWith(
      NEW_API_OWNED_SESSION_ALARM_NAME,
    )
    expect(harness.dependencies.createAlarm).not.toHaveBeenCalled()
  })

  it("touches only the requested owned SID", async () => {
    const harness = createHarness()
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)
    await lifecycle.capture(freshBundle())

    await expect(lifecycle.touch("ftp://managed.example")).resolves.toEqual({
      owned: false,
    })
    await expect(
      lifecycle.touch(ORIGIN, "borrowed-session-placeholder"),
    ).resolves.toEqual({ owned: false })

    harness.setNow(NOW + 1_000)
    await expect(
      lifecycle.touch(ORIGIN, "owned-session-placeholder"),
    ).resolves.toEqual({ owned: true })
    expect(harness.getStored()).toEqual({
      version: 1,
      receipts: {
        [OWNED_RECEIPT_KEY]: expect.objectContaining({
          lastUsedAt: NOW + 1_000,
          cleanupAt: NOW + 1_000 + 10 * 60_000,
        }),
      },
    })
  })

  it("deletes a receipt when exact cleanup authentication is unavailable", async () => {
    const harness = createHarness()
    vi.mocked(harness.dependencies.revokeSession).mockResolvedValue({
      status: "unavailable",
    })
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)
    await lifecycle.capture(freshBundle())

    await expect(lifecycle.cleanup(ORIGIN)).resolves.toEqual({
      status: "failed",
    })
    expect(harness.getStored()).toEqual({ version: 1, receipts: {} })
  })

  it("stops retrying when the next cleanup would exceed credential expiry", async () => {
    const harness = createHarness()
    vi.mocked(harness.dependencies.revokeSession).mockResolvedValue({
      status: "retry",
    })
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)
    await lifecycle.capture(
      freshBundle({ accessExpiresAt: Math.floor((NOW + 30_000) / 1000) }),
    )

    await expect(lifecycle.cleanup(ORIGIN)).resolves.toEqual({
      status: "failed",
    })
    expect(harness.getStored()).toEqual({ version: 1, receipts: {} })
  })

  it("continues alarm cleanup when one revoke dependency rejects", async () => {
    const harness = createHarness()
    const lifecycle = createNewApiOwnedSessionLifecycle(harness.dependencies)
    await lifecycle.initialize()
    await lifecycle.capture(freshBundle())
    await lifecycle.capture(
      freshBundle({ sessionId: "second-owned-session-placeholder" }),
    )
    vi.mocked(harness.dependencies.revokeSession)
      .mockRejectedValueOnce(new Error("transport escaped adapter"))
      .mockResolvedValue({ status: "cleaned" })
    harness.setNow(NOW + 11 * 60_000)

    harness.fireAlarm()

    await vi.waitFor(() => {
      expect(harness.dependencies.revokeSession).toHaveBeenCalledTimes(2)
    })
    await vi.waitFor(() => {
      expect(harness.dependencies.reportError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "transport escaped adapter" }),
      )
    })
    expect(harness.getStored()).toEqual({
      version: 1,
      receipts: {
        [OWNED_RECEIPT_KEY]: expect.objectContaining({
          cleanupAt: NOW + 12 * 60_000,
        }),
      },
    })
  })
})
