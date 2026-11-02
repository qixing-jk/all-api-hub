import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  CHECKIN_FEEDBACK_ISSUE_LIMITS,
  CHECKIN_FEEDBACK_ISSUE_URL,
} from "~/services/checkin/feedback/githubIssue"
import {
  openCheckInFeedbackIssueTab,
  setupCheckInFeedbackTabHints,
} from "~/services/checkin/feedback/githubTab"

const url = `${CHECKIN_FEEDBACK_ISSUE_URL}?template=checkin_adaptation.yml`
const hint = {
  title: "Report copied",
  description: "Paste the full report before submitting",
  dismiss: "Close",
}
let values: Record<string, unknown>
let updated: (id: number, change: unknown, tab: unknown) => void
let removed: (id: number) => void
let cleanup: (() => void) | undefined
beforeEach(() => {
  values = {}
  vi.stubGlobal("browser", {
    tabs: {
      sendMessage: vi.fn().mockResolvedValue({ presented: true }),
      create: vi.fn().mockResolvedValue({ id: 73 }),
      update: vi.fn().mockImplementation(async () => {
        expect(Object.keys(values)).toHaveLength(1)
        return { id: 73, url }
      }),
      onUpdated: {
        addListener: vi.fn((fn) => {
          updated = fn
        }),
        removeListener: vi.fn(),
      },
      onRemoved: {
        addListener: vi.fn((fn) => {
          removed = fn
        }),
        removeListener: vi.fn(),
      },
    },
    storage: {
      session: {
        get: vi.fn(async (key: string) => ({ [key]: values[key] })),
        set: vi.fn(async (next) => {
          Object.assign(values, next)
        }),
        remove: vi.fn(async (key: string) => {
          delete values[key]
        }),
      },
    },
  })
})
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("GitHub feedback tab guidance", () => {
  it("rejects malformed URLs and missing tab IDs before arming guidance", async () => {
    await expect(openCheckInFeedbackIssueTab("invalid", hint)).rejects.toThrow(
      "Invalid feedback",
    )
    vi.mocked(browser.tabs.create).mockResolvedValueOnce({} as browser.tabs.Tab)
    await expect(openCheckInFeedbackIssueTab(url, hint)).rejects.toThrow(
      "not created",
    )
    expect(Object.keys(values)).toHaveLength(0)
    expect(browser.tabs.update).not.toHaveBeenCalled()
  })

  it("clears the armed hint when navigation fails", async () => {
    vi.mocked(browser.tabs.update).mockRejectedValueOnce(
      new Error("navigation failed"),
    )
    await expect(openCheckInFeedbackIssueTab(url, hint)).rejects.toThrow(
      "navigation failed",
    )
    expect(Object.keys(values)).toHaveLength(0)
  })

  it("ignores incomplete or unrelated updates and accepts composer URL changes", async () => {
    cleanup = setupCheckInFeedbackTabHints()
    await openCheckInFeedbackIssueTab(url, hint)
    updated(73, { status: "loading" }, { url })
    updated(73, { status: "complete" }, {})
    updated(73, { url: "invalid" }, {})
    updated(73, { url: "https://example.com/" }, {})
    await Promise.resolve()
    expect(browser.storage.session.get).not.toHaveBeenCalled()
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled()
    updated(73, { url }, {})
    await vi.waitFor(() =>
      expect(browser.tabs.sendMessage).toHaveBeenCalledOnce(),
    )
  })

  it("arms only the created tab before navigation and restores its hint after login", async () => {
    cleanup = setupCheckInFeedbackTabHints()
    await openCheckInFeedbackIssueTab(url, hint)
    expect(browser.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: "about:blank", active: false }),
    )
    expect(browser.tabs.update).toHaveBeenCalledWith(73, { url, active: true })
    updated(73, { status: "complete" }, { url: "https://github.com/login" })
    updated(74, { status: "complete" }, { url })
    await vi.waitFor(() =>
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        73,
        expect.objectContaining({
          hint: expect.objectContaining({ withdraw: true }),
        }),
        { frameId: 0 },
      ),
    )
    vi.mocked(browser.tabs.sendMessage).mockClear()
    updated(73, { status: "complete" }, { url })
    await vi.waitFor(() =>
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        73,
        expect.objectContaining({
          action: RuntimeActionIds.ContentCheckInFeedbackHint,
        }),
        { frameId: 0 },
      ),
    )
  })
  it("retains tab guidance across worker restart and clears closed or expired tabs", async () => {
    cleanup = setupCheckInFeedbackTabHints()
    await openCheckInFeedbackIssueTab(url, hint)
    cleanup()
    cleanup = setupCheckInFeedbackTabHints()
    updated(73, { status: "complete" }, { url })
    await vi.waitFor(() =>
      expect(browser.tabs.sendMessage).toHaveBeenCalledOnce(),
    )
    removed(73)
    await vi.waitFor(() => expect(Object.keys(values)).toHaveLength(0))
    await openCheckInFeedbackIssueTab(url, hint)
    vi.spyOn(Date, "now").mockReturnValue(
      Date.now() + CHECKIN_FEEDBACK_ISSUE_LIMITS.hintLifetimeMs + 1,
    )
    updated(73, { status: "complete" }, { url })
    await vi.waitFor(() => expect(Object.keys(values)).toHaveLength(0))
    expect(browser.tabs.sendMessage).toHaveBeenCalledOnce()
  })

  it("keeps the tab usable if injection fails and retries on its next page update", async () => {
    cleanup = setupCheckInFeedbackTabHints()
    await openCheckInFeedbackIssueTab(url, hint)
    vi.mocked(browser.tabs.sendMessage).mockRejectedValueOnce(
      new Error("Host access denied"),
    )
    updated(73, { status: "complete" }, { url })
    await vi.waitFor(() =>
      expect(browser.tabs.sendMessage).toHaveBeenCalledOnce(),
    )
    expect(Object.keys(values)).toHaveLength(1)
    updated(73, { status: "complete" }, { url })
    await vi.waitFor(() =>
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2),
    )
  })

  it("rejects unrelated destinations and still navigates if session storage is unavailable", async () => {
    await expect(
      openCheckInFeedbackIssueTab("https://example.com/issues/new", hint),
    ).rejects.toThrow()
    expect(browser.tabs.create).not.toHaveBeenCalled()
    vi.mocked(browser.storage.session.set).mockRejectedValueOnce(
      new Error("unavailable"),
    )
    vi.mocked(browser.tabs.update).mockResolvedValueOnce({
      id: 73,
    } as browser.tabs.Tab)
    await openCheckInFeedbackIssueTab(url, hint)
    expect(browser.tabs.update).toHaveBeenCalledWith(73, { url, active: true })
  })
  it("withdraws the standard notice and ends guidance after the tab reaches a submitted issue", async () => {
    cleanup = setupCheckInFeedbackTabHints()
    await openCheckInFeedbackIssueTab(url, hint)
    updated(73, { status: "complete" }, { url })
    await vi.waitFor(() =>
      expect(browser.tabs.sendMessage).toHaveBeenCalledOnce(),
    )
    updated(
      73,
      { status: "complete" },
      { url: "https://github.com/qixing-jk/all-api-hub/issues/123" },
    )
    await vi.waitFor(() => expect(Object.keys(values)).toHaveLength(0))
    await vi.waitFor(() =>
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2),
    )
    expect(browser.tabs.sendMessage).toHaveBeenLastCalledWith(
      73,
      expect.objectContaining({
        hint: expect.objectContaining({ withdraw: true }),
      }),
      { frameId: 0 },
    )
    updated(73, { status: "complete" }, { url })
    expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2)
  })
})
