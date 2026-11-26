import { expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { setupContentMessageHandlers } from "~/entrypoints/content/messageHandlers"
import { showAccessTokenCue } from "~/services/browsingContext/newApiAccessTokenPage/cue"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"

vi.mock("~/entrypoints/content/shared/uiRoot", () => ({
  setContentScriptContext: vi.fn(),
  ensureRedemptionToastUi: vi.fn(),
}))
vi.mock("~/services/browsingContext/newApiAccessTokenPage/cue", () => ({
  showAccessTokenCue: vi.fn(),
}))
vi.mock("~/utils/browser/runtimeMessages", async (original) => ({
  ...(await original<typeof import("~/utils/browser/runtimeMessages")>()),
  onRuntimeMessage: vi.fn(() => vi.fn()),
}))

it.each([true, false])(
  "delegates the cue and replies once (success=%s)",
  async (success) => {
    const openedSite = "https://api.example.com"
    if (success) vi.mocked(showAccessTokenCue).mockResolvedValue(undefined)
    else
      vi.mocked(showAccessTokenCue).mockRejectedValue(
        new Error("Page unavailable"),
      )
    setupContentMessageHandlers()
    const receive = vi.mocked(onRuntimeMessage).mock.lastCall![0]
    const reply = vi.fn()
    expect(
      receive(
        {
          action: RuntimeActionIds.ContentHighlightAccessTokenSection,
          openedSite,
        },
        {},
        reply,
      ),
    ).toBe(true)
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledExactlyOnceWith({ success }),
    )
    expect(showAccessTokenCue).toHaveBeenCalledExactlyOnceWith(openedSite)
  },
)
