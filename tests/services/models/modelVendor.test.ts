import { describe, expect, it } from "vitest"

import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import type { ModelIdentityLookupResult } from "~/services/models/modelMetadata/types"
import {
  aggregateModelVendors,
  buildCustomVendorKey,
  normalizeCustomVendorName,
  resolveCuratedModelVendor,
  resolveModelVendorCandidate,
} from "~/services/models/modelVendor"

const unmatchedLookup = { state: "unmatched" } as const

function resolvedLookup(
  providerId: string,
  match: "exact" | "normalized-alias" = "exact",
): ModelIdentityLookupResult {
  return {
    state: "resolved",
    match,
    metadata: {
      id: "dataset/model",
      name: "Dataset Model",
      provider_id: providerId,
    },
  }
}

describe("resolveModelVendorCandidate", () => {
  it("applies the fixed evidence precedence and preserves metadata match provenance", () => {
    expect(
      resolveModelVendorCandidate(
        {
          id: "claude-3-opus",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "OpenAI",
          },
        },
        resolvedLookup("anthropic"),
      ),
    ).toEqual({
      state: "candidate",
      kind: "known",
      key: "known:openai",
      knownId: "openai",
      labelCandidate: "OpenAI",
      source: "publisher-evidence",
    })

    expect(
      resolveModelVendorCandidate(
        { id: "dataset/model" },
        resolvedLookup("google", "exact"),
      ),
    ).toEqual({
      state: "candidate",
      kind: "known",
      key: "known:google",
      knownId: "google",
      labelCandidate: "Google",
      source: "metadata",
      identityMatch: "exact",
    })

    expect(
      resolveModelVendorCandidate(
        { id: "qwen-max" },
        resolvedLookup("alibaba-cn", "exact"),
      ),
    ).toMatchObject({
      state: "candidate",
      kind: "known",
      key: "known:alibaba",
      knownId: "alibaba",
      labelCandidate: "Alibaba",
      source: "metadata",
      identityMatch: "exact",
    })

    expect(
      resolveModelVendorCandidate(
        { id: "dataset-alias" },
        resolvedLookup("Example Publisher", "normalized-alias"),
      ),
    ).toEqual({
      state: "candidate",
      kind: "custom",
      key: "custom:example%20publisher",
      labelCandidate: "Example Publisher",
      source: "metadata",
      identityMatch: "normalized-alias",
    })

    expect(
      resolveModelVendorCandidate(
        { id: "groq/compound" },
        resolvedLookup("Example Publisher"),
      ),
    ).toMatchObject({
      state: "candidate",
      kind: "known",
      key: "known:groq",
      knownId: "groq",
      source: "curated-rule",
    })
  })

  it("arbitrates custom metadata only with explicit product policy", () => {
    expect(
      resolveModelVendorCandidate(
        { id: "utter-project/EuroLLM-22B-Instruct-2512" },
        resolvedLookup("utter-project"),
      ),
    ).toMatchObject({
      state: "candidate",
      kind: "known",
      key: "known:eurollm",
      knownId: "eurollm",
      source: "curated-rule",
    })

    expect(
      resolveModelVendorCandidate(
        { id: "NousResearch/Hermes-3-Llama-3.1-405B" },
        resolvedLookup("NousResearch"),
      ),
    ).toMatchObject({
      state: "candidate",
      kind: "custom",
      key: "custom:nousresearch",
      source: "metadata",
    })

    for (const [providerId, expected] of [
      ["poolside", "custom:poolside"],
      ["sakana", "custom:sakana"],
      ["nvidia", "known:nvidia"],
    ] as const) {
      expect(
        resolveModelVendorCandidate(
          { id: `${providerId}/opaque-model` },
          resolvedLookup(providerId),
        ),
      ).toMatchObject({
        state: "candidate",
        key: expected,
        source: "metadata",
      })
    }
  })

  it.each([
    "acme/DeepSeek-R1-Distill-Qwen-14B-Llama-3",
    "acme/DeepSeek-R1-Distill-Llama-70B-Qwen3",
  ])("keeps custom metadata for ambiguous derived model %s", (modelId) => {
    expect(
      resolveModelVendorCandidate({ id: modelId }, resolvedLookup("acme")),
    ).toMatchObject({
      state: "candidate",
      kind: "custom",
      key: "custom:acme",
      source: "metadata",
    })
  })

  it("maps the models.dev moonshotai provider before curated Kimi matching", () => {
    const modelId = "moonshotai/kimi-k2-thinking-turbo"

    expect(
      resolveModelVendorCandidate(
        { id: modelId },
        {
          state: "resolved",
          match: "exact",
          metadata: {
            id: modelId,
            name: "Kimi K2 Thinking Turbo",
            provider_id: "moonshotai",
            family: "kimi-thinking",
          },
        },
      ),
    ).toEqual({
      state: "candidate",
      kind: "known",
      key: "known:moonshot",
      knownId: "moonshot",
      labelCandidate: "Moonshot AI",
      source: "metadata",
      identityMatch: "exact",
    })
  })

  it("maps the models.dev meituan provider to the curated Meituan identity", () => {
    expect(
      resolveModelVendorCandidate(
        { id: "meituan/longcat-2.0" },
        {
          state: "resolved",
          match: "exact",
          metadata: {
            id: "meituan/longcat-2.0",
            name: "LongCat-2.0",
            provider_id: "meituan",
            family: "longcat",
          },
        },
      ),
    ).toEqual({
      state: "candidate",
      kind: "known",
      key: "known:meituan",
      knownId: "meituan",
      labelCandidate: "Meituan",
      source: "metadata",
      identityMatch: "exact",
    })
  })

  it("ignores ambiguous metadata and falls through each lower precedence level", () => {
    expect(
      resolveModelVendorCandidate(
        {
          id: "unrecognized-model",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
            name: "Meta",
          },
        },
        { state: "ambiguous" },
      ),
    ).toMatchObject({
      state: "candidate",
      key: "known:meta",
      source: "deployment-alias",
    })

    expect(
      resolveModelVendorCandidate(
        {
          id: "qwen-max",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
            name: "Admin category",
          },
        },
        unmatchedLookup,
      ),
    ).toMatchObject({
      state: "candidate",
      key: "known:alibaba",
      source: "curated-rule",
    })

    expect(
      resolveModelVendorCandidate(
        {
          id: "unrecognized-model",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
            name: "Google",
          },
        },
        unmatchedLookup,
      ),
    ).toMatchObject({
      state: "candidate",
      key: "known:google",
      source: "routing-alias",
    })
  })

  it("uses weak deployment and routing evidence only after a curated no-match", () => {
    expect(
      resolveModelVendorCandidate(
        {
          id: "qwen-max",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
            name: "Meta",
          },
        },
        unmatchedLookup,
      ),
    ).toMatchObject({
      state: "candidate",
      knownId: "alibaba",
      source: "curated-rule",
    })

    expect(
      resolveModelVendorCandidate(
        {
          id: "2zai",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
            name: "Meta",
          },
        },
        unmatchedLookup,
      ),
    ).toMatchObject({
      state: "candidate",
      knownId: "meta",
      source: "deployment-alias",
    })

    expect(
      resolveModelVendorCandidate(
        {
          id: "0wFF",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
            name: "Google",
          },
        },
        unmatchedLookup,
      ),
    ).toMatchObject({
      state: "candidate",
      knownId: "google",
      source: "routing-alias",
    })

    for (const kind of [
      MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
      MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
    ] as const) {
      expect(
        resolveModelVendorCandidate(
          {
            id: "gpt-4-claude",
            vendorEvidence: { kind, name: "Google" },
          },
          unmatchedLookup,
        ),
      ).toEqual({ state: "unknown" })
    }
  })

  it("accepts deterministic custom publishers but rejects arbitrary deployment and routing labels", () => {
    expect(
      resolveModelVendorCandidate(
        {
          id: "example-model",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: " Example   Publisher ",
            externalId: "42",
          },
        },
        unmatchedLookup,
      ),
    ).toEqual({
      state: "candidate",
      kind: "custom",
      key: "custom:example%20publisher",
      labelCandidate: "Example Publisher",
      source: "publisher-evidence",
    })

    for (const vendorEvidence of [
      {
        kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
        name: "Admin category",
      },
      {
        kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
        name: "gateway",
      },
      {
        kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
        name: "123",
      },
      {
        kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
        name: "自定义",
      },
    ] as const) {
      expect(
        resolveModelVendorCandidate(
          { id: "example-model", vendorEvidence },
          unmatchedLookup,
        ),
      ).toEqual({ state: "unknown" })
    }
  })

  it("does not treat an unregistered prefix as publisher evidence", () => {
    for (const id of ["ExamplePublisher/unrecognized-model"]) {
      expect(resolveModelVendorCandidate({ id }, unmatchedLookup)).toEqual({
        state: "unknown",
      })
    }
  })

  it.each([
    ["openai", "openai"],
    ["alibaba", "alibaba"],
    ["google", "google"],
    ["anthropic", "anthropic"],
    ["nvidia", "nvidia"],
    ["mistral", "mistral"],
    ["zhipuai", "zhipu"],
    ["cohere", "cohere"],
    ["minimax", "minimax"],
    ["xiaomi", "xiaomi"],
    ["moonshotai", "moonshot"],
    ["deepseek", "deepseek"],
    ["xai", "xai"],
    ["meta", "meta"],
    ["deepreinforce", "deep-reinforce"],
    ["perplexity", "perplexity"],
    ["stepfun", "stepfun"],
    ["sarvam", "sarvam"],
    ["microsoft", "microsoft"],
    ["tencent", "tencent"],
    ["meituan", "meituan"],
    ["poolside", null],
    ["sakana", null],
  ] as const)(
    "applies the complete models.dev lab prefix contract for %s",
    (prefix, knownId) => {
      const candidate = resolveModelVendorCandidate(
        { id: `${prefix}/opaque-model` },
        unmatchedLookup,
      )

      if (knownId === null) {
        expect(candidate).toEqual({ state: "unknown" })
      } else {
        expect(candidate).toMatchObject({
          state: "candidate",
          kind: "known",
          key: `known:${knownId}`,
          knownId,
          source: "curated-rule",
        })
      }
    },
  )

  it.each([
    ["qwen", "alibaba"],
    ["claude", "anthropic"],
    ["gemini", "google"],
    ["llama", "meta"],
    ["kimi", "moonshot"],
    ["glm", "zhipu"],
    ["sonar", "perplexity"],
    ["mimo", "xiaomi"],
    ["essential-ai", "essential-ai"],
    ["arcee-ai", "arcee"],
    ["deepcogito", "deep-cogito"],
    ["liquid", "liquid"],
    ["prism-ml", "prism-ml"],
    ["speakleash", "speakleash"],
  ] as const)(
    "uses exact eligible brand alias %s for an opaque model",
    (prefix, knownId) => {
      expect(
        resolveModelVendorCandidate(
          { id: `${prefix}/opaque-model` },
          unmatchedLookup,
        ),
      ).toMatchObject({
        state: "candidate",
        knownId,
        source: "curated-rule",
      })
    },
  )

  it.each([
    ["DeepSeek-AI/opaque:free", "deepseek"],
    ["ＱＷＥＮ／opaque-model", "alibaba"],
    ["Deep   Mind/opaque-model", "google"],
    ["qwen/Some Opaque Model", "alibaba"],
    ["ＱＷＥＮ／Some　Opaque　Model", "alibaba"],
  ] as const)(
    "normalizes exact weak alias prefix fallback for %s",
    (modelId, knownId) => {
      expect(
        resolveModelVendorCandidate({ id: modelId }, unmatchedLookup),
      ).toMatchObject({
        state: "candidate",
        kind: "known",
        key: `known:${knownId}`,
        knownId,
        source: "curated-rule",
      })
    },
  )

  it.each([
    ["microsoft/claude-3", "anthropic"],
    ["deepseek-ai/Qwen3", "alibaba"],
    ["OpenRouter/Llama-3", "meta"],
  ] as const)(
    "keeps direct model evidence ahead of prefix fallback for %s",
    (modelId, knownId) => {
      expect(
        resolveModelVendorCandidate({ id: modelId }, unmatchedLookup),
      ).toMatchObject({
        state: "candidate",
        knownId,
        source: "curated-rule",
      })
    },
  )

  it.each([
    "microsoft/wrapper-gpt-4",
    "microsoft/sonnet",
    "microsoft/gpt-4-claude",
    "microsoft/Wrapper gpt-4",
    "microsoft/Some sonnet",
  ])("keeps prefix fallback conflicts ambiguous for %s", (modelId) => {
    expect(
      resolveModelVendorCandidate({ id: modelId }, unmatchedLookup),
    ).toEqual({ state: "unknown" })
  })

  it.each([
    "fireworks/opaque-model",
    "openrouter/opaque-model",
    "groq/opaque-model",
    "opencode/opaque-model",
    "opencodefree/opaque-model",
    "kilo/opaque-model",
    "kilo-code/opaque-model",
    "utter-project/opaque-model",
    "azure/opaque-model",
    "together/opaque-model",
  ])("does not treat hosting or virtual prefix %s as ownership", (modelId) => {
    expect(
      resolveModelVendorCandidate({ id: modelId }, unmatchedLookup),
    ).toEqual({ state: "unknown" })
  })

  it.each([
    "gateway/microsoft/opaque-model",
    "microsoft//opaque-model",
    "microsoft/",
    "microsoft/:free",
    "qwen/   ",
    "qwen/   :free",
    "qwen/�",
    "qwen/\ud800",
    "qwen/opaque/model",
    "micro_soft/opaque-model",
    "micro%73oft/opaque-model",
    "qwenish/opaque-model",
    "my-claude/opaque-model",
  ])("rejects malformed or inexact prefix identity %s", (modelId) => {
    expect(
      resolveModelVendorCandidate({ id: modelId }, unmatchedLookup),
    ).toEqual({ state: "unknown" })
  })

  it.each([
    MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
    MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
  ] as const)("does not treat Groq %s evidence as model ownership", (kind) => {
    expect(
      resolveModelVendorCandidate(
        {
          id: "opaque-model",
          vendorEvidence: { kind, name: "Groq" },
        },
        unmatchedLookup,
      ),
    ).toEqual({ state: "unknown" })
  })

  it.each([
    ["OpenRouter", "openrouter"],
    ["Kilo Code", "kilo-code"],
  ] as const)(
    "retains strong Publisher and metadata aliases for router owner %s",
    (name, knownId) => {
      expect(
        resolveModelVendorCandidate(
          {
            id: "opaque-model",
            vendorEvidence: {
              kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
              name,
            },
          },
          unmatchedLookup,
        ),
      ).toMatchObject({
        state: "candidate",
        key: `known:${knownId}`,
        knownId,
        source: "publisher-evidence",
      })

      expect(
        resolveModelVendorCandidate(
          { id: "opaque-model" },
          resolvedLookup(knownId),
        ),
      ).toMatchObject({
        state: "candidate",
        key: `known:${knownId}`,
        knownId,
        source: "metadata",
      })
    },
  )

  it.each([
    ["OpenRouter", "meta-llama/Llama-3.3-70B-Instruct", "meta"],
    ["OpenRouter", "opaque-model", null],
    ["Kilo Code", "Qwen/Qwen3-8B", "alibaba"],
    ["Kilo Code", "opaque-model", null],
  ] as const)(
    "does not treat weak %s evidence as ownership of %s",
    (name, modelId, expectedKnownId) => {
      for (const kind of [
        MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
        MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
      ] as const) {
        const candidate = resolveModelVendorCandidate(
          { id: modelId, vendorEvidence: { kind, name } },
          unmatchedLookup,
        )

        if (expectedKnownId === null) {
          expect(candidate).toEqual({ state: "unknown" })
        } else {
          expect(candidate).toMatchObject({
            state: "candidate",
            knownId: expectedKnownId,
            source: "curated-rule",
          })
        }
      }
    },
  )

  it.each([
    ["Groq", "groq"],
    ["Essential AI", "essential-ai"],
    ["Arcee AI", "arcee"],
  ] as const)("retains strong Publisher alias %s as %s", (name, knownId) => {
    expect(
      resolveModelVendorCandidate(
        {
          id: "opaque-model",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name,
          },
        },
        unmatchedLookup,
      ),
    ).toMatchObject({
      state: "candidate",
      key: `known:${knownId}`,
      knownId,
      source: "publisher-evidence",
    })
  })

  it.each([
    ["groq", "groq"],
    ["deepcogito", "deep-cogito"],
    ["swiss-ai", "swiss-ai"],
  ] as const)("retains strong metadata alias %s as %s", (name, knownId) => {
    expect(
      resolveModelVendorCandidate({ id: "opaque-model" }, resolvedLookup(name)),
    ).toMatchObject({
      state: "candidate",
      key: `known:${knownId}`,
      knownId,
      source: "metadata",
    })
  })

  it.each([
    ["Z.ai", "zhipu"],
    ["zai", "zhipu"],
    ["zai-org", "zhipu"],
    ["CohereLabs", "cohere"],
    ["Tencent-Hunyuan", "tencent"],
    ["baichuan-inc", "baichuan"],
    ["ByteDance-Seed", "bytedance"],
    ["stepfun-ai", "stepfun"],
    ["deepreinforce-ai", "deep-reinforce"],
    ["inceptionai", "inception"],
    ["sarvamai", "sarvam"],
    ["OpenSenseNova", "sensetime"],
  ] as const)(
    "canonicalizes strong-only official alias %s as %s",
    (name, knownId) => {
      expect(
        resolveModelVendorCandidate(
          {
            id: "opaque-model",
            vendorEvidence: {
              kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
              name,
            },
          },
          unmatchedLookup,
        ),
      ).toMatchObject({
        state: "candidate",
        knownId,
        source: "publisher-evidence",
      })

      expect(
        resolveModelVendorCandidate(
          { id: "opaque-model" },
          resolvedLookup(name),
        ),
      ).toMatchObject({
        state: "candidate",
        knownId,
        source: "metadata",
      })

      for (const kind of [
        MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
        MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
      ] as const) {
        expect(
          resolveModelVendorCandidate(
            {
              id: "opaque-model",
              vendorEvidence: { kind, name },
            },
            unmatchedLookup,
          ),
        ).toEqual({ state: "unknown" })
      }

      expect(
        resolveModelVendorCandidate(
          { id: `${name}/opaque-model` },
          unmatchedLookup,
        ),
      ).toEqual({ state: "unknown" })
    },
  )

  const genericAnthropicSubfamilyNames = ["Sonnet", "Haiku", "Opus"] as const

  it.each(genericAnthropicSubfamilyNames)(
    "keeps generic Publisher name %s custom",
    (name) => {
      expect(
        resolveModelVendorCandidate(
          {
            id: "opaque-model",
            vendorEvidence: {
              kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
              name,
            },
          },
          unmatchedLookup,
        ),
      ).toEqual({
        state: "candidate",
        kind: "custom",
        key: buildCustomVendorKey(normalizeCustomVendorName(name)),
        labelCandidate: name,
        source: "publisher-evidence",
      })
    },
  )

  it.each(genericAnthropicSubfamilyNames)(
    "keeps generic metadata provider %s custom",
    (name) => {
      expect(
        resolveModelVendorCandidate(
          { id: "opaque-model" },
          resolvedLookup(name),
        ),
      ).toEqual({
        state: "candidate",
        kind: "custom",
        key: buildCustomVendorKey(normalizeCustomVendorName(name)),
        labelCandidate: name,
        source: "metadata",
        identityMatch: "exact",
      })
    },
  )

  it.each(genericAnthropicSubfamilyNames)(
    "lets curated ownership win over generic deployment name %s",
    (name) => {
      expect(
        resolveModelVendorCandidate(
          {
            id: "qwen-max",
            vendorEvidence: {
              kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
              name,
            },
          },
          unmatchedLookup,
        ),
      ).toMatchObject({
        state: "candidate",
        knownId: "alibaba",
        source: "curated-rule",
      })
    },
  )

  it.each(genericAnthropicSubfamilyNames)(
    "rejects generic routing provider name %s for an opaque model",
    (name) => {
      expect(
        resolveModelVendorCandidate(
          {
            id: "opaque-model",
            vendorEvidence: {
              kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
              name,
            },
          },
          unmatchedLookup,
        ),
      ).toEqual({ state: "unknown" })
    },
  )
})

