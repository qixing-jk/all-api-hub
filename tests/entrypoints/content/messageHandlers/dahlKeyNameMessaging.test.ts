import { expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { setupContentMessageHandlers } from "~/entrypoints/content/messageHandlers"
import { synchronizeDahlWebsiteKeyNames } from "~/services/apiService/dahl/keyNamePage"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"

vi.mock("~/entrypoints/content/shared/uiRoot", () => ({
  setContentScriptContext: vi.fn(),
  ensureRedemptionToastUi: vi.fn(),
}))
vi.mock("~/services/apiService/dahl/keyNamePage", () => ({
  synchronizeDahlWebsiteKeyNames: vi.fn(),
}))
vi.mock("~/utils/browser/runtimeMessages", async (original) => ({
  ...(await original<typeof import("~/utils/browser/runtimeMessages")>()),
  onRuntimeMessage: vi.fn(() => vi.fn()),
}))

it.each([true, false])(
  "keeps the Dahl naming message port open and replies once (success=%s)",
  async (success) => {
    const command = {
      action: RuntimeActionIds.ContentSyncDahlKeyNames,
      expectedUserId: "uuid-example",
      keyIds: [7],
      pendingLabels: { "7": "Work" },
    }
    const result = {
      success: true,
      userId: "uuid-example",
      labels: { "7": "Work" },
    }
    if (success)
      vi.mocked(synchronizeDahlWebsiteKeyNames).mockResolvedValue(result)
    else
      vi.mocked(synchronizeDahlWebsiteKeyNames).mockRejectedValue(
        new Error("Unavailable page"),
      )
    setupContentMessageHandlers()
    const receive = vi.mocked(onRuntimeMessage).mock.lastCall![0]
    const reply = vi.fn()
    expect(receive(command, {}, reply)).toBe(true)
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledExactlyOnceWith(
        success ? result : { success: false },
      ),
    )
    expect(synchronizeDahlWebsiteKeyNames).toHaveBeenCalledWith(command)
  },
)
