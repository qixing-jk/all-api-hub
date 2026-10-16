import { renderHook, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  UI_HANDOFF_RECEIVE_RESULTS,
  useUiHandoffReceiver,
  type UiHandoffReceiveResult,
} from "~/hooks/useUiHandoffReceiver"
import { createUiHandoffChannel } from "~/services/uiHandoff"

const channel = createUiHandoffChannel({
  draftPrefix: "receiver-draft:",
  pendingPrefix: "receiver-pending:",
  lockName: "receiver-handoff",
  ttlMs: 60_000,
  normalize: (value: unknown) => (typeof value === "string" ? value : null),
})

describe("shared UI handoff receiver", () => {
  beforeEach(async () => {
    await browser.storage.session.clear()
    vi.spyOn(browser.tabs, "query").mockResolvedValue([
      { id: 1, windowId: 2 },
    ] as browser.tabs.Tab[])
  })
  afterEach(() => vi.restoreAllMocks())

  it("retains a busy form and retries after the receiver becomes available, including Strict Mode", async () => {
    const id = await channel.prepare("retained", 2)
    await channel.publish(id, 2)
    const receive = vi.fn(
      (_value: string) =>
        UI_HANDOFF_RECEIVE_RESULTS.Busy as UiHandoffReceiveResult,
    )
    const failure = vi.fn()
    const { rerender } = renderHook(
      ({ ready }) =>
        useUiHandoffReceiver({
          enabled: true,
          channel,
          onReceive: ready
            ? (value) => {
                receive(value)
                return UI_HANDOFF_RECEIVE_RESULTS.Accepted
              }
            : receive,
          onFailure: failure,
        }),
      { initialProps: { ready: false }, wrapper: StrictMode },
    )
    await waitFor(() => expect(failure).toHaveBeenCalledWith("busy"))
    expect(await channel.getPending(2)).toBe(id)
    rerender({ ready: true })
    await waitFor(async () => expect(await channel.getPending(2)).toBeNull())
    expect(receive).toHaveBeenCalledWith("retained")
  })
})
