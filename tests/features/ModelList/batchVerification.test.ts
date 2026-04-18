import { describe, expect, it } from "vitest"

import {
  createBatchVerifyModelItems,
  pickBatchVerifyCompatibleToken,
  resolveBatchVerifyApiType,
} from "~/features/ModelList/batchVerification"
import { API_TYPES } from "~/services/verification/aiApiVerification"

describe("model list batch verification helpers", () => {
  it("deduplicates model items by model-list row key", () => {
    const source = {
      kind: "account",
      account: { id: "acc-1" },
    } as any

    const result = createBatchVerifyModelItems([
      {
        model: { model_name: "gpt-4o", enable_groups: ["default"] },
        source,
      },
      {
        model: { model_name: "gpt-4o", enable_groups: ["default"] },
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

  it("keeps missing model group metadata unrestricted", () => {
    const source = {
      kind: "account",
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

  it("auto-detects the closest verification API type from model id", () => {
    expect(resolveBatchVerifyApiType("auto", "claude-3-5-sonnet")).toBe(
      API_TYPES.ANTHROPIC,
    )
    expect(resolveBatchVerifyApiType("auto", "gemini-2.5-flash")).toBe(
      API_TYPES.GOOGLE,
    )
    expect(resolveBatchVerifyApiType("auto", "gpt-4o-mini")).toBe(
      API_TYPES.OPENAI_COMPATIBLE,
    )
    expect(resolveBatchVerifyApiType(API_TYPES.OPENAI, "gpt-4o-mini")).toBe(
      API_TYPES.OPENAI,
    )
  })

  it("selects the first enabled token compatible with model and group", () => {
    const tokens = [
      {
        id: 1,
        status: 0,
        group: "default",
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
        group: "default",
        model_limits_enabled: true,
        model_limits: "gpt-4o-mini",
        models: "",
      },
      {
        id: 4,
        status: 1,
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
    ] as any

    expect(
      pickBatchVerifyCompatibleToken(tokens, {
        modelId: "gpt-4o-mini",
        enableGroups: ["default"],
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
        enableGroups: ["default"],
      }),
    ).toBeNull()
  })
})
