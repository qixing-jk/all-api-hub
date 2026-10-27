import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { handleGetUserFromLocalStorage } from "~/entrypoints/content/messageHandlers/handlers/storage"

const consoleIdentity = {
  uuid: "account-uuid",
  uid: "numeric-console-id",
  email: "user@example.com",
  username: "other-name",
  keys: ["private"],
  mobilePhone: "private",
}

describe("Novita content identity extraction", () => {
  beforeEach(() => {
    vi.stubGlobal("location", new URL("https://novita.ai/console"))
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "token=opaque-console-session",
    )
    localStorage.clear()
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "stale-id", username: "stale-user" }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const readSession = (url = "https://novita.ai/console") =>
    new Promise<any>((resolve) => {
      handleGetUserFromLocalStorage(
        { url, siteType: SITE_TYPES.NOVITA },
        resolve,
      )
    })

  it("returns the verified UUID, email and explicit console bearer for account onboarding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(consoleIdentity)))
    vi.stubGlobal("fetch", fetchMock)
    const result = await readSession()
    expect(result).toMatchObject({
      success: true,
      data: {
        userId: "account-uuid",
        user: { id: "account-uuid", username: "user@example.com" },
        siteTypeHint: SITE_TYPES.NOVITA,
        accessToken: "novita-console:opaque-console-session",
      },
    })
    expect(JSON.stringify(result)).not.toContain("private")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-server.novita.ai/v1/user/info",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        headers: { Authorization: "Bearer opaque-console-session" },
      }),
    )
  })

  it.each([
    ["signed out", { status: 401 }, {}],
    [
      "missing UUID",
      { status: 200 },
      { email: "user@example.com", uid: "numeric-id" },
    ],
    ["missing email", { status: 200 }, { uuid: "account-uuid" }],
  ])(
    "does not replace an unavailable %s session with cached user data",
    async (_label, init, body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(body), init)),
      )
      const result = await readSession()
      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
      expect(JSON.stringify(result)).not.toContain("stale-id")
      expect(JSON.stringify(result)).not.toContain("opaque-console-session")
    },
  )

  it("does not dispatch without a session cookie", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue("")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect((await readSession()).success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects an identity after its login cookie changes during the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        vi.spyOn(document, "cookie", "get").mockReturnValue(
          "token=different-session",
        )
        return new Response(JSON.stringify(consoleIdentity))
      }),
    )
    expect((await readSession()).success).toBe(false)
  })

  it("does not read the console API from a foreign document", async () => {
    vi.stubGlobal("location", new URL("https://other.example"))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect((await readSession()).success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps network failure details and cookies out of the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("opaque-console-session")),
    )
    const result = await readSession()
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain("opaque-console-session")
  })
})
