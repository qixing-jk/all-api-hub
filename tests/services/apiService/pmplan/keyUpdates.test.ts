import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { PMPLAN_KEY_STATUSES } from "~/services/apiService/pmplan/constants"
import type { PmplanKey } from "~/services/apiService/pmplan/keys"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

afterEach(() => vi.restoreAllMocks())

const key = (): PmplanKey => ({
  id: 7,
  key_prefix: "sk-pm-test…",
  status: PMPLAN_KEY_STATUSES.Active,
  all_models: true,
  models: [],
  expires_at: "2030-01-01T00:00:00Z",
})
async function openCollection() {
  const session = await getSiteTypeCapabilities(
    "pmplan",
  ).account!.keyResourceManagement!.open({
    account: { id: "pm-account", siteType: "pmplan" },
    request: {
      accountId: "pm-account",
      baseUrl: "https://plan.pmcat.top",
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "661",
        cookie: "pmplan_session=test",
      },
    },
  })
  return session.openCollection("account")
}

it.each([401, 403, 503])(
  "keeps an accepted revoke uncertain when readback fails with %s",
  async (status) => {
    installCookieTransport("pmplan_session", "plan.pmcat.top")
    let revoked = false
    let deletes = 0
    server.use(
      http.get("https://plan.pmcat.top/api/me", () =>
        HttpResponse.json({ user: { id: 661, username: "sample" } }),
      ),
      http.get("https://plan.pmcat.top/api/keys", () =>
        revoked
          ? HttpResponse.json(
              { error: { message: "Readback failed" } },
              { status },
            )
          : HttpResponse.json({ keys: [key()] }),
      ),
      http.delete("https://plan.pmcat.top/api/keys/7", () => {
        revoked = true
        deletes++
        return HttpResponse.json({ ok: true })
      }),
    )
    const collection = await openCollection()
    const ref = (await collection.list()).items[0]!.ref
    await expect(collection.revoke!(ref)).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
    expect(deletes).toBe(1)
  },
)

it("preserves unknown native key status without enabling mutations", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/keys", () =>
      HttpResponse.json({ keys: [{ ...key(), status: "future-status" }] }),
    ),
  )
  const collection = await openCollection()
  const item = (await collection.list()).items[0]!
  expect(item.status).toBe("unknown")
  expect(item.actions).toMatchObject({ canRevoke: false, canUpdate: false })
})

it("edits and clears model restrictions, preserving expiry and never returning a secret", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  let current = key()
  const writes: unknown[] = []
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/keys", () =>
      HttpResponse.json({ keys: [current] }),
    ),
    http.get("https://plan.pmcat.top/api/models", () =>
      HttpResponse.json({
        models: [
          {
            name: "gpt-test",
            input_micro: 1,
            output_micro: 2,
            channel_count: 1,
          },
        ],
      }),
    ),
    http.put(
      "https://plan.pmcat.top/api/keys/7/models",
      async ({ request }) => {
        const body = (await request.json()) as { models: string[] }
        writes.push(body)
        current = {
          ...current,
          models: body.models,
          all_models: body.models.length === 0,
        }
        return HttpResponse.json({
          ok: true,
          models: current.models,
          all_models: current.all_models,
        })
      },
    ),
  )
  const collection = await openCollection()
  const item = (await collection.list()).items[0]!
  expect(item.actions.canUpdate).toBe(true)
  const editor = await collection.openEditEditor(item.ref)
  expect(editor.fields.map((field) => field.fieldId)).toEqual(["models"])
  const result = await editor.submit({ models: ["gpt-test"] })
  expect(result.createdSecret).toBeUndefined()
  const reopened = await collection.openEditEditor(item.ref)
  expect(reopened.initialValues.models).toEqual(["gpt-test"])
  await reopened.submit({ models: [] })
  expect(
    (await collection.openEditEditor(item.ref)).initialValues.models,
  ).toEqual([])
  expect(writes).toEqual([{ models: ["gpt-test"] }, { models: [] }])
  expect(current.expires_at).toBe("2030-01-01T00:00:00Z")
})

it.each(["models", PMPLAN_KEY_STATUSES.Revoked, PMPLAN_KEY_STATUSES.Expired])(
  "refuses an edit when the open key changes: %s",
  async (change) => {
    installCookieTransport("pmplan_session", "plan.pmcat.top")
    let current = key()
    let puts = 0
    server.use(
      http.get("https://plan.pmcat.top/api/me", () =>
        HttpResponse.json({ user: { id: 661, username: "sample" } }),
      ),
      http.get("https://plan.pmcat.top/api/keys", () =>
        HttpResponse.json({ keys: [current] }),
      ),
      http.get("https://plan.pmcat.top/api/models", () =>
        HttpResponse.json({ models: [] }),
      ),
      http.put("https://plan.pmcat.top/api/keys/7/models", () => {
        puts++
        return HttpResponse.json({ ok: true })
      }),
    )
    const collection = await openCollection()
    const ref = (await collection.list()).items[0]!.ref
    const editor = await collection.openEditEditor(ref)
    current =
      change === "models"
        ? { ...current, all_models: false, models: ["new-choice"] }
        : { ...current, status: change }
    await expect(editor.submit({ models: [] })).rejects.toMatchObject({
      failure: { code: "resource_changed" },
    })
    expect(puts).toBe(0)
    if (change !== "models") {
      expect((await collection.list()).items[0]!.actions.canUpdate).toBe(false)
      await expect(collection.openEditEditor(ref)).rejects.toMatchObject({
        failure: { code: "unavailable" },
      })
    }
  },
)

it("blocks replay after an accepted model edit loses readback authorization", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  let puts = 0
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/keys", () =>
      puts
        ? HttpResponse.json({ error: "Expired" }, { status: 401 })
        : HttpResponse.json({ keys: [key()] }),
    ),
    http.get("https://plan.pmcat.top/api/models", () =>
      HttpResponse.json({ models: [] }),
    ),
    http.put("https://plan.pmcat.top/api/keys/7/models", () => {
      puts++
      return HttpResponse.json({ ok: true, all_models: true, models: [] })
    }),
  )
  const collection = await openCollection()
  const editor = await collection.openEditEditor(
    (await collection.list()).items[0]!.ref,
  )
  await expect(editor.submit({ models: [] })).rejects.toMatchObject({
    failure: { code: "mutation_state_uncertain" },
  })
  await expect(editor.submit({ models: [] })).rejects.toThrow()
  expect(puts).toBe(1)
})

it("keeps unavailable previous models visible and requires correcting them before a write", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  let puts = 0
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/keys", () =>
      HttpResponse.json({
        keys: [{ ...key(), all_models: false, models: ["retired"] }],
      }),
    ),
    http.get("https://plan.pmcat.top/api/models", () =>
      HttpResponse.json({ models: [] }),
    ),
    http.put("https://plan.pmcat.top/api/keys/7/models", () => {
      puts++
      return HttpResponse.json({ ok: true })
    }),
  )
  const collection = await openCollection()
  const editor = await collection.openEditEditor(
    (await collection.list()).items[0]!.ref,
  )
  expect(editor.initialValues.models).toEqual(["retired"])
  expect(editor.fields[0]).toMatchObject({ options: [{ value: "retired" }] })
  await expect(editor.submit(editor.initialValues)).rejects.toThrow()
  expect(editor.validate({ models: [] })).toEqual({ valid: true })
  expect(puts).toBe(0)
})
