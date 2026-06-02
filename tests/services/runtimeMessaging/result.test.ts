import { describe, expect, it } from "vitest"

import {
  createRuntimeMessageFailure,
  getRuntimeMessageFailureMessage,
  getRuntimeMessageToastMessage,
} from "~/services/runtimeMessaging/result"

describe("runtime messaging result helpers", () => {
  it("keeps explicit failure responses typed", () => {
    expect(createRuntimeMessageFailure("request rejected")).toEqual({
      success: false,
      error: "request rejected",
    })
  })

  it("normalizes failure messages with a local fallback", () => {
    expect(
      getRuntimeMessageFailureMessage(
        createRuntimeMessageFailure(" request rejected "),
        "fallback message",
      ),
    ).toBe("request rejected")
    expect(
      getRuntimeMessageFailureMessage(
        createRuntimeMessageFailure("   "),
        "fallback message",
      ),
    ).toBe("fallback message")
  })

  it("returns toast message text only for failure responses", () => {
    expect(
      getRuntimeMessageToastMessage(
        createRuntimeMessageFailure(" request rejected "),
      ),
    ).toBe("request rejected")
    expect(
      getRuntimeMessageToastMessage({
        success: true,
        data: undefined,
      }),
    ).toBeUndefined()
  })
})
