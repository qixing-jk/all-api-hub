import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { fetchPmplan, fetchUserInfo } from "~/services/apiService/pmplan"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const { fetchApi } = vi.hoisted(() => ({ fetchApi: vi.fn() }))
vi.mock("~/services/apiTransport/request", async (original) => ({
  ...(await original()),
  fetchApi,
}))
const request = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://plan.pmcat.top",
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId: "661",
    cookie: "pmplan_session=saved",
  },
  fetchContext: {
    kind: "browser-context" as const,
    incognito: true,
    cookieStoreId: "1",
  },
}
beforeEach(() =>
  fetchApi.mockResolvedValue({ user: { id: 661, username: "sample" } }),
)
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  fetchApi.mockReset()
})

it("requires Firefox's Cookie interceptor before attempting console requests", async () => {
  vi.stubEnv("BROWSER", "firefox")
  vi.spyOn(browser.permissions, "contains").mockResolvedValue(false)
  await expect(fetchUserInfo(request)).rejects.toMatchObject({
    code: "COOKIE_PERMISSION_REQUIRED",
  })
  expect(fetchApi).not.toHaveBeenCalled()
})
it.each(["https://plan.pmcat.top", "https://custom-plan.example"])(
  "isolates Firefox Cookie transport at %s and suppresses ambient-page fallback",
  async (baseUrl) => {
    vi.stubEnv("BROWSER", "firefox")
    vi.spyOn(browser.permissions, "contains").mockResolvedValue(true)
    await fetchUserInfo({ ...request, baseUrl })
    expect(fetchApi).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl,
        auth: expect.objectContaining({
          cookie: request.auth.cookie,
          accessToken: undefined,
        }),
        cookieSession: undefined,
        fetchContext: undefined,
        forceTempWindow: false,
      }),
      expect.objectContaining({
        currentTabTransport: "disabled",
        tempWindowFallback: {},
      }),
      false,
    )
  },
)

it.each([
  ["GET", true],
  ["head", true],
  ["OPTIONS", true],
  ["post", false],
  ["PUT", false],
  ["DELETE", false],
])(
  "preserves mutation observation and CSRF policy for %s",
  async (method, safe) => {
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    await fetchPmplan({ ...request, observer }, "/api/keys", { method })
    expect(fetchApi).toHaveBeenCalledTimes(2)
    expect(fetchApi.mock.calls[0]![0].observer).toBeUndefined()
    const [sentRequest, transport] = fetchApi.mock.calls[1]!
    expect(sentRequest.observer).toBe(safe ? undefined : observer)
    expect(transport.options.method).toBe(method)
    expect(transport.options.headers.get("X-PMPlan-CSRF")).toBe(
      safe ? null : "1",
    )
  },
)
