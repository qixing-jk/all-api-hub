import { expect, it, vi } from "vitest"

import {
  captureTokenOAuthCallback,
  NEW_API_TOKEN_OAUTH_MARKER,
} from "~/services/apiService/newApiFamily/accessTokens/callback"

it("leaves a site's callback untouched when its verification marker is malformed", () => {
  history.replaceState(null, "", "/oauth/github?code=site-code&state=state")
  sessionStorage.setItem(
    NEW_API_TOKEN_OAUTH_MARKER,
    JSON.stringify({
      requestId: "request",
      origin: location.origin,
      provider: "github",
      state: "state",
    }),
  )
  const send = vi
    .spyOn(browser.runtime, "sendMessage")
    .mockResolvedValue(undefined)
  captureTokenOAuthCallback()
  expect(location.search).toBe("?code=site-code&state=state")
  expect(send).not.toHaveBeenCalled()
  sessionStorage.clear()
})

it("captures an owned callback once and removes its code before the site's UI can consume it", () => {
  history.replaceState(null, "", "/oauth/github?code=one-use&state=state")
  sessionStorage.setItem(
    NEW_API_TOKEN_OAUTH_MARKER,
    JSON.stringify({
      requestId: "request",
      origin: location.origin,
      provider: "github",
      state: "state",
      expiresAt: Date.now() + 300000,
    }),
  )
  const send = vi
    .spyOn(browser.runtime, "sendMessage")
    .mockResolvedValue(undefined)
  captureTokenOAuthCallback()
  captureTokenOAuthCallback()
  expect(location.search).toBe("")
  expect(send).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledWith({
    action: "newApiTokenOAuthCallback",
    requestId: "request",
    callback: { state: "state", code: "one-use" },
  })
})

it.each([
  ["state", "OAUTH_CANCELLED"],
  ["wrong-state", true],
] as const)(
  "reports an OAuth denial as cancellation only for the owned state (%s)",
  (state, error) => {
    history.replaceState(
      null,
      "",
      `/oauth/github?error=access_denied&state=${state}`,
    )
    sessionStorage.setItem(
      NEW_API_TOKEN_OAUTH_MARKER,
      JSON.stringify({
        requestId: "request",
        origin: location.origin,
        provider: "github",
        state: "state",
        expiresAt: Date.now() + 300000,
      }),
    )
    const send = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockResolvedValue(undefined)
    captureTokenOAuthCallback()
    expect(send).toHaveBeenCalledWith({
      action: "newApiTokenOAuthCallback",
      requestId: "request",
      error,
    })
  },
)
