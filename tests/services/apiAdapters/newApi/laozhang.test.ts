import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { toNewApiTokenWrite } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { resolveNewApiFamilyTokenTransport } from "~/services/apiAdapters/newApi/tokenTransport"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://api2.laozhang.ai"
const siteType = SITE_TYPES.LAOZHANG
const request = {
  baseUrl,
  auth: { authType: AuthTypeEnum.Cookie, userId: "42" },
}

describe("LaoZhang protocol dispatch", () => {
  it("uses native restrictions when compatibility aliases are empty", async () => {
    server.use(
      http.get(`${baseUrl}/api/token/1`, () =>
        HttpResponse.json({
          success: true,
          data: {
            id: 1,
            name: "test",
            key: "sk-****",
            models: "gpt-test",
            ip_whitelist: "203.0.113.0/24",
            model_limits_enabled: false,
            model_limits: "",
            allow_ips: "",
          },
        }),
      ),
    )
    await expect(
      resolveNewApiFamilyTokenTransport(siteType).fetchTokenById(request, 1),
    ).resolves.toMatchObject({
      model_limits_enabled: true,
      model_limits: "gpt-test",
      allow_ips: "203.0.113.0/24",
    })
  })
  it("writes native model and IP restriction names for create and edit", async () => {
    const bodies: unknown[] = []
    server.use(
      http.all(`${baseUrl}/api/token/`, async ({ request }) => {
        const body = await request.json()
        bodies.push(body)
        return HttpResponse.json({ success: true, data: body })
      }),
    )
    const transport = resolveNewApiFamilyTokenTransport(siteType)
    const values = {
      name: "test",
      remain_quota: 500000,
      expired_time: -1,
      unlimited_quota: false,
      group: "",
      model_limits_enabled: true,
      model_limits: "gpt-test",
      allow_ips: "203.0.113.0/24",
    }
    await transport.createApiToken(request, values)
    await transport.updateApiToken(request, 1, values)
    expect(bodies).toEqual([
      expect.objectContaining({
        models: "gpt-test",
        ip_whitelist: "203.0.113.0/24",
      }),
      expect.objectContaining({
        id: 1,
        models: "gpt-test",
        ip_whitelist: "203.0.113.0/24",
      }),
    ])
  })
  it("preserves native writable settings when editing the name without sending secrets or counters", () => {
    const token = {
      id: 1,
      user_id: 42,
      key: "private-secret",
      name: "test",
      remain_quota: 500000,
      used_quota: 123,
      expired_time: -1,
      unlimited_quota: false,
      group: "",
      remark: "keep note",
      fallback_groups: "claude_code",
      billing_type: 1,
      subnet: "",
      ip_whitelist: "",
      advertisement: "",
      ad_position: "",
    } as unknown as NewApiToken
    const body = toNewApiTokenWrite(token, siteType)
    expect(body).toMatchObject({
      remark: "keep note",
      fallback_groups: "claude_code",
      billing_type: 1,
    })
    expect(body).not.toHaveProperty("key")
    expect(body).not.toHaveProperty("used_quota")
    expect(body).not.toHaveProperty("user_id")
  })
  it("refreshes quota and collects every zero-based daily income page", async () => {
    const pages: number[] = []
    server.use(
      http.get(`${baseUrl}/api/user/self`, () =>
        HttpResponse.json({
          success: true,
          data: { id: 42, username: "test-user", quota: 1500000 },
        }),
      ),
      http.get(`${baseUrl}/api/log/self/stat`, () =>
        HttpResponse.json({ success: true, data: { quota: 500000 } }),
      ),
      http.get(`${baseUrl}/api/log/self`, ({ request }) => {
        const params = new URL(request.url).searchParams
        expect(params.get("pageSize")).toBe("100")
        const page = Number(params.get("p"))
        pages.push(page)
        return HttpResponse.json({
          success: true,
          data:
            page === 0
              ? [
                  {
                    id: 1,
                    type: Number(params.get("type")),
                    quota: 500000,
                    content: "",
                    created_at: 1,
                  },
                ]
              : [],
        })
      }),
    )
    const result = await getSiteTypeCapabilities(
      siteType,
    ).account!.refresh!.refreshAccount({
      ...request,
      siteType,
      checkIn: createCompatibilityCheckInConfig({
        siteType,
        supported: false,
        automaticExecutionEnabled: false,
      }),
      includeTodayCashflow: true,
    })
    expect(result).toMatchObject({
      success: true,
      data: { quota: 1500000, today_quota_consumption: 500000 },
    })
    expect(pages).toContain(0)
    expect(pages).toContain(1)
  })
  it("reads zero-based inventory using pageSize until an empty page", async () => {
    const pages: number[] = []
    server.use(
      http.get(`${baseUrl}/api/token/`, ({ request }) => {
        const params = new URL(request.url).searchParams
        expect(params.get("pageSize")).toBe("100")
        const page = Number(params.get("p"))
        pages.push(page)
        return HttpResponse.json({
          success: true,
          data:
            page < 2
              ? [
                  {
                    id: page + 1,
                    name: `key-${page}`,
                    key: "sk-****",
                    remain_quota: 500000,
                    models: "",
                    ip_whitelist: "",
                  },
                ]
              : [],
        })
      }),
    )
    const tokens =
      await resolveNewApiFamilyTokenTransport(siteType).fetchAccountTokens(
        request,
      )
    expect(tokens.map((token) => token.id)).toEqual([1, 2])
    expect(pages).toEqual([0, 1, 2])
  })

  it("loads native available models and selectable groups", async () => {
    server.use(
      http.get(`${baseUrl}/api/user/available_model/`, () =>
        HttpResponse.json({ success: true, data: ["gpt-test"] }),
      ),
      http.get(`${baseUrl}/api/groupPro/selectable`, () =>
        HttpResponse.json({
          success: true,
          data: [{ name: "vip", display_name: "VIP", convert_ratio: 0.5 }],
        }),
      ),
    )
    const transport = resolveNewApiFamilyTokenTransport(siteType)
    expect(await transport.fetchAccountAvailableModels(request)).toEqual([
      "gpt-test",
    ])
    expect(await transport.fetchUserGroups(request)).toEqual({
      vip: { desc: "VIP", ratio: 0.5 },
    })
  })

  it("retains pricing sibling metadata and vendor evidence", async () => {
    server.use(
      http.get(`${baseUrl}/api/pricing`, () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              model_name: "gpt-test",
              vendor_id: 1,
              quota_type: 0,
              model_ratio: 1,
              completion_ratio: 2,
              enable_groups: ["vip"],
              supported_endpoint_types: ["openai"],
            },
          ],
          vendors: [{ id: 1, name: "OpenAI" }],
          group_ratio: { vip: 0.5 },
          usable_group: { vip: "VIP" },
        }),
      ),
    )
    await expect(
      getSiteTypeCapabilities(siteType).account!.modelPricing!.fetchPricing(
        request,
      ),
    ).resolves.toMatchObject({
      groupRatios: { vip: 0.5 },
      groupAccess: { kind: "authoritative", usableGroups: ["vip"] },
      data: [{ vendorEvidence: { name: "OpenAI" } }],
    })
  })

  it("uses the native aff_code invitation URL", async () => {
    server.use(
      http.get(`${baseUrl}/api/user/aff/`, () =>
        HttpResponse.json({ success: true, data: "test code" }),
      ),
    )
    await expect(
      getSiteTypeCapabilities(siteType).account!.inviteLink!.fetchInviteLink({
        request,
      }),
    ).resolves.toBe(`${baseUrl}/register/?aff_code=test+code`)
  })
})
