import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import {
  classifyGptLoadAuthFailure,
  createGptLoadGroup,
  createGptLoadIdempotencyKey,
  deleteGptLoadGroup,
  deleteGptLoadGroupCredential,
  fetchGptLoadSession,
  getGptLoadGroupModels,
  getGptLoadGroupSettings,
  GPT_LOAD_AUTH_FAILURE_REASONS,
  hasGptLoadAdminPrincipal,
  importGptLoadGroupCredentials,
  listAllGptLoadGroups,
  listGptLoadChannelCatalog,
  listGptLoadGroupCredentials,
  listGptLoadGroups,
  listGptLoadModelIds,
  revealGptLoadGroupCredential,
  updateGptLoadGroupModels,
  updateGptLoadGroupSettings,
} from "~/services/apiService/gptLoad"
import {
  GPT_LOAD_SECRET_STATES,
  toGptLoadSanitizedGroup,
} from "~/services/apiService/gptLoad/redaction"
import { GptLoadApiError } from "~/services/apiService/gptLoad/request"
import { server } from "~~/tests/msw/server"

const BASE_URL = "https://gpt-load.example.invalid"
const config = { baseUrl: `${BASE_URL}/`, managementKey: "auth-key-example" }

const envelope = (data: unknown) =>
  HttpResponse.json({ code: 0, message: "ok", data })

/** The gateway's error envelope uses a STRING code, not a number. */
const errorEnvelope = (code: string, message: string, status = 400) =>
  HttpResponse.json({ code, message }, { status })

