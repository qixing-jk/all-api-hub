import { describe, expect, it } from "vitest"

import {
  createBatchVerifyModelItems,
  MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES,
  pickBatchVerifyCompatibleRuntimeKey,
  pickBatchVerifyCompatibleToken,
  resolveBatchVerifyApiType,
} from "~/features/ModelList/batchVerification"
import {
  MODEL_LIST_SOURCE_IDENTITY_KINDS,
  MODEL_MANAGEMENT_SOURCE_KINDS,
} from "~/features/ModelList/modelManagementSources"
import { DEFAULT_MODEL_GROUP } from "~/services/models/constants"
import { API_TYPES } from "~/services/verification/aiApiVerification"

describe("model list batch verification helpers", () => {
  it("deduplicates model items by model-list row key", () => {
    const source = {
      kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      account: { id: "acc-1" },
    } as any

    const result = createBatchVerifyModelItems([
      {
        model: { model_name: "gpt-4o", enable_groups: [DEFAULT_MODEL_GROUP] },
        source,
      },
      {
        model: { model_name: "gpt-4o", enable_groups: [DEFAULT_MODEL_GROUP] },
        source,
      },
      {
        model: { model_name: "claude-3-5-sonnet", enable_groups: ["vip"] },
        source,
      },
    ] as any)

    expect(result).toHaveLength(2)
    expect(result.map((item) => item.modelId)).toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
  })

  it("keeps matching model names from different accounts as separate items", () => {
    const firstAccountSource = {
      kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      account: { id: "acc-1" },
    } as any
    const secondAccountSource = {
      kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      account: { id: "acc-2" },
    } as any

    const result = createBatchVerifyModelItems([
      {
        model: { model_name: "gpt-4o", enable_groups: [DEFAULT_MODEL_GROUP] },
        source: firstAccountSource,
      },
      {
        model: { model_name: "gpt-4o", enable_groups: [DEFAULT_MODEL_GROUP] },
        source: secondAccountSource,
      },
      {
        model: { model_name: "gpt-4o", enable_groups: [DEFAULT_MODEL_GROUP] },
        source: firstAccountSource,
      },
    ] as any)

    expect(result).toHaveLength(2)
    expect(result.map((item) => item.key)).toEqual([
      "account:acc-1:gpt-4o",
      "account:acc-2:gpt-4o",
    ])
  })

  it("keeps same-account token rows separate for batch verification", () => {
    const source = {
      kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      account: { id: "batch-sub2api-account" },
      capabilities: { supportsBatchCredentialVerification: true },
    } as any
    const model = { model_name: "shared-model", enable_groups: ["default"] }

    const result = createBatchVerifyModelItems([
      {
        model,
        source,
        sourceIdentity: {
          kind: "account-token",
          id: "batch-sub2api-account:token:51",
          tokenId: 51,
          tokenName: "Default key",
        },
        groupRatios: { default: 1 },
        effectiveGroup: "default",
      },
      {
        model,
        source,
        sourceIdentity: {
          kind: "account-token",
          id: "batch-sub2api-account:token:52",
          tokenId: 52,
          tokenName: "Second key",
        },
        groupRatios: { default: 1 },
        effectiveGroup: "default",
      },
    ] as any)

    expect(result.map((item) => item.key)).toEqual([
      "account:batch-sub2api-account:token:51:shared-model",
      "account:batch-sub2api-account:token:52:shared-model",
    ])
    expect(result.map((item) => item.sourceIdentity)).toEqual([
      {
        kind: "account-token",
        id: "batch-sub2api-account:token:51",
        tokenId: 51,
        tokenName: "Default key",
      },
      {
        kind: "account-token",
        id: "batch-sub2api-account:token:52",
        tokenId: 52,
        tokenName: "Second key",
      },
    ])
  })

  it("selects the matching token for token-scoped rows", () => {
    const tokens = [
      {
        id: 51,
        status: 1,
        group: DEFAULT_MODEL_GROUP,
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
      {
        id: 52,
        status: 1,
        group: DEFAULT_MODEL_GROUP,
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
    ] as any

    expect(
      pickBatchVerifyCompatibleToken(tokens, {
        modelId: "shared-model",
        enableGroups: [DEFAULT_MODEL_GROUP],
        sourceIdentity: {
          kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN,
          id: "batch-sub2api-account:token:52",
          tokenId: 52,
          tokenName: "Second key",
        },
      })?.id,
    ).toBe(52)
  })

  it("does not fall back to another compatible token for token-scoped rows", () => {
    const tokens = [
      {
        id: 51,
        status: 1,
        group: DEFAULT_MODEL_GROUP,
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
      {
        id: 52,
        status: 1,
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
    ] as any

    expect(
      pickBatchVerifyCompatibleToken(tokens, {
        modelId: "shared-model",
        enableGroups: [DEFAULT_MODEL_GROUP],
        sourceIdentity: {
          kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN,
          id: "batch-sub2api-account:token:53",
          tokenId: 53,
          tokenName: "Missing key",
        },
      }),
    ).toBeNull()

    expect(
      pickBatchVerifyCompatibleToken(tokens, {
        modelId: "shared-model",
        enableGroups: [DEFAULT_MODEL_GROUP],
        sourceIdentity: {
          kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN,
          id: "batch-sub2api-account:token:52",
          tokenId: 52,
          tokenName: "VIP key",
        },
      }),
    ).toBeNull()
  })

  it("keeps missing model group metadata unrestricted", () => {
    const source = {
      kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      account: { id: "acc-1" },
    } as any

    const [item] = createBatchVerifyModelItems([
      {
        model: { model_name: "gpt-4o" },
        source,
      },
    ] as any)

    expect(item.enableGroups).toBeNull()
  })

  it("narrows verification group metadata and token selection to the row's effective group", () => {
    const source = {
      kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      account: { id: "acc-1" },
    } as any

    const [item] = createBatchVerifyModelItems([
      {
        model: {
          model_name: "gpt-4o",
          enable_groups: [DEFAULT_MODEL_GROUP, "vip"],
        },
        effectiveGroup: "vip",
        source,
      },
    ] as any)

    expect(item.enableGroups).toEqual(["vip"])
    expect(
      pickBatchVerifyCompatibleToken(
        [
          {
            id: 1,
            status: 1,
            group: DEFAULT_MODEL_GROUP,
            model_limits_enabled: false,
            model_limits: "",
            models: "",
          },
          {
            id: 2,
            status: 1,
            group: "vip",
            model_limits_enabled: false,
            model_limits: "",
            models: "",
          },
        ] as any,
        item,
      )?.id,
    ).toBe(2)
  })

  it("omits rows whose source cannot provide verification credentials", () => {
    const supportedSource = {
      kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      account: { id: "supported-account" },
      capabilities: {
        supportsBatchCredentialVerification: true,
      },
    } as any
    const unsupportedSource = {
      kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      account: { id: "aihubmix-account" },
      capabilities: {
        supportsBatchCredentialVerification: false,
      },
    } as any

    const result = createBatchVerifyModelItems([
      {
        model: { model_name: "gpt-4o", enable_groups: [DEFAULT_MODEL_GROUP] },
        source: supportedSource,
      },
      {
        model: { model_name: "gpt-aihubmix", enable_groups: [] },
        source: unsupportedSource,
      },
    ] as any)

    expect(result.map((item) => item.key)).toEqual([
      "account:supported-account:gpt-4o",
    ])
  })

  it("auto-detects the closest verification API type from model id", () => {
    expect(
      resolveBatchVerifyApiType(
        MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES.AUTO,
        "claude-3-5-sonnet",
      ),
    ).toBe(API_TYPES.ANTHROPIC)
    expect(
      resolveBatchVerifyApiType(
        MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES.AUTO,
        "gemini-2.5-flash",
      ),
    ).toBe(API_TYPES.GOOGLE)
    expect(
      resolveBatchVerifyApiType(
        MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES.AUTO,
        "gpt-4o-mini",
      ),
    ).toBe(API_TYPES.OPENAI_COMPATIBLE)
    expect(resolveBatchVerifyApiType(API_TYPES.OPENAI, "gpt-4o-mini")).toBe(
      API_TYPES.OPENAI,
    )
  })

  it("selects the first enabled token compatible with model and group", () => {
    const tokens = [
      {
        id: 1,
        status: 0,
        group: DEFAULT_MODEL_GROUP,
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
      {
        id: 2,
        status: 1,
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
      {
        id: 3,
        status: 1,
        group: DEFAULT_MODEL_GROUP,
        model_limits_enabled: true,
        model_limits: "gpt-4o-mini",
        models: "",
      },
      {
        id: 4,
        status: 1,
        group: DEFAULT_MODEL_GROUP,
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
    ] as any

    expect(
      pickBatchVerifyCompatibleToken(tokens, {
        modelId: "gpt-4o-mini",
        enableGroups: [DEFAULT_MODEL_GROUP],
      })?.id,
    ).toBe(3)
  })

  it("selects an enabled token when model group metadata is unavailable", () => {
    const tokens = [
      {
        id: 1,
        status: 1,
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
    ] as any

    expect(
      pickBatchVerifyCompatibleToken(tokens, {
        modelId: "gpt-4o-mini",
        enableGroups: null,
      })?.id,
    ).toBe(1)
  })

  it("returns null when no enabled token is model-compatible", () => {
    const tokens = [
      {
        id: 1,
        status: 1,
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
    ] as any

    expect(
      pickBatchVerifyCompatibleToken(tokens, {
        modelId: "gpt-4o-mini",
        enableGroups: [DEFAULT_MODEL_GROUP],
      }),
    ).toBeNull()
  })

  it("selects a matching service-credential runtime key without token group filtering", () => {
    const runtimeKey = {
      id: "service_credential:acc-1:codex",
      source: "service_credential",
      label: "Codex",
      secret: "sk-service",
      status: "active",
      accountId: "acc-1",
      accountName: "Account One",
      siteType: "sharedchat",
      baseUrl: "https://runtime.example.invalid",
      capabilities: {
        copy: true,
        export: true,
        verify: true,
        fetchRuntimeModels: true,
        rotate: false,
        updateToken: false,
        deleteToken: false,
      },
      service: "codex",
      credential: {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "sk-service",
        isAuthenticated: true,
        baseUrl: "https://runtime.example.invalid",
      },
      account: {
        id: "acc-1",
        name: "Account One",
        siteType: "sharedchat",
        baseUrl: "https://runtime.example.invalid",
        authType: "access_token",
        token: "account-token",
        userId: "1",
        tagIds: [],
      },
    } as any

    expect(
      pickBatchVerifyCompatibleRuntimeKey([runtimeKey], {
        modelId: "vip-only-model",
        enableGroups: ["vip"],
        sourceIdentity: {
          kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY,
          id: "acc-1:runtime-key:service_credential:acc-1:codex",
          runtimeKeyId: "service_credential:acc-1:codex",
          runtimeKeyName: "Codex",
        },
      }),
    ).toBe(runtimeKey)

    expect(
      pickBatchVerifyCompatibleRuntimeKey([runtimeKey], {
        modelId: "empty-groups-model",
        enableGroups: [],
        sourceIdentity: {
          kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY,
          id: "acc-1:runtime-key:service_credential:acc-1:codex",
          runtimeKeyId: "service_credential:acc-1:codex",
          runtimeKeyName: "Codex",
        },
      }),
    ).toBe(runtimeKey)
  })

  it("keeps account-token runtime keys constrained by token compatibility", () => {
    const runtimeKeys = [
      {
        id: "account_token:acc-1:1",
        source: "account_token",
        label: "Default key",
        secret: "sk-default",
        status: "active",
        tokenId: 1,
        token: {
          id: 1,
          name: "Default key",
          key: "sk-default",
          status: 1,
          group: DEFAULT_MODEL_GROUP,
          model_limits_enabled: false,
          model_limits: "",
          models: "",
        },
      },
      {
        id: "account_token:acc-1:2",
        source: "account_token",
        label: "VIP key",
        secret: "sk-vip",
        status: "active",
        tokenId: 2,
        token: {
          id: 2,
          name: "VIP key",
          key: "sk-vip",
          status: 1,
          group: "vip",
          model_limits_enabled: false,
          model_limits: "",
          models: "",
        },
      },
    ] as any

    expect(
      pickBatchVerifyCompatibleRuntimeKey(runtimeKeys, {
        modelId: "shared-model",
        enableGroups: [DEFAULT_MODEL_GROUP],
        sourceIdentity: {
          kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY,
          id: "acc-1:runtime-key:account_token:acc-1:2",
          runtimeKeyId: "account_token:acc-1:2",
          runtimeKeyName: "VIP key",
        },
      }),
    ).toBeNull()

    expect(
      pickBatchVerifyCompatibleRuntimeKey(runtimeKeys, {
        modelId: "shared-model",
        enableGroups: ["vip"],
        sourceIdentity: {
          kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY,
          id: "acc-1:runtime-key:account_token:acc-1:2",
          runtimeKeyId: "account_token:acc-1:2",
          runtimeKeyName: "VIP key",
        },
      }),
    ).toBe(runtimeKeys[1])
  })

  it("preserves exact matching for legacy account-token source identities", () => {
    const runtimeKeys = [
      {
        id: "account_token:acc-1:51",
        source: "account_token",
        label: "First key",
        secret: "sk-first",
        status: "active",
        tokenId: 51,
        token: {
          id: 51,
          name: "First key",
          key: "sk-first",
          status: 1,
          group: DEFAULT_MODEL_GROUP,
          model_limits_enabled: false,
          model_limits: "",
          models: "",
        },
      },
      {
        id: "account_token:acc-1:52",
        source: "account_token",
        label: "Second key",
        secret: "sk-second",
        status: "active",
        tokenId: 52,
        token: {
          id: 52,
          name: "Second key",
          key: "sk-second",
          status: 1,
          group: DEFAULT_MODEL_GROUP,
          model_limits_enabled: false,
          model_limits: "",
          models: "",
        },
      },
    ] as any

    expect(
      pickBatchVerifyCompatibleRuntimeKey(runtimeKeys, {
        modelId: "shared-model",
        enableGroups: [DEFAULT_MODEL_GROUP],
        sourceIdentity: {
          kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN,
          id: "acc-1:token:52",
          tokenId: 52,
          tokenName: "Second key",
        },
      }),
    ).toBe(runtimeKeys[1])

    expect(
      pickBatchVerifyCompatibleRuntimeKey(runtimeKeys, {
        modelId: "shared-model",
        enableGroups: [DEFAULT_MODEL_GROUP],
        sourceIdentity: {
          kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN,
          id: "acc-1:token:53",
          tokenId: 53,
          tokenName: "Missing key",
        },
      }),
    ).toBeNull()
  })
})
