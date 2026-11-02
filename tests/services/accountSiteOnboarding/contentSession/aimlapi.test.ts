import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { readIdentityCookie } from "~/services/accountBrowserSession/localIdentityState"
import { aimlApiContentSessionExtractor as extractor } from "~/services/accountSiteOnboarding/contentSession/aimlapi"

vi.mock("~/services/accountBrowserSession/localIdentityState", () => ({
  readIdentityCookie: vi.fn(),
}))
const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal("location", { origin: "https://aimlapi.com" })
  vi.stubGlobal("fetch", fetchMock)
  vi.mocked(readIdentityCookie).mockReturnValue('{"key":"session"}')
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ id: "123", email: "person@example.invalid" }),
    ),
  )
})
afterEach(() => vi.unstubAllGlobals())

const extract = () => extractor.extract({} as never)
it("extracts only verified identity and transient console authentication", async () => {
  expect(
    extractor.canExtract({
      url: "https://aimlapi.com/console",
      siteTypeHint: "aimlapi",
    } as never),
  ).toBe(true)
  expect(
    extractor.canExtract({
      url: "https://example.invalid",
      siteTypeHint: "aimlapi",
    } as never),
  ).toBe(false)
  expect(await extract()).toEqual({
    userId: "123",
    user: { id: "123", username: "person@example.invalid" },
    siteTypeHint: "aimlapi",
    transientAuth: {
      kind: "aimlapi_console",
      origin: "https://aimlapi.com",
      token: "session",
      userId: "123",
    },
  })
  expect(fetchMock).toHaveBeenCalledWith(
    "https://app.aimlapi.com/v1/users/me",
    expect.objectContaining({
      headers: { Authorization: "Bearer session" },
      credentials: "omit",
      redirect: "error",
    }),
  )
})
it.each([null, "invalid", "{}", '{"key":2}', '{"key":""}'])(
  "rejects an absent or malformed console cookie: %s",
  async (cookie) => {
    vi.mocked(readIdentityCookie).mockReturnValue(cookie)
    await expect(extract()).rejects.toThrow("session unavailable")
    expect(fetchMock).not.toHaveBeenCalled()
  },
)
it.each([
  null,
  {},
  { id: 123, email: "email" },
  { id: "", email: "email" },
  { id: "123", email: 123 },
  { id: "123", email: "" },
])("rejects invalid session identity %#", async (body) => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body)))
  await expect(extract()).rejects.toThrow("session unavailable")
})
it("rejects an identity read after the browser session changes", async () => {
  vi.mocked(readIdentityCookie)
    .mockReturnValueOnce('{"key":"session"}')
    .mockReturnValueOnce('{"key":"new-session"}')
  await expect(extract()).rejects.toThrow("session unavailable")
})
it("rejects a wrong origin before reading credentials", async () => {
  vi.stubGlobal("location", { origin: "https://app.aimlapi.com" })
  await expect(extract()).rejects.toThrow("session unavailable")
  expect(fetchMock).not.toHaveBeenCalled()
})
it("rejects an expired session", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 401 }))
  await expect(extract()).rejects.toThrow("session unavailable")
})
