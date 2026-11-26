import { expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { setupContentMessageHandlers } from "~/entrypoints/content/messageHandlers"
import * as tokenContent from "~/services/apiService/newApiFamily/accessTokens/content"
import { NewApiTokenSessionError } from "~/services/apiService/newApiFamily/accessTokens/sessionError"
import { showAccessTokenCue } from "~/services/browsingContext/newApiAccessTokenPage/cue"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"

vi.mock("~/entrypoints/content/shared/uiRoot", () => ({
  setContentScriptContext: vi.fn(),
  ensureRedemptionToastUi: vi.fn(),
}))
vi.mock("~/services/browsingContext/newApiAccessTokenPage/cue", () => ({
  showAccessTokenCue: vi.fn(),
}))
vi.mock("~/services/apiService/newApiFamily/accessTokens/content", () => ({
  cancelNewApiTokenPasskey: vi.fn(),
  prepareNewApiTokenSession: vi.fn(),
  requestNewApiTokenPasskey: vi.fn(),
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

it.each(["success", "identity-mismatch", "unexpected"] as const)(
  "replies to token session preparation with %s",
  async (outcome) => {
    const prepare = vi.mocked(tokenContent.prepareNewApiTokenSession)
    const session = {
      token: "session",
      user: { id: 42 },
      sessionId: "sid",
      expiresAt: 42,
    }
    if (outcome === "success") prepare.mockResolvedValueOnce(session)
    else
      prepare.mockRejectedValueOnce(
        outcome === "identity-mismatch"
          ? new NewApiTokenSessionError("ACCOUNT_IDENTITY_MISMATCH")
          : new Error("private site detail"),
      )
    setupContentMessageHandlers()
    const receive = vi.mocked(onRuntimeMessage).mock.lastCall![0]
    const reply = vi.fn()
    expect(
      receive(
        {
          action: RuntimeActionIds.ContentPrepareNewApiTokenSession,
          expectedOrigin: "https://api.example.com",
          expectedIdentity: "42",
        },
        {},
        reply,
      ),
    ).toBe(true)
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledExactlyOnceWith(
        outcome === "success"
          ? { success: true, data: session }
          : outcome === "identity-mismatch"
            ? { success: false, code: "ACCOUNT_IDENTITY_MISMATCH" }
            : { success: false },
      ),
    )
    expect(prepare).toHaveBeenCalledWith("https://api.example.com", "42")
  },
)

it("routes passkey requests and cancellation to the owning content operation", async () => {
  const request = vi
    .mocked(tokenContent.requestNewApiTokenPasskey)
    .mockResolvedValueOnce(null)
  const cancel = vi.mocked(tokenContent.cancelNewApiTokenPasskey)
  setupContentMessageHandlers()
  const receive = vi.mocked(onRuntimeMessage).mock.lastCall![0]
  const reply = vi.fn()
  const expectedOrigin = "https://api.example.com"
  const requestId = "owned-request"
  const options = { publicKey: {} }
  expect(
    receive(
      {
        action: RuntimeActionIds.ContentNewApiTokenPasskey,
        expectedOrigin,
        requestId,
        options,
      },
      {},
      reply,
    ),
  ).toBe(true)
  await vi.waitFor(() =>
    expect(reply).toHaveBeenCalledWith({ success: true, data: null }),
  )
  expect(request).toHaveBeenCalledWith(expectedOrigin, options, requestId)
  expect(
    receive(
      {
        action: RuntimeActionIds.ContentCancelNewApiTokenPasskey,
        expectedOrigin,
        requestId,
      },
      {},
      reply,
    ),
  ).toBe(true)
  await vi.waitFor(() =>
    expect(reply).toHaveBeenLastCalledWith({ success: true }),
  )
  expect(cancel).toHaveBeenCalledExactlyOnceWith(expectedOrigin, requestId)
})
