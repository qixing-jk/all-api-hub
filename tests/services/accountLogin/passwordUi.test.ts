// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://gateway.example/login"}
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { handlePasswordUi } from "~/services/accountLogin/passwordUi"

const deps = vi.hoisted(() => ({ verification: vi.fn(), send: vi.fn() }))
vi.mock("~/services/checkin/pageVerification", () => ({
  hasPageVerification: () => false,
  waitForPageVerification: deps.verification,
}))
vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeMessage: deps.send,
}))
const request = {
  origin: "https://gateway.example",
  requestId: "ui",
  expectedIdentity: "17",
  credentials: { username: "alice", password: "secret" },
}
const provider = { readSession: vi.fn(), logout: vi.fn(), settings: vi.fn() }
function invoke(phase: string, details = {}) {
  return new Promise((resolve) =>
    handlePasswordUi({ ...request, phase, ...details }, resolve, provider),
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  document.body.innerHTML = ""
  provider.readSession.mockResolvedValue(null)
  provider.settings.mockResolvedValue({ enabled: true, verification: false })
  deps.verification.mockResolvedValue({ status: "not-required" })
})
afterEach(() => vi.useRealTimers())
it("only permits API fallback before submission on a page with no recognized native UI", async () => {
  vi.useFakeTimers()
  const result = invoke("prepare")
  await vi.runAllTimersAsync()
  await expect(result).resolves.toEqual({ kind: "fallback" })
})
it("rejects invalid identity before reading or modifying a website session", async () => {
  await expect(
    invoke("prepare", { expectedIdentity: undefined }),
  ).resolves.toEqual({ status: "uncertain" })
  expect(provider.readSession).not.toHaveBeenCalled()
})
it("rejects a stale or absent prepared flow without submitting credentials", async () => {
  await expect(invoke("submit")).resolves.toEqual({ status: "failed" })
})
it("rejects an unknown phase after preparation", async () => {
  document.body.innerHTML =
    '<form><input name="username"><input type="password"><button>Login</button></form>'
  await invoke("prepare")
  await expect(invoke("unsupported")).resolves.toEqual({ status: "failed" })
})
it("hands verification to the extension and leaves a blocked native form unsubmitted", async () => {
  document.body.innerHTML =
    '<form><input name="username"><input type="password"><button>Login</button></form>'
  const submit = vi.fn((event: Event) => event.preventDefault())
  document.querySelector("form")!.addEventListener("submit", submit)
  deps.send.mockResolvedValue({ presented: true })
  deps.verification.mockImplementation(async ({ requestAssist }) => {
    await expect(requestAssist()).resolves.toBe(true)
    return { status: "required" }
  })
  await invoke("prepare")
  await expect(invoke("submit")).resolves.toEqual({ kind: "manual" })
  expect(deps.send).toHaveBeenCalledWith(
    expect.objectContaining({ requestId: "ui" }),
  )
  expect(submit).not.toHaveBeenCalled()
})
it("recognizes a user's native submission during verification and does not click submit again", async () => {
  document.body.innerHTML =
    '<form><input name="username"><input type="password"><button>Login</button></form>'
  const submit = vi.fn((event: Event) => event.preventDefault())
  document.querySelector("form")!.addEventListener("submit", submit)
  deps.verification.mockImplementation(async () => {
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { cancelable: true }))
    return { status: "not-required" }
  })
  await invoke("prepare")
  await expect(invoke("submit")).resolves.toEqual({ kind: "submitted" })
  expect(submit).toHaveBeenCalledTimes(1)
})
