import { describe, expect, it } from "vitest"

import { getModelVendorPresentation } from "~/features/ModelList/modelVendorPresentation"
import type {
  ModelVendorCatalogEntry,
  ResolvedModelVendor,
} from "~/services/models/modelMetadata/types"
import type { KnownModelVendorId } from "~/services/models/modelVendor"

const resolvedKnownVendor = (knownId: string): ResolvedModelVendor => ({
  state: "resolved",
  kind: "known",
  key: `known:${knownId}`,
  knownId,
  label: knownId,
  source: "curated-rule",
})

describe("getModelVendorPresentation", () => {
  const knownVendorBrands = [
    "openai",
    "anthropic",
    "google",
    "meta",
    "alibaba",
    "xai",
    "deepseek",
    "mistral",
    "moonshot",
    "zhipu",
    "minimax",
    "cohere",
    "tencent",
    "baidu",
    "baichuan",
    "01-ai",
    "bytedance",
    "nvidia",
    "xiaomi",
    "meituan",
    "stepfun",
    "perplexity",
    "essential-ai",
    "ai2",
    "microsoft",
    "arcee",
    "deep-cogito",
    "groq",
    "openrouter",
    "kilo-code",
    "jina",
    "liquid",
    "inception",
    "amazon",
    "baai",
    "sensetime",
    "upstage",
    "kuaishou",
    "shanghai-ai-lab",
    "opencode",
  ] as const satisfies ReadonlyArray<KnownModelVendorId>

  it.each(knownVendorBrands)(
    "stores the compounded icon for known vendor %s",
    (knownId) => {
      const presentation = getModelVendorPresentation(
        resolvedKnownVendor(knownId),
      )

      expect(presentation.kind).toBe("brand")
      if (presentation.kind !== "brand") {
        throw new Error(`Expected a brand presentation for ${knownId}`)
      }
      expect(presentation.Brand.Mark).toBeDefined()
    },
  )

  it("records library Color availability without assigning local brand colors", () => {
    const google = getModelVendorPresentation(resolvedKnownVendor("google"))
    const anthropic = getModelVendorPresentation(
      resolvedKnownVendor("anthropic"),
    )

    expect(google.kind).toBe("brand")
    expect(anthropic.kind).toBe("brand")
    if (google.kind !== "brand" || anthropic.kind !== "brand") return

    expect(google.Brand.Color).toBeDefined()
    expect(anthropic.Brand.Color).toBeUndefined()
  })

  const knownVendorInitials = [
    ["netease-youdao", "YD"],
    ["canopy-labs", "CL"],
    ["deep-reinforce", "DR"],
    ["inclusion-ai", "IA"],
    ["nomic", "N"],
    ["sarvam", "S"],
    ["swiss-ai", "CH"],
    ["sdaia", "SA"],
    ["prism-ml", "PM"],
    ["speakleash", "SL"],
    ["eurollm", "EU"],
  ] as const satisfies ReadonlyArray<readonly [KnownModelVendorId, string]>

  it.each(knownVendorInitials)(
    "stores explicit initials for known vendor %s (%s)",
    (knownId, initials) => {
      expect(getModelVendorPresentation(resolvedKnownVendor(knownId))).toEqual({
        kind: "initials",
        initials,
      })
    },
  )

  it("separates unresolved ownership from generic identity fallback", () => {
    const unconfiguredKnown = getModelVendorPresentation(
      resolvedKnownVendor("future-vendor"),
    )
    const customCatalogEntry: ModelVendorCatalogEntry = {
      kind: "custom",
      key: "custom:example%20lab",
      label: "Example Lab",
    }

    expect(unconfiguredKnown).toEqual({ kind: "generic" })
    expect(getModelVendorPresentation(customCatalogEntry)).toEqual({
      kind: "generic",
    })
    expect(getModelVendorPresentation({ state: "unknown" })).toEqual({
      kind: "unknown",
    })
  })

  it("returns the generic presentation for prototype-named known identities", () => {
    expect(getModelVendorPresentation(resolvedKnownVendor("toString"))).toEqual(
      { kind: "generic" },
    )
  })

  it("works when the static Object.hasOwn API is unavailable", () => {
    const hasOwnDescriptor = Object.getOwnPropertyDescriptor(Object, "hasOwn")
    if (!hasOwnDescriptor) {
      throw new Error("Expected Object.hasOwn in the test runtime")
    }

    let configured: ReturnType<typeof getModelVendorPresentation>
    let generic: ReturnType<typeof getModelVendorPresentation>

    try {
      Object.defineProperty(Object, "hasOwn", {
        ...hasOwnDescriptor,
        value: undefined,
      })

      configured = getModelVendorPresentation(resolvedKnownVendor("openai"))
      generic = getModelVendorPresentation(resolvedKnownVendor("future-vendor"))
    } finally {
      Object.defineProperty(Object, "hasOwn", hasOwnDescriptor)
    }

    expect(configured).toMatchObject({ kind: "brand" })
    expect(generic).toEqual({ kind: "generic" })
  })

  it("does not attach project-maintained brand colors or backgrounds", () => {
    const anthropic = getModelVendorPresentation(
      resolvedKnownVendor("anthropic"),
    )

    expect(anthropic).toMatchObject({ kind: "brand" })
    expect(anthropic).not.toHaveProperty("iconClassName")
    expect(anthropic).not.toHaveProperty("containerClassName")
    expect(JSON.stringify(anthropic)).not.toMatch(/orange|bg-|text-/i)
  })

  it("exposes only local render configuration without a remote asset source", () => {
    const presentations = [
      getModelVendorPresentation(resolvedKnownVendor("openai")),
      getModelVendorPresentation(resolvedKnownVendor("future-vendor")),
      getModelVendorPresentation({ state: "unknown" }),
    ]

    for (const presentation of presentations) {
      expect(presentation).not.toHaveProperty("src")
      expect(presentation).not.toHaveProperty("url")
      expect(presentation).not.toHaveProperty("imageUrl")
      expect(JSON.stringify(presentation)).not.toMatch(/https?:\/\//)
    }
  })
})
