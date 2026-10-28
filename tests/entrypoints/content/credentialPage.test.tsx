import { afterEach, expect, it, vi } from "vitest"

import { handleInspectCredentialPage } from "~/entrypoints/content/messageHandlers/handlers/credentialPage"

afterEach(() => {
  document.body.replaceChildren()
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
it("recognizes an explicitly rendered missing page", async () => {
  document.body.innerHTML = "<h1>404</h1>"
  const reply = vi.fn()
  await handleInspectCredentialPage({}, reply)
  expect(reply).toHaveBeenCalledWith({ success: true, state: "not_found" })
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
