import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { showGitHubFeedbackHint } from "~/services/checkin/feedback/githubHint"
import { sendRuntimeActionMessage } from "~/utils/browser/runtimeMessages"

vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeActionMessage: vi.fn().mockResolvedValue({ success: true }),
}))
const options = {
  title: "Report copied",
  description: "Paste the full report",
  dismiss: "Close",
  targetUrl: "https://github.com/qixing-jk/all-api-hub/issues/new",
  expiresAt: Date.now() + 60_000,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("location", new URL(options.targetUrl))
})
afterEach(() => vi.unstubAllGlobals())
it("uses the existing content notification API with a dismiss action and stable toast ID", async () => {
  const notify = { info: vi.fn(), dismiss: vi.fn() }
  expect(showGitHubFeedbackHint(options, notify)).toBe(true)
  expect(notify.info).toHaveBeenCalledWith(
    options.description,
    expect.objectContaining({
      id: "checkin-feedback-paste",
      title: options.title,
      action: expect.objectContaining({ label: options.dismiss }),
    }),
  )
  const payload = notify.info.mock.calls[0]![1]
  await payload.action.onClick()
  expect(sendRuntimeActionMessage).toHaveBeenCalledWith(
    { action: RuntimeActionIds.DismissCheckInFeedbackHint },
    { maxAttempts: 1 },
  )
  expect(notify.dismiss).toHaveBeenCalledWith("checkin-feedback-paste")
  notify.info.mockClear()
  expect(showGitHubFeedbackHint(options, notify)).toBe(false)
  expect(notify.info).not.toHaveBeenCalled()
})
it("does not notify on login, unrelated pages or an expired session", () => {
  const notify = { info: vi.fn(), dismiss: vi.fn() }
  for (const url of [
    "https://github.com/login",
    "https://github.com/other/repo/issues/new",
    "https://github.example/qixing-jk/all-api-hub/issues/new",
  ]) {
    vi.stubGlobal("location", new URL(url))
    expect(showGitHubFeedbackHint(options, notify)).toBe(false)
  }
  vi.stubGlobal("location", new URL(options.targetUrl))
  expect(
    showGitHubFeedbackHint({ ...options, expiresAt: Date.now() - 1 }, notify),
  ).toBe(false)
  expect(notify.info).not.toHaveBeenCalled()
})

it("withdraws a previous notice on route changes without dismissing the feedback session", () => {
  const notify = { info: vi.fn(), dismiss: vi.fn() }
  vi.stubGlobal(
    "location",
    new URL("https://github.com/qixing-jk/all-api-hub/issues/123"),
  )
  expect(showGitHubFeedbackHint({ ...options, withdraw: true }, notify)).toBe(
    true,
  )
  expect(notify.dismiss).toHaveBeenCalledWith("checkin-feedback-paste")
  expect(notify.info).not.toHaveBeenCalled()
  expect(sendRuntimeActionMessage).not.toHaveBeenCalled()
})
