import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { prepareDefaultAccountKeyCreation } from "~/services/accounts/keys/accountKeyCreation"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { EditableResourceProjection } from "~/services/apiAdapters/contracts/resourceNative"
import { novitaKeyEditor } from "~/services/apiAdapters/novita/keyEditor"
import { novitaAccountKeyResources } from "~/services/apiAdapters/novita/keyResources"
import { encodeNovitaCredentials } from "~/services/apiService/novita/constants"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const keyRow = {
  name: "all-api-hub-probe-key",
  id: "508046",
  key: "",
  expireTime: "",
  createTime: "2026-10-25 00:52:12",
  stringId: "key_dec88048c9a343fdb089114885e13768",
  memberId: "",
  uuid: "00000000-0000-4000-8000-000000000001",
  maskedKey: "sk_1Av3****VaCk",
  lastUsedAt: "-1",
  modelAccessPolicy: {
    mode: "all_enabled",
    allowedModelCount: 0,
    excludedModelCount: 0,
  },
  ipAccessPolicy: null,
}

const openSession = async (accessToken = "sk_key") =>
  await novitaAccountKeyResources.open({
    account: {
      id: "novita-account",
      name: "Novita AI",
      siteType: SITE_TYPES.NOVITA,
    },
    request: {
      accountId: "novita-account",
      baseUrl: "https://novita.ai",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken,
        userId: "account-uuid",
      },
    },
  })
const openCollection = async (accessToken = "sk_key") =>
  (await openSession(accessToken)).openCollection("default")

const ref = {
  accountId: "novita-account",
  siteType: SITE_TYPES.NOVITA,
  scopeKey: "default",
  resourceId: "key_dec88048c9a343fdb089114885e13768",
}

