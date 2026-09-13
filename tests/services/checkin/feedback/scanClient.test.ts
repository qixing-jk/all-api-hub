import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { collectCheckInFeedbackClues } from "~/services/checkin/feedback/scan"
import { collectFeedbackCluesInBrowser } from "~/services/checkin/feedback/scanClient"
import { FEEDBACK_SCAN_SESSION_TIMEOUT_MS } from "~/services/checkin/feedback/scanTypes"
import { AuthTypeEnum } from "~/types"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  executeProtectionBypassTask: vi.fn(),
}))
vi.mock("~/utils/browser/browserApi", () => ({
  sendRuntimeMessage: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("~/utils/browser/tempWindowRequestSource", () => ({
  getCurrentTempWindowRequestSource: () => "options",
}))
vi.mock("~/services/checkin/feedback/scan", () => ({
  collectCheckInFeedbackClues: vi.fn(),
}))

const input = {
  baseUrl: "https://example.com/path?private=value",
  siteType: SITE_TYPES.NEW_API,
}
const clues = {
  status: "completed" as const,
  statusQueries: [],
  routes: ["/api/checkin"],
  authenticatedQueriesUnavailable: false,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(collectCheckInFeedbackClues).mockResolvedValue(clues)
})
afterEach(() => vi.useRealTimers())

describe("feedback browser scan", () => {
  it("avoids a browser task for an invalid origin", async () => {
    expect(
      await collectFeedbackCluesInBrowser(
        { ...input, baseUrl: "invalid" },
        new AbortController().signal,
      ),
    ).toEqual(clues)
    expect(executeProtectionBypassTask).not.toHaveBeenCalled()
  })

  it("omits an absent user ID from the selected token envelope", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: clues,
    })
    await collectFeedbackCluesInBrowser(
      {
        ...input,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "selected" },
      },
      new AbortController().signal,
    )
    const auth = vi.mocked(executeProtectionBypassTask).mock.calls[0][0].task
    expect(auth).toMatchObject({
      params: { input: { auth: { accessToken: "selected" } } },
    })
    expect(JSON.stringify(auth)).not.toContain("userId")
  })

  it("prefers a protected page with a feedback command and copies only the selected token fields", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: clues,
    })
    expect(
      await collectFeedbackCluesInBrowser(
        {
          ...input,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "selected",
            refreshToken: "never-copy",
            cookie: "never-copy",
            userId: 42,
          },
        },
        new AbortController().signal,
      ),
    ).toEqual(clues)
    expect(executeProtectionBypassTask).toHaveBeenCalledWith(
      expect.objectContaining({
        execution: expect.objectContaining({
          command: "checkin_feedback",
          surface: "options",
        }),
        task: expect.objectContaining({
          kind: "checkin_feedback_scan",
          params: expect.objectContaining({
            originUrl: "https://example.com",
            input: {
              baseUrl: "https://example.com",
              siteType: SITE_TYPES.NEW_API,
              auth: {
                authType: AuthTypeEnum.AccessToken,
                accessToken: "selected",
                userId: 42,
              },
            },
          }),
        }),
      }),
    )
    expect(collectCheckInFeedbackClues).not.toHaveBeenCalled()
  })

  it("falls back to bounded direct reads when a temporary page is unavailable", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({ success: false })
    expect(
      await collectFeedbackCluesInBrowser(input, new AbortController().signal),
    ).toEqual(clues)
    expect(collectCheckInFeedbackClues).toHaveBeenCalledOnce()
  })

  it("cancels the remote request without falling back or waiting for a late result", async () => {
    vi.mocked(sendRuntimeMessage).mockRejectedValueOnce(
      new Error("port closed"),
    )
    const remote = createDeferred<any>()
    vi.mocked(executeProtectionBypassTask).mockReturnValue(remote.promise)
    const controller = new AbortController()
    const pending = collectFeedbackCluesInBrowser(input, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow("scan_cancelled")
    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancelCheckinFeedbackScan" }),
    )
    expect(collectCheckInFeedbackClues).not.toHaveBeenCalled()
    remote.resolve({ success: true, data: clues })
  })

  it("caps the complete browser workflow instead of starting a fresh fallback after its deadline", async () => {
    vi.useFakeTimers()
    vi.mocked(executeProtectionBypassTask).mockReturnValue(
      new Promise(() => {}),
    )
    const pending = collectFeedbackCluesInBrowser(
      input,
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(FEEDBACK_SCAN_SESSION_TIMEOUT_MS)
    expect((await pending).issues).toEqual(["task_timeout"])
    expect(collectCheckInFeedbackClues).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
