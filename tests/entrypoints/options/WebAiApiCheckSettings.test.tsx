import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, expect, it, vi } from "vitest"

import WebAiApiCheckSettings from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSettings"
import toast from "~/lib/notify"
import { buildUserPreferences } from "~~/tests/test-utils/factories"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const { context, update, reset } = vi.hoisted(() => ({
  context: vi.fn(),
  update: vi.fn(),
  reset: vi.fn(),
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: ReactNode }) => children,
  useUserPreferencesContext: () => context(),
}))
vi.mock("~/lib/notify", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))
beforeEach(() => {
  vi.clearAllMocks()
  const preferences = buildUserPreferences()
  update.mockResolvedValue({ ok: true, preferences })
  reset.mockResolvedValue({ ok: true, preferences })
  context.mockReturnValue({
    preferences,
    updateWebAiApiCheck: update,
    resetWebAiApiCheckConfig: reset,
    mutateWebAiApiCheckSiteRules: vi.fn(),
  })
})

it("summarizes many malformed cleanup expressions without saving them", () => {
  render(<WebAiApiCheckSettings />)
  const input = screen.getByPlaceholderText(
    "webAiApiCheck:settings.keyCleanup.patternsPlaceholder",
  )
  fireEvent.change(input, {
    target: {
      value: Array.from({ length: 11 }, (_, i) => `[broken${i}`).join("\n"),
    },
  })
  fireEvent.blur(input)
  expect(screen.getAllByRole("listitem")).toHaveLength(10)
  expect(
    screen.getByText("webAiApiCheck:settings.keyCleanup.invalidMore"),
  ).toBeVisible()
  expect(update).not.toHaveBeenCalled()
})

it("keeps primary settings directly visible without an idle saved label", () => {
  render(<WebAiApiCheckSettings />)
  expect(
    screen.getByText("webAiApiCheck:settings.siteRules.whitelist"),
  ).toBeVisible()
  expect(
    screen.getByText("webAiApiCheck:settings.siteRules.blacklist"),
  ).toBeVisible()
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(
    screen.getByPlaceholderText(
      "webAiApiCheck:settings.keyCleanup.patternsPlaceholder",
    ),
  ).toBeVisible()
  expect(
    screen.getByRole("textbox", {
      name: "webAiApiCheck:settings.siteRules.preview",
    }),
  ).toBeVisible()
  expect(
    screen.queryByText("webAiApiCheck:settings.saved"),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole("switch", {
      name: "webAiApiCheck:settings.autoDetect.enhanced.enable",
    }),
  ).toBeVisible()
})

it("saves immediate controls without a success toast and reports failures", async () => {
  const user = userEvent.setup()
  render(<WebAiApiCheckSettings />)
  await user.click(
    screen.getByRole("switch", {
      name: "webAiApiCheck:settings.autoDetect.enable",
    }),
  )
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({ autoDetect: { enabled: false } }),
  )
  expect(toast.success).not.toHaveBeenCalled()
  update.mockResolvedValueOnce({ ok: false, reason: { type: "storage-error" } })
  await user.click(
    screen.getByRole("switch", {
      name: "webAiApiCheck:settings.contextMenu.enable",
    }),
  )
  await waitFor(() => expect(toast.error).toHaveBeenCalled())
})

it("shows cleanup directly, saves on blur and rejects unsafe expressions", async () => {
  render(<WebAiApiCheckSettings />)
  const input = screen.getByPlaceholderText(
    "webAiApiCheck:settings.keyCleanup.patternsPlaceholder",
  )
  expect(input).toBeVisible()
  fireEvent.change(input, { target: { value: "(a+)+$" } })
  fireEvent.blur(input)
  expect(update).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: " safe-prefix " } })
  fireEvent.blur(input)
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      keyCleanup: { removalPatterns: ["safe-prefix"] },
    }),
  )
  expect(
    screen.queryByText("webAiApiCheck:settings.saved"),
  ).not.toBeInTheDocument()
})

it("retains failed cleanup drafts for retry", async () => {
  render(<WebAiApiCheckSettings />)
  const input = screen.getByPlaceholderText(
    "webAiApiCheck:settings.keyCleanup.patternsPlaceholder",
  )
  update.mockRejectedValueOnce(new Error("write failed"))
  fireEvent.change(input, { target: { value: "retry-prefix" } })
  fireEvent.blur(input)
  await waitFor(() => expect(toast.error).toHaveBeenCalled())
  expect(input).toHaveValue("retry-prefix")
  fireEvent.blur(input)
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
})
