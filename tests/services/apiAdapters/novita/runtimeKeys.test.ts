import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createAccountSource } from "~/features/ModelList/catalog/modelManagementSources"
import { MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES } from "~/features/ModelList/verification/batchVerification"
import { executeBatchModelVerification } from "~/features/ModelList/verification/executeBatchModelVerification"
import { isAccountRuntimeKeyCompatibleWithModel } from "~/services/accounts/keys/accountRuntimeKeys"
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { resolveAssociatedProfileSecret } from "~/services/apiCredentialProfiles/accountImport/accountRuntimeKeyRecovery"
import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  runApiVerificationProbe,
} from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"
import {
  buildApiCredentialProfile,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiCredentialProfiles/accountImport/accountRuntimeKeyRecovery",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiCredentialProfiles/accountImport/accountRuntimeKeyRecovery")
    >()),
    resolveAssociatedProfileSecret: vi.fn(),
  }),
)
vi.mock("~/services/verification/aiApiVerification", async (original) => ({
  ...(await original<
    typeof import("~/services/verification/aiApiVerification")
  >()),
  runApiVerificationProbe: vi.fn(),
}))

const account = buildDisplaySiteData({
  id: "novita-runtime",
  siteType: SITE_TYPES.NOVITA,
  baseUrl: "https://novita.ai",
  userId: "account-uuid",
  token: "novita-console:management-secret",
})
const row = {
  name: "Inference key",
  stringId: "key-one",
  maskedKey: "sk_test****last",
  expireTime: "",
  modelAccessPolicy: {
    mode: "all_enabled",
    excludedModelCount: 0,
    allowedModelCount: 0,
  },
}

