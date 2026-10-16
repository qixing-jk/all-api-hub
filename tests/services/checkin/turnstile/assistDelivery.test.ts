import { describe, expect, it, vi } from "vitest"

import { deliverTurnstileAssistNotice } from "~/services/checkin/turnstile/assistDelivery"

describe("Turnstile reminder delivery", () => {
  it("delivers to both explicitly enabled channels", async () => {
    const page = vi.fn().mockResolvedValue(true)
    const system = vi.fn().mockResolvedValue(true)
    expect(
      await deliverTurnstileAssistNotice("both", { page, system }),
    ).toEqual(["page", "system"])
  })
  it("never falls back to a disabled channel", async () => {
    const page = vi.fn().mockResolvedValue(false)
    const system = vi.fn().mockResolvedValue(true)
    expect(
      await deliverTurnstileAssistNotice("page", { page, system }),
    ).toEqual([])
    expect(system).not.toHaveBeenCalled()
  })
  it("keeps the other enabled channel working after a failure", async () => {
    const page = vi.fn().mockRejectedValue(new Error("page closed"))
    const system = vi.fn().mockResolvedValue(true)
    expect(
      await deliverTurnstileAssistNotice("both", { page, system }),
    ).toEqual(["system"])
  })
})
