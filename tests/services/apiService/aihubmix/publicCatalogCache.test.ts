import { delay, http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { aihubmixModelPricing } from "~/services/apiAdapters/aihubmix/modelPricing"
import { fetchModelPricing } from "~/services/apiService/aihubmix"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const requestFor = (account: string) => ({
  baseUrl: "https://console.aihubmix.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: account,
    userId: account,
  },
})
const counts = { catalog: 0, website: 0, account: 0 }
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const catalog = () =>
  HttpResponse.json({
    success: true,
    data: ["a", "b", "c"].map((model) => ({
      model_id: model,
      pricing: { input: 1, output: 2 },
    })),
  })
const website = () =>
  HttpResponse.json({
    success: true,
    data: ["a", "b", "c"].map((model) => ({
      model,
      billing_config: "",
      desc: "公开说明",
    })),
  })

describe("AIHubMix shared public catalogs", () => {
  beforeEach(() => {
    aihubmixModelPricing.invalidateCache?.()
    Object.assign(counts, { catalog: 0, website: 0, account: 0 })
    server.use(
      http.get("https://aihubmix.com/api/v1/models", async ({ request }) => {
        counts.catalog++
        expect(request.headers.has("Authorization")).toBe(false)
        expect(request.credentials).toBe("omit")
        expect(request.cache).toBe("no-cache")
        await delay(10)
        return catalog()
      }),
      http.get("https://aihubmix.com/call/mdl_info", async ({ request }) => {
        counts.website++
        expect(request.headers.has("Authorization")).toBe(false)
        await delay(10)
        return website()
      }),
      http.get(
        "https://aihubmix.com/api/user/available_models",
        ({ request }) => {
          counts.account++
          return HttpResponse.json({
            success: true,
            data: [{ model: request.headers.get("Authorization") }],
          })
        },
      ),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    aihubmixModelPricing.invalidateCache?.()
  })

  it("uses five requests for three concurrent accounts while preserving each account's models", async () => {
    const results = await Promise.all(
      ["a", "b", "c"].map((id) => fetchModelPricing(requestFor(id))),
    )
    expect(counts).toEqual({ catalog: 1, website: 1, account: 3 })
    expect(
      results.map((result) => result.data.map((model) => model.model_name)),
    ).toEqual([["a"], ["b"], ["c"]])
  })

  it("reuses both snapshots for a later account and reloads them after ten minutes", async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, "now").mockReturnValue(now)
    await fetchModelPricing(requestFor("a"))
    clock.mockReturnValue(now + 599_999)
    await fetchModelPricing(requestFor("b"))
    expect(counts).toEqual({ catalog: 1, website: 1, account: 2 })
    clock.mockReturnValue(now + 600_000)
    await fetchModelPricing(requestFor("c"))
    expect(counts).toEqual({ catalog: 2, website: 2, account: 3 })
  })

  it("invalidates both public snapshots through the pricing capability", async () => {
    await fetchModelPricing(requestFor("a"))
    expect(aihubmixModelPricing.invalidateCache).toBeTypeOf("function")
    aihubmixModelPricing.invalidateCache?.()
    await Promise.all(["b", "c"].map((id) => fetchModelPricing(requestFor(id))))
    expect(counts).toEqual({ catalog: 2, website: 2, account: 3 })
  })

  it("does not cache a failed website enrichment as a successful empty snapshot", async () => {
    server.use(
      http.get("https://aihubmix.com/call/mdl_info", () => {
        counts.website++
        return counts.website === 1
          ? new HttpResponse(null, { status: 503 })
          : website()
      }),
    )
    const first = await fetchModelPricing(requestFor("a"))
    expect(first.data[0].pricingPlan?.source.rulesUnavailable).toBe(true)
    const second = await fetchModelPricing(requestFor("b"))
    expect(second.data[0].pricingPlan?.source.rulesUnavailable).toBeUndefined()
    expect(counts).toEqual({ catalog: 1, website: 2, account: 2 })
  })

  it("allows another attempt after a failed public catalog request", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () => {
        counts.catalog++
        return counts.catalog === 1
          ? new HttpResponse(null, { status: 503 })
          : catalog()
      }),
    )
    await expect(fetchModelPricing(requestFor("a"))).rejects.toThrow()
    await expect(fetchModelPricing(requestFor("b"))).resolves.toMatchObject({
      data: [{ model_name: "b" }],
    })
    expect(counts.catalog).toBe(2)
  })

  it("does not let an older request overwrite or detach the replacement started by refresh", async () => {
    const started = [deferred(), deferred()]
    const release = [deferred(), deferred()]
    server.use(
      http.get("https://aihubmix.com/api/v1/models", async () => {
        const index = counts.catalog++
        if (index < 2) {
          started[index].resolve()
          await release[index].promise
        }
        return HttpResponse.json({
          success: true,
          data: ["a", "b", "c"].map((id) => ({
            model_id: id,
            pricing: { input: index + 1, output: 2 },
          })),
        })
      }),
    )
    const old = fetchModelPricing(requestFor("a"))
    await started[0].promise
    aihubmixModelPricing.invalidateCache?.()
    const replacement = fetchModelPricing(requestFor("b"))
    await started[1].promise
    release[0].resolve()
    await old
    const follower = fetchModelPricing(requestFor("c"))
    release[1].resolve()
    const results = await Promise.all([replacement, follower])
    expect(counts.catalog).toBe(2)
    expect(
      results.map((result) => result.data[0].pricingPlan?.rates.input?.amount),
    ).toEqual([2, 2])
    const cached = await fetchModelPricing(requestFor("a"))
    expect(cached.data[0].pricingPlan?.rates.input?.amount).toBe(2)
    expect(counts.catalog).toBe(2)
  })
})
