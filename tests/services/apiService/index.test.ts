import { beforeEach, describe, expect, it, vi } from "vitest"

import { DONE_HUB, ONE_HUB } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"
import * as commonAPI from "~/services/apiService/common"
import * as oneHubAPI from "~/services/apiService/oneHub"

vi.mock("~/services/apiService/common", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/apiService/common")
  >("~/services/apiService/common")
  return { ...actual }
})

vi.mock("~/services/apiService", async () => {
  const actual = await vi.importActual<typeof import("~/services/apiService")>(
    "~/services/apiService",
  )
  return { ...actual }
})

describe("apiService index wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should call common implementation by default when no site override provided", async () => {
    const spy = vi
      .spyOn(commonAPI, "fetchUserInfo")
      .mockResolvedValue({} as any)

    await (getApiService(undefined).fetchUserInfo as any)(
      "https://example.com",
      1,
    )

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith("https://example.com", 1)
  })

  it("should use override module when selecting a site-scoped api instance", async () => {
    const spy = vi
      .spyOn(oneHubAPI, "fetchModelPricing")
      .mockResolvedValue({} as any)

    await (getApiService(ONE_HUB).fetchModelPricing as any)({ foo: "bar" })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ foo: "bar" })
  })

  it("should route to override without relying on object siteType detection", async () => {
    const spy = vi
      .spyOn(oneHubAPI, "fetchAccountTokens")
      .mockResolvedValue([] as any)

    await (getApiService(DONE_HUB).fetchAccountTokens as any)({ foo: "bar" })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ foo: "bar" })
  })

  it("should fall back to common implementation when override module does not implement function", async () => {
    const spy = vi
      .spyOn(commonAPI, "fetchUserInfo")
      .mockResolvedValue({} as any)

    await (getApiService(ONE_HUB).fetchUserInfo as any)(
      "https://example.com",
      1,
    )

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith("https://example.com", 1)
  })
})
