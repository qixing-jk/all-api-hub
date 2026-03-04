import { describe, expect, it, vi } from "vitest"

import { fetchCheckInStatus } from "~/services/apiService/wong"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: vi.fn(),
}))

describe("apiService wong", () => {
  it("fetchCheckInStatus returns false when backend says checked_in true", async () => {
    const { fetchApi } = await import("~/services/apiService/common/utils")
    vi.mocked(fetchApi).mockResolvedValueOnce({
      success: true,
      message: "",
      data: {
        enabled: true,
        checked_in: true,
      },
    })

    const canCheckIn = await fetchCheckInStatus({
      baseUrl: "https://wong.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    } as any)

    expect(canCheckIn).toBe(false)
  })

  it("fetchCheckInStatus returns true when backend says checked_in false", async () => {
    const { fetchApi } = await import("~/services/apiService/common/utils")
    vi.mocked(fetchApi).mockResolvedValueOnce({
      success: true,
      message: "",
      data: {
        enabled: true,
        checked_in: false,
      },
    })

    const canCheckIn = await fetchCheckInStatus({
      baseUrl: "https://wong.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    } as any)

    expect(canCheckIn).toBe(true)
  })

  it("fetchCheckInStatus returns undefined when enabled is false", async () => {
    const { fetchApi } = await import("~/services/apiService/common/utils")
    vi.mocked(fetchApi).mockResolvedValueOnce({
      success: true,
      message: "",
      data: {
        enabled: false,
        checked_in: false,
      },
    })

    const canCheckIn = await fetchCheckInStatus({
      baseUrl: "https://wong.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    } as any)

    expect(canCheckIn).toBeUndefined()
  })

  it("fetchCheckInStatus returns false when server returns already checked message with success=false", async () => {
    const { fetchApi } = await import("~/services/apiService/common/utils")
    vi.mocked(fetchApi).mockResolvedValueOnce({
      success: false,
      message: "今天已经签到过啦",
      data: null,
    })

    const canCheckIn = await fetchCheckInStatus({
      baseUrl: "https://wong.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    } as any)

    expect(canCheckIn).toBe(false)
  })

  it("fetchCheckInStatus returns false when server returns already checked message with success=true", async () => {
    const { fetchApi } = await import("~/services/apiService/common/utils")
    vi.mocked(fetchApi).mockResolvedValueOnce({
      success: true,
      message: "今天已经签到过啦",
      data: undefined,
    })

    const canCheckIn = await fetchCheckInStatus({
      baseUrl: "https://wong.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    } as any)

    expect(canCheckIn).toBe(false)
  })

  it("fetchCheckInStatus returns false when server returns success=false but checked_in true", async () => {
    const { fetchApi } = await import("~/services/apiService/common/utils")
    vi.mocked(fetchApi).mockResolvedValueOnce({
      success: false,
      message: "",
      data: {
        enabled: true,
        checked_in: true,
      },
    })

    const canCheckIn = await fetchCheckInStatus({
      baseUrl: "https://wong.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    } as any)

    expect(canCheckIn).toBe(false)
  })
})
