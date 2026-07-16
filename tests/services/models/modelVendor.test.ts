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

  it("does not treat namespace prefixes as publisher evidence", () => {
    for (const id of [
      "ExamplePublisher/unrecognized-model",
      "alibaba/unrecognized-model",
      "meituan/unrecognized-model",
    ]) {
      expect(resolveModelVendorCandidate({ id }, unmatchedLookup)).toEqual({
        state: "unknown",
      })
    }
  })
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
    ["image-1", "openai"],
    ["audio-preview", "openai"],
    ["codex-auto-review", "openai"],
    ["claude-3-5-sonnet", "anthropic"],
    ["haiku-3", "anthropic"],
    ["opus-4", "anthropic"],
    ["gemini-2.5-flash", "google"],
    ["gemma-3", "google"],
    ["deepmind-model", "google"],
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
  ] as const)("recognizes curated family %s as %s", (modelId, knownId) => {
    expect(resolveCuratedModelVendor(modelId)).toMatchObject({
      state: "candidate",
      key: `known:${knownId}`,
      source: "curated-rule",
    })
  })

  it.each([
    "daylight",
    "o2-preview",
    "po2",
    "agpt-oss-120b",
    "gptoss-120b",
    "gpt-neox-20b",
    "vendor/gpt-neox-20b",
    "gpt-j-6b",
    "vendor/gpt4all",
    "codex-runtime-model",
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
