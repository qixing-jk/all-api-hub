import assert from "node:assert/strict"
import test from "node:test"

import {
  buildModelPlan,
  buildProviderPrefixMappings,
} from "../src/modelPlan.js"

test("adds manual models and standard-to-actual mappings", () => {
  const result = buildModelPlan({
    fetchedModels: ["openai/gpt-4o", "claude-sonnet-4"],
    manualModels: ["gpt-5-new", "gpt-5-new"],
    mappings: [
      { standardModel: "gpt-4o", actualModel: "openai/gpt-4o" },
      { standardModel: "claude-sonnet-4", actualModel: "claude-sonnet-4" },
    ],
  })

  assert.deepEqual(result.models, [
    "openai/gpt-4o",
    "claude-sonnet-4",
    "gpt-5-new",
    "gpt-4o",
  ])
  assert.deepEqual(result.modelMapping, {
    "gpt-4o": "openai/gpt-4o",
  })
})

test("rejects mappings to models the channel does not expose", () => {
  assert.throws(
    () =>
      buildModelPlan({
        fetchedModels: ["model-a"],
        manualModels: [],
        mappings: [{ standardModel: "official-a", actualModel: "missing" }],
      }),
    /映射目标不在/,
  )
})

test("maps unique OpenRouter provider models to public model names", () => {
  const mappings = buildProviderPrefixMappings([
    "openai/gpt-4o",
    "anthropic/claude-sonnet-4",
    "provider-a/shared-model",
    "provider-b/shared-model",
  ])

  assert.deepEqual(mappings, [
    { standardModel: "gpt-4o", actualModel: "openai/gpt-4o" },
    {
      standardModel: "claude-sonnet-4",
      actualModel: "anthropic/claude-sonnet-4",
    },
  ])

  assert.deepEqual(
    buildModelPlan({
      fetchedModels: [
        "openai/gpt-4o",
        "anthropic/claude-sonnet-4",
        "provider-a/shared-model",
        "provider-b/shared-model",
      ],
      manualModels: [],
      mappings,
      hideMappedActualModels: true,
    }),
    {
      models: [
        "provider-a/shared-model",
        "provider-b/shared-model",
        "gpt-4o",
        "claude-sonnet-4",
      ],
      modelMapping: {
        "gpt-4o": "openai/gpt-4o",
        "claude-sonnet-4": "anthropic/claude-sonnet-4",
      },
    },
  )
})

test("rejects aliases that shadow a different actual model", () => {
  assert.throws(
    () =>
      buildModelPlan({
        fetchedModels: ["model-a", "model-b"],
        manualModels: [],
        mappings: [{ standardModel: "model-a", actualModel: "model-b" }],
      }),
    /冲突/,
  )
})

test("keeps an existing channel template mapping that already exposes its alias", () => {
  assert.deepEqual(
    buildModelPlan({
      fetchedModels: ["gemma-4-26b-a4b-it", "google/gemma-4-26b-a4b-it"],
      manualModels: [],
      mappings: [
        {
          standardModel: "gemma-4-26b-a4b-it",
          actualModel: "google/gemma-4-26b-a4b-it",
        },
      ],
      hideMappedActualModels: true,
      allowMappedStandardModels: true,
    }),
    {
      models: ["gemma-4-26b-a4b-it"],
      modelMapping: {
        "gemma-4-26b-a4b-it": "google/gemma-4-26b-a4b-it",
      },
    },
  )
})
