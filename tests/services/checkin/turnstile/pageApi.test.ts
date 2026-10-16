import { beforeEach, describe, expect, it, vi } from "vitest"

import { probeTurnstilePageApi } from "~/services/checkin/turnstile/pageApi"

type TurnstileTestWindow = Window & {
  turnstile?: {
    getResponse?: () => string
    execute?: () => void
  }
  __aahTurnstileExecuteAttempted?: boolean
}

describe("probeTurnstilePageApi", () => {
  beforeEach(() => {
    const target = window as TurnstileTestWindow
    delete target.turnstile
    delete target.__aahTurnstileExecuteAttempted
  })

  it("returns the token the official widget already produced", () => {
    const execute = vi.fn()
    ;(window as TurnstileTestWindow).turnstile = {
      getResponse: () => "  token-from-api  ",
      execute,
    }

    expect(probeTurnstilePageApi(true)).toEqual({
      hasApi: true,
      token: "token-from-api",
      executed: false,
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it("does not execute the widget during the quiet automatic attempt", () => {
    const execute = vi.fn()
    ;(window as TurnstileTestWindow).turnstile = {
      getResponse: () => "",
      execute,
    }

    expect(probeTurnstilePageApi(false)).toEqual({
      hasApi: true,
      token: null,
      executed: false,
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it("calls the official execute API once when automatic completion is still pending", () => {
    const execute = vi.fn()
    ;(window as TurnstileTestWindow).turnstile = {
      getResponse: () => "",
      execute,
    }

    expect(probeTurnstilePageApi(true)).toEqual({
      hasApi: true,
      token: null,
      executed: true,
    })
    expect(probeTurnstilePageApi(true)).toEqual({
      hasApi: true,
      token: null,
      executed: true,
    })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("reports that the page has no Turnstile client API", () => {
    expect(probeTurnstilePageApi(true)).toEqual({
      hasApi: false,
      token: null,
      executed: false,
    })
  })
})
