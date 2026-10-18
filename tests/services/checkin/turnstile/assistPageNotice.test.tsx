import { afterEach, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { showTurnstileAssistPageNotice } from "~/services/checkin/turnstile/assistPageNotice"

const { send } = vi.hoisted(() => ({
  send: vi.fn(),
}))
vi.mock("~/utils/browser/runtimeMessages", () => ({ sendRuntimeMessage: send }))
afterEach(() => vi.restoreAllMocks())
const message = {
  action: RuntimeActionIds.TurnstileAssistPageNotice,
  requestId: "request",
} as const

it("identifies the extension and links directly to reminder settings without opening verification", async () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  vi.spyOn(document, "hasFocus").mockReturnValue(true)
  const notify = { info: vi.fn(), dismiss: vi.fn() }
  showTurnstileAssistPageNotice(message, notify)
  const options = notify.info.mock.calls[0]![1]
  expect(options.title).toBeTruthy()
  send.mockResolvedValue({ success: true })
  await options.secondaryAction.onClick()
  expect(send).toHaveBeenLastCalledWith({
    action: RuntimeActionIds.OpenSettingsTurnstileAssist,
  })
  send.mockResolvedValue({ success: false })
  await expect(options.secondaryAction.onClick()).rejects.toThrow()
})

it("does not claim delivery on hidden or unfocused pages", () => {
  const notify = { info: vi.fn(), dismiss: vi.fn() }
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
  expect(showTurnstileAssistPageNotice(message, notify)).toBe(false)
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  vi.spyOn(document, "hasFocus").mockReturnValue(false)
  expect(showTurnstileAssistPageNotice(message, notify)).toBe(false)
  expect(notify.info).not.toHaveBeenCalled()
})

it("provides an action for the live request and removes ended reminders even on hidden pages", async () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  vi.spyOn(document, "hasFocus").mockReturnValue(true)
  const notify = { info: vi.fn(), dismiss: vi.fn() }
  expect(showTurnstileAssistPageNotice(message, notify)).toBe(true)
  send.mockResolvedValue({ presented: false })
  await notify.info.mock.calls[0]![1].action.onClick()
  expect(send).toHaveBeenCalledWith({
    action: RuntimeActionIds.TurnstileAssistOpen,
    requestId: "request",
  })
  expect(notify.dismiss).toHaveBeenCalledWith("turnstile-assist:request")
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
  expect(
    showTurnstileAssistPageNotice({ ...message, dismiss: true }, notify),
  ).toBe(true)
})

it("rejects invalid or blank request IDs", () => {
  const notify = { info: vi.fn(), dismiss: vi.fn() }
  expect(
    showTurnstileAssistPageNotice(
      { action: RuntimeActionIds.TurnstileAssistPageNotice, requestId: "" },
      notify,
    ),
  ).toBe(false)
  expect(
    showTurnstileAssistPageNotice(
      { action: RuntimeActionIds.TurnstileAssistPageNotice, requestId: "   " },
      notify,
    ),
  ).toBe(false)
  expect(
    showTurnstileAssistPageNotice(
      {
        action: RuntimeActionIds.TurnstileAssistPageNotice,
        requestId: null as any,
      },
      notify,
    ),
  ).toBe(false)
})

it.each(["login-session", "login"] as const)(
  "offers the native login action with reason %s",
  (reason) => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    vi.spyOn(document, "hasFocus").mockReturnValue(true)
    const notify = { info: vi.fn(), dismiss: vi.fn() }
    expect(showTurnstileAssistPageNotice({ ...message, reason }, notify)).toBe(
      true,
    )
    const [body, options] = notify.info.mock.calls[0]!
    expect(body).toBe(
      reason === "login-session"
        ? "shieldBypass:notification.loginSessionBody"
        : "shieldBypass:notification.loginAssistBody",
    )
    expect(options.action.label).toBe("shieldBypass:notification.openLogin")
  },
)
