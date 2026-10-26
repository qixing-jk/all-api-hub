import { afterEach, describe, expect, it, vi } from "vitest"

import zhMessages from "~/locales/zh-CN/messages.json"
import { vercelContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/vercel"
import {
  vercelAccountDetectionPrivacy,
  vercelBrowserIdentity,
} from "~/services/apiAdapters/vercelAiGateway/browserIdentity"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const context = {
  url: "https://vercel.com/qihang131417-3933/~/ai-gateway",
  siteTypeHint: "vercel-ai-gateway" as const,
}

const userBody = {
  user: {
    id: "dx6kpFo0P5f3qAIXWLqGB4II",
    username: "qihang131417-3933",
    email: "someone@example.invalid",
  },
}

const teamsBody = {
  teams: [
    {
      id: "team_TdlAsoLqxN0EbYG3vV0XeCAz",
      slug: "qihang131417-3933",
      name: "qihang131417-3933's projects",
    },
  ],
}

const stubFetch = (responses: Record<string, unknown>) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = responses[url]
    if (body === undefined) return { ok: false, json: async () => ({}) }
    return { ok: true, json: async () => body }
  })

afterEach(() => vi.unstubAllGlobals())

describe("Vercel AI Gateway content session", () => {
  it("explains the required team access token in Chinese instead of showing a translation key", async () => {
    const i18n = await createResourceTestI18n(
      { "zh-CN": { messages: zhMessages } },
      "zh-CN",
    )
    expect(i18n.t("messages:vercelAiGateway.accessTokenRequired")).toBe(
      "Vercel AI Gateway 需要拥有该网关的团队的 Vercel 访问令牌。",
    )
  })
  it("detects the team in the current console URL instead of the first team", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        "/api/user": userBody,
        "/api/teams": {
          teams: [{ id: "team_other", slug: "other" }, ...teamsBody.teams],
        },
      }),
    )
    expect(await vercelContentSessionExtractor.extract(context)).toMatchObject({
      userId: teamsBody.teams[0]!.id,
    })
    expect(
      await vercelContentSessionExtractor.extract({
        ...context,
        url: "https://vercel.com/unknown/~/ai-gateway",
      }),
    ).toBeNull()
  })
  it("does not claim another site or an unregistered origin", () => {
    for (const url of ["invalid", "https://example.invalid", undefined]) {
      expect(
        vercelContentSessionExtractor.canExtract({ ...context, url }),
      ).toBe(false)
    }
    expect(
      vercelContentSessionExtractor.canExtract({
        ...context,
        siteTypeHint: "new-api",
      }),
    ).toBe(false)
  })

  it("reads the personal session but identifies the account by its team", async () => {
    const fetchMock = stubFetch({
      "/api/user": userBody,
      "/api/teams": teamsBody,
    })
    vi.stubGlobal("fetch", fetchMock)

    expect(await vercelContentSessionExtractor.extract(context)).toEqual({
      userId: "team_TdlAsoLqxN0EbYG3vV0XeCAz",
      siteTypeHint: "vercel-ai-gateway",
      user: {
        id: "dx6kpFo0P5f3qAIXWLqGB4II",
        username: "qihang131417-3933",
        team_name: "qihang131417-3933's projects",
      },
    })
  })

  it("recognizes the logged-in console user whose identity is returned as uid", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        "/api/user": { user: { uid: "console-user", username: "someone" } },
        "/api/teams": teamsBody,
      }),
    )
    expect(await vercelContentSessionExtractor.extract(context)).toMatchObject({
      userId: "team_TdlAsoLqxN0EbYG3vV0XeCAz",
      siteTypeHint: "vercel-ai-gateway",
      user: { id: "console-user", username: "someone" },
    })
  })

  it("does not extract without a team, because keys and credits are team-scoped", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({ "/api/user": userBody, "/api/teams": { teams: [] } }),
    )
    expect(await vercelContentSessionExtractor.extract(context)).toBeNull()
  })

  it("does not extract when the console session is signed out", async () => {
    vi.stubGlobal("fetch", stubFetch({}))
    expect(await vercelContentSessionExtractor.extract(context)).toBeNull()
  })

  it("verifies a saved account by matching its team", async () => {
    const capability = vercelBrowserIdentity
    const observation = capability.observe({
      origin: "https://vercel.com",
      siteType: "vercel-ai-gateway",
      candidateUserIds: ["team_other", "team_TdlAsoLqxN0EbYG3vV0XeCAz"],
    })!
    const read = vi.fn(
      async () => teamsBody as unknown as Record<string, unknown>,
    )

    expect(await observation.verify(read)).toBe("team_TdlAsoLqxN0EbYG3vV0XeCAz")
    expect(read).toHaveBeenCalledWith({ url: "https://vercel.com/api/teams" })
  })

  it("adopts the session's first team when no saved account matches", async () => {
    const observation = vercelBrowserIdentity.observe({
      origin: "https://vercel.com",
      siteType: "vercel-ai-gateway",
      candidateUserIds: [],
    })!
    expect(
      await observation.verify(
        async () => teamsBody as unknown as Record<string, unknown>,
      ),
    ).toBe("team_TdlAsoLqxN0EbYG3vV0XeCAz")
  })

  it("stays unconfirmed when the session has no readable team", async () => {
    const observation = vercelBrowserIdentity.observe({
      origin: "https://vercel.com",
      siteType: "vercel-ai-gateway",
      candidateUserIds: [],
    })!
    expect(await observation.verify(async () => null)).toBeNull()
    expect(await observation.verify(async () => ({ teams: "nope" }))).toBeNull()
  })

  it("only observes the canonical Vercel console", () => {
    expect(
      vercelBrowserIdentity.canObserve({
        origin: "https://vercel.com",
        siteType: "vercel-ai-gateway",
        candidateUserIds: [],
      }),
    ).toBe(true)
    expect(
      vercelBrowserIdentity.canObserve({
        origin: "https://example.invalid",
        siteType: "vercel-ai-gateway",
        candidateUserIds: [],
      }),
    ).toBe(false)
  })

  it("allows read-only detection only on the Vercel console origin", () => {
    expect(
      vercelAccountDetectionPrivacy.matchesUrl(
        "https://vercel.com/qihang131417-3933/~/ai-gateway",
      ),
    ).toBe(true)
    for (const url of [
      "http://vercel.com",
      "https://api.vercel.com/v1/api-keys",
      "https://example.invalid",
      "not a url",
    ]) {
      expect(vercelAccountDetectionPrivacy.matchesUrl(url)).toBe(false)
    }
    // Localization is resolved by the caller; the adapter only supplies the key.
    expect(vercelAccountDetectionPrivacy.getFailureMessage()).toBe(
      "messages:vercelAiGateway.accessTokenRequired",
    )
  })
})
