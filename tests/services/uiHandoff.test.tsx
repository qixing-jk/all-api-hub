import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createUiHandoffChannel } from "~/services/uiHandoff"

const channel = createUiHandoffChannel({
  draftPrefix: "test-ui-draft:",
  pendingPrefix: "test-ui-pending:",
  lockName: "test-ui-handoff",
  ttlMs: 60_000,
  normalize: (value: unknown) => (typeof value === "string" ? value : null),
})

describe("UI handoff channel", () => {
  beforeEach(async () => {
    await browser.storage.session.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  it("rejects invalid handoff state and window IDs before writing storage", async () => {
    await expect(channel.prepare(null as unknown as string, 2)).rejects.toThrow(
      "Invalid UI handoff",
    )
    await expect(channel.prepare("valid", 2.5)).rejects.toThrow(
      "Invalid UI handoff",
    )
    expect(await browser.storage.session.get(null)).toEqual({})
  })

  it.each([
    { version: 2 },
    { windowId: "2" },
    { windowId: 2.5 },
    { createdAt: "100000" },
    { createdAt: 100_001 },
    { createdAt: 39_999 },
    { state: null },
  ])(
    "rejects and clears malformed or stale envelopes: %j",
    async (override) => {
      vi.spyOn(Date, "now").mockReturnValue(100_000)
      const id = await channel.prepare("valid", 2)
      await channel.publish(id, 2)
      await browser.storage.session.set({
        [`test-ui-draft:${id}`]: {
          version: 1,
          createdAt: 100_000,
          windowId: 2,
          state: "valid",
          ...override,
        },
      })
      const accept = vi.fn(() => true)
      expect(await channel.receive(id, accept, 2)).toBe(false)
      expect(accept).not.toHaveBeenCalled()
      expect(await channel.getPending(2)).toBeNull()
      expect(await browser.storage.session.get(`test-ui-draft:${id}`)).toEqual(
        {},
      )
    },
  )

  it("accepts an envelope at its exact TTL boundary", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000)
    const id = await channel.prepare("valid", 2)
    await channel.publish(id, 2)
    vi.mocked(Date.now).mockReturnValue(160_000)
    const accept = vi.fn(() => true)
    expect(await channel.receive(id, accept, 2)).toBe(true)
    expect(accept).toHaveBeenCalledExactlyOnceWith("valid")
  })

  it("releases an expired signal so later setup is not blocked indefinitely", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000)
    const expired = await channel.prepare("expired", 2)
    await channel.publish(expired, 2)
    vi.mocked(Date.now).mockReturnValue(160_001)
    const next = await channel.prepare("next", 2)
    expect(await channel.publish(next, 2)).toBe(true)
    expect(await channel.receive(expired, () => true)).toBe(false)
    const accept = vi.fn(() => true)
    expect(await channel.receive(next, accept, 2)).toBe(true)
    expect(accept).toHaveBeenCalledExactlyOnceWith("next")
  })

  it("keeps a busy window's request and delivers both intents exactly once", async () => {
    const first = await channel.prepare("first", 2)
    const second = await channel.prepare("second", 2)
    expect(await channel.publish(first, 2)).toBe(true)
    expect(await channel.publish(second, 2)).toBe(false)
    expect(await channel.receive(first, () => true, 5)).toBe(false)
    expect(await channel.receive(first, () => false, 2)).toBe(false)
    const accept = vi.fn(() => true)
    expect(await channel.receive(first, accept, 2)).toBe(true)
    expect(await channel.receive(first, accept, 2)).toBe(false)
    expect(accept).toHaveBeenCalledExactlyOnceWith("first")
    expect(await channel.receive(second, accept)).toBe(true)
  })
})
