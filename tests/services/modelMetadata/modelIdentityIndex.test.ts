import { describe, expect, it } from "vitest"

import {
  createModelIdentityIndex,
  resolveModelIdentity,
  resolveRedirectModelIdentity,
} from "~/services/models/modelMetadata/modelIdentityIndex"
import type { ModelMetadata } from "~/services/models/modelMetadata/types"

function createMetadata(
  overrides: Partial<ModelMetadata> & Pick<ModelMetadata, "id">,
): ModelMetadata {
  return {
    name: overrides.id,
    provider_id: "example",
    ...overrides,
  }
}

describe("modelIdentityIndex", () => {
  it("distinguishes exact full ids from unambiguous bare-id and name aliases", () => {
    const providerQualified = createMetadata({
      id: "openai/gpt-4o",
      name: "GPT-4o Omni",
      provider_id: "openai",
    })
    const standalone = createMetadata({
      id: "standalone-model",
      name: "Standalone Model",
    })
    const index = createModelIdentityIndex([providerQualified, standalone])

    expect(resolveModelIdentity(index, "openai/gpt-4o")).toEqual({
      state: "resolved",
      match: "exact",
      metadata: providerQualified,
    })
    expect(resolveModelIdentity(index, "standalone-model")).toEqual({
      state: "resolved",
      match: "exact",
      metadata: standalone,
    })
    expect(resolveModelIdentity(index, "gpt-4o")).toEqual({
      state: "resolved",
      match: "normalized-alias",
      metadata: providerQualified,
    })
    expect(resolveModelIdentity(index, "GPT-4o Omni")).toEqual({
      state: "resolved",
      match: "normalized-alias",
      metadata: providerQualified,
    })
  })

  it("keeps metadata display names out of redirect aliases", () => {
    const namedMetadata = createMetadata({
      id: "example/friendly-model",
      name: "Friendly Name",
    })
    const nameIndex = createModelIdentityIndex([namedMetadata])

    expect(resolveModelIdentity(nameIndex, "Friendly Name")).toEqual({
      state: "resolved",
      match: "normalized-alias",
      metadata: namedMetadata,
    })
    expect(resolveRedirectModelIdentity(nameIndex, "Friendly Name")).toEqual({
      state: "unmatched",
    })

    const exactIdMetadata = createMetadata({
      id: "Friendly Name",
      name: "Different Display Name",
    })
    const exactIdIndex = createModelIdentityIndex([exactIdMetadata])

    expect(resolveRedirectModelIdentity(exactIdIndex, "Friendly Name")).toEqual(
      {
        state: "resolved",
        match: "exact",
        metadata: exactIdMetadata,
      },
    )
  })

  it("normalizes conservative separator, token-order, and date aliases", () => {
    const claude = createMetadata({
      id: "anthropic/claude-sonnet-4-5-20250929",
      name: "Claude 4.5 Sonnet",
      provider_id: "anthropic",
    })
    const separatorModel = createMetadata({
      id: "example/model_alpha-v1",
      name: "Separator Model",
    })
    const index = createModelIdentityIndex([claude, separatorModel])

    expect(resolveModelIdentity(index, "claude-4.5-sonnet")).toEqual({
      state: "resolved",
      match: "normalized-alias",
      metadata: claude,
    })
    expect(resolveModelIdentity(index, "claude-4.5-sonnet-20250929")).toEqual({
      state: "resolved",
      match: "normalized-alias",
      metadata: claude,
    })
    expect(resolveModelIdentity(index, "model-alpha_v1")).toEqual({
      state: "resolved",
      match: "normalized-alias",
      metadata: separatorModel,
    })
  })

  it("reports duplicate bare ids, names, and token aliases as ambiguous", () => {
    const metadata = [
      createMetadata({
        id: "provider-a/shared-model",
        name: "Duplicate Display Name",
        provider_id: "provider-a",
      }),
      createMetadata({
        id: "provider-b/shared-model",
        name: "Duplicate Display Name",
        provider_id: "provider-b",
      }),
      createMetadata({
        id: "provider-a/alpha-model-v1",
        name: "Alpha A",
        provider_id: "provider-a",
      }),
      createMetadata({
        id: "provider-b/alpha-v1-model",
        name: "Alpha B",
        provider_id: "provider-b",
      }),
    ]
    const index = createModelIdentityIndex(metadata)

    expect(resolveModelIdentity(index, "shared-model")).toEqual({
      state: "ambiguous",
    })
    expect(resolveModelIdentity(index, "Duplicate Display Name")).toEqual({
      state: "ambiguous",
    })
    expect(resolveModelIdentity(index, "alpha.model_v1")).toEqual({
      state: "ambiguous",
    })
    expect(resolveModelIdentity(index, "provider-a/shared-model")).toEqual({
      state: "resolved",
      match: "exact",
      metadata: metadata[0],
    })
  })

  it("retains family as metadata without turning family vocabulary into aliases", () => {
    const metadata = createMetadata({
      id: "publisher/model-a",
      name: "Model A",
      provider_id: "publisher",
      family: "o Hy north auto command v0",
    })
    const exactNamespace = createMetadata({
      id: "openrouter/model-b",
      name: "Model B",
      provider_id: "publisher",
    })
    const index = createModelIdentityIndex([metadata, exactNamespace])

    for (const familyToken of ["o", "Hy", "north", "auto", "command", "v0"]) {
      expect(resolveModelIdentity(index, familyToken)).toEqual({
        state: "unmatched",
      })
    }
    expect(resolveModelIdentity(index, "openrouter/model-a")).toEqual({
      state: "unmatched",
    })
    expect(resolveModelIdentity(index, "azure/model-a")).toEqual({
      state: "unmatched",
    })
    expect(resolveModelIdentity(index, "openrouter")).toEqual({
      state: "unmatched",
    })
    expect(resolveModelIdentity(index, "openrouter/model-b")).toEqual({
      state: "resolved",
      match: "exact",
      metadata: exactNamespace,
    })
    expect(resolveModelIdentity(index, "publisher/model-a")).toEqual({
      state: "resolved",
      match: "exact",
      metadata,
    })
  })

  it("keeps redirect lookup exact when date removal would change the raw id", () => {
    const dated = createMetadata({
      id: "anthropic/claude-sonnet-4-5-20250929",
      name: "Claude 4.5 Sonnet",
      provider_id: "anthropic",
    })
    const compact = createMetadata({
      id: "example/model-a20250101",
      name: "Compact Model",
    })
    const index = createModelIdentityIndex([dated, compact])

    expect(
      resolveRedirectModelIdentity(
        index,
        "anthropic/claude-sonnet-4-5-20250929",
      ),
    ).toEqual({ state: "resolved", match: "exact", metadata: dated })
    expect(
      resolveRedirectModelIdentity(index, "claude-4.5-sonnet-20250929"),
    ).toEqual({ state: "unmatched" })
    expect(resolveRedirectModelIdentity(index, "claude-4.5-sonnet")).toEqual({
      state: "resolved",
      match: "normalized-alias",
      metadata: dated,
    })
    expect(resolveRedirectModelIdentity(index, "model-a-20250101")).toEqual({
      state: "unmatched",
    })
    expect(resolveRedirectModelIdentity(index, "model-a20250101")).toEqual({
      state: "resolved",
      match: "normalized-alias",
      metadata: compact,
    })
  })

  it("does not expose mutable metadata stored by the index", () => {
    const metadata = createMetadata({
      id: "example/model-a",
      capabilities: { reasoning: true },
      modalities: { input: ["text"], output: ["text"] },
    })
    const index = createModelIdentityIndex([metadata])
    const first = resolveModelIdentity(index, "model-a")

    if (first.state !== "resolved") {
      throw new Error("Expected model-a to resolve")
    }
    first.metadata.capabilities!.reasoning = false
    first.metadata.modalities!.input.push("image")

    expect(resolveModelIdentity(index, "model-a")).toEqual({
      state: "resolved",
      match: "normalized-alias",
      metadata,
    })
  })
})