describe("Novita key resources", () => {
  it("does not recover plaintext from a masked inventory resource", async () => {
    const session = await openSession()
    await expect(session.runtimeKey?.resolve(ref)).resolves.toMatchObject({
      kind: "unavailable",
    })
  })

  it("offers public full-ID hints with saved policy IDs when only an API key is available", async () => {
    let hintReads = 0
    server.use(
      http.get("https://api.novita.ai/openai/v1/models", ({ request }) => {
        hintReads++
        expect(request.headers.get("Authorization")).toBeNull()
        return HttpResponse.json({
          data: [
            { id: "moonshotai/kimi-k3", display_name: "Kimi K3" },
            { id: "moonshotai/kimi-k3", display_name: "Kimi K3" },
          ],
        })
      }),
    )
    const editor = novitaKeyEditor(
      {
        baseUrl: "https://novita.ai",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "sk_key" },
      },
      {
        name: "Existing key",
        allowedIps: [],
        modelPolicy: {
          schemaVersion: 1,
          productScope: "model_api",
          mode: "selected",
          allowedModels: [{ type: "llm", id: "saved/retired-model" }],
          excludedModels: [],
        },
      },
    )
    const expected = [
      { value: "saved/retired-model", displayLabel: "saved/retired-model" },
      { value: "moonshotai/kimi-k3", displayLabel: "moonshotai/kimi-k3" },
    ]
    await expect(
      Promise.all([
        editor.loadOptions?.("allowed_models", editor.initialValues),
        editor.loadOptions?.("excluded_models", editor.initialValues),
      ]),
    ).resolves.toEqual([expected, expected])
    expect(hintReads).toBe(1)
  })

  it("keeps saved model IDs editable when paired console authentication expires", async () => {
    let consoleReads = 0
    let openApiReads = 0
    let publicHintReads = 0
    server.use(
      http.get("https://api.novita.ai/openai/v1/models", () => {
        publicHintReads++
        return HttpResponse.json({ data: [{ id: "moonshotai/kimi-k3" }] })
      }),
      http.get(
        "https://api-server.novita.ai/v1/user/whitelist/available-llm-models",
        () => {
          consoleReads++
          return new HttpResponse(null, { status: 401 })
        },
      ),
      http.get(
        "https://api.novita.ai/openapi/v1/user/whitelist/available-llm-models",
        () => {
          openApiReads++
          return new HttpResponse(null, { status: 404 })
        },
      ),
    )
    const editor = novitaKeyEditor(
      {
        baseUrl: "https://novita.ai",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: encodeNovitaCredentials({
            apiKey: "sk_key",
            consoleToken: "expired",
          }),
        },
      },
      {
        name: "Existing key",
        allowedIps: [],
        modelPolicy: {
          schemaVersion: 1,
          productScope: "model_api",
          mode: "selected",
          allowedModels: [{ type: "llm", id: "existing/model" }],
          excludedModels: [],
        },
      },
    )
    await expect(
      editor.loadOptions?.("allowed_models", editor.initialValues),
    ).resolves.toEqual([
      { value: "existing/model", displayLabel: "existing/model" },
      { value: "moonshotai/kimi-k3", displayLabel: "moonshotai/kimi-k3" },
    ])
    expect(consoleReads).toBe(1)
    expect(openApiReads).toBe(0)
    expect(publicHintReads).toBe(1)
  })

  it.each([
    ["", 401],
    ["sk_key", 404],
    ["sk_key", 500],
  ])(
    "preserves console model-list failures with API key %j and status %s",
    async (apiKey, status) => {
      server.use(
        http.get(
          "https://api-server.novita.ai/v1/user/whitelist/available-llm-models",
          () => new HttpResponse(null, { status }),
        ),
      )
      const editor = novitaKeyEditor({
        baseUrl: "https://novita.ai",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: encodeNovitaCredentials({
            apiKey,
            consoleToken: "saved-session",
          }),
        },
      })
      await expect(
        editor.loadOptions?.("allowed_models", editor.initialValues),
      ).rejects.toMatchObject({ statusCode: status })
    },
  )
  it.each(["****", "sk_****", "sk_other****last"])(
    "omits the account hint for insufficient or incompatible mask %s",
    async (maskedKey) => {
      server.use(
        http.get("https://api.novita.ai/openapi/v2/user/key", () =>
          HttpResponse.json({ keys: [{ ...keyRow, maskedKey }] }),
        ),
      )
      const facts = (
        await (await openCollection("sk_1Av3-full-secret-VaCk")).list()
      ).items[0]
      expect(facts?.accountCredentialIdentity?.status).toBe(
        maskedKey === "sk_other****last" ? "mismatch" : "unknown",
      )
    },
  )
  it("keeps multiple matching rows as candidates and retains the hint in detail", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v2/user/key", () =>
        HttpResponse.json({
          keys: [keyRow, { ...keyRow, stringId: "key-other" }],
        }),
      ),
    )
    const collection = await openCollection("sk_1Av3-full-secret-VaCk")
    expect(
      (await collection.list()).items.map(
        (facts) => facts.accountCredentialIdentity?.status,
      ),
    ).toEqual(["possible", "possible"])
    expect((await collection.get(ref)).accountCredentialIdentity?.status).toBe(
      "possible",
    )
  })
  it.each([
    ["sk_1Av3-full-secret-VaCk", "possible"],
    ["sk_1Av3-other-secret-VaCk", "possible"],
    ["sk_other-secret", "mismatch"],
    ["novita-console:sk_1Av3-full-secret-VaCk", "unknown"],
  ])(
    "only hints at masked credential correlation for %s",
    async (credential, role) => {
      server.use(
        http.get("https://api-server.novita.ai/v2/user/key", () =>
          HttpResponse.json({ keys: [keyRow] }),
        ),
      )
      const collection = await openCollection(credential)
      const facts = (await collection.list()).items[0]
      expect(facts?.accountCredentialIdentity?.status).toBe(role)
      expect(facts?.runtimeSecret).toBeUndefined()
    },
  )
  it("does not attempt default creation with an API-key account", async () => {
    const plan = await prepareDefaultAccountKeyCreation(
      buildDisplaySiteData({
        siteType: SITE_TYPES.NOVITA,
        baseUrl: "https://novita.ai",
        userId: "account-uuid",
        token: "sk_key",
      }),
    )
    expect(plan.kind).toBe("input-required")
  })
  it.each([
    [undefined, DEFAULT_AUTO_PROVISION_KEY_NAME],
    ["", DEFAULT_AUTO_PROVISION_KEY_NAME],
    ["   ", DEFAULT_AUTO_PROVISION_KEY_NAME],
    ["  My Novita key  ", "My Novita key"],
  ])(
    "uses the shared default name with hint %j",
    async (nameHint, expected) => {
      const session = await openSession("novita-console:saved-session")
      const editor = await session.openCreateEditor("default", undefined, {
        nameHint,
      })
      expect(editor.initialValues.name).toBe(expected)
      expect(editor.validate(editor.initialValues).valid).toBe(true)
    },
  )

  beforeEach(() => {
    server.resetHandlers()
    server.use(
      http.get(
        "https://api.novita.ai/openai/v1/models",
        () => new HttpResponse(null, { status: 503 }),
      ),
      http.get("https://api.novita.ai/openapi/v2/user/key", () =>
        HttpResponse.json({ keys: [keyRow] }),
      ),
      http.get(
        "https://api.novita.ai/openapi/v2/user/key/:id/model-access-policy",
        ({ params }) =>
          HttpResponse.json({
            stringId: params.id,
            policy: {
              schemaVersion: 1,
              productScope: "model_api",
              mode: "all_enabled",
              allowedModels: [],
              excludedModels: [],
            },
          }),
      ),
      http.get(
        "https://api.novita.ai/openapi/v2/user/key/:id/ip-access-policy",
        ({ params }) =>
          HttpResponse.json({
            stringId: params.id,
            policy: { allowedIps: [] },
          }),
      ),
    )
  })

  it.each([undefined, "all-api-hub-probe-key"])(
    "creates a key named %j with a saved console credential and hands off its one-time secret",
    async (name) => {
      const expectedName = name ?? DEFAULT_AUTO_PROVISION_KEY_NAME
      let created = false
      server.use(
        http.get("https://api-server.novita.ai/v1/user/info", () =>
          HttpResponse.json({
            uuid: "account-uuid",
            email: "user@example.com",
          }),
        ),
        http.get("https://api-server.novita.ai/v2/user/key", () =>
          HttpResponse.json({
            keys: created ? [{ ...keyRow, name: expectedName }] : [],
          }),
        ),
        http.post(
          "https://api-server.novita.ai/v2/user/key",
          async ({ request }) => {
            expect(request.headers.get("Authorization")).toBe(
              "Bearer saved-session",
            )
            expect(await request.json()).toEqual({
              name: expectedName,
              expireTime: "",
            })
            created = true
            return HttpResponse.json({
              id: keyRow.stringId,
              apiKey: "sk_one-time-secret",
            })
          },
        ),
      )
      const plan = await prepareDefaultAccountKeyCreation(
        buildDisplaySiteData({
          id: "novita-account",
          name: "Novita AI",
          siteType: SITE_TYPES.NOVITA,
          baseUrl: "https://novita.ai",
          userId: "account-uuid",
          token: "novita-console:saved-session",
        }),
        { intent: { nameHint: name } },
      )
      expect(plan.kind).toBe("ready")
      if (plan.kind !== "ready")
        throw new Error("Expected a ready creation plan")
      const result = await plan.create()
      expect(result.facts?.ref).toEqual(ref)
      expect(result.facts?.displayName).toBe(expectedName)
      expect(result.createdSecret).toMatchObject({
        secret: "sk_one-time-secret",
        secretAvailability: "create-response-only",
        credential: { baseUrl: "https://api.novita.ai/openai" },
      })
      expect(result.facts?.runtimeSecret).toBeUndefined()
    },
  )

  it("renames and deletes an owned key with fresh identity checks and readback", async () => {
    let name = keyRow.name
    let deleted = false
    let identityReads = 0
    server.use(
      http.get("https://api-server.novita.ai/v1/user/info", () => {
        identityReads++
        return HttpResponse.json({
          uuid: "account-uuid",
          email: "user@example.com",
        })
      }),
      http.get("https://api-server.novita.ai/v2/user/key", () =>
        HttpResponse.json({ keys: deleted ? [] : [{ ...keyRow, name }] }),
      ),
      http.get(
        "https://api-server.novita.ai/v2/user/key/:id/model-access-policy",
        () =>
          HttpResponse.json({
            stringId: keyRow.stringId,
            policy: {
              schemaVersion: 1,
              productScope: "model_api",
              mode: "all_enabled",
              allowedModels: [],
              excludedModels: [],
            },
          }),
      ),
      http.get(
        "https://api-server.novita.ai/v2/user/key/:id/ip-access-policy",
        () =>
          HttpResponse.json({
            stringId: keyRow.stringId,
            policy: { allowedIps: ["192.0.2.1"] },
          }),
      ),
      http.put(
        "https://api-server.novita.ai/v2/user/key",
        async ({ request }) => {
          expect(await request.json()).toEqual({
            name: "renamed",
            stringId: keyRow.stringId,
          })
          name = "renamed"
          return HttpResponse.json({})
        },
      ),
      http.delete("https://api-server.novita.ai/v2/user/key/:id", () => {
        deleted = true
        return HttpResponse.json({})
      }),
    )
    const collection = await openCollection("novita-console:saved-session")
    expect((await collection.list()).items[0]?.actions).toMatchObject({
      canUpdate: true,
      canDelete: true,
    })
    const editor = await collection.openEditEditor(ref)
    expect(editor.initialValues.name).toBe(keyRow.name)
    expect(editor.initialValues.allowed_ips).toBe("192.0.2.1")
    const result = await editor.submit({
      ...editor.initialValues,
      name: "renamed",
    })
    expect(result.facts?.displayName).toBe("renamed")
    expect(
      (await collection.openEditEditor(ref)).initialValues.allowed_ips,
    ).toBe("192.0.2.1")
    await collection.delete(ref)
    expect((await collection.list()).items).toEqual([])
    expect(identityReads).toBe(2)
  })

  it.each(["other-account", ""])(
    "blocks key creation for a mismatched or missing identity (%s)",
    async (uuid) => {
      let writes = 0
      server.use(
        http.get("https://api-server.novita.ai/v1/user/info", () =>
          HttpResponse.json({ uuid, email: "user@example.com" }),
        ),
        http.post("https://api-server.novita.ai/v2/user/key", () => {
          writes++
          return HttpResponse.json({})
        }),
      )
      const editor = await (
        await openSession("novita-console:saved-session")
      ).openCreateEditor("default")
      await expect(editor.submit(editor.initialValues)).rejects.toBeDefined()
      expect(writes).toBe(0)
    },
  )

  it("does not replay a creation whose response was lost", async () => {
    let writes = 0
    server.use(
      http.get("https://api-server.novita.ai/v1/user/info", () =>
        HttpResponse.json({ uuid: "account-uuid", email: "user@example.com" }),
      ),
      http.post("https://api-server.novita.ai/v2/user/key", () => {
        writes++
        return new HttpResponse(null, { status: 500 })
      }),
    )
    const editor = await (
      await openSession("novita-console:saved-session")
    ).openCreateEditor("default")
    await expect(editor.submit(editor.initialValues)).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
    await expect(editor.submit(editor.initialValues)).rejects.toBeDefined()
    expect(writes).toBe(1)
  })

  it("reports expired console authentication without disclosing echoed credentials", async () => {
    server.use(
      http.get("https://api-server.novita.ai/v1/user/info", () =>
        HttpResponse.json(
          {
            code: 401,
            reason: "UNAUTHORIZED",
            message: "invalid novita-console:saved-session",
          },
          { status: 401 },
        ),
      ),
    )
    const editor = await (
      await openSession("novita-console:saved-session")
    ).openCreateEditor("default")
    await expect(editor.submit(editor.initialValues)).rejects.toMatchObject({
      failure: {
        code: "authentication_failed",
        message: "messages:novita.credentialInvalid",
      },
    })
  })

  it("uses model names in policy choices and validates native IP/CIDR input", async () => {
    server.use(
      http.get(
        "https://api-server.novita.ai/v1/user/whitelist/available-llm-models",
        () =>
          HttpResponse.json({
            models: [{ modelId: "4", modelName: "gryphe/mythomax-l2-13b" }],
          }),
      ),
    )
    const editor = await (
      await openSession("novita-console:saved-session")
    ).openCreateEditor("default")
    expect(
      await editor.loadOptions?.("allowed_models", editor.initialValues),
    ).toEqual([
      {
        value: "gryphe/mythomax-l2-13b",
        displayLabel: "gryphe/mythomax-l2-13b",
      },
    ])
    expect(
      editor.validate({
        ...editor.initialValues,
        ip_restricted: true,
        allowed_ips: "198.51.100.0/24\n192.0.2.1",
      }),
    ).toEqual({ valid: true })
    expect(
      editor.validate({
        ...editor.initialValues,
        ip_restricted: true,
        allowed_ips: "0.0.0.0/0",
      }),
    ).toMatchObject({ valid: false, issues: [{ fieldId: "allowed_ips" }] })
  })

  it("creates with native expiry/model/IP policies, then edits and reopens the saved policies", async () => {
    let created = false
    let name = "restricted"
    let policy = {
      schemaVersion: 1,
      productScope: "model_api",
      mode: "all_enabled",
      allowedModels: [] as { type: string; id: string }[],
      excludedModels: [] as { type: string; id: string }[],
    }
    let allowedIps: string[] = []
    server.use(
      http.get("https://api-server.novita.ai/v1/user/info", () =>
        HttpResponse.json({ uuid: "account-uuid", email: "user@example.com" }),
      ),
      http.get("https://api-server.novita.ai/v2/user/key", () =>
        HttpResponse.json({ keys: created ? [{ ...keyRow, name }] : [] }),
      ),
      http.post(
        "https://api-server.novita.ai/v2/user/key",
        async ({ request }) => {
          const body = (await request.json()) as {
            name: string
            expireTime: string
          }
          expect(body.expireTime).toMatch(
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
          )
          const expiry =
            Date.parse(body.expireTime.replace(" ", "T") + "Z") / 1000
          expect(expiry).toBeGreaterThan(Date.now() / 1000 + 86390)
          expect(expiry).toBeLessThanOrEqual(Date.now() / 1000 + 86400)
          name = body.name
          created = true
          return HttpResponse.json({
            id: keyRow.stringId,
            apiKey: "sk_one-time-secret",
          })
        },
      ),
      http.get(
        "https://api-server.novita.ai/v2/user/key/:id/model-access-policy",
        () => HttpResponse.json({ stringId: keyRow.stringId, policy }),
      ),
      http.get(
        "https://api-server.novita.ai/v2/user/key/:id/ip-access-policy",
        () =>
          HttpResponse.json({
            stringId: keyRow.stringId,
            policy: { allowedIps },
          }),
      ),
      http.put(
        "https://api-server.novita.ai/v2/user/key/:id/model-access-policy",
        async ({ request }) => {
          policy = (await request.json()) as typeof policy
          return HttpResponse.json({})
        },
      ),
      http.put(
        "https://api-server.novita.ai/v2/user/key/:id/ip-access-policy",
        async ({ request }) => {
          allowedIps = ((await request.json()) as { allowedIps: string[] })
            .allowedIps
          return HttpResponse.json({})
        },
      ),
    )
    const session = await openSession("novita-console:saved-session")
    const create = await session.openCreateEditor("default")
    await create.submit({
      ...create.initialValues,
      name,
      lifecycle: "24h",
      model_mode: "selected",
      allowed_models: ["gryphe/mythomax-l2-13b"],
      ip_restricted: true,
      allowed_ips: "192.0.2.1",
    })
    const collection = await session.openCollection("default")
    const edit = await collection.openEditEditor(ref)
    expect(edit.initialValues).toMatchObject({
      model_mode: "selected",
      allowed_models: ["gryphe/mythomax-l2-13b"],
      allowed_ips: "192.0.2.1",
    })
    expect(edit.fields.map((field) => field.fieldId)).not.toContain("lifecycle")
    await edit.submit({
      ...edit.initialValues,
      allowed_models: [
        "gryphe/mythomax-l2-13b",
        "meta-llama/llama-3.3-70b-instruct",
      ],
      allowed_ips: "198.51.100.0/24",
    })
    const reopened = await collection.openEditEditor(ref)
    expect(reopened.initialValues).toMatchObject({
      name: "restricted",
      allowed_models: [
        "gryphe/mythomax-l2-13b",
        "meta-llama/llama-3.3-70b-instruct",
      ],
      allowed_ips: "198.51.100.0/24",
    })
  })

  it("removes only its newly created key when policy configuration fails", async () => {
    let created = false
    let deletedId = ""
    server.use(
      http.get("https://api-server.novita.ai/v1/user/info", () =>
        HttpResponse.json({ uuid: "account-uuid", email: "user@example.com" }),
      ),
      http.post("https://api-server.novita.ai/v2/user/key", () => {
        created = true
        return HttpResponse.json({
          id: keyRow.stringId,
          apiKey: "sk_one-time-secret",
        })
      }),
      http.put(
        "https://api-server.novita.ai/v2/user/key/:id/ip-access-policy",
        () => new HttpResponse(null, { status: 400 }),
      ),
      http.get("https://api-server.novita.ai/v2/user/key", () =>
        HttpResponse.json({ keys: created ? [keyRow] : [] }),
      ),
      http.delete(
        "https://api-server.novita.ai/v2/user/key/:id",
        ({ params }) => {
          deletedId = String(params.id)
          created = false
          return HttpResponse.json({})
        },
      ),
    )
    const editor = await (
      await openSession("novita-console:saved-session")
    ).openCreateEditor("default")
    await expect(
      editor.submit({
        ...editor.initialValues,
        ip_restricted: true,
        allowed_ips: "192.0.2.1",
      }),
    ).rejects.toMatchObject({ mutationCertainty: "not-applied" })
    expect(deletedId).toBe(keyRow.stringId)
    expect(created).toBe(false)
  })

  it("keeps the one-time secret when the post-create inventory read fails", async () => {
    server.use(
      http.get("https://api-server.novita.ai/v1/user/info", () =>
        HttpResponse.json({ uuid: "account-uuid", email: "user@example.com" }),
      ),
      http.post("https://api-server.novita.ai/v2/user/key", () =>
        HttpResponse.json({
          id: keyRow.stringId,
          apiKey: "sk_one-time-secret",
        }),
      ),
      http.get(
        "https://api-server.novita.ai/v2/user/key",
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    const editor = await (
      await openSession("novita-console:saved-session")
    ).openCreateEditor("default")
    const result = await editor.submit(editor.initialValues)
    expect(result.facts).toBeNull()
    expect(result.createdSecret?.secret).toBe("sk_one-time-secret")
  })

  it("rejects API-key creation without silently adopting an ambient login", async () => {
    const session = await openSession()
    await expect(session.openCreateEditor("default")).rejects.toMatchObject({
      failure: {
        code: "authentication_failed",
        message: "messages:novita.consoleCredentialRequired",
      },
    })
  })

  it("edits model and IP policies with an API key without offering rename or delete", async () => {
    let unavailableModelRequests = 0
    let modelPolicy = {
      schemaVersion: 1,
      productScope: "model_api",
      mode: "all_enabled",
      allowedModels: [] as { type: string; id: string }[],
      excludedModels: [],
    }
    let allowedIps: string[] = []
    server.use(
      http.get(
        "https://api.novita.ai/openapi/v1/user/whitelist/available-llm-models",
        () => {
          unavailableModelRequests++
          return new HttpResponse(null, { status: 404 })
        },
      ),
      http.get("https://api.novita.ai/openapi/v1/user/info", () =>
        HttpResponse.json({ uuid: "account-uuid", email: "user@example.com" }),
      ),
      http.get(
        "https://api.novita.ai/openapi/v2/user/key/:id/model-access-policy",
        () =>
          HttpResponse.json({ stringId: keyRow.stringId, policy: modelPolicy }),
      ),
      http.get(
        "https://api.novita.ai/openapi/v2/user/key/:id/ip-access-policy",
        () =>
          HttpResponse.json({
            stringId: keyRow.stringId,
            policy: { allowedIps },
          }),
      ),
      http.put(
        "https://api.novita.ai/openapi/v2/user/key/:id/model-access-policy",
        async ({ request }) => {
          modelPolicy = (await request.json()) as typeof modelPolicy
          return HttpResponse.json({})
        },
      ),
      http.put(
        "https://api.novita.ai/openapi/v2/user/key/:id/ip-access-policy",
        async ({ request }) => {
          allowedIps = ((await request.json()) as { allowedIps: string[] })
            .allowedIps
          return HttpResponse.json({})
        },
      ),
    )
    const collection = await openCollection()
    const editor = await collection.openEditEditor(ref)
    await expect(
      editor.loadOptions?.("allowed_models", editor.initialValues),
    ).resolves.toEqual([])
    expect(unavailableModelRequests).toBe(0)
    expect(editor.fields.some((field) => field.fieldId === "name")).toBe(false)
    const result = await editor.submit({
      ...editor.initialValues,
      model_mode: "selected",
      allowed_models: ["example/model"],
      ip_restricted: true,
      allowed_ips: "192.0.2.1",
    })
    expect(result.facts?.actions).toEqual({ canUpdate: true, canDelete: false })
    const reopened = await collection.openEditEditor(ref)
    expect(reopened.initialValues.allowed_models).toEqual(["example/model"])
    await expect(
      reopened.loadOptions?.("allowed_models", reopened.initialValues),
    ).resolves.toEqual([
      { value: "example/model", displayLabel: "example/model" },
    ])
    expect(reopened.initialValues.allowed_ips).toBe("192.0.2.1")
    await expect(
      reopened.submit({ ...reopened.initialValues, name: "forbidden rename" }),
    ).rejects.toBeDefined()
    await expect(collection.delete(ref)).rejects.toBeDefined()
  })

  it("lists the masked inventory with policy summaries", async () => {
    const page = await (await openCollection()).list()
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      displayName: "all-api-hub-probe-key",
      maskedLabel: "sk_1Av3****VaCk",
      actions: { canUpdate: true, canDelete: false },
    })
  })

  it("projects API-key facts without plaintext or deletion", async () => {
    const collection = await openCollection()
    const facts = await collection.get(ref)
    expect(facts.displayName).toBe("all-api-hub-probe-key")
    expect(facts.maskedLabel).toBe("sk_1Av3****VaCk")
    expect(facts.runtimeSecret).toBeUndefined()
    expect(facts.actions).toEqual({
      canUpdate: true,
      canDelete: false,
    })
    // Permanent keys (`""` live / `"never"` documented) render as never expiring.
    expect(facts.displayFacts).toContainEqual({
      fieldId: "expire_time",
      kind: "expiry",
      timestampMs: "never",
    })
  })

  it("marks an expiring key with its native expiry", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v2/user/key", () =>
        HttpResponse.json({
          keys: [
            {
              ...keyRow,
              stringId: "key_expiring",
              expireTime: "1767225600",
            },
          ],
        }),
      ),
    )
    const collection = await openCollection()
    const facts = await collection.get({ ...ref, resourceId: "key_expiring" })
    expect(facts.displayFacts).toContainEqual({
      fieldId: "expire_time",
      kind: "expiry",
      timestampMs: 1767225600000,
    })
  })

  it("interprets the native UTC expiry string independently of the local timezone", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v2/user/key", () =>
        HttpResponse.json({
          keys: [{ ...keyRow, expireTime: "2020-01-01 00:00:00" }],
        }),
      ),
    )
    const facts = await (await openCollection()).get(ref)
    expect(facts.status).toBe("expired")
    expect(facts.displayFacts).toContainEqual({
      fieldId: "expire_time",
      kind: "expiry",
      timestampMs: 1577836800000,
    })
  })

  it("reports a missing key through the not-found failure", async () => {
    const collection = await openCollection()
    await expect(
      collection.get({ ...ref, resourceId: "key_missing" }),
    ).rejects.toMatchObject({ failure: { code: "not_found" } })
  })
  it.each(["name", "models", "ips"])(
    "rejects concurrent %s changes before updating",
    async (field) => {
      let name = keyRow.name
      let models = {
        schemaVersion: 1,
        productScope: "model_api",
        mode: "all_enabled",
        allowedModels: [] as { type: string; id: string }[],
        excludedModels: [],
      }
      let ips: string[] = []
      let writes = 0
      server.use(
        http.get("https://api-server.novita.ai/v1/user/info", () =>
          HttpResponse.json({
            uuid: "account-uuid",
            email: "user@example.com",
          }),
        ),
        http.get("https://api-server.novita.ai/v2/user/key", () =>
          HttpResponse.json({ keys: [{ ...keyRow, name }] }),
        ),
        http.get(
          "https://api-server.novita.ai/v2/user/key/:id/model-access-policy",
          () =>
            HttpResponse.json({ stringId: keyRow.stringId, policy: models }),
        ),
        http.get(
          "https://api-server.novita.ai/v2/user/key/:id/ip-access-policy",
          () =>
            HttpResponse.json({
              stringId: keyRow.stringId,
              policy: { allowedIps: ips },
            }),
        ),
        http.put("https://api-server.novita.ai/v2/user/key", () => {
          writes++
          return HttpResponse.json({})
        }),
        http.put(
          "https://api-server.novita.ai/v2/user/key/:id/model-access-policy",
          () => {
            writes++
            return HttpResponse.json({})
          },
        ),
        http.put(
          "https://api-server.novita.ai/v2/user/key/:id/ip-access-policy",
          () => {
            writes++
            return HttpResponse.json({})
          },
        ),
      )
      const editor = await (
        await openCollection("novita-console:test")
      ).openEditEditor(ref)
      if (field === "name") name = "changed elsewhere"
      if (field === "models")
        models = {
          ...models,
          mode: "selected",
          allowedModels: [{ type: "llm", id: "other" }],
        }
      if (field === "ips") ips = ["192.0.2.2"]
      const patch: EditableResourceProjection =
        field === "name"
          ? { name: "my change" }
          : field === "models"
            ? { model_mode: "selected", allowed_models: ["my-model"] }
            : { ip_restricted: true, allowed_ips: "192.0.2.1" }
      await expect(
        editor.submit({ ...editor.initialValues, ...patch }),
      ).rejects.toMatchObject({
        mutationCertainty: "not-applied",
        failure: { code: "resource_changed" },
      })
      expect(writes).toBe(0)
    },
  )

  it.each(["name", "models", "ips"])(
    "keeps accepted %s writes uncertain when readback disagrees",
    async (field) => {
      let writes = 0
      server.use(
        http.get("https://api-server.novita.ai/v1/user/info", () =>
          HttpResponse.json({
            uuid: "account-uuid",
            email: "user@example.com",
          }),
        ),
        http.get("https://api-server.novita.ai/v2/user/key", () =>
          HttpResponse.json({ keys: [keyRow] }),
        ),
        http.get(
          "https://api-server.novita.ai/v2/user/key/:id/model-access-policy",
          () =>
            HttpResponse.json({
              stringId: keyRow.stringId,
              policy: {
                schemaVersion: 1,
                productScope: "model_api",
                mode: "all_enabled",
                allowedModels: [],
                excludedModels: [],
              },
            }),
        ),
        http.get(
          "https://api-server.novita.ai/v2/user/key/:id/ip-access-policy",
          () =>
            HttpResponse.json({
              stringId: keyRow.stringId,
              policy: { allowedIps: [] },
            }),
        ),
        http.put("https://api-server.novita.ai/v2/user/key", () => {
          writes++
          return HttpResponse.json({})
        }),
        http.put(
          "https://api-server.novita.ai/v2/user/key/:id/model-access-policy",
          () => {
            writes++
            return HttpResponse.json({})
          },
        ),
        http.put(
          "https://api-server.novita.ai/v2/user/key/:id/ip-access-policy",
          () => {
            writes++
            return HttpResponse.json({})
          },
        ),
      )
      const editor = await (
        await openCollection("novita-console:test")
      ).openEditEditor(ref)
      const patch: EditableResourceProjection =
        field === "name"
          ? { name: "my change" }
          : field === "models"
            ? { model_mode: "selected", allowed_models: ["my-model"] }
            : { ip_restricted: true, allowed_ips: "192.0.2.1" }
      await expect(
        editor.submit({ ...editor.initialValues, ...patch }),
      ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
      await expect(
        editor.submit({ ...editor.initialValues, ...patch }),
      ).rejects.toBeDefined()
      expect(writes).toBe(1)
    },
  )

  it("does not confirm deletion while the key remains in inventory", async () => {
    let writes = 0
    server.use(
      http.get("https://api-server.novita.ai/v1/user/info", () =>
        HttpResponse.json({ uuid: "account-uuid", email: "user@example.com" }),
      ),
      http.get("https://api-server.novita.ai/v2/user/key", () =>
        HttpResponse.json({ keys: [keyRow] }),
      ),
      http.delete("https://api-server.novita.ai/v2/user/key/:id", () => {
        writes++
        return HttpResponse.json({})
      }),
    )
    await expect(
      (await openCollection("novita-console:test")).delete(ref),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
    expect(writes).toBe(1)
  })

  it.each(["models", "ips"])(
    "keeps failed creation uncertain when %s readback and cleanup fail",
    async (field) => {
      let creates = 0
      let deletes = 0
      server.use(
        http.get("https://api-server.novita.ai/v1/user/info", () =>
          HttpResponse.json({
            uuid: "account-uuid",
            email: "user@example.com",
          }),
        ),
        http.post("https://api-server.novita.ai/v2/user/key", () => {
          creates++
          return HttpResponse.json({
            id: keyRow.stringId,
            apiKey: "sk_created",
          })
        }),
        http.get("https://api-server.novita.ai/v2/user/key", () =>
          HttpResponse.json({ keys: creates ? [keyRow] : [] }),
        ),
        http.put(
          "https://api-server.novita.ai/v2/user/key/:id/model-access-policy",
          () => HttpResponse.json({}),
        ),
        http.put(
          "https://api-server.novita.ai/v2/user/key/:id/ip-access-policy",
          () => HttpResponse.json({}),
        ),
        http.get(
          "https://api-server.novita.ai/v2/user/key/:id/model-access-policy",
          () =>
            HttpResponse.json({
              stringId: keyRow.stringId,
              policy: {
                schemaVersion: 1,
                productScope: "model_api",
                mode: "all_enabled",
                allowedModels: [],
                excludedModels: [],
              },
            }),
        ),
        http.get(
          "https://api-server.novita.ai/v2/user/key/:id/ip-access-policy",
          () =>
            HttpResponse.json({
              stringId: keyRow.stringId,
              policy: { allowedIps: [] },
            }),
        ),
        http.delete("https://api-server.novita.ai/v2/user/key/:id", () => {
          deletes++
          return HttpResponse.json({}, { status: 503 })
        }),
      )
      const editor = await (
        await openSession("novita-console:test")
      ).openCreateEditor("default")
      const patch: EditableResourceProjection =
        field === "models"
          ? { model_mode: "selected", allowed_models: ["my-model"] }
          : { ip_restricted: true, allowed_ips: "192.0.2.1" }
      await expect(
        editor.submit({ ...editor.initialValues, ...patch }),
      ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
      expect(creates).toBe(1)
      expect(deletes).toBe(1)
    },
  )
})
