import { CpuChipIcon } from "@heroicons/react/24/outline"
import {
  Ai2,
  Alibaba,
  Anthropic,
  Arcee,
  Aws,
  BAAI,
  Baichuan,
  Baidu,
  ByteDance,
  Cohere,
  DeepCogito,
  DeepSeek,
  EssentialAI,
  Google,
  Groq,
  Inception,
  InternLM,
  Jina,
  KiloCode,
  Kolors,
  Liquid,
  LongCat,
  Meta,
  Microsoft,
  Minimax,
  Mistral,
  Moonshot,
  Nvidia,
  OpenAI,
  OpenCode,
  OpenRouter,
  Perplexity,
  SenseNova,
  Stepfun,
  Tencent,
  Upstage,
  XAI,
  XiaomiMiMo,
  Yi,
  Zhipu,
} from "@lobehub/icons"
import { describe, expect, it, vi } from "vitest"

import { getModelVendorPresentation } from "~/features/ModelList/modelVendorPresentation"
import type {
  ModelVendorCatalogEntry,
  ResolvedModelVendor,
} from "~/services/models/modelMetadata/types"
import type { KnownModelVendorId } from "~/services/models/modelVendor"

vi.mock("@lobehub/icons", () => {
  const createIcon = () => () => null

  return {
    Ai2: createIcon(),
    Alibaba: createIcon(),
    Anthropic: createIcon(),
    Arcee: createIcon(),
    Aws: createIcon(),
    BAAI: createIcon(),
    Baichuan: createIcon(),
    Baidu: createIcon(),
    ByteDance: createIcon(),
    Cohere: createIcon(),
    DeepCogito: createIcon(),
    DeepSeek: createIcon(),
    EssentialAI: createIcon(),
    Google: createIcon(),
    Groq: createIcon(),
    Inception: createIcon(),
    InternLM: createIcon(),
    Jina: createIcon(),
    KiloCode: createIcon(),
    Kolors: createIcon(),
    Liquid: createIcon(),
    LongCat: createIcon(),
    Meta: createIcon(),
    Microsoft: createIcon(),
    Minimax: createIcon(),
    Mistral: createIcon(),
    Moonshot: createIcon(),
    Nvidia: createIcon(),
    OpenAI: createIcon(),
    OpenCode: createIcon(),
    OpenRouter: createIcon(),
    Perplexity: createIcon(),
    Stepfun: createIcon(),
    SenseNova: createIcon(),
    Tencent: createIcon(),
    Upstage: createIcon(),
    XAI: createIcon(),
    XiaomiMiMo: createIcon(),
    Yi: createIcon(),
    Zhipu: createIcon(),
  }
})

vi.mock("~/services/models/utils/modelProviders", () => {
  throw new Error("Vendor presentation must not depend on modelProviders")
})

const resolvedKnownVendor = (knownId: string): ResolvedModelVendor => ({
  state: "resolved",
  kind: "known",
  key: `known:${knownId}`,
  knownId,
  label: knownId,
  source: "curated-rule",
})

describe("getModelVendorPresentation", () => {
  const knownVendorPresentations = [
    ["openai", OpenAI],
    ["anthropic", Anthropic],
    ["google", Google],
    ["meta", Meta],
    ["alibaba", Alibaba],
    ["xai", XAI],
    ["deepseek", DeepSeek],
    ["mistral", Mistral],
    ["moonshot", Moonshot],
    ["zhipu", Zhipu],
    ["minimax", Minimax],
    ["cohere", Cohere],
    ["tencent", Tencent],
    ["baidu", Baidu],
    ["baichuan", Baichuan],
    ["01-ai", Yi],
    ["bytedance", ByteDance],
    ["nvidia", Nvidia],
    ["xiaomi", XiaomiMiMo],
    ["meituan", LongCat],
    ["stepfun", Stepfun],
    ["perplexity", Perplexity],
    ["essential-ai", EssentialAI],
    ["ai2", Ai2],
    ["microsoft", Microsoft],
    ["arcee", Arcee],
    ["deep-cogito", DeepCogito],
    ["groq", Groq],
    ["openrouter", OpenRouter],
    ["kilo-code", KiloCode],
    ["jina", Jina],
    ["liquid", Liquid],
    ["inception", Inception],
    ["amazon", Aws],
    ["baai", BAAI],
    ["sensetime", SenseNova],
    ["upstage", Upstage],
    ["kuaishou", Kolors],
    ["shanghai-ai-lab", InternLM],
    ["opencode", OpenCode],
  ] as const satisfies ReadonlyArray<readonly [KnownModelVendorId, unknown]>

  it.each(knownVendorPresentations)(
    "uses the explicit local publisher presentation for %s",
    (knownId, Icon) => {
      const presentation = getModelVendorPresentation(
        resolvedKnownVendor(knownId),
      )

      expect(presentation.Icon).toBe(Icon)
      expect(presentation.iconClassName).toEqual(expect.any(String))
      expect(presentation.containerClassName).toEqual(expect.any(String))
    },
  )

  it.each([
    "netease-youdao",
    "nomic",
    "sarvam",
    "canopy-labs",
    "deep-reinforce",
    "inclusion-ai",
    "swiss-ai",
    "sdaia",
    "prism-ml",
    "speakleash",
    "eurollm",
  ] as const satisfies ReadonlyArray<KnownModelVendorId>)(
    "uses the generic local presentation for known vendor %s without a local icon",
    (knownId) => {
      const presentation = getModelVendorPresentation(
        resolvedKnownVendor(knownId),
      )
      const unknown = getModelVendorPresentation({ state: "unknown" })

      expect(presentation).toBe(unknown)
      expect(presentation.Icon).toBe(CpuChipIcon)
    },
  )

  it("returns the same generic local presentation for unsupported identities", () => {
    const unconfiguredKnown = getModelVendorPresentation(
      resolvedKnownVendor("future-vendor"),
    )
    const customCatalogEntry: ModelVendorCatalogEntry = {
      kind: "custom",
      key: "custom:example%20lab",
      label: "Example Lab",
    }
    const custom = getModelVendorPresentation(customCatalogEntry)
    const unknown = getModelVendorPresentation({ state: "unknown" })

    expect(unconfiguredKnown).toBe(custom)
    expect(custom).toBe(unknown)
    expect(unknown.Icon).toBe(CpuChipIcon)
  })

  it("returns the generic presentation for prototype-named known identities", () => {
    const prototypeNamedKnown = getModelVendorPresentation(
      resolvedKnownVendor("toString"),
    )
    const unknown = getModelVendorPresentation({ state: "unknown" })

    expect(prototypeNamedKnown).toBe(unknown)
  })

  it("works when the static Object.hasOwn API is unavailable", () => {
    const hasOwnDescriptor = Object.getOwnPropertyDescriptor(Object, "hasOwn")
    if (!hasOwnDescriptor) {
      throw new Error("Expected Object.hasOwn in the test runtime")
    }

    try {
      Object.defineProperty(Object, "hasOwn", {
        ...hasOwnDescriptor,
        value: undefined,
      })

      const configured = getModelVendorPresentation(
        resolvedKnownVendor("openai"),
      )
      const generic = getModelVendorPresentation(
        resolvedKnownVendor("future-vendor"),
      )

      expect(configured.Icon).toBe(OpenAI)
      expect(generic.Icon).toBe(CpuChipIcon)
    } finally {
      Object.defineProperty(Object, "hasOwn", hasOwnDescriptor)
    }
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
      expect(presentation.Icon).not.toEqual(expect.any(String))
      expect(JSON.stringify(presentation)).not.toMatch(/https?:\/\//)
    }
  })
})