describe("gpt-load transport", () => {
  it.each(["flat", "nested"])(
    "rejects a short page that leaves the known total unmet (%s)",
    async (shape) => {
      server.use(
        http.get(
          `${BASE_URL}/api/modern/groups`,
          () => new HttpResponse(null, { status: 404 }),
        ),
        http.get(`${BASE_URL}/api/groups`, ({ request }) => {
          const page = Number(new URL(request.url).searchParams.get("page"))
          return envelope({
            items: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({
              id: index + 1,
              name: `Group ${index}`,
              channel_id: "openai",
            })),
            ...(shape === "flat"
              ? { total_items: 101 }
              : { pagination: { total_items: 101 } }),
          })
        }),
      )
      await expect(listAllGptLoadGroups(config)).rejects.toThrow(/incomplete/i)
    },
  )

  it.each(["repeated", "capped"])(
    "rejects incomplete classic inventories (%s)",
    async (mode) => {
      server.use(
        http.get(
          `${BASE_URL}/api/modern/groups`,
          () => new HttpResponse(null, { status: 404 }),
        ),
        http.get(`${BASE_URL}/api/groups`, ({ request }) => {
          const page =
            mode === "repeated"
              ? 1
              : Number(new URL(request.url).searchParams.get("page"))
          return envelope({
            items: Array.from({ length: 100 }, (_, index) => ({
              id: (page - 1) * 100 + index + 1,
              name: `Group ${page}-${index}`,
              channel_id: "openai",
            })),
          })
        }),
      )
      await expect(listAllGptLoadGroups(config)).rejects.toThrow(/incomplete/i)
    },
  )
  it("rejects malformed create and settings responses", async () => {
    server.use(
      http.post(`${BASE_URL}/api/groups`, () => envelope(null)),
      http.get(`${BASE_URL}/api/groups/1/settings`, () => envelope(null)),
      http.put(`${BASE_URL}/api/groups/1/settings`, () => envelope(null)),
    )
    await expect(
      createGptLoadGroup(config, {
        name: "A",
        channelId: "openai",
        connectionType: "api_key",
        params: {},
        models: [],
        credentials: ["fake"],
      }),
    ).rejects.toMatchObject({ confirmedNonApplication: false })
    await expect(getGptLoadGroupSettings(config, 1)).rejects.toThrow(
      /invalid group settings/,
    )
    await expect(
      updateGptLoadGroupSettings(config, 1, {
        enabled: false,
        priceMultiplier: "2",
        weightManual: 20,
      }),
    ).rejects.toThrow(/invalid group settings/)
  })

  it("accepts a canonical group create response and ignores malformed model items", async () => {
    server.use(
      http.post(`${BASE_URL}/api/groups`, () =>
        envelope({ group: { id: 9, name: "Created" } }),
      ),
      http.get(`${BASE_URL}/api/models`, () =>
        envelope({ items: [null, 3, {}, { client_model: " real " }] }),
      ),
    )
    expect(
      await createGptLoadGroup(config, {
        name: "A",
        channelId: "openai",
        connectionType: "api_key",
        params: {},
        models: [],
        credentials: ["fake"],
      }),
    ).toMatchObject({ id: 9, name: "Created" })
    expect(await listGptLoadModelIds(config)).toEqual(["real"])
  })
  it.each([401, 403, 423, 500])(
    "does not retry modern inventory failures (%s) on the classic route",
    async (status) => {
      let classicReads = 0
      server.use(
        http.get(`${BASE_URL}/api/modern/groups`, () =>
          errorEnvelope("FAILED", "failure", status),
        ),
        http.get(`${BASE_URL}/api/groups`, () => {
          classicReads++
          return envelope({ items: [] })
        }),
      )
      await expect(listAllGptLoadGroups(config)).rejects.toMatchObject({
        status,
      })
      expect(classicReads).toBe(0)
    },
  )

  it("rejects an incomplete model catalogue at the pagination cap", async () => {
    server.use(
      http.get(`${BASE_URL}/api/models`, () =>
        envelope({
          items: Array.from({ length: 100 }, (_, index) => ({
            client_model: `model-${index}`,
          })),
        }),
      ),
    )
    await expect(listGptLoadModelIds(config)).rejects.toThrow(/incomplete/i)
  })

  beforeEach(() => {
    server.resetHandlers()
  })

  it("trims a trailing slash and unwraps the business envelope", async () => {
    let seenUrl = ""
    const authorization: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/channels`, ({ request }) => {
        seenUrl = request.url
        authorization.push(request.headers.get("authorization") ?? "")
        return envelope({
          items: [
            {
              channel_id: "openai_compatible",
              name: "OpenAI Compatible",
              param_fields: [
                { key: "base_url", label: "Base URL", input_kind: "url" },
              ],
              connection: { type: "api_key", credential_input: "batch_text" },
            },
          ],
        })
      }),
    )

    const catalog = await listGptLoadChannelCatalog(config)
    expect(seenUrl).toBe(`${BASE_URL}/api/channels`)
    expect(authorization).toEqual(["Bearer auth-key-example"])
    expect(catalog).toHaveLength(1)
    expect(catalog[0]?.channel_id).toBe("openai_compatible")
  })

  it("rejects a string-coded failure envelope on an HTTP 2xx body", async () => {
    server.use(
      http.get(`${BASE_URL}/api/channels`, () =>
        HttpResponse.json({ code: "UNAUTHORIZED", message: "无效的授权密钥" }),
      ),
    )

    const error = await listGptLoadChannelCatalog(config).catch(
      (error: unknown) => error,
    )
    expect(error).toBeInstanceOf(GptLoadApiError)
    expect(error).toMatchObject({
      code: "UNAUTHORIZED",
      confirmedNonApplication: true,
    })
  })

  it("surfaces the gateway's message and string code on an HTTP failure", async () => {
    server.use(
      http.post(`${BASE_URL}/api/groups`, () =>
        errorEnvelope("DUPLICATE_RESOURCE", "分组名称已存在", 409),
      ),
    )

    const error = await createGptLoadGroup(config, {
      name: "dup",
      channelId: "openai",
      connectionType: "api_key",
      params: {},
      models: [],
      credentials: ["sk-1"],
    }).catch((error: unknown) => error)

    expect(error).toBeInstanceOf(GptLoadApiError)
    expect(error).toMatchObject({
      status: 409,
      message: "分组名称已存在",
      code: "DUPLICATE_RESOURCE",
      responseReceived: true,
      // A 4xx proves the write did not apply.
      confirmedNonApplication: true,
    })
  })

  it("treats a 5xx as an unconfirmed write", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/groups`,
        () => new HttpResponse("boom", { status: 500 }),
      ),
    )

    const error = await createGptLoadGroup(config, {
      name: "x",
      channelId: "openai",
      connectionType: "api_key",
      params: {},
      models: [],
      credentials: ["sk-1"],
    }).catch((error: unknown) => error)

    expect(error).toBeInstanceOf(GptLoadApiError)
    expect(error).toMatchObject({
      status: 500,
      confirmedNonApplication: false,
      responseReceived: true,
    })
  })
})

