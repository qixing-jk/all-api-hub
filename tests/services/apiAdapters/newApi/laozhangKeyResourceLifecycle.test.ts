import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { createNewApiAccountKeyResources } from "~/services/apiAdapters/newApi/keys/accountKeyResource"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://api2.laozhang.ai"
const siteType = SITE_TYPES.LAOZHANG
const request = {
  baseUrl,
  accountId: "account-1",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test", userId: 42 },
}
const fullToken = {
  id: 1,
  user_id: 42,
  key: "sk-****",
  status: 1,
  name: "original",
  created_time: 1,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  group: "default",
  models: "",
  ip_whitelist: "",
  billing_type: 4,
  fallback_groups: "",
  remark: "keep",
  subnet: "",
  advertisement: "",
  ad_position: -1,
  rate_limit_duration: 60,
  rate_limit_num: 12,
  rate_limit_exceeded_message: "wait",
  retry_keep_billing_type_enabled: null,
  activate_on_first_use: true,
  valid_duration: 7,
  mj_translate_enabled: true,
  mj_translate_base_url: "https://translation.example",
  mj_translate_model: "model",
  mj_translate_api_key: "saved-translation-secret",
  mj_discord_proxy_url: "",
}

// The live inventory omits limiter, activation, retry and all MJ configuration.
const listProjection = (row: typeof fullToken) =>
  Object.fromEntries(
    Object.entries(row).filter(
      ([id]) =>
        !id.startsWith("mj_") &&
        !id.startsWith("rate_limit_") &&
        ![
          "activate_on_first_use",
          "valid_duration",
          "retry_keep_billing_type_enabled",
        ].includes(id),
    ),
  )

function fixture() {
  const rows = [{ ...fullToken }]
  const writes: Record<string, unknown>[] = []
  server.use(
    http.get(`${baseUrl}/api/token/`, ({ request }) =>
      HttpResponse.json({
        success: true,
        data:
          new URL(request.url).searchParams.get("p") === "0"
            ? rows.map(listProjection)
            : [],
      }),
    ),
    http.get(`${baseUrl}/api/token/:id`, ({ params }) =>
      HttpResponse.json({
        success: true,
        data: rows.find((row) => row.id === Number(params.id)),
      }),
    ),
    http.put(`${baseUrl}/api/token/`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      writes.push(body)
      Object.assign(rows.find((row) => row.id === body.id)!, body)
      return HttpResponse.json({ success: true })
    }),
    http.post(`${baseUrl}/api/token/`, async ({ request }) => {
      rows.push({
        ...fullToken,
        ...((await request.json()) as Record<string, unknown>),
        id: 2,
      })
      return HttpResponse.json({ success: true })
    }),
  )
  return { rows, writes }
}
const open = () =>
  createNewApiAccountKeyResources(siteType).open({
    account: { id: "account-1", siteType },
    request,
  })
const ref = {
  accountId: "account-1",
  siteType,
  scopeKey: "account",
  resourceId: "1",
}

describe("LaoZhang editable detail hydration", () => {
  it("keeps update confirmation uncertain when the written key disappears from inventory", async () => {
    const { rows, writes } = fixture()
    server.use(
      http.put(`${baseUrl}/api/token/`, async ({ request }) => {
        writes.push((await request.json()) as Record<string, unknown>)
        rows.splice(0)
        return HttpResponse.json({ success: true })
      }),
    )
    const collection = await (await open()).openCollection("account")
    const editor = await collection.openEditEditor(ref)
    await expect(
      editor.submit({ ...editor.initialValues, name: "renamed" }),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
    expect(writes).toHaveLength(1)
  })

  it("preserves settings refreshed between opening and submitting the editor", async () => {
    const { rows, writes } = fixture()
    const collection = await (await open()).openCollection("account")
    const editor = await collection.openEditEditor(ref)
    rows[0]!.mj_translate_api_key = "rotated-translation-secret"
    rows[0]!.rate_limit_num = 19
    await editor.submit({ ...editor.initialValues, name: "renamed" })
    expect(writes[0]).toMatchObject({
      mj_translate_api_key: "rotated-translation-secret",
      rate_limit_num: 19,
    })
  })
  it("rejects a mismatched native detail identity before editing or writing", async () => {
    const { writes } = fixture()
    server.use(
      http.get(`${baseUrl}/api/token/:id`, () =>
        HttpResponse.json({
          success: true,
          data: { ...fullToken, user_id: 999 },
        }),
      ),
    )
    const collection = await (await open()).openCollection("account")
    await expect(collection.openEditEditor(ref)).rejects.toBeInstanceOf(
      AccountKeyResourceError,
    )
    expect(writes).toEqual([])
  })
  it("opens full native settings that are absent from inventory", async () => {
    fixture()
    const session = await open()
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor(ref)
    expect(editor.initialValues).toMatchObject({
      mj_translate_enabled: true,
      rate_limit_enabled: true,
      activate_on_first_use: true,
      valid_duration: 7,
      mj_translate_api_key: { kind: "unchanged" },
    })
  })
  it("preserves hidden native settings and confirms updates against full detail", async () => {
    const { writes } = fixture()
    const collection = await (await open()).openCollection("account")
    const editor = await collection.openEditEditor(ref)
    const result = await editor.submit({
      ...editor.initialValues,
      name: "renamed",
    })
    expect(result.facts?.ref.resourceId).toBe("1")
    expect(writes[0]).toMatchObject({
      name: "renamed",
      mj_translate_enabled: true,
      mj_translate_api_key: "saved-translation-secret",
      rate_limit_duration: 60,
      valid_duration: 7,
    })
  })
  it("confirms a created key even when its native settings are omitted from inventory", async () => {
    fixture()
    const editor = await (await open()).openCreateEditor("account")
    const result = await editor.submit({
      ...editor.initialValues,
      name: "created",
      group: "default",
    })
    expect(result.facts?.ref.resourceId).toBe("2")
  })
})
