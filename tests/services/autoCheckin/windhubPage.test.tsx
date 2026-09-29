// @vitest-environment-options {"url":"https://windhub.cc/console/personal"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { verifyAccountBrowserIdentity } from "~/services/accountBrowserSession/identityVerification"
import { runWindhubPageCheckin } from "~/services/apiAdapters/windhub/pageCheckin"

vi.mock("~/services/accountBrowserSession/identityVerification", () => ({
  verifyAccountBrowserIdentity: vi.fn(),
}))

const mockRead = (checked: boolean) => ({
  ok: true,
  redirected: false,
  json: async () => ({
    success: true,
    data: { enabled: true, stats: { checked_in_today: checked } },
  }),
})

describe("Windhub page check-in", () => {
  beforeEach(() => {
    vi.mocked(verifyAccountBrowserIdentity).mockResolvedValue("123")
    document.body.innerHTML = '<button type="button">立即签到</button>'
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("refuses another account before reading or clicking", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const button = document.querySelector("button")!
    const click = vi.spyOn(button, "click")
    expect(
      await runWindhubPageCheckin({ mode: "execute", expectedUserId: "999" }),
    ).toEqual({ kind: "identity_mismatch" })
    expect(fetch).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })

  it("reports today's completed check-in without clicking", async () => {
    const fetch = vi.fn().mockResolvedValue(mockRead(true))
    vi.stubGlobal("fetch", fetch)
    const click = vi.spyOn(document.querySelector("button")!, "click")
    expect(
      await runWindhubPageCheckin({ mode: "execute", expectedUserId: "123" }),
    ).toEqual({ kind: "already" })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(click).not.toHaveBeenCalled()
  })

  it("clicks once and requires status readback", async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(mockRead(false))
      .mockResolvedValueOnce(mockRead(false))
      .mockResolvedValueOnce(mockRead(true))
    vi.stubGlobal("fetch", fetch)
    const click = vi.spyOn(document.querySelector("button")!, "click")
    const result = runWindhubPageCheckin({
      mode: "execute",
      expectedUserId: "123",
    })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await result).toEqual({ kind: "checked" })
    expect(click).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