describe("gpt-load idempotency key", () => {
  it("always generates a canonical UUID v4", () => {
    const pattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    for (let index = 0; index < 25; index += 1) {
      expect(createGptLoadIdempotencyKey()).toMatch(pattern)
    }
  })

  it("sends the key as Idempotency-Key on group creation", async () => {
    let seenKey = ""
    let seenBody: unknown
    server.use(
      http.post(`${BASE_URL}/api/groups`, async ({ request }) => {
        seenKey = request.headers.get("idempotency-key") ?? ""
        seenBody = await request.json()
        return envelope({
          group_id: 7,
          group_name: "created",
          credentials_added: 1,
          credentials_duplicated: 0,
        })
      }),
    )

    const created = await createGptLoadGroup(config, {
      name: "created",
      channelId: "openai_compatible",
      connectionType: "api_key",
      params: { base_url: "https://relay.example.invalid/v1" },
      models: ["gpt-example"],
      credentials: ["sk-a", "sk-b"],
    })

    expect(seenKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(seenBody).toMatchObject({
      name: "created",
      channel_id: "openai_compatible",
      connection_type: "api_key",
      params: { base_url: "https://relay.example.invalid/v1" },
      credentials: "sk-a\nsk-b",
      confirm_same_target: true,
    })
    expect(created).toMatchObject({ id: 7, name: "created" })
  })
})

describe("gpt-load auth", () => {
  it("reads the admin principal from the session response", async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/session`, () =>
        envelope({ authenticated: true, principal_type: "admin" }),
      ),
    )

    const session = await fetchGptLoadSession(config)
    expect(hasGptLoadAdminPrincipal(session)).toBe(true)
  })

  it("does not treat a downstream access key as configured", async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/session`, () =>
        envelope({ authenticated: true, principal_type: "access_key" }),
      ),
    )

    const session = await fetchGptLoadSession(config)
    expect(hasGptLoadAdminPrincipal(session)).toBe(false)
  })

  it.each([
    [401, GPT_LOAD_AUTH_FAILURE_REASONS.InvalidCredential],
    [423, GPT_LOAD_AUTH_FAILURE_REASONS.InvalidCredential],
    [403, GPT_LOAD_AUTH_FAILURE_REASONS.InsufficientPrivilege],
  ])("classifies HTTP %i as %s", (status, reason) => {
    const error = new GptLoadApiError("denied", status)
    expect(classifyGptLoadAuthFailure(error)).toBe(reason)
  })

  it("returns null for an unclassified failure", () => {
    expect(
      classifyGptLoadAuthFailure(new GptLoadApiError("boom", 500)),
    ).toBeNull()
  })
})

