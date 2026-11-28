import { afterEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { pmplanContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/pmplan"
import { getAccountBrowserIdentityCapability } from "~/services/accountSiteOnboarding/registry"
import { pmplanBrowserIdentity } from "~/services/apiAdapters/pmplan/browserIdentity"
import { detectsPmplan } from "~/services/apiService/pmplan/detection"

afterEach(() => vi.restoreAllMocks())
it("requires a JSON media type even when health returns a valid program identity", async () => {
  const response = new Response(
    JSON.stringify({
      ok: true,
      name: "pm-plan",
      version: "1.0",
      time: "2026-01-01T00:00:00Z",
    }),
  )
  response.headers.delete("content-type")
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response)
  expect(await detectsPmplan("https://custom-plan.example")).toBe(false)
})
it.each(["invalid", "file:///tmp/plan", "https://user:secret@plan.example"])(
  "declines unsafe browser identity origins: %s",
  (origin) => {
    expect(
      pmplanBrowserIdentity.canObserve({
        origin,
        siteType: SITE_TYPES.PMPLAN,
        candidateUserIds: [],
      }),
    ).toBe(false)
  },
)
it("returns no verified identity for a malformed console response", async () => {
  const context = {
    origin: "https://plan.example",
    siteType: SITE_TYPES.PMPLAN,
    candidateUserIds: [],
  }
  expect(
    await pmplanBrowserIdentity
      .observe(context)!
      .verify(vi.fn().mockResolvedValue({})),
  ).toBeNull()
})
it("extracts the live PM-Plan console identity without exporting a token", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ user: { id: 661, username: "sample" } })),
  )
  expect(
    await pmplanContentSessionExtractor.extract({
      url: "https://plan.pmcat.top",
      siteTypeHint: "pmplan",
    }),
  ).toMatchObject({
    userId: "661",
    siteTypeHint: "pmplan",
    user: { id: "661", username: "sample" },
  })
})

it("verifies browser identity against the self-hosted origin", async () => {
  const context = {
    siteType: "pmplan" as const,
    origin: "https://custom-plan.example",
    candidateUserIds: ["12"],
  }
  const identity = getAccountBrowserIdentityCapability(context)
  expect(identity).toBeDefined()
  const read = vi
    .fn()
    .mockResolvedValue({ user: { id: 12, username: "local" } })
  expect(await identity!.observe(context)!.verify(read)).toBe("12")
  expect(read).toHaveBeenCalledWith({ url: `${context.origin}/api/me` })
})

it("reads the detected deployment's session and never the hosted console", async () => {
  const context = {
    url: "https://custom-plan.example/#/keys",
    siteTypeHint: "pmplan" as const,
  }
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 12, username: "local" } })),
    )
  expect(pmplanContentSessionExtractor.canExtract(context)).toBe(true)
  expect(await pmplanContentSessionExtractor.extract(context)).toMatchObject({
    userId: "12",
  })
  expect(fetch).toHaveBeenCalledWith(
    "https://custom-plan.example/api/me",
    expect.objectContaining({ credentials: "include", redirect: "error" }),
  )
})

it("does not turn a logged-out self-hosted console into a successful identity", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("Unauthorized", { status: 401 }),
  )
  expect(
    await pmplanContentSessionExtractor.extract({
      url: "https://custom-plan.example",
      siteTypeHint: "pmplan",
    }),
  ).toBeNull()
})

it.each([
  {},
  { url: "https://custom-plan.example", siteTypeHint: SITE_TYPES.NEW_API },
  { siteTypeHint: SITE_TYPES.PMPLAN },
  { url: "invalid", siteTypeHint: SITE_TYPES.PMPLAN },
  { url: "file:///tmp/pmplan", siteTypeHint: SITE_TYPES.PMPLAN },
  {
    url: "https://user:password@custom-plan.example",
    siteTypeHint: SITE_TYPES.PMPLAN,
  },
])(
  "declines ineligible session contexts before fetching: %j",
  async (context) => {
    const fetch = vi.spyOn(globalThis, "fetch")
    expect(pmplanContentSessionExtractor.canExtract(context)).toBe(false)
    expect(await pmplanContentSessionExtractor.extract(context)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  },
)

it.each(["invalid-json", "invalid-identity", "network"])(
  "returns no session after %s while forwarding cancellation",
  async (failure) => {
    const controller = new AbortController()
    const fetch = vi.spyOn(globalThis, "fetch")
    if (failure === "network") fetch.mockRejectedValue(new Error("offline"))
    else
      fetch.mockResolvedValue(
        new Response(failure === "invalid-json" ? "invalid" : "{}"),
      )
    expect(
      await pmplanContentSessionExtractor.extract({
        url: "https://custom-plan.example/#/keys",
        siteTypeHint: SITE_TYPES.PMPLAN,
        abortSignal: controller.signal,
      }),
    ).toBeNull()
    expect(fetch).toHaveBeenCalledWith(
      "https://custom-plan.example/api/me",
      expect.objectContaining({ signal: controller.signal }),
    )
  },
)