describe("known vendor aliases and curated model families", () => {
  const knownVendors = [
    ["openai", "OpenAI"],
    ["anthropic", "Anthropic"],
    ["google", "Google"],
    ["meta", "Meta"],
    ["alibaba", "Alibaba"],
    ["xai", "xAI"],
    ["deepseek", "DeepSeek"],
    ["mistral", "Mistral"],
    ["moonshot", "Moonshot AI"],
    ["zhipu", "Zhipu AI"],
    ["minimax", "MiniMax"],
    ["cohere", "Cohere"],
    ["tencent", "Tencent"],
    ["baidu", "Baidu"],
    ["baichuan", "Baichuan"],
    ["01-ai", "01.AI"],
    ["bytedance", "ByteDance"],
    ["nvidia", "NVIDIA"],
    ["xiaomi", "Xiaomi"],
    ["stepfun", "StepFun"],
    ["perplexity", "Perplexity"],
    ["sdaia", "SDAIA"],
    ["prism-ml", "PrismML"],
    ["speakleash", "SpeakLeash"],
    ["eurollm", "EuroLLM"],
    ["openrouter", "OpenRouter"],
    ["kilo-code", "Kilo Code"],
    ["kuaishou", "Kuaishou"],
    ["shanghai-ai-lab", "Shanghai AI Laboratory"],
    ["opencode", "OpenCode"],
  ] as const

  it.each(knownVendors)(
    "maps known alias %s to canonical label %s",
    (id, label) => {
      for (const alias of [id, label]) {
        expect(
          resolveModelVendorCandidate(
            {
              id: "unrecognized-model",
              vendorEvidence: {
                kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
                name: alias,
              },
            },
            unmatchedLookup,
          ),
        ).toMatchObject({
          state: "candidate",
          key: `known:${id}`,
          knownId: id,
          labelCandidate: label,
        })
      }
    },
  )

  it.each([
    ["gpt-4o", "openai"],
    ["gpt4o", "openai"],
    ["gpt-oss-120b", "openai"],
    ["vendor/gpt-oss-20b", "openai"],
    ["o1-preview", "openai"],
    ["chatgpt-4o", "openai"],
    ["dall-e-3", "openai"],
    ["whisper-1", "openai"],
    ["text-embedding-3-small", "openai"],
    ["text-embedding-3-large", "openai"],
    ["text-embedding-ada-002", "openai"],
    ["codex-auto-review", "openai"],
    ["claude-3-5-sonnet", "anthropic"],
    ["gemini-2.5-flash", "google"],
    ["gemma-3", "google"],
    ["llama-3.3", "meta"],
    ["qwen-max", "alibaba"],
    ["alibaba/qwen3.5-flash", "alibaba"],
    ["qwen2.5-coder", "alibaba"],
    ["tongyi-qianwen", "alibaba"],
    ["grok-3", "xai"],
    ["deepseek-r1", "deepseek"],
    ["mixtral-8x7b", "mistral"],
    ["kimi-k2", "moonshot"],
    ["glm-4.5", "zhipu"],
    ["minimax-m2", "minimax"],
    ["command-r-plus", "cohere"],
    ["hunyuan-t1", "tencent"],
    ["ernie-4.5", "baidu"],
    ["baichuan-4", "baichuan"],
    ["yi-large", "01-ai"],
    ["doubao-pro", "bytedance"],
    ["nemotron-ultra", "nvidia"],
    ["mimo-v2", "xiaomi"],
    ["LongCat-Flash-Lite", "meituan"],
    ["step-2-16k", "stepfun"],
    ["sonar-pro", "perplexity"],
    ["upstage/SOLAR-10.7B-Instruct-v1.0", "upstage"],
  ] as const)("recognizes curated family %s as %s", (modelId, knownId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({
      state: "candidate",
      key: `known:${knownId}`,
      source: "curated-rule",
    })
  })

  const stableFamilyClassificationMatrix = [
    ["codex-mini-latest", "openai"],
    ["text.embedding.4.large", "openai"],
    ["text_embedding_ada_002", "openai"],
    ["gpt-realtime-preview", "openai"],
    ["gpt-audio-2", "openai"],
    ["gpt-image-2", "openai"],
    ["gpt-4.1-mini", "openai"],
    ["o2-preview", "openai"],
    ["tts2-preview", "openai"],
    ["tts-preview", "openai"],
    ["claude-future", "anthropic"],
    ["imagen-4-preview", "google"],
    ["Leanstral-2603", "mistral"],
    ["aya-101", "cohere"],
    ["tiny-aya-fire", "cohere"],
    ["hy3-preview", "tencent"],
    ["Baichuan2", "baichuan"],
    ["01-ai/Yi-Future", "01-ai"],
    ["riva_translate_preview", "nvidia"],
    ["mimo-next", "xiaomi"],
    ["Step3", "stepfun"],
    ["Step-3.7", "stepfun"],
    ["Step1X", "stepfun"],
    ["stepfun-ai/Step", "stepfun"],
    ["stepfun-ai/Step-Audio", "stepfun"],
    ["sonar-reasoning", "perplexity"],
    ["rnj-1.5-instruct", "essential-ai"],
    ["OLMoE-2", "ai2"],
    ["Phi4-mini", "microsoft"],
    ["WizardLM-3", "microsoft"],
    ["arcee-ai/Trinity-Nano", "arcee"],
    ["bge-reranker-base_v1", "baai"],
    ["canopylabs/orpheus-other", "canopy-labs"],
    ["deepcogito/Cogito-Next", "deep-cogito"],
    ["Ornith-2.0", "deep-reinforce"],
    ["openrouter/bodybuilder", "openrouter"],
    ["openrouter/fusion", "openrouter"],
    ["openrouter/fusion-flash", "openrouter"],
    ["openrouter/pareto-code", "openrouter"],
    ["kilo-auto/frontier", "kilo-code"],
    ["kilo-auto/balanced", "kilo-code"],
    ["kilo-auto/efficient", "kilo-code"],
    ["inclusionai/Ling-Next", "inclusion-ai"],
    ["jina-embedding-v4", "jina"],
    ["jina-embeddings-v5", "jina"],
    ["LFM2-1.2B", "liquid"],
    ["LFM2.5-8B-A1B", "liquid"],
    ["nomic_embed_text-v2", "nomic"],
    ["nova-canvas-v2", "amazon"],
    ["nova-pro-v2", "amazon"],
    ["nova-reel-2", "amazon"],
    ["nova-sonic-preview", "amazon"],
    ["sarvam-next", "sarvam"],
    ["SenseNova-Next", "sensetime"],
    ["upstage/SOLAR-Next", "upstage"],
    ["solar-pro-3", "upstage"],
    ["Apertus-Next", "swiss-ai"],
  ] as const

  it.each(stableFamilyClassificationMatrix)(
    "recognizes stable family model %s as %s",
    (modelId, knownId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        state: "candidate",
        kind: "known",
        key: `known:${knownId}`,
        knownId,
        source: "curated-rule",
      })
    },
  )

  it.each([
    "my-gpt-realtime",
    "o2foo",
    "ttsish",
    "tts2ish",
    "sonnet-generator",
    "haiku-3",
    "opus-4",
    "deepmind-model",
    "leanstrality",
    "bigmodel-preview",
    "shell-command-r",
    "hy30",
    "mybaichuan2",
    "baichuanish",
    "01-ai-random",
    "gliner-sensitive-data",
    "acme-mimo-model",
    "Step-Audio",
    "other/Step",
    "other/Step-Audio",
    "stepfun-random",
    "olmoire-model",
    "other/trinity-mini",
    "orpheus-v1-english",
    "other/orpheus-v1-english",
    "other/cogito-671b-v2.1",
    "openrouter/random-product",
    "other/kilo-auto/frontier",
    "other/ling-2.6-1t",
    "jina-randomizer",
    "my-jina-embedding",
    "lfm-radio",
    "xlfm2",
    "other/mercury-2",
    "nova-6.7b",
    "nova-scotia",
    "supernova-pro",
    "apertures",
    "my-apertus",
  ])("keeps opaque or near-family model %s unclassified", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each([
    "trinity-large-preview",
    "trinity-mini",
    "cogito-671b-v2.1",
    "cogito-671b-v2.1-fp8",
    "ling-2.6-1t",
  ])("does not retain historical bare release exception %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each([
    ["gliner-pii", "nvidia"],
    ["NVIDIA/GLINER-PII", "nvidia"],
    ["groq/compound", "groq"],
    ["GROQ/COMPOUND-MINI", "groq"],
    ["openrouter/auto", "openrouter"],
    ["openrouter/free", "openrouter"],
    ["openrouter/bodybuilder", "openrouter"],
    ["openrouter/fusion", "openrouter"],
    ["openrouter/fusion-flash", "openrouter"],
    ["openrouter/pareto-code", "openrouter"],
    ["openrouter-random", "openrouter"],
    ["ＯＰＥＮＲＯＵＴＥＲ／ＡＵＴＯ", "openrouter"],
  ] as const)("recognizes controlled exact model ID %s", (modelId, knownId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({ knownId })
  })

  it.each([
    "other/gliner-pii",
    "compound",
    "compound-mini",
    "other/compound",
    "auto",
    "other/auto",
    "other/openrouter-random",
    "openrouter/random",
    "openrouter/auto-v2",
  ])("keeps controlled exact model ID namespace-safe for %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each(["kilo-auto/small", "kilo-auto/random", "KILO-AUTO/FUTURE-TIER"])(
    "accepts one well-formed Kilo tier segment in %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "kilo-code",
      })
    },
  )

  it.each([
    "kilo-auto/",
    "kilo-auto//small",
    "kilo-auto/small/extra",
    "kilo-auto/-small",
    "kilo-auto/small-",
    "other/kilo-auto/random",
  ])("rejects malformed or foreign Kilo tier identity %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each([
    "mercury-2",
    "mercury-edit",
    "mercury-edit-2",
    "mercury-coder-small",
  ])("recognizes controlled bare Mercury family %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({
      knownId: "inception",
    })
  })

  it.each(["other/mercury-2", "other/mercury-edit-2", "mercury-retrograde"])(
    "keeps Mercury family namespace and root boundaries for %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each([
    "solar-pro2",
    "solar-pro3",
    "solar-pro",
    "solar-pro-2",
    "solar-pro-3",
    "Solar-Open",
    "SOLAR-0",
    "SOLAR-10.7B",
    "solar-docvision",
    "solar-mini",
    "solar-open2",
    "solar-0-mini",
    "solar-1-mini",
    "solar-open-exp",
    "solar-system",
    "SOLAR-10.7B-Instruct-v1.0",
    "acme/solar-pro2",
    "other/solar-docvision",
    "solar-powered-10.7b-instruct",
  ])("recognizes the stable Upstage SOLAR family %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({
      knownId: "upstage",
    })
  })

  it.each(["solarized", "solaris", "my-solar"])(
    "rejects SOLAR near-prefix %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each(["nova-2-pro-v1", "nova-2-lite-v1", "nova-pro-v2", "nova-lite-2"])(
    "recognizes controlled Amazon Nova generation placement %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "amazon",
      })
    },
  )

  it.each(["nova-2-random", "nova-scotia"])(
    "rejects unsupported Amazon Nova subfamily %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each(["rnj-1", "rnj-1.5", "rnj-2", "rnj-10"])(
    "recognizes the Essential RNJ numeric lineage %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "essential-ai",
      })
    },
  )

  it.each(["rnjx-1", "x-rnj-1"])("rejects RNJ near-prefix %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each([
    "gpt-realtime-claude-future",
    "claude-gpt-4",
    "claude-o2",
    "claude-text-embedding-4",
    "gpt-4-sonnet",
    "gemini-haiku",
    "qwen-opus",
  ])("keeps cross-vendor token order ambiguity-safe for %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each([
    "gpt-4-gemini",
    "gemini-gpt-4",
    "claude-gemini",
    "gemini-claude",
    "gpt-4-sonar",
    "sonar-gpt-4",
    "claude-dall e-3",
    "dall e-3-claude",
  ])("keeps anchored cross-family permutations ambiguous for %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each([
    "wrapper-gemini",
    "wrapper-sonar",
    "wrapper-gpt-4",
    "wrapper-claude",
  ])(
    "does not classify incidental suffix %s without a direct match",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each([
    "NousResearch/Hermes-3-Llama-3.1-405B",
    "NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO",
    "teknium/OpenHermes-2.5-Mistral-7B",
    "dphn/Dolphin-Mistral-24B-Venice-Edition",
  ])("does not infer ownership from embedded base family in %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each([
    ["nvidia/Llama-3.1-Nemotron-8B-UltraLong-4M-Instruct", "nvidia"],
    ["nvidia/llama-nemotron-embed-vl-1b-v2", "nvidia"],
    ["deepseek/deepseek-r1-distill-qwen-32b", "deepseek"],
    ["deepseek/deepseek-r1-distill-llama-70b", "deepseek"],
    ["deepcogito/cogito-v1-preview-qwen-14B", "deep-cogito"],
    ["deepcogito/cogito-v2-preview-llama-70B", "deep-cogito"],
    ["deepcogito/cogito-v2-preview-deepseek-671B-MoE", "deep-cogito"],
  ] as const)(
    "lets an exact eligible prefix corroborate a present candidate in %s",
    (modelId, knownId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({ knownId })
    },
  )

  it.each([
    "DeepSeek-R1-Distill-Qwen-14B",
    "DeepSeek-R1-Distill-Llama-70B",
    "openrouter/DeepSeek-R1-Distill-Qwen-32B",
    "openrouter/DeepSeek-R1-Distill-Llama-70B",
    "fireworks/DeepSeek-R1-Distill-Qwen-32B",
    "fireworks/DeepSeek-R1-Distill-Llama-70B",
    "acme/DeepSeek-R1-Distill-Qwen-7B",
    "acme/DeepSeek-R1-Distill-Llama-8B",
  ])("uses explicit DeepSeek derived-product grammar for %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({
      knownId: "deepseek",
    })
  })

  it.each([
    "DeepSeek-R1-Distill-Qwen-14B-Llama-3",
    "acme/DeepSeek-R1-Distill-Qwen-14B-Llama-3",
    "DeepSeek-R1-Distill-Llama-70B-Qwen3",
    "acme/DeepSeek-R1-Distill-Llama-70B-Qwen3",
  ])("keeps mixed DeepSeek derivative %s ambiguous", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each([
    "deepseek/DeepSeek-R1-Distill-Qwen-14B-Llama-3",
    "deepseek/DeepSeek-R1-Distill-Llama-70B-Qwen3",
  ])(
    "lets the exact DeepSeek prefix corroborate mixed derivative %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "deepseek",
      })
    },
  )

  it.each([
    ["Llama-3.3-70B-Instruct", "meta"],
    ["Qwen3-32B", "alibaba"],
    ["Mistral-7B-Instruct", "mistral"],
    ["DeepSeek-V3", "deepseek"],
    ["OpenRouter/Llama-3.3-70B-Instruct", "meta"],
  ] as const)("keeps leading canonical family %s as %s", (modelId, knownId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({ knownId })
  })

  it.each(["gpt-4-trinity-mini", "gpt-4-mercury-2"])(
    "does not promote qualified-only policy suffix %s into a conflict",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "openai",
      })
    },
  )

  const secondPassClassificationOracle = [
    ["CohereLabs/aya-expanse-32b", "cohere"],
    ["CohereLabs/aya-vision-32b", "cohere"],
    ["CohereLabs/tiny-aya-earth", "cohere"],
    ["CohereLabs/tiny-aya-global", "cohere"],
    ["CohereLabs/tiny-aya-water", "cohere"],
    ["EssentialAI/rnj-1-instruct", "essential-ai"],
    ["Qwen3-Embedding-0.6B", "alibaba"],
    ["Qwen3-Embedding-4B", "alibaba"],
    ["Qwen3-Embedding-8B", "alibaba"],
    ["Qwen3-VL-Embedding-2B", "alibaba"],
    ["qwen3-embedding-8b", "alibaba"],
    ["SenseVoiceSmall", "alibaba"],
    ["allenai/Olmo-3-7B-Instruct", "ai2"],
    ["alpindale/WizardLM-2-8x22B", "microsoft"],
    ["microsoft/phi-4", "microsoft"],
    ["arcee-ai/trinity-large-preview:free", "arcee"],
    ["arcee-ai/trinity-mini:free", "arcee"],
    ["bce-reranker-base_v1", "netease-youdao"],
    ["bge-large-zh-v1.5", "baai"],
    ["bge-m3", "baai"],
    ["bge-reranker-large", "baai"],
    ["bge-reranker-v2-m3", "baai"],
    ["bge-small-zh-v1.5", "baai"],
    ["canopylabs/orpheus-arabic-saudi", "canopy-labs"],
    ["canopylabs/orpheus-v1-english", "canopy-labs"],
    ["deepcogito/cogito-671b-v2.1", "deep-cogito"],
    ["deepcogito/cogito-671b-v2.1-FP8", "deep-cogito"],
    ["deepreinforce-ai/Ornith-1.0-35B", "deep-reinforce"],
    ["deepreinforce-ai/Ornith-1.0-35B-FP8", "deep-reinforce"],
    ["diffusiongemma-26b-a4b-it", "google"],
    ["gliner-pii", "nvidia"],
    ["riva-translate-4b-instruct-v1.1", "nvidia"],
    ["glm4.7", "zhipu"],
    ["zai-org/AutoGLM-Phone-9B-Multilingual", "zhipu"],
    ["groq/compound", "groq"],
    ["groq/compound-mini", "groq"],
    ["hy3", "tencent"],
    ["inclusionAI/Ling-2.6-1T", "inclusion-ai"],
    ["jina-clip-v1", "jina"],
    ["jina-clip-v2", "jina"],
    ["jina-reranker-m0", "jina"],
    ["labs-leanstral-1-5", "mistral"],
    ["labs-leanstral-1-5-1", "mistral"],
    ["liquid/lfm-2.5-1.2b-instruct:free", "liquid"],
    ["liquid/lfm-2.5-1.2b-thinking:free", "liquid"],
    ["mercury-2", "inception"],
    ["mercury-edit", "inception"],
    ["nomic-embed-code", "nomic"],
    ["nova-lite-1.0", "amazon"],
    ["nova-lite-2", "amazon"],
    ["nova-micro-1.0", "amazon"],
    ["nova-premier-1.0", "amazon"],
    ["sarvam-m", "sarvam"],
    ["sensenova-6.7-flash-lite", "sensetime"],
    ["sensenova-u1-fast", "sensetime"],
    ["swiss-ai/Apertus-70B-Instruct-2509", "swiss-ai"],
    ["swiss-ai/Apertus-8B-Instruct-2509", "swiss-ai"],
  ] as const

  it.each(secondPassClassificationOracle)(
    "classifies approved second-pass model %s as %s",
    (modelId, knownId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        state: "candidate",
        kind: "known",
        key: `known:${knownId}`,
        knownId,
        source: "curated-rule",
      })
    },
  )

  const remainingClassificationOracle = [
    ["0wFF", null],
    ["2zai", null],
    ["ASecretCat", null],
    ["Youtu-Embedding", "tencent"],
    ["allam-2-7b", "sdaia"],
    ["bce-embedding-base_v1", "netease-youdao"],
    ["corethink:free", null],
    ["deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", "deepseek"],
    ["ising-calibration-1-35b-a3b", "nvidia"],
    ["kilo-auto", "kilo-code"],
    ["kilo-auto/free", "kilo-code"],
    ["openrouter-random", "openrouter"],
    ["openrouter/auto", "openrouter"],
    ["openrouter/free", "openrouter"],
    ["prism-ml/Ternary-Bonsai-27B-gguf", "prism-ml"],
    ["speakleash/Bielik-11B-v3.0-Instruct", "speakleash"],
    ["utter-project/EuroLLM-22B-Instruct-2512", "eurollm"],
  ] as const

  it.each(remainingClassificationOracle)(
    "classifies approved remaining model %s as %s",
    (modelId, expectedKnownId) => {
      const candidate = resolveCuratedModelVendor(modelId)

      if (expectedKnownId === null) {
        expect(candidate).toEqual({ state: "unknown" })
      } else {
        expect(candidate).toMatchObject({
          state: "candidate",
          kind: "known",
          key: `known:${expectedKnownId}`,
          knownId: expectedKnownId,
          source: "curated-rule",
        })
      }
    },
  )

  const auditedClassificationOracle = [
    ["BigModel/cogview-3-flash", "zhipu"],
    ["Fireworks/Cogito 671B v2.1", null],
    ["Fireworks/DeepSeek V3.1", null],
    ["Fireworks/Deepseek v3.2", null],
    ["Fireworks/Kimi K2 Instruct 0905", null],
    ["Fireworks/Kimi K2 Thinking", null],
    ["Fireworks/Kimi K2.5", null],
    ["Fireworks/Llama 3.3 70B Instruct", null],
    ["Fireworks/OpenAI gpt-oss-120b", null],
    ["Fireworks/OpenAI gpt-oss-20b", null],
    ["Kwai-Kolors/Kolors", "kuaishou"],
    ["OpenCodeFree/big-pickle", "opencode"],
    ["OpenCodeFree/north-mini-code", "cohere"],
    ["deepseek-ai/DeepSeek-R1-0528-Qwen3-8B", "deepseek"],
    ["internlm/internlm2_5-7b-chat", "shanghai-ai-lab"],
    ["nano-banana-pro", "google"],
    ["solar-10.7b-instruct", "upstage"],
    ["voxtral-mini-tts-2603", "mistral"],
    ["voxtral-mini-tts-latest", "mistral"],
    ["voxtral-mini-tts-mellon-greek-2606-solutions", "mistral"],
    ["0wFF", null],
    ["2zai", null],
    ["ASecretCat", null],
    ["corethink:free", null],
    ["translate-model", null],
    ["translate-model-3.1", null],
    ["translate-model-3.1-t", null],
    ["translate-model-fast", null],
    ["translate-model-mini", null],
    ["translate-model-test", null],
  ] as const

  it.each(auditedClassificationOracle)(
    "classifies audited catalog ID %s as %s",
    (modelId, expectedKnownId) => {
      const candidate = resolveCuratedModelVendor(modelId)

      if (expectedKnownId === null) {
        expect(candidate).toEqual({ state: "unknown" })
      } else {
        expect(candidate).toMatchObject({
          state: "candidate",
          kind: "known",
          key: `known:${expectedKnownId}`,
          knownId: expectedKnownId,
          source: "curated-rule",
        })
      }
    },
  )

  it.each(["CogView-3-Flash", "CogView3-Pro", "cogview_4_preview"])(
    "recognizes the stable Zhipu CogView family %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "zhipu",
      })
    },
  )

  it.each(["cogviewer-3", "my-cogview-3"])(
    "rejects CogView near-prefix %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each(["north-mini-code", "north_mini_code-v2", "north.mini.code.preview"])(
    "recognizes the stable Cohere North Mini Code family %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "cohere",
      })
    },
  )

  it.each(["northstar-mini-code", "my-north-mini-code"])(
    "rejects North Mini Code near-prefix %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each(["Kolors", "kolors-v2", "kolors_preview"])(
    "recognizes the Kuaishou Kolors family %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "kuaishou",
      })
    },
  )

  it.each(["kolorscope", "my-kolors"])(
    "rejects Kolors near-prefix %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each(["InternLM2_5-7B-Chat", "InternLM3-8B", "internlm-4-preview"])(
    "recognizes the Shanghai AI Laboratory InternLM family %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "shanghai-ai-lab",
      })
    },
  )

  it.each(["internlmx-3", "my-internlm-3"])(
    "rejects InternLM near-prefix %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each([
    ["big-pickle", "opencode"],
    ["opencode/big-pickle", "opencode"],
    ["opencodefree/big-pickle", "opencode"],
  ] as const)(
    "recognizes controlled product ID %s as %s",
    (modelId, knownId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({ knownId })
    },
  )

  it.each([
    "other/big-pickle",
    "opencode/big-pickle-v2",
    "opencode/unrecognized-model",
  ])("keeps controlled product ID %s exact and namespace-safe", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each([
    "nano-banana",
    "nano-banana-pro",
    "nano-banana-pro-v2",
    "nano-banana_2",
    "google/nano-banana",
    "other/nano-banana-pro",
    "other/nano-banana.preview",
  ])("recognizes the Google Nano Banana family %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({
      knownId: "google",
    })
  })

  it.each(["nano-bananax", "nanobanana", "my-nano-banana"])(
    "rejects Nano Banana near-prefix %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each([
    "DeepSeek-R1-0528-Qwen3-8B",
    "DeepSeek-R1-1234-Qwen4-Next",
    "deepseek-ai/DeepSeek-R1-0528-Qwen3-32B-GGUF",
  ])("attributes stable dated DeepSeek Qwen derivatives in %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({
      knownId: "deepseek",
    })
  })

  it.each([
    "acme/DeepSeek-R1-0528-Qwen3-8B",
    "DeepSeek-R1-052-Qwen3-8B",
    "DeepSeek-R1-0528-Qwen3-8B-Claude",
  ])("keeps dated DeepSeek attribution safe for %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it("preserves Alibaba ownership for ordinary Qwen models", () => {
    for (const modelId of ["Qwen/Qwen3-8B", "Qwen4-Next"]) {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "alibaba",
      })
    }
  })

  it("does not infer Mistral from the unprefixed Mellon suffix", () => {
    expect(resolveCuratedModelVendor("mellon-greek-2606-solutions")).toEqual({
      state: "unknown",
    })
  })

  it("keeps OpenAI TTS direct-only inside other model families", () => {
    expect(resolveCuratedModelVendor("voxtral-mini-tts-future")).toMatchObject({
      knownId: "mistral",
    })
    expect(resolveCuratedModelVendor("voxtral-mini-tts-gpt-4")).toEqual({
      state: "unknown",
    })
    expect(resolveCuratedModelVendor("voxtral-mini-tts-claude")).toEqual({
      state: "unknown",
    })
    expect(resolveCuratedModelVendor("openai/tts-1-hd")).toMatchObject({
      knownId: "openai",
    })
    expect(resolveCuratedModelVendor("other/tts-preview")).toEqual({
      state: "unknown",
    })
  })

  it.each([
    "Youtu-Embedding-v2",
    "youtu_embedding_3-large",
    "youtu.embedding.preview",
  ])("recognizes the stable Tencent Youtu family %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({
      knownId: "tencent",
    })
  })

  it.each(["my-youtu-embedding", "YoutuEmbedding", "youtuber-embedding"])(
    "does not match a near-prefix as Tencent Youtu in %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each([
    "bce-embedding-base-v2",
    "bce_embedding_large_v1",
    "bce.reranker.preview",
  ])("recognizes the stable NetEase Youdao BCE family %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({
      knownId: "netease-youdao",
    })
  })

  it("rejects BCE near-prefixes and leaves BGE with BAAI", () => {
    for (const modelId of ["bceembedding-base-v1", "bcephalous-model"]) {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    }

    expect(resolveCuratedModelVendor("bge-m3")).toMatchObject({
      knownId: "baai",
    })
  })

  it.each([
    "ising-calibration-1-35b-a3b-preview",
    "ising_calibration_2-70b",
    "ising.calibration.instruct",
  ])("recognizes the stable NVIDIA Ising family %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({
      knownId: "nvidia",
    })
  })

  it("rejects Ising near-prefixes and does not claim its Qwen base", () => {
    for (const modelId of ["isingly-calibration", "my-ising-calibration"]) {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    }

    expect(resolveCuratedModelVendor("Qwen3-30B-A3B")).toMatchObject({
      knownId: "alibaba",
    })
  })

  it.each([
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-8B-Instruct",
    "deepseek-ai/DeepSeek-R1-Distill-Qwen_32B_GGUF",
    "DeepSeek-R1-Distill-Qwen-14B",
  ])(
    "uses the stable DeepSeek derived-family attribution for %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "deepseek",
      })
    },
  )

  it.each([
    "DeepSeek-R1-Distill-Qwen-14B-claude",
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B-claude",
  ])(
    "keeps derived attribution ambiguous when %s also matches another vendor",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it("keeps the DeepSeek attribution grammar boundary-safe", () => {
    for (const modelId of [
      "DeepSeek-R1-Distill-Qwen7B",
      "deepseek-qwen-mashup",
    ]) {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    }

    expect(resolveCuratedModelVendor("gpt-4-claude-opus")).toEqual({
      state: "unknown",
    })
    expect(resolveCuratedModelVendor("Qwen/Qwen3-8B")).toMatchObject({
      knownId: "alibaba",
    })
  })

  it.each(["ALLaM-2-7b-instruct", "allam_3_70b", "allam.preview"])(
    "recognizes the stable SDAIA ALLaM family %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({
        knownId: "sdaia",
      })
    },
  )

  it.each(["my-allam-2-7b", "callam-2-7b", "allam2-7b"])(
    "does not match a near-prefix as SDAIA ALLaM in %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each([
    ["prism-ml/Ternary-Bonsai-72B-Instruct-v2", "prism-ml"],
    ["prism-ml/Ternary-Bonsai_GGUF", "prism-ml"],
    ["speakleash/Bielik-35B-v4.0-Instruct", "speakleash"],
    ["speakleash/Bielik_GGUF", "speakleash"],
    ["utter-project/EuroLLM-70B-Instruct-2601", "eurollm"],
    ["utter-project/EuroLLM_GGUF", "eurollm"],
  ] as const)(
    "recognizes stable creator-qualified derived family %s",
    (modelId, knownId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({ knownId })
    },
  )

  it.each([
    "other/Ternary-Bonsai-27B-gguf",
    "other/Bielik-11B-v3.0-Instruct",
    "other/EuroLLM-22B-Instruct-2512",
    "utter-project/EuroLLMish-22B",
    "utter-project/unrecognized-model",
  ])("keeps derived family namespace and root boundaries for %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it("does not infer derived checkpoint owners from bases or consortium identities", () => {
    expect(resolveCuratedModelVendor("Qwen/Qwen3-8B")).toMatchObject({
      knownId: "alibaba",
    })
    expect(resolveCuratedModelVendor("utter-project")).toEqual({
      state: "unknown",
    })
    expect(resolveCuratedModelVendor("unbabel/model")).toEqual({
      state: "unknown",
    })
  })

  it.each([
    "auto",
    "free",
    "random",
    "acme/auto",
    "other/kilo-auto",
    "other/kilo-auto/free",
    "openrouter/auto-v2",
    "openrouter/random",
  ])(
    "does not infer router ownership from generic or near-match ID %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each([
    ["openrouter/auto:free", "openrouter"],
    ["openrouter/free:floor", "openrouter"],
    ["openrouter-random:legacy", "openrouter"],
    ["kilo-auto:free", "kilo-code"],
    ["kilo-auto/free:free", "kilo-code"],
  ] as const)(
    "strips routing decoration from exact router product %s",
    (modelId, knownId) => {
      expect(resolveCuratedModelVendor(modelId)).toMatchObject({ knownId })
    },
  )

  it.each([
    "embedding-model",
    "embedding-3-small",
    "acme-text-embedding-3-small",
    "image-1",
    "image-preview",
    "audio-preview",
    "audio-transcription",
  ])("does not attribute generic capability model %s to OpenAI", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each([
    "mygliner-pii",
    "gliner-sensitive-data",
    "gliner-pii-copy",
    "riva-translateable",
    "nova-liteweight-1.0",
    "sensenovation-u1-fast",
    "hy30",
  ])("does not match near-substring or cross-family model %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it.each(["glm4all", "glm404notfound", "my-glm4x", "foo/glm4all"])(
    "does not accept an unterminated numeric GLM version in %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each(["compound", "compound-mini", "acme/compound"])(
    "requires the Groq namespace for %s",
    (modelId) => {
      expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
    },
  )

  it.each([
    "orpheus-arabic-saudi",
    "orpheus-v1-english",
    "acme/orpheus-arabic-saudi",
  ])("requires an approved Canopy Labs full ID for %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it("attributes reuploads by the model creator rather than uploader namespace", () => {
    expect(
      resolveCuratedModelVendor("alpindale/WizardLM-2-8x22B"),
    ).toMatchObject({
      key: "known:microsoft",
    })
  })

  it("keeps Alibaba SenseVoice distinct from SenseTime SenseNova", () => {
    expect(resolveCuratedModelVendor("SenseVoiceSmall")).toMatchObject({
      key: "known:alibaba",
    })
    expect(resolveCuratedModelVendor("sensenova-u1-fast")).toMatchObject({
      key: "known:sensetime",
    })
  })

  it.each([
    "daylight",
    "po2",
    "agpt-oss-120b",
    "gptoss-120b",
    "gpt-neox-20b",
    "vendor/gpt-neox-20b",
    "gpt-j-6b",
    "vendor/gpt4all",
    "qwenfoo",
    "longcatapult",
    "模型yi-large",
    "songsonnetfragment",
  ])("does not match family fragments in %s", (modelId) => {
    expect(resolveCuratedModelVendor(modelId)).toEqual({ state: "unknown" })
  })

  it("returns Unknown instead of picking the first rule for cross-vendor ties", () => {
    expect(resolveCuratedModelVendor("gpt-4-claude-opus")).toEqual({
      state: "unknown",
    })
  })

  it.each([
    [MODEL_VENDOR_EVIDENCE_KINDS.Publisher, "DeepMind", "google"],
    [MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory, "Tongyi", "alibaba"],
    [MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider, "Llama", "meta"],
    [MODEL_VENDOR_EVIDENCE_KINDS.Publisher, "x.ai", "xai"],
    [MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider, "Doubao", "bytedance"],
  ] as const)(
    "maps exact %s evidence alias %s to %s",
    (kind, name, knownId) => {
      expect(
        resolveModelVendorCandidate(
          {
            id: "unrecognized-model",
            vendorEvidence: { kind, name },
          },
          unmatchedLookup,
        ),
      ).toMatchObject({
        state: "candidate",
        kind: "known",
        key: `known:${knownId}`,
        knownId,
      })
    },
  )

  it.each([
    MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
    MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
  ] as const)("rejects non-alias %s evidence", (kind) => {
    for (const name of ["custom", "unknown", "", "123", "gateway"]) {
      expect(
        resolveModelVendorCandidate(
          {
            id: "unrecognized-model",
            vendorEvidence: { kind, name },
          },
          unmatchedLookup,
        ),
      ).toEqual({ state: "unknown" })
    }
  })
})