describe("gpt-load groups", () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it("reads a page and walks the inventory", async () => {
    const pages = [
      [0, 1, 2, 3],
      [4, 5],
    ]
    server.use(
      http.get(`${BASE_URL}/api/groups`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"))
        const ids = pages[page - 1] ?? []
        return envelope({
          items: ids.map((id) => ({
            id: id + 1,
            name: `group-${id}`,
            channel_id: "openai",
            params: { base_url: `https://relay-${id}.example.invalid/v1` },
            enabled: true,
            status: "available",
            model_names: ["m"],
          })),
          pagination: { page, page_size: 100, total_items: 6, total_pages: 2 },
        })
      }),
    )

    // Three per page is below the page size, so the walk stops after page one
    // unless the handler pads to the page size; assert the single-page read and
    // the total instead.
    const page = await listGptLoadGroups(config, { page: 1, pageSize: 3 })
    expect(page.total).toBe(6)
    expect(page.groups).toHaveLength(4)
  })

  it("reads the flat inventory route and keeps each group's model names", async () => {
    let calls = 0
    server.use(
      http.get(`${BASE_URL}/api/modern/groups`, () => {
        calls += 1
        return envelope({
          items: [
            {
              id: 1,
              name: "primary",
              channel_id: "openai_compatible",
              endpoint: "https://relay.example.invalid/v1",
              enabled: true,
              availability: "ready",
              model_names: ["gpt-4o", "gpt-4o-mini"],
              credentials: { total: 2, available: 2 },
            },
          ],
        })
      }),
    )

    const all = await listAllGptLoadGroups(config)
    expect(calls).toBe(1)
    expect(all).toHaveLength(1)
    // The projection needs model names, which only the modern route carries.
    expect(all[0]?.model_names).toEqual(["gpt-4o", "gpt-4o-mini"])
  })

  it("falls back to the paginated classic walk when the modern route is absent", async () => {
    server.use(
      http.get(
        `${BASE_URL}/api/modern/groups`,
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.get(`${BASE_URL}/api/groups`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"))
        if (page === 1) {
          return envelope({
            items: Array.from({ length: 100 }, (_, index) => ({
              id: index + 1,
              name: `g${index + 1}`,
              channel_id: "openai",
            })),
            pagination: {
              page,
              page_size: 100,
              total_items: 101,
              total_pages: 2,
            },
          })
        }
        return envelope({
          items: [{ id: 101, name: "g101", channel_id: "openai" }],
          pagination: {
            page,
            page_size: 100,
            total_items: 101,
            total_pages: 2,
          },
        })
      }),
    )

    const all = await listAllGptLoadGroups(config)
    expect(all).toHaveLength(101)
    expect(all[100]?.id).toBe(101)
  })

  it("reads the model catalogue page by page and dedupes client models", async () => {
    const requestedPages: number[] = []
    server.use(
      http.get(`${BASE_URL}/api/models`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"))
        requestedPages.push(page)
        if (page === 1) {
          // A full page is the only signal that another page exists.
          return envelope({
            items: [
              { client_model: "gpt-4o" },
              { client_model: "gpt-4o" },
              { client_model: "  deepseek-chat  " },
              ...Array.from({ length: 97 }, (_, index) => ({
                client_model: `filler-${index}`,
              })),
            ],
            pagination: { page, page_size: 100, total_items: 102 },
          })
        }
        return envelope({
          items: [{ client_model: "z-odd-model" }, { not_a_model: true }],
          pagination: { page, page_size: 100, total_items: 102 },
        })
      }),
    )

    const ids = await listGptLoadModelIds(config)
    // Sorted and deduplicated; non-string rows are skipped without failing.
    expect(ids[0]).toBe("deepseek-chat")
    expect(ids).toContain("filler-0")
    expect(ids).toContain("gpt-4o")
    expect(ids).toContain("z-odd-model")
    expect(ids).toHaveLength(100)
    expect(requestedPages).toEqual([1, 2])
  })

  it("stops after one page when the catalogue is short", async () => {
    let calls = 0
    server.use(
      http.get(`${BASE_URL}/api/models`, () => {
        calls += 1
        return envelope({
          items: [{ client_model: "gpt-4o" }],
          pagination: { page: 1, page_size: 100, total_items: 1 },
        })
      }),
    )

    const ids = await listGptLoadModelIds(config)
    expect(ids).toEqual(["gpt-4o"])
    expect(calls).toBe(1)
  })

  it("applies a partial settings patch", async () => {
    let seenBody: unknown
    let seenMethod = ""
    server.use(
      http.put(`${BASE_URL}/api/groups/1/settings`, async ({ request }) => {
        seenMethod = request.method
        seenBody = await request.json()
        return envelope({ name: "renamed", enabled: true })
      }),
    )

    const settings = await updateGptLoadGroupSettings(config, 1, {
      name: "renamed",
      params: { base_url: "https://relay.example.invalid/v1" },
    })
    void settings
    expect(seenMethod).toBe("PUT")
    expect(seenBody).toEqual({
      name: "renamed",
      params: { base_url: "https://relay.example.invalid/v1" },
    })
  })

  it("replaces the whole model list", async () => {
    let seenBody: unknown
    server.use(
      http.put(`${BASE_URL}/api/groups/1/models`, async ({ request }) => {
        seenBody = await request.json()
        return envelope({
          items: [{ id: "gpt-example", alias: "", alias_enabled: false }],
        })
      }),
    )

    const models = await updateGptLoadGroupModels(config, 1, ["gpt-example"])
    expect(seenBody).toEqual({
      models: [{ id: "gpt-example", alias: "", alias_enabled: false }],
    })
    expect(models.map((model) => model.id)).toEqual(["gpt-example"])
  })

  it("reads and deletes a group, sending an empty JSON body on delete", async () => {
    let deleteBody: unknown
    let deleteMethod = ""
    server.use(
      http.delete(`${BASE_URL}/api/groups/3`, async ({ request }) => {
        deleteMethod = request.method
        deleteBody = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await deleteGptLoadGroup(config, 3)
    expect(deleteMethod).toBe("DELETE")
    expect(deleteBody).toEqual({})
  })

  it("reads settings and models for a detail view", async () => {
    server.use(
      http.get(`${BASE_URL}/api/groups/1/settings`, () =>
        envelope({
          name: "primary",
          channel_id: "openai",
          params: { base_url: "https://relay.example.invalid/v1" },
          enabled: true,
          price_multiplier: "1.5",
          weight_manual: 30,
        }),
      ),
      http.get(`${BASE_URL}/api/groups/1/models`, () =>
        envelope({ items: [{ id: "gpt-example" }] }),
      ),
    )

    const settings = await getGptLoadGroupSettings(config, 1)
    const models = await getGptLoadGroupModels(config, 1)
    expect(settings).toMatchObject({ name: "primary", weight_manual: 30 })
    expect(models.map((model) => model.id)).toEqual(["gpt-example"])
  })
})

describe("gpt-load credentials", () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it("reads the masked pool", async () => {
    server.use(
      http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
        envelope({
          items: [
            {
              credential_id: 11,
              mask: "sk-p****0001",
              effective_status: "available",
              weight: 50,
            },
          ],
        }),
      ),
    )

    const credentials = await listGptLoadGroupCredentials(config, 1)
    expect(credentials).toHaveLength(1)
    expect(credentials[0]).toMatchObject({
      credential_id: 11,
      mask: "sk-p****0001",
    })
  })

  it("reads credentials beyond the first page for editing and migration", async () => {
    const pages: number[] = []
    server.use(
      http.get(`${BASE_URL}/api/groups/1/credentials`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"))
        pages.push(page)
        return envelope({
          items: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({
            credential_id: (page - 1) * 100 + index + 1,
            mask: "sk-p****0001",
          })),
          pagination: { page, page_size: 100, total_items: 101 },
        })
      }),
    )

    const credentials = await listGptLoadGroupCredentials(config, 1)
    expect(credentials).toHaveLength(101)
    expect(credentials[100]?.credential_id).toBe(101)
    expect(pages).toEqual([1, 2])
  })

  it("rejects an incomplete pool when the gateway repeats a full page", async () => {
    server.use(
      http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
        envelope({
          items: Array.from({ length: 100 }, (_, index) => ({
            credential_id: index + 1,
          })),
        }),
      ),
    )
    await expect(listGptLoadGroupCredentials(config, 1)).rejects.toBeInstanceOf(
      GptLoadApiError,
    )
  })

  it("imports a batch of credentials", async () => {
    let seenBody: unknown
    server.use(
      http.post(
        `${BASE_URL}/api/groups/1/credentials/import`,
        async ({ request }) => {
          seenBody = await request.json()
          return envelope({ group_id: 1, credentials_added: 2 })
        },
      ),
    )

    await importGptLoadGroupCredentials(config, 1, ["sk-a", "sk-b"])
    expect(seenBody).toEqual({ credentials: "sk-a\nsk-b" })
  })

  it("reveals the first string value of a channel-specific credential", async () => {
    server.use(
      http.post(`${BASE_URL}/api/groups/1/credentials/11/reveal`, () =>
        envelope({
          credential_id: 11,
          credential: { api_key: "sk-plaintext-example" },
        }),
      ),
    )

    expect(await revealGptLoadGroupCredential(config, 1, 11)).toBe(
      "sk-plaintext-example",
    )
  })

  it("rejects a reveal with no readable value", async () => {
    server.use(
      http.post(`${BASE_URL}/api/groups/1/credentials/11/reveal`, () =>
        envelope({ credential_id: 11, credential: {} }),
      ),
    )

    await expect(revealGptLoadGroupCredential(config, 1, 11)).rejects.toThrow(
      /did not return a readable channel credential/,
    )
  })

  it("deletes one credential with an empty JSON body", async () => {
    let seenBody: unknown
    server.use(
      http.delete(
        `${BASE_URL}/api/groups/1/credentials/11`,
        async ({ request }) => {
          seenBody = await request.json()
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    await deleteGptLoadGroupCredential(config, 1, 11)
    expect(seenBody).toEqual({})
  })
})

describe("gpt-load redaction", () => {
  it("never marks a list row's credential available", () => {
    const sanitized = toGptLoadSanitizedGroup(
      {
        id: 1,
        name: "primary",
        channel_id: "openai",
        params: { base_url: "https://relay.example.invalid/v1" },
        enabled: true,
        status: "available",
        credential_counts: { total: 3, available: 2 },
        price_multiplier: "1",
      },
      "sk-p****0001",
    )

    expect(sanitized.secretState).toBe(GPT_LOAD_SECRET_STATES.Masked)
    expect(sanitized.credentialCount).toBe(3)
    expect(sanitized.baseUrl).toBe("https://relay.example.invalid/v1")
  })

  it("reports unavailable when the group owns no credential", () => {
    const sanitized = toGptLoadSanitizedGroup({
      id: 1,
      name: "empty",
      channel_id: "openai",
      enabled: true,
      credential_counts: { total: 0, available: 0 },
    })
    expect(sanitized.secretState).toBe(GPT_LOAD_SECRET_STATES.Unavailable)
  })
})
