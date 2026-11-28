import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { collectCheckInEvidence } from "~/services/checkin/discovery/evidence/scan"
import { collectCheckInEvidenceInBrowser } from "~/services/checkin/discovery/evidence/scanClient"
import {
  CHECK_IN_EVIDENCE_SCAN_PURPOSES,
  CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS,
  FEEDBACK_SCAN_STATUSES,
  type CheckInEvidence,
} from "~/services/checkin/discovery/evidence/scanTypes"
import { AuthTypeEnum } from "~/types"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  executeProtectionBypassTask: vi.fn(),
}))
vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeMessage: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("~/utils/browser/tempWindowRequestSource", () => ({
  getCurrentTempWindowRequestSource: () => "options",
}))
vi.mock("~/services/checkin/discovery/evidence/scan", () => ({
  collectCheckInEvidence: vi.fn(),
}))

const input = {
  baseUrl: "https://example.com/path?private=value",
  siteType: SITE_TYPES.NEW_API,
}
const clues = {
  status: FEEDBACK_SCAN_STATUSES.Completed,
  statusQueries: [],
  routes: ["/api/checkin"],
  authenticatedQueriesUnavailable: false,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(collectCheckInEvidence).mockResolvedValue(clues)
})
afterEach(() => vi.useRealTimers())

describe("feedback browser scan", () => {
  it("keeps native page evidence requests free of account credentials and API routes", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: clues,
    })
    await collectCheckInEvidenceInBrowser(
      {
        ...input,
        purpose: CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "selected" },
        routePaths: ["/api/user/daily-custom"],
      },
      new AbortController().signal,
    )
    expect(executeProtectionBypassTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({
          params: expect.objectContaining({
            input: {
              baseUrl: "https://example.com",
              siteType: SITE_TYPES.NEW_API,
              purpose: CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage,
            },
          }),
        }),
      }),
    )
  })

  it("forwards configured routes to the protected diagnostic scan", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: clues,
    })
    await collectCheckInEvidenceInBrowser(
      {
        ...input,
        routePaths: ["/api/user/daily-custom"],
        nativePagePath: "/invite?tab=daily#/claim",
      },
      new AbortController().signal,
    )
    expect(executeProtectionBypassTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({
          params: expect.objectContaining({
            input: {
              baseUrl: "https://example.com",
              siteType: SITE_TYPES.NEW_API,
              routePaths: ["/api/user/daily-custom"],
              nativePagePath: "/invite?tab=daily#/claim",
            },
          }),
        }),
      }),
    )
  })
  it("avoids a browser task for an invalid origin", async () => {
    expect(
      await collectCheckInEvidenceInBrowser(
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
    await collectCheckInEvidenceInBrowser(
      {
        ...input,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "selected" },
      },
      new AbortController().signal,
    )
    const auth = atIndex(
      vi.mocked(executeProtectionBypassTask).mock.calls,
      0,
    )[0].task
    expect(auth).toMatchObject({
      params: { input: { auth: { accessToken: "selected" } } },
    })
    expect(JSON.stringify(auth)).not.toContain("userId")
  })

  it("preserves an authenticated feedback scan's empty token without inventing credentials", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: clues,
    })
    await collectCheckInEvidenceInBrowser(
      { ...input, auth: { authType: AuthTypeEnum.AccessToken } },
      new AbortController().signal,
    )
    expect(executeProtectionBypassTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({
          params: expect.objectContaining({
            input: {
              baseUrl: "https://example.com",
              siteType: SITE_TYPES.NEW_API,
              auth: { authType: AuthTypeEnum.AccessToken, accessToken: "" },
            },
          }),
        }),
      }),
    )
  })

  it("prefers a protected page with a feedback command and copies only the selected token fields", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: clues,
    })
    expect(
      await collectCheckInEvidenceInBrowser(
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
    expect(collectCheckInEvidence).not.toHaveBeenCalled()
  })

  it("falls back to bounded direct reads when a temporary page is unavailable", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({ success: false })
    expect(
      await collectCheckInEvidenceInBrowser(
        input,
        new AbortController().signal,
      ),
    ).toEqual(clues)
    expect(collectCheckInEvidence).toHaveBeenCalledOnce()
  })

  it("cancels the remote request without falling back or waiting for a late result", async () => {
    vi.mocked(sendRuntimeMessage).mockRejectedValueOnce(
      new Error("port closed"),
    )
    const remote = createDeferred<{
      success: boolean
      data?: CheckInEvidence
    }>()
    vi.mocked(executeProtectionBypassTask).mockReturnValue(remote.promise)
    const controller = new AbortController()
    const pending = collectCheckInEvidenceInBrowser(input, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow("scan_cancelled")
    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancelCheckinFeedbackScan" }),
    )
    expect(collectCheckInEvidence).not.toHaveBeenCalled()
    remote.resolve({ success: true, data: clues })
  })

  it("caps the complete browser workflow instead of starting a fresh fallback after its deadline", async () => {
    vi.useFakeTimers()
    vi.mocked(executeProtectionBypassTask).mockReturnValue(
      new Promise(() => {}),
    )
    const pending = collectCheckInEvidenceInBrowser(
      input,
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS)
    expect((await pending).issues).toEqual(["task_timeout"])
    expect(collectCheckInEvidence).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
