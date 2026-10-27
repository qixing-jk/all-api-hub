import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import type { EditableResourceProjection } from "~/services/apiAdapters/contracts/resourceNative"
import { novitaAccountBootstrap } from "~/services/apiAdapters/novita/accountBootstrap"
import {
  getNovitaSafeErrorMessage,
  novitaAccountPersistence,
} from "~/services/apiAdapters/novita/accountPersistence"
import { novitaKeyEditor } from "~/services/apiAdapters/novita/keyEditor"
import { novitaProviderModelCatalog } from "~/services/apiAdapters/novita/providerModelCatalog"
import {
  encodeNovitaCredentials,
  fetchAccountData,
  fetchNovitaBalanceDetail,
  fetchNovitaData,
  fetchNovitaKeys,
  fetchNovitaUserInfo,
  novitaAmountToUsd,
  parseNovitaCredentials,
  refreshAccountData,
  verifyNovitaCredentials,
} from "~/services/apiService/novita"
import {
  createNovitaKey,
  fetchNovitaAllowedIps,
  fetchNovitaManagementModels,
  fetchNovitaModelPolicy,
} from "~/services/apiService/novita/keyManagement"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const request = {
  baseUrl: "https://novita.ai",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "sk_test",
    userId: "test-user",
  },
}
const policy = {
  schemaVersion: 1,
  productScope: "model_api",
  mode: "all_enabled",
  allowedModels: [],
  excludedModels: [],
}

