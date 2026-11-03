import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { nanoGptKeyResources } from "~/services/apiAdapters/nanogpt/keyResources"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { nativeKey } from "~~/tests/test-utils/nanogpt"

const origin = "https://nano-gpt.com/api/management/v1"
const request = {
  baseUrl: "https://nano-gpt.com",
  accountId: "nano",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "sk-nano-mgmt-fixture",
  },
}
const open = () =>
  nanoGptKeyResources.open({
    account: { id: "nano", siteType: SITE_TYPES.NANOGPT },
    request,
  })

describe("NanoGPT native key workflow", () => {
  it("allows inference-only accounts to load an empty native inventory without management requests", async () => {
    let reads = 0
    server.use(
      http.get(`${origin}/api-keys`, () => {
        reads++
        return HttpResponse.json({ data: [nativeKey] })
      }),
    )
    const auth = { ...request.auth, accessToken: "inference-fixture" }
    const session = await nanoGptKeyResources.open({
      account: { id: "nano", siteType: SITE_TYPES.NANOGPT },
      request: { ...request, auth },
    })
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    expect((await collection.list()).items).toEqual([])
    expect(nanoGptKeyResources.operations?.(auth)).toEqual({
      create: false,
      update: false,
      delete: false,
    })
    expect(reads).toBe(0)
  })
  it("lists non-exportable keys, edits one limit without replacing untouched fields and revokes once", async () => {
    let state = { ...nativeKey }
    let deletes = 0
    server.use(
      http.get(`${origin}/api-keys`, () =>
        HttpResponse.json({ data: [state] }),
      ),
      http.get(`${origin}/api-keys/17`, () => HttpResponse.json(state)),
      http.patch(`${origin}/api-keys/17`, async ({ request }) => {
        const patch = await request.json()
        expect(patch).toEqual({ daily_usd_limit: 3.75 })
        state = { ...state, ...(patch as object) }
        return HttpResponse.json(state)
      }),
      http.delete(`${origin}/api-keys/17`, () => {
        deletes++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const session = await open()
    const collection = await session.openCollection("account")
    const list = await collection.list()
    const facts = list.items[0]!
    expect(facts.runtimeSecret).toBeUndefined()
    expect(facts.status).toBe("enabled")
    const editor = await collection.openEditEditor(facts.ref)
    expect(editor.initialValues.weekly_usd_limit).toBe(10)
    expect(
      editor.validate({ ...editor.initialValues, daily_rpd_limit: 0.5 }).valid,
    ).toBe(false)
    const result = await editor.submit({
      ...editor.initialValues,
      daily_usd_limit: 3.75,
    })
    expect(result.facts?.displayName).toBe("fixture")
    expect(state.weekly_usd_limit).toBe(10)
    expect((await collection.get(facts.ref)).displayName).toBe("fixture")
    await collection.delete(facts.ref)
    expect(deletes).toBe(1)
  })
})

it("keeps a post-dispatch malformed create uncertain and does not replay the mutation", async () => {
  let creates = 0
  server.use(
    http.post(`${origin}/api-keys`, () => {
      creates++
      return HttpResponse.json({ ...nativeKey, id: "18" })
    }),
  )
  const session = await open()
  const editor = await session.openCreateEditor("account")
  await expect(
    editor.submit({ ...editor.initialValues, name: "created" }),
  ).rejects.toMatchObject({
    failure: { code: "mutation_state_uncertain" },
  })
  await expect(
    editor.submit({ ...editor.initialValues, name: "created" }),
  ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
  expect(creates).toBe(1)
})

it("retains permission-denied recovery for usage-only tokens instead of marking them invalid", async () => {
  server.use(
    http.get(`${origin}/api-keys`, () =>
      HttpResponse.json(
        {
          error: {
            code: "insufficient_scope",
            message: "Key read scope required",
          },
        },
        { status: 403 },
      ),
    ),
  )
  const collection = await (await open()).openCollection("account")
  await expect(collection.list()).rejects.toMatchObject({
    failure: { code: "permission_denied" },
  })
})

it("does not replay an update when authoritative readback fails", async () => {
  let reads = 0
  let writes = 0
  server.use(
    http.get(`${origin}/api-keys/17`, () =>
      ++reads < 3
        ? HttpResponse.json(nativeKey)
        : HttpResponse.json({ error: "readback unavailable" }, { status: 503 }),
    ),
    http.patch(`${origin}/api-keys/17`, () => {
      writes++
      return HttpResponse.json({ ...nativeKey, name: "changed" })
    }),
  )
  const session = await open()
  const collection = await session.openCollection("account")
  const ref = {
    accountId: "nano",
    siteType: SITE_TYPES.NANOGPT,
    scopeKey: "account",
    resourceId: "17",
  }
  const editor = await collection.openEditEditor(ref)
  await expect(
    editor.submit({ ...editor.initialValues, name: "changed" }),
  ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
  await expect(
    editor.submit({ ...editor.initialValues, name: "changed" }),
  ).rejects.toThrow()
  expect(writes).toBe(1)
})

it("validates native limits and preserves legacy policy without rewriting unchanged fields", async () => {
  const baseline = {
    ...nativeKey,
    zdr_policy: "unset",
    expires_at: "2027-01-01T00:00:00Z",
  }
  let writes = 0
  server.use(
    http.get(`${origin}/api-keys/17`, () => HttpResponse.json(baseline)),
    http.patch(`${origin}/api-keys/17`, () => {
      writes++
      return HttpResponse.json(baseline)
    }),
  )
  const session = await open()
  const collection = await session.openCollection("account")
  const editor = await collection.openEditEditor({
    accountId: "nano",
    siteType: SITE_TYPES.NANOGPT,
    scopeKey: "account",
    resourceId: "17",
  })
  expect(editor.validate(editor.initialValues).valid).toBe(true)
  for (const [field, value] of [
    ["name", " "],
    ["name", "a".repeat(121)],
    ["daily_rpd_limit", 0.5],
    ["daily_rpd_limit", 10_000_001],
    ["daily_usd_limit", 0.00001],
    ["daily_usd_limit", 100_001],
    ["weekly_request_limit", -1],
    ["monthly_input_token_limit", 2_147_483_648],
    ["expires_at", "not-a-date"],
  ] as const) {
    expect(
      editor.validate({ ...editor.initialValues, [field]: value }).valid,
      `${field}: ${value}`,
    ).toBe(false)
  }
  expect(
    editor.validate({
      ...editor.initialValues,
      daily_usd_limit: 0,
      monthly_request_limit: null,
    }).valid,
  ).toBe(true)
  await editor.submit(editor.initialValues)
  expect(writes).toBe(0)
})

it("keeps a denied write retryable without claiming the token is invalid", async () => {
  let writes = 0
  server.use(
    http.post(`${origin}/api-keys`, () => {
      writes++
      return HttpResponse.json(
        { error: { code: "insufficient_scope" } },
        { status: 403 },
      )
    }),
  )
  const session = await open()
  const editor = await session.openCreateEditor("account")
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(editor.submit(editor.initialValues)).rejects.toMatchObject({
      failure: { code: "permission_denied" },
      mutationCertainty: "not-applied",
    })
  }
  expect(writes).toBe(2)
})
