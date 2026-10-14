import { describe, expectTypeOf, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { AutoDetectResult } from "~/services/siteDetection/autoDetectContracts"

describe("account detection result contract", () => {
  it("requires data on success and excludes it on failure", () => {
    type Success = Extract<AutoDetectResult, { success: true }>
    type Failure = Extract<AutoDetectResult, { success: false }>
    const data = {
      userId: "1",
      user: { id: "1" },
      rawUser: {},
      siteType: SITE_TYPES.NEW_API,
    }

    expectTypeOf<Success["data"]>().not.toBeNullable()
    expectTypeOf<Failure["data"]>().toEqualTypeOf<undefined>()

    // @ts-expect-error A successful detection must carry account data.
    const missingData: AutoDetectResult = { success: true }
    // @ts-expect-error Failed detection must not expose account data.
    const failedWithData: AutoDetectResult = { success: false, data }
    // @ts-expect-error A success must not also report an error.
    const conflictingResult: Success = { success: true, data, error: "failed" }
    void [missingData, failedWithData, conflictingResult]
  })

  it("narrows data using the success discriminant", () => {
    const checkResult = (result: AutoDetectResult) => {
      if (result.success) {
        expectTypeOf(result.data.userId).toEqualTypeOf<string>()
        expectTypeOf(result.data.user.id).toEqualTypeOf<string>()
        expectTypeOf(result.data.user.username).toEqualTypeOf<
          string | undefined
        >()
        expectTypeOf(result.data.rawUser).toEqualTypeOf<
          Record<string, unknown>
        >()
        expectTypeOf(result.error).toEqualTypeOf<undefined>()
      } else {
        expectTypeOf(result.data).toEqualTypeOf<undefined>()
        expectTypeOf(result.error).toEqualTypeOf<string | undefined>()
      }
    }
    expectTypeOf(checkResult).toBeFunction()
  })
})