describe("custom vendor keys and deterministic aggregation", () => {
  const malformedVendorName = "Acme\ud800 Labs"

  it("repairs malformed Unicode in publisher evidence before building a custom key", () => {
    const candidate = resolveModelVendorCandidate(
      {
        id: "unrecognized-model",
        vendorEvidence: {
          kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
          name: malformedVendorName,
        },
      },
      unmatchedLookup,
    )

    expect(candidate).toEqual({
      state: "candidate",
      kind: "custom",
      key: "custom:acme%EF%BF%BD%20labs",
      labelCandidate: "Acme� Labs",
      source: "publisher-evidence",
    })
  })

  it("repairs malformed Unicode in metadata providers and aggregates deterministically", () => {
    const candidate = resolveModelVendorCandidate(
      { id: "dataset/model" },
      resolvedLookup(malformedVendorName),
    )

    expect(normalizeCustomVendorName(malformedVendorName)).toBe("acme� labs")
    expect(
      buildCustomVendorKey(normalizeCustomVendorName(malformedVendorName)),
    ).toBe("custom:acme%EF%BF%BD%20labs")
    expect(aggregateModelVendors([candidate, candidate])).toMatchObject({
      catalog: [
        {
          kind: "custom",
          key: "custom:acme%EF%BF%BD%20labs",
          label: "Acme� Labs",
        },
      ],
      resolved: [
        { state: "resolved", key: "custom:acme%EF%BF%BD%20labs" },
        { state: "resolved", key: "custom:acme%EF%BF%BD%20labs" },
      ],
    })
  })

  it.each(["all", "unknown", "Azure", "Ollama"])(
    "keeps explicit publisher %s as a custom vendor instead of a filter or known taxonomy value",
    (name) => {
      expect(
        resolveModelVendorCandidate(
          {
            id: "unrecognized-model",
            vendorEvidence: {
              kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
              name,
            },
          },
          unmatchedLookup,
        ),
      ).toMatchObject({
        state: "candidate",
        kind: "custom",
        key: buildCustomVendorKey(normalizeCustomVendorName(name)),
      })
    },
  )

  it("normalizes custom names without collapsing punctuation", () => {
    expect(normalizeCustomVendorName("  Example   VENDOR  ")).toBe(
      "example vendor",
    )
    expect(buildCustomVendorKey("all")).toBe("custom:all")
    expect(buildCustomVendorKey("unknown")).toBe("custom:unknown")
    expect(buildCustomVendorKey("example.vendor")).toBe("custom:example.vendor")
    expect(buildCustomVendorKey("example/vendor")).toBe(
      "custom:example%2Fvendor",
    )
  })

  it("ignores external ids, merges case and space variants, and keeps different labels distinct", () => {
    const publisher = (name: string, externalId: string) =>
      resolveModelVendorCandidate(
        {
          id: "model",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name,
            externalId,
          },
        },
        unmatchedLookup,
      )

    const sameKeyA = publisher("Beta Labs", "1")
    const sameKeyB = publisher("  beta   labs ", "2")
    const punctuationDistinct = publisher("Beta-Labs", "1")
    const sameExternalIdDifferentLabel = publisher("Other Labs", "1")
    const { catalog, resolved } = aggregateModelVendors([
      sameKeyA,
      sameKeyB,
      punctuationDistinct,
      sameExternalIdDifferentLabel,
    ])

    expect(catalog.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "custom:beta%20labs", label: "Beta Labs" },
      { key: "custom:beta-labs", label: "Beta-Labs" },
      { key: "custom:other%20labs", label: "Other Labs" },
    ])
    expect(resolved[0]).toEqual(resolved[1])
    expect(resolved[2]).not.toEqual(resolved[0])
    expect(resolved[3]).not.toEqual(resolved[0])
  })

  it("merges known aliases and remaps every row to a code-point canonical label", () => {
    const customCandidate = (labelCandidate: string) => ({
      state: "candidate" as const,
      kind: "custom" as const,
      key: "custom:example" as const,
      labelCandidate,
      source: "publisher-evidence" as const,
    })
    const knownAlias = (labelCandidate: string) => ({
      state: "candidate" as const,
      kind: "known" as const,
      key: "known:google" as const,
      knownId: "google",
      labelCandidate,
      source: "publisher-evidence" as const,
    })

    const { catalog, resolved } = aggregateModelVendors([
      customCandidate("b"),
      customCandidate("a"),
      knownAlias("Google"),
      knownAlias("google"),
      { state: "unknown" },
    ])

    expect(catalog).toEqual([
      { kind: "custom", key: "custom:example", label: "a" },
      {
        kind: "known",
        key: "known:google",
        knownId: "google",
        label: "Google",
      },
    ])
    expect(resolved).toEqual([
      {
        state: "resolved",
        kind: "custom",
        key: "custom:example",
        label: "a",
        source: "publisher-evidence",
      },
      {
        state: "resolved",
        kind: "custom",
        key: "custom:example",
        label: "a",
        source: "publisher-evidence",
      },
      {
        state: "resolved",
        kind: "known",
        key: "known:google",
        knownId: "google",
        label: "Google",
        source: "publisher-evidence",
      },
      {
        state: "resolved",
        kind: "known",
        key: "known:google",
        knownId: "google",
        label: "Google",
        source: "publisher-evidence",
      },
      { state: "unknown" },
    ])
  })
})