describe("Novita runtime credentials", () => {
  beforeEach(() => {
    vi.mocked(resolveAssociatedProfileSecret).mockReset()
    vi.mocked(runApiVerificationProbe).mockReset()
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValue({
      status: "not-found",
    })
    server.use(
      http.get("https://api-server.novita.ai/v2/user/key", () =>
        HttpResponse.json({ keys: [row] }),
      ),
    )
    server.use(
      http.get("https://api.novita.ai/openapi/v2/user/key", () =>
        HttpResponse.json({ keys: [row] }),
      ),
    )
  })

  it.each(["model-a", "blocked-model"])(
    "runs batch verification with an associated inference key only for allowed model %s",
    async (modelId) => {
      server.use(
        http.get("https://api-server.novita.ai/v2/user/key", () =>
          HttpResponse.json({
            keys: [
              {
                ...row,
                modelAccessPolicy: {
                  mode: "all_enabled",
                  excludedModelCount: 1,
                },
              },
            ],
          }),
        ),
        http.get(
          "https://api-server.novita.ai/v2/user/key/key-one/model-access-policy",
          () =>
            HttpResponse.json({
              stringId: "key-one",
              policy: {
                schemaVersion: 1,
                productScope: "model_api",
                mode: "all_enabled",
                allowedModels: [],
                excludedModels: [{ type: "llm", id: "blocked-model" }],
              },
            }),
        ),
      )
      const profile = buildApiCredentialProfile({
        apiKey: "sk_inference",
        baseUrl: "https://api.novita.ai/openai",
      })
      vi.mocked(resolveAssociatedProfileSecret).mockResolvedValue({
        status: "resolved",
        secret: profile.apiKey,
        profile,
      })
      vi.mocked(runApiVerificationProbe).mockResolvedValue({
        id: API_VERIFICATION_PROBE_IDS.Models,
        status: "pass",
        latencyMs: 1,
        summary: "Fixture models",
      })
      const status = await executeBatchModelVerification(
        {
          key: modelId,
          modelId,
          enableGroups: null,
          source: createAccountSource(account),
        },
        {
          apiTypeMode: MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES.AUTO,
          verificationMode: API_VERIFICATION_MODES.Streaming,
          selectedProbeIds: [API_VERIFICATION_PROBE_IDS.Models],
          abortSignal: new AbortController().signal,
          shouldStop: () => false,
          getAccountRuntimeKeys: () => fetchDisplayAccountRuntimeKeys(account),
          getResolvedRuntimeKey: (_item, key, signal) =>
            resolveDisplayAccountRuntimeKeySecret(account, key, {
              abortSignal: signal,
            }),
          persistResult: vi.fn().mockResolvedValue(undefined),
          recordFailureCategory: vi.fn(),
          publish: vi.fn(),
        },
      )
      expect(status).toBe(modelId === "model-a" ? "pass" : "skipped")
      if (modelId === "model-a")
        expect(runApiVerificationProbe).toHaveBeenCalledWith(
          expect.objectContaining({
            baseUrl: "https://api.novita.ai/openai",
            apiKey: "sk_inference",
          }),
        )
      else expect(runApiVerificationProbe).not.toHaveBeenCalled()
    },
  )

  it.each([account.token, "sk_account-read-only", "sk_test-full-secret-last"])(
    "projects the masked key without adopting the account credential (%s)",
    async (token) => {
      const owner = { ...account, token }
      const keys = await fetchDisplayAccountRuntimeKeys(owner)
      expect(keys).toHaveLength(1)
      expect(keys[0]).toMatchObject({
        label: "Inference key",
        secret: "",
        status: "active",
        baseUrl: "https://api.novita.ai/openai",
      })
      expect(keys[0]?.source).toBe("account_key_resource")
      expect(keys[0]).not.toHaveProperty("accountCredential")
      await expect(
        resolveDisplayAccountRuntimeKeySecret(owner, keys[0]!),
      ).rejects.toThrow()
    },
  )

  it("keeps expired keys out of model-compatible selection", async () => {
    server.use(
      http.get("https://api-server.novita.ai/v2/user/key", () =>
        HttpResponse.json({
          keys: [{ ...row, expireTime: "2020-01-01 00:00:00" }],
        }),
      ),
    )
    const key = (await fetchDisplayAccountRuntimeKeys(account))[0]!
    expect(key.status).toBe("inactive")
    expect(isAccountRuntimeKeyCompatibleWithModel(key, { id: "model-a" })).toBe(
      false,
    )
  })

  it("resolves only the exact associated credential instead of the management token", async () => {
    const profile = buildApiCredentialProfile({
      apiKey: "sk_inference",
      baseUrl: "https://api.novita.ai/openai",
    })
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValue({
      status: "resolved",
      secret: profile.apiKey,
      profile,
    })
    const keys = await fetchDisplayAccountRuntimeKeys(account)
    const resolved = await resolveDisplayAccountRuntimeKeySecret(
      account,
      keys[0]!,
    )
    expect(resolved.secret).toBe("sk_inference")
    expect(resolveAssociatedProfileSecret).toHaveBeenCalledWith({
      source: "account_key_resource",
      ref: {
        accountId: account.id,
        siteType: SITE_TYPES.NOVITA,
        scopeKey: "default",
        resourceId: "key-one",
      },
    })
    expect(keys[0]?.secret).toBe("")
  })

  it.each(["selected", "all_enabled"] as const)(
    "respects %s model restrictions",
    async (mode) => {
      server.use(
        http.get("https://api-server.novita.ai/v2/user/key", () =>
          HttpResponse.json({
            keys: [
              {
                ...row,
                modelAccessPolicy: {
                  mode,
                  allowedModelCount: 1,
                  excludedModelCount: 1,
                },
              },
            ],
          }),
        ),
        http.get(
          "https://api-server.novita.ai/v2/user/key/key-one/model-access-policy",
          () =>
            HttpResponse.json({
              stringId: "key-one",
              policy: {
                schemaVersion: 1,
                productScope: "model_api",
                mode,
                allowedModels: [{ type: "llm", id: "allowed-model" }],
                excludedModels: [{ type: "llm", id: "blocked-model" }],
              },
            }),
        ),
      )
      const key = (await fetchDisplayAccountRuntimeKeys(account))[0]!
      expect(
        isAccountRuntimeKeyCompatibleWithModel(key, { id: "allowed-model" }),
      ).toBe(true)
      expect(
        isAccountRuntimeKeyCompatibleWithModel(key, { id: "blocked-model" }),
      ).toBe(false)
      expect(
        isAccountRuntimeKeyCompatibleWithModel(key, { id: "other-model" }),
      ).toBe(mode === "all_enabled")
    },
  )

  it("does not treat an unreadable restriction policy as unrestricted access", async () => {
    server.use(
      http.get("https://api-server.novita.ai/v2/user/key", () =>
        HttpResponse.json({
          keys: [
            {
              ...row,
              modelAccessPolicy: { mode: "selected", allowedModelCount: 1 },
            },
          ],
        }),
      ),
      http.get(
        "https://api-server.novita.ai/v2/user/key/key-one/model-access-policy",
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    await expect(fetchDisplayAccountRuntimeKeys(account)).rejects.toThrow()
  })
})
