import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createToolcodeCheckInStatusEndpoint,
  resolveToolcodeCheckInTimezone,
} from "~/services/apiService/sub2api/checkin/toolcodeCheckInProtocol"

afterEach(() => vi.restoreAllMocks())

describe("ToolCode status endpoint", () => {
  it("resolves the browser timezone for callers", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Asia/Singapore",
    } as Intl.ResolvedDateTimeFormatOptions)
    expect(resolveToolcodeCheckInTimezone()).toBe("Asia/Singapore")
  })
  it("falls back to UTC when runtime timezone data throws", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("timezone data unavailable")
    })
    expect(resolveToolcodeCheckInTimezone()).toBe("UTC")
  })
  it("falls back to UTC when runtime timezone data is empty", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "",
    } as Intl.ResolvedDateTimeFormatOptions)
    expect(resolveToolcodeCheckInTimezone()).toBe("UTC")
  })
  it("builds the supplied timezone without consulting runtime timezone state", () => {
    const runtimeTimezone = vi
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation(() => {
        throw new Error("timezone data unavailable")
      })
    expect(createToolcodeCheckInStatusEndpoint("Asia/Singapore")).toBe(
      "/api/v1/engagement/checkin/status?timezone=Asia%2FSingapore",
    )
    expect(runtimeTimezone).not.toHaveBeenCalled()
  })
})
