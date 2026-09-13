import { describe, expect, it } from "vitest"

import { createFeedbackScanRegistry } from "~/services/checkin/feedback/scanRegistry"

describe("feedback scan ownership", () => {
  it("rejects duplicate dispatches and cancels only the requested scan", () => {
    const scans = createFeedbackScanRegistry()
    const first = scans.start("first")!
    const second = scans.start("second")!
    expect(scans.start("first")).toBeUndefined()
    scans.cancel("first")
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    scans.finish("first")
    expect(scans.start("first")).toBeUndefined()
    scans.finish("second")
    expect(scans.start("second")).toBeDefined()
  })

  it("keeps cancellation and active ownership isolated between runtime contexts", () => {
    const page = createFeedbackScanRegistry()
    const background = createFeedbackScanRegistry()
    page.cancel("request")
    expect(page.start("request")).toBeUndefined()
    expect(background.start("request")).toBeDefined()
  })
})
