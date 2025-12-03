import { beforeEach, describe, expect, it, vi } from "vitest"

import { DONE_HUB, ONE_HUB } from "~/constants/siteType"
import {
  fetchAccountTokens,
  fetchModelPricing,
  fetchUserInfo,
} from "~/services/apiService"
import * as commonAPI from "~/services/apiService/common"
import * as oneHubAPI from "~/services/apiService/oneHub"

describe("apiService index wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should call common implementation by default when no site override provided", async () => {
    const spy = vi
      .spyOn(commonAPI, "fetchUserInfo")
      .mockResolvedValue({} as any)

    await (fetchUserInfo as any)({ foo: "bar" })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ foo: "bar" })
  })

  it("should use override module when site string is passed as last argument", async () => {
    const spy = vi
      .spyOn(oneHubAPI, "fetchModelPricing")
      .mockResolvedValue({} as any)

    await (fetchModelPricing as any)({ foo: "bar" }, ONE_HUB)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ foo: "bar" })
  })

  it("should detect siteType from object argument when last arg is not a site string", async () => {
    const spy = vi
      .spyOn(oneHubAPI, "fetchAccountTokens")
      .mockResolvedValue([] as any)

    await (fetchAccountTokens as any)({ foo: "bar", siteType: DONE_HUB })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ foo: "bar", siteType: DONE_HUB })
  })

  it("should fall back to common implementation when override module does not implement function", async () => {
    const spy = vi
      .spyOn(commonAPI, "fetchUserInfo")
      .mockResolvedValue({} as any)

    await (fetchUserInfo as any)({ foo: "bar" }, ONE_HUB)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ foo: "bar" })
  })
})