describe("Novita boundary validation", () => {
  it("keeps completion identity failures in controlled local copy", () => {
    expect(
      getNovitaSafeErrorMessage(
        new AutoDetectCompletionError(
          "account_identity_mismatch",
          new Error("secret"),
        ),
        "fallback",
      ),
    ).toBe("accountDialog:messages.autoDetectIdentityMismatch")
  })

  it.each([null, {}, { keys: [null] }, { keys: [{}] }])(
    "rejects malformed inventories: %j",
    async (body) => {
      server.use(
        http.get("https://api.novita.ai/openapi/v2/user/key", () =>
          HttpResponse.json(body),
        ),
      )
      await expect(fetchNovitaKeys(request)).rejects.toMatchObject({
        code: "JSON_PARSE_ERROR",
      })
    },
  )
  it.each([null, { uuid: "test-user" }, { email: "user@example.com" }])(
    "rejects incomplete account identity: %j",
    async (body) => {
      server.use(
        http.get("https://api.novita.ai/openapi/v1/user/info", () =>
          HttpResponse.json(body),
        ),
      )
      await expect(fetchNovitaUserInfo(request)).rejects.toMatchObject({
        code: "JSON_PARSE_ERROR",
      })
    },
  )
  it("rejects a malformed balance envelope", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v1/billing/balance/detail", () =>
        HttpResponse.json(null),
      ),
    )
    await expect(fetchNovitaBalanceDetail(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
    expect((await refreshAccountData(request as never)).success).toBe(false)
  })
  it("does not add a zero credit limit to cash components", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v1/billing/balance/detail", () =>
        HttpResponse.json({
          availableBalance: "12000",
          cashBalance: "10000",
          creditLimit: "0",
        }),
      ),
    )
    expect(
      (await fetchAccountData(request as never)).nativeBalance,
    ).toMatchObject({ components: [{ kind: "permanent", amount: 1 }] })
  })
  it("verifies a credential pair independently and rejects an unexpected account", async () => {
    const reads: string[] = []
    for (const origin of [
      "https://api.novita.ai/openapi",
      "https://api-server.novita.ai",
    ])
      server.use(
        http.get(origin + "/v1/user/info", ({ request }) => {
          reads.push(request.headers.get("authorization")!)
          return HttpResponse.json({
            uuid: "test-user",
            email: "user@example.com",
          })
        }),
      )
    const paired = {
      ...request,
      auth: {
        ...request.auth,
        accessToken: encodeNovitaCredentials({
          apiKey: "sk_test",
          consoleToken: "console",
        }),
      },
    }
    expect((await verifyNovitaCredentials(paired, "test-user")).id).toBe(
      "test-user",
    )
    expect(reads).toEqual(["Bearer sk_test", "Bearer console"])
    await expect(
      verifyNovitaCredentials(paired, "other-user"),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
  })
  it.each([
    null,
    {},
    { stringId: "other", policy },
    { stringId: "key", policy: { ...policy, schemaVersion: 2 } },
    { stringId: "key", policy: { ...policy, productScope: "other" } },
    { stringId: "key", policy: { ...policy, mode: "unknown" } },
    { stringId: "key", policy: { ...policy, allowedModels: null } },
    {
      stringId: "key",
      policy: { ...policy, excludedModels: [{ type: "image", id: "model" }] },
    },
    {
      stringId: "key",
      policy: { ...policy, allowedModels: [{ type: "llm", id: "" }] },
    },
  ])("rejects unsupported writable model policies: %j", async (body) => {
    server.use(
      http.get(
        "https://api.novita.ai/openapi/v2/user/key/key/model-access-policy",
        () => HttpResponse.json(body),
      ),
    )
    await expect(fetchNovitaModelPolicy(request, "key")).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
  it.each([
    null,
    {},
    { stringId: "other", policy: { allowedIps: [] } },
    { stringId: "key", policy: { allowedIps: [1] } },
    { stringId: "key", policy: {} },
  ])("rejects incomplete IP allowlists: %j", async (body) => {
    server.use(
      http.get(
        "https://api.novita.ai/openapi/v2/user/key/key/ip-access-policy",
        () => HttpResponse.json(body),
      ),
    )
    await expect(fetchNovitaAllowedIps(request, "key")).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
  it.each([
    {},
    { id: "key", apiKey: "masked" },
    { id: "", apiKey: "sk_secret" },
  ])("rejects a missing one-time creation secret: %j", async (body) => {
    server.use(
      http.post("https://api-server.novita.ai/v2/user/key", () =>
        HttpResponse.json(body),
      ),
    )
    await expect(
      createNovitaKey(
        {
          ...request,
          auth: { ...request.auth, accessToken: "novita-console:test" },
        },
        { name: "key", expireTime: "" },
      ),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
  })
  it.each([null, {}, { models: [null] }, { models: [{ modelName: "" }] }])(
    "rejects invalid management model choices: %j",
    async (body) => {
      server.use(
        http.get(
          "https://api-server.novita.ai/v1/user/whitelist/available-llm-models",
          () => HttpResponse.json(body),
        ),
      )
      await expect(
        fetchNovitaManagementModels({
          ...request,
          auth: { ...request.auth, accessToken: "novita-console:test" },
        }),
      ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
    },
  )
  it("omits absent query values while preserving false and zero", async () => {
    let query = ""
    server.use(
      http.get("https://api.novita.ai/openapi/probe", ({ request }) => {
        query = new URL(request.url).search
        return HttpResponse.json({ ok: true })
      }),
    )
    await expect(
      fetchNovitaData(request, "/probe", {
        query: { empty: null, absent: undefined, count: 0, enabled: false },
      }),
    ).resolves.toEqual({ ok: true })
    expect(query).toBe("?count=0&enabled=false")
  })
  it("keeps absent credentials and blank amount conversions explicit", () => {
    expect(encodeNovitaCredentials({ apiKey: "", consoleToken: "" })).toBe("")
    expect(
      parseNovitaCredentials(
        'novita-credentials:{"apiKey":12,"consoleToken":null}',
      ),
    ).toEqual({ apiKey: "", consoleToken: "" })
    expect(novitaAmountToUsd("")).toBeNaN()
    expect(novitaAccountPersistence.getCredentialKey?.(" ")).toBeUndefined()
    expect(
      novitaAccountPersistence.getOperationLogDetails?.(
        { unsafe: "secret" },
        { safe: "details" },
      ),
    ).toEqual({ safe: "details" })
  })
  it.each([
    [
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
      "accountDialog:messages.autoDetectIdentityMismatch",
    ],
    [API_ERROR_CODES.HTTP_401, "messages:novita.credentialInvalid"],
    [API_ERROR_CODES.NETWORK_ERROR, "messages:novita.networkFallback"],
    [
      API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
      "messages:novita.malformedResponse",
    ],
    [API_ERROR_CODES.JSON_PARSE_ERROR, "messages:novita.malformedResponse"],
  ])("uses controlled copy for %s", (code, expected) => {
    expect(
      getNovitaSafeErrorMessage(
        new ApiError("secret", undefined, undefined, code),
        "fallback",
      ),
    ).toBe(expected)
  })
  it("uses safe fallback copy for unknown failures", () => {
    expect(getNovitaSafeErrorMessage(new Error("secret"), "fallback")).toBe(
      "fallback",
    )
    expect(getNovitaSafeErrorMessage(new ApiError("secret"), "fallback")).toBe(
      "messages:novita.malformedResponse",
    )
    expect(
      novitaAccountPersistence.getValidationFailureMessage?.(
        new Error("secret"),
      ),
    ).toBe("messages:novita.networkFallback")
    expect(
      novitaAccountPersistence.getHealthFailureReason?.(new Error("secret")),
    ).toBe("account:healthStatus.unknownError")
  })
  it("exposes static bootstrap facts and refuses implicit key creation", async () => {
    await expect(
      novitaAccountBootstrap.loadBootstrapFacts?.(request),
    ).resolves.toMatchObject({
      displayName: "Novita AI",
      checkInSupported: false,
    })
    await expect(
      novitaAccountBootstrap.fetchCheckInSupport?.(request, {}),
    ).resolves.toBe(false)
    await expect(
      novitaAccountBootstrap.getOrCreateAccessToken(request),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    await expect(
      novitaAccountBootstrap.resolveRoutePath?.(
        { siteType: "novita", baseUrl: "https://novita.ai" },
        "adminCredentials",
      ),
    ).resolves.toBe("/settings/key-management")
  })
})

describe("Novita editable policy validation", () => {
  it("preserves excluded-model policies through editing and command construction", () => {
    const e = novitaKeyEditor(request, {
      name: "Existing",
      allowedIps: [],
      modelPolicy: {
        schemaVersion: 1,
        productScope: "model_api",
        mode: "all_enabled",
        allowedModels: [],
        excludedModels: [{ type: "llm", id: "excluded-model" }],
      },
    })
    expect(e.initialValues.excluded_models).toEqual(["excluded-model"])
    expect(e.buildCommand(e.initialValues).modelPolicy.excludedModels).toEqual([
      { type: "llm", id: "excluded-model" },
    ])
  })
  it("propagates abort intent while fetching optional hints", async () => {
    const controller = new AbortController()
    controller.abort()
    const e = novitaKeyEditor({ ...request, abortSignal: controller.signal })
    await expect(
      e.loadOptions?.("allowed_models", e.initialValues),
    ).rejects.toThrow()
    await expect(
      novitaProviderModelCatalog.fetchPricing({
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  const editor = () => novitaKeyEditor(request)
  const invalidEdits: EditableResourceProjection[] = [
    { name: "" },
    { lifecycle: "unknown" },
    { model_mode: "unknown" },
    { allowed_models: [], model_mode: "selected" },
    { allowed_models: [""], model_mode: "selected" },
    { excluded_models: null },
    { allowed_ips: "", ip_restricted: true },
    { allowed_ips: "999.1.1.1", ip_restricted: true },
    { allowed_ips: "192.0.2.1/33", ip_restricted: true },
    {
      allowed_ips: Array(101).fill("192.0.2.1").join(","),
      ip_restricted: true,
    },
  ]
  it.each(invalidEdits)("rejects invalid edits: %j", (patch) => {
    const e = editor()
    expect(e.validate({ ...e.initialValues, ...patch }).valid).toBe(false)
  })
  it("keeps public hints optional and retries after failure", async () => {
    let reads = 0
    server.use(
      http.get("https://api.novita.ai/openai/v1/models", () => {
        reads++
        return new HttpResponse(null, { status: 503 })
      }),
    )
    const e = editor()
    await expect(
      e.loadOptions?.("allowed_models", e.initialValues),
    ).resolves.toEqual([])
    await expect(
      e.loadOptions?.("allowed_models", e.initialValues),
    ).resolves.toEqual([])
    expect(reads).toBe(2)
  })
  it("does not suppress console model-list authorization failures", async () => {
    server.use(
      http.get(
        "https://api-server.novita.ai/v1/user/whitelist/available-llm-models",
        () => new HttpResponse(null, { status: 403 }),
      ),
    )
    const e = novitaKeyEditor({
      ...request,
      auth: { ...request.auth, accessToken: "novita-console:test" },
    })
    await expect(
      e.loadOptions?.("allowed_models", e.initialValues),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe("Novita public catalog admission", () => {
  it.each([null, {}, { data: [null] }, { data: [{ id: "" }] }])(
    "rejects malformed public models: %j",
    async (body) => {
      server.use(
        http.get("https://api.novita.ai/openai/v1/models", () =>
          HttpResponse.json(body),
        ),
      )
      await expect(
        novitaProviderModelCatalog.fetchPricing({}),
      ).rejects.toThrow()
    },
  )
  it.each([429, 503])(
    "discloses catalog HTTP %s without upstream secrets",
    async (status) => {
      server.use(
        http.get("https://api.novita.ai/openai/v1/models", () =>
          HttpResponse.json({ message: "secret" }, { status }),
        ),
      )
      await expect(
        novitaProviderModelCatalog.fetchPricing({}),
      ).rejects.toThrow()
    },
  )
  it("falls back from invalid decimal prices and ignores unusable prices", async () => {
    server.use(
      http.get("https://api.novita.ai/openai/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "model",
              pricing: {
                prompt: { price_per_m_decimal: "invalid", price_per_m: 10000 },
                completion: { price_per_m_decimal: "-1", price_per_m: 20000 },
                input_cache_read: { price_per_m: -1 },
              },
            },
          ],
        }),
      ),
    )
    expect(
      (await novitaProviderModelCatalog.fetchPricing({})).data[0]
        ?.token_price_usd_per_million,
    ).toEqual({ input: 1, output: 2 })
  })
})
