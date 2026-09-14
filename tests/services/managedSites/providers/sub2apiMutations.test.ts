import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import {
  createSub2ApiManagedAccountMutation,
  deleteSub2ApiManagedAccountMutation,
  updateSub2ApiManagedAccountMutation,
} from "~/services/managedSites/providers/sub2apiMutations"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://sub2api-mutations.example.invalid",
  adminToken: "admin-placeholder",
}
const endpoint = `${config.baseUrl}/api/v1/admin/accounts`
const input = {
  name: "Imported account",
  platform: "openai" as const,
  apiKey: "key-placeholder",
  baseUrl: "https://upstream.example.invalid",
  concurrency: 1,
  priority: 1,
}
const account = {
  id: 17,
  name: input.name,
  platform: input.platform,
  type: "apikey",
  status: "active",
}

describe("Sub2API provider mutation outcomes", () => {
  it.each([
    {
      failure: "rejection",
      response: () =>
        HttpResponse.json({ code: 403, message: "forbidden" }, { status: 403 }),
      outcome: "rejected",
    },
    {
      failure: "rejection without code",
      response: () =>
        HttpResponse.json({ message: "forbidden" }, { status: 400 }),
      outcome: "rejected",
    },
    {
      failure: "lost response",
      response: () => HttpResponse.error(),
      outcome: "uncertain",
    },
    {
      failure: "malformed success",
      response: () => HttpResponse.text("not json"),
      outcome: "uncertain",
    },
  ])(
    "classifies create $failure without replaying the request",
    async ({ response, outcome }) => {
      let requests = 0
      server.use(
        http.post(endpoint, () => {
          requests++
          return response()
        }),
      )
      const result = await createSub2ApiManagedAccountMutation(
        config,
        input,
        "active",
      )
      expect(result).toMatchObject({ outcome })
      expect(requests).toBe(1)
    },
  )

  it.each([
    {
      result: "rejected",
      response: () => HttpResponse.json({ code: 403 }, { status: 403 }),
    },
    { result: "uncertain", response: () => HttpResponse.error() },
  ])(
    "retains the confirmed creation when pausing is $result",
    async ({ response }) => {
      const requests: string[] = []
      server.use(
        http.post(endpoint, () => {
          requests.push("create")
          return HttpResponse.json({ code: 0, data: account })
        }),
        http.put(`${endpoint}/17`, () => {
          requests.push("pause")
          return response()
        }),
      )
      const result = await createSub2ApiManagedAccountMutation(
        config,
        input,
        "inactive",
      )
      expect(result).toMatchObject({
        outcome: "partial",
        confirmedEffects: [
          { kind: "resource-created", resourceKind: "channel" },
        ],
      })
      expect(requests).toEqual(["create", "pause"])
    },
  )

  it("returns the paused account only after both writes are confirmed", async () => {
    server.use(
      http.post(endpoint, () => HttpResponse.json({ code: 0, data: account })),
      http.put(`${endpoint}/17`, () =>
        HttpResponse.json({
          code: 0,
          data: { ...account, status: "inactive" },
        }),
      ),
    )
    const result = await createSub2ApiManagedAccountMutation(
      config,
      input,
      "inactive",
    )
    expect(result).toMatchObject({
      outcome: "succeeded",
      data: { id: 17, status: "inactive" },
      confirmedEffects: [
        { kind: "resource-created" },
        { kind: "status-updated", resourceId: 17 },
      ],
    })
  })

  it.each(["update", "delete"] as const)(
    "does not replay an uncertain %s",
    async (operation) => {
      let requests = 0
      server.use(
        http.all(`${endpoint}/17`, () => {
          requests++
          return HttpResponse.error()
        }),
      )
      const result =
        operation === "update"
          ? await updateSub2ApiManagedAccountMutation(config, 17, {
              notes: "Updated",
            })
          : await deleteSub2ApiManagedAccountMutation(config, 17)
      expect(result).toMatchObject({ outcome: "uncertain" })
      expect(requests).toBe(1)
    },
  )
})
