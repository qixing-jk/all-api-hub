import { afterEach, expect, it, vi } from "vitest"

import { handleInspectCredentialPage } from "~/entrypoints/content/messageHandlers/handlers/credentialPage"

afterEach(() => {
  document.body.replaceChildren()
  window.history.replaceState(null, "", "/")
  vi.useRealTimers()
})
it("observes a token action without clicking or returning a token value", async () => {
  document.body.innerHTML =
    '<button>Access Token</button><input value="private-token">'
  const click = vi.fn()
  document.querySelector("button")!.onclick = click
  const reply = vi.fn()
  await handleInspectCredentialPage({}, reply)
  expect(reply).toHaveBeenCalledWith({ success: true, state: "credential" })
  expect(click).not.toHaveBeenCalled()
  expect(JSON.stringify(reply.mock.calls)).not.toContain("private-token")
})
it("waits for the token feature rather than treating an initial loading shell as absent", async () => {
  const reply = vi.fn()
  const pending = handleInspectCredentialPage({}, reply)
  document.body.innerHTML =
    '<section aria-labelledby="security-access"><h3 id="security-access">Sessions & Access</h3></section>'
  await pending
  expect(reply).toHaveBeenCalledWith({ success: true, state: "credential" })
})

it("preserves recognition of visible access-token labels when a button has an alternative name", async () => {
  vi.useFakeTimers()
  document.body.innerHTML =
    '<button aria-label="Manage account">Access Tokens</button>'
  const reply = vi.fn()
  const pending = handleInspectCredentialPage({}, reply)
  await vi.advanceTimersByTimeAsync(5000)
  await pending
  expect(reply).toHaveBeenCalledWith({ success: true, state: "credential" })
})
it("recognizes an explicitly rendered missing page", async () => {
  document.body.innerHTML = "<h1>404</h1>"
  const reply = vi.fn()
  await handleInspectCredentialPage({}, reply)
  expect(reply).toHaveBeenCalledWith({ success: true, state: "not_found" })
})

it("recognizes a localized New API create action on a fork without the modern section", async () => {
  vi.useFakeTimers()
  document.body.innerHTML = "<button>建立存取令牌</button>"
  const reply = vi.fn()
  const pending = handleInspectCredentialPage({}, reply)
  await vi.advanceTimersByTimeAsync(5000)
  await pending
  expect(reply).toHaveBeenCalledWith({ success: true, state: "credential" })
})
it("keeps a login or challenge page inconclusive after the bounded wait", async () => {
  vi.useFakeTimers()
  document.body.innerHTML = '<form><input type="password"></form>'
  const reply = vi.fn()
  const pending = handleInspectCredentialPage({}, reply)
  await vi.advanceTimersByTimeAsync(5000)
  await pending
  expect(reply).toHaveBeenCalledWith({ success: true, state: "unknown" })
})

it("recognizes the legacy personal route before the user selects Security Settings", async () => {
  vi.useFakeTimers()
  window.history.replaceState(null, "", "/console/personal")
  document.body.innerHTML =
    '<div class="semi-card"><div role="tab" data-tabkey="semiTabsecurity">Security Settings</div></div>'
  const reply = vi.fn()
  const pending = handleInspectCredentialPage({}, reply)
  await vi.advanceTimersByTimeAsync(5000)
  await pending
  expect(reply).toHaveBeenCalledWith({ success: true, state: "credential" })
})

it("recognizes the Semi Design legacy missing-route screen without a 404 heading", async () => {
  vi.useFakeTimers()
  document.body.innerHTML =
    '<div class="semi-empty-description">Page not found, please check if your browser address is correct</div>'
  const reply = vi.fn()
  const pending = handleInspectCredentialPage({}, reply)
  await vi.advanceTimersByTimeAsync(5000)
  await pending
  expect(reply).toHaveBeenCalledWith({ success: true, state: "not_found" })
})

it("ignores unrelated buttons and loading mutations until a credential action appears", async () => {
  document.body.innerHTML = "<button></button><h1>Loading</h1>"
  const reply = vi.fn()
  const pending = handleInspectCredentialPage({}, reply)
  document.body.append(document.createElement("div"))
  await Promise.resolve()
  expect(reply).not.toHaveBeenCalled()
  document.body.insertAdjacentHTML("beforeend", "<button>Access Token</button>")
  await pending
  expect(reply).toHaveBeenCalledWith({ success: true, state: "credential" })
})
