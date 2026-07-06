import assert from "node:assert/strict"
import test from "node:test"

import {
  buildAwsInferenceProfileMappings,
  getAwsEntryChannelSettings,
  getAwsRuntimeBaseUrl,
  getPublicChannelConfig,
  inferAwsCredentialMode,
  normalizeAwsBatchCredentialInput,
  resolveChannelInput,
  validateBatchCredentialEntries,
} from "../src/channelConfig.js"

const provider = (id, channelType) => ({ id, channelType })

test("builds the two New API AWS credential formats with region", () => {
  assert.equal(getPublicChannelConfig("aws", 33).supportsModelFetch, false)
  assert.deepEqual(
    resolveChannelInput(provider("aws", 33), {
      credentialMode: "ak_sk",
      credentialParts: {
        accessKey: "AKIAEXAMPLE",
        secretKey: "secret",
        region: "us-east-1",
      },
    }),
    {
      apiKey: "AKIAEXAMPLE|secret|us-east-1",
      channelOther: "",
      channelSettings: { aws_key_type: "ak_sk" },
      models: getPublicChannelConfig("aws", 33).defaultModels,
      providerMappings: [],
      awsEntryRouting: false,
      config: getPublicChannelConfig("aws", 33),
    },
  )

  const apiKeyMode = resolveChannelInput(provider("aws", 33), {
    credentialMode: "api_key",
    credentialParts: { apiKey: "bedrock-key", region: "eu-west-1" },
  })
  assert.equal(apiKeyMode.apiKey, "bedrock-key|eu-west-1")
  assert.deepEqual(apiKeyMode.channelSettings, { aws_key_type: "api_key" })
})

test("maps an AWS public model to an inference profile ID or ARN", () => {
  const result = resolveChannelInput(provider("aws", 33), {
    credentialMode: "ak_sk",
    credentialParts: {
      accessKey: "AKIAEXAMPLE",
      secretKey: "secret",
      region: "us-east-1",
    },
    providerModels: "claude-sonnet-4-6",
    providerModelMappings:
      "claude-sonnet-4-6=arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/example",
  })

  assert.deepEqual(result.providerMappings, [
    {
      standardModel: "claude-sonnet-4-6",
      actualModel:
        "arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/example",
    },
  ])
})

test("maps AWS models to global inference profile IDs", () => {
  const result = resolveChannelInput(provider("aws", 33), {
    credentialMode: "ak_sk",
    credentialParts: {
      accessKey: "AKIAEXAMPLE",
      secretKey: "secret",
      region: "us-east-1",
    },
    providerModels: "claude-sonnet-4-5-20250929\nclaude-sonnet-4-6",
    providerFlags: { globalInference: true },
  })

  assert.deepEqual(result.providerMappings, [
    {
      standardModel: "claude-sonnet-4-5-20250929",
      actualModel: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
    },
    {
      standardModel: "claude-sonnet-4-6",
      actualModel: "global.anthropic.claude-sonnet-4-6",
    },
  ])
})

test("maps an AWS API key channel according to its source region", () => {
  const result = resolveChannelInput(provider("aws", 33), {
    credentialMode: "api_key",
    credentialParts: {
      apiKey: "bedrock-key",
      region: "eu-west-1",
    },
    providerModels: "claude-sonnet-4-6",
  })

  assert.deepEqual(result.providerMappings, [
    {
      standardModel: "claude-sonnet-4-6",
      actualModel: "eu.anthropic.claude-sonnet-4-6",
    },
  ])
})

test("uses global inference for non-US and non-EU reference regions", () => {
  assert.deepEqual(
    buildAwsInferenceProfileMappings(["claude-sonnet-4-6"], "ap-southeast-1"),
    [
      {
        standardModel: "claude-sonnet-4-6",
        actualModel: "global.anthropic.claude-sonnet-4-6",
      },
    ],
  )
})

test("builds the reference AWS runtime endpoint from the credential region", () => {
  assert.equal(
    getAwsRuntimeBaseUrl("bedrock-key|ca-central-1"),
    "https://bedrock-runtime.ca-central-1.amazonaws.com",
  )
})

test("infers each AWS batch credential mode independently", () => {
  assert.equal(inferAwsCredentialMode("bedrock-key|us-east-2"), "api_key")
  assert.equal(inferAwsCredentialMode("AKIAEXAMPLE|secret|eu-west-1"), "ak_sk")
  assert.equal(inferAwsCredentialMode("invalid"), "")
  assert.deepEqual(
    getAwsEntryChannelSettings("bedrock-key|us-east-2", {
      copied_setting: true,
      aws_key_type: "ak_sk",
    }),
    { copied_setting: true, aws_key_type: "api_key" },
  )
})

test("repairs wrapped and alternate-delimiter AWS batch credentials", () => {
  assert.equal(
    normalizeAwsBatchCredentialInput(
      "ABSKEXAMPLELONG\nWRAPPEDVALUE\n|us-east-2",
    ),
    "ABSKEXAMPLELONGWRAPPEDVALUE|us-east-2",
  )
  assert.equal(
    normalizeAwsBatchCredentialInput(
      "ABSKFIRST｜us-east-2\nAKIASECOND|secret|eu-west-1",
    ),
    "ABSKFIRST|us-east-2\nAKIASECOND|secret|eu-west-1",
  )
  assert.equal(
    normalizeAwsBatchCredentialInput("ABSKTHIRD\nus-west-2\n50"),
    "ABSKTHIRD|us-west-2 50",
  )
})

test("keeps an explicit AWS application profile ahead of global mode", () => {
  const result = resolveChannelInput(provider("aws", 33), {
    credentialMode: "ak_sk",
    credentialParts: {
      accessKey: "AKIAEXAMPLE",
      secretKey: "secret",
      region: "us-east-1",
    },
    providerModels: "claude-sonnet-4-6",
    providerModelMappings:
      "claude-sonnet-4-6=arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/example",
    providerFlags: { globalInference: true },
  })

  assert.equal(result.providerMappings.length, 1)
  assert.match(result.providerMappings[0].actualModel, /^arn:aws:bedrock:/)
})

test("allows structured providers to use precomposed batch credentials", () => {
  const result = resolveChannelInput(provider("aws", 33), {
    credentialMode: "ak_sk",
    useRawCredentials: true,
  })

  assert.equal(result.apiKey, "")
  assert.deepEqual(result.channelSettings, { aws_key_type: "ak_sk" })
})

test("normalizes Vertex service account and model-specific regions", () => {
  const result = resolveChannelInput(provider("vertex-ai", 41), {
    credentialMode: "json",
    credentialParts: {
      serviceAccountJson: JSON.stringify({
        project_id: "project",
        client_email: "service@example.com",
        private_key: "private-key",
      }),
    },
    providerExtra:
      '{"default":"us-central1","claude-sonnet-4-6":"europe-west1"}',
    providerModels: "gemini-2.5-pro\nclaude-sonnet-4-6",
  })

  assert.deepEqual(result.channelSettings, { vertex_key_type: "json" })
  assert.equal(
    result.channelOther,
    '{"default":"us-central1","claude-sonnet-4-6":"europe-west1"}',
  )
  assert.deepEqual(result.models, ["gemini-2.5-pro", "claude-sonnet-4-6"])
})

test("requires deployment names when New API cannot fetch models", () => {
  assert.throws(
    () =>
      resolveChannelInput(provider("azure", 3), {
        apiKey: "azure-key",
        providerExtra: "2025-04-01-preview",
      }),
    /不能自动拉取模型/,
  )
})

test("allows a selected channel template to supply cloud model configuration", () => {
  const result = resolveChannelInput(provider("azure", 3), {
    apiKey: "azure-key",
    configSource: "template",
  })

  assert.deepEqual(result.models, [])
  assert.equal(result.channelOther, "")
})

test("stores Azure API version and deployment names", () => {
  const result = resolveChannelInput(provider("azure", 3), {
    apiKey: "azure-key",
    providerExtra: "2025-04-01-preview",
    providerModels: "gpt-4o-production",
  })

  assert.equal(result.channelOther, "2025-04-01-preview")
  assert.deepEqual(result.models, ["gpt-4o-production"])
})

test("validates AWS batch credential format and inference region", () => {
  assert.doesNotThrow(() =>
    validateBatchCredentialEntries(provider("aws", 33), "ak_sk", [
      { apiKey: "AKIAEXAMPLE|secret|us-east-1" },
      { apiKey: "AKIAEXAMPLE2|secret|ap-southeast-2" },
    ]),
  )
  assert.throws(
    () =>
      validateBatchCredentialEntries(provider("aws", 33), "ak_sk", [
        { apiKey: "AKIAEXAMPLE|secret" },
      ]),
    /AK\|SK\|Region/,
  )
  assert.throws(
    () =>
      validateBatchCredentialEntries(provider("aws", 33), "api_key", [
        { apiKey: "bedrock-key|not-a-region" },
      ]),
    /推理地区/,
  )
  assert.doesNotThrow(() =>
    validateBatchCredentialEntries(provider("aws", 33), "auto", [
      { apiKey: "ABSKEXAMPLE|us-east-2" },
      { apiKey: "AKIAEXAMPLE|secret|eu-central-1" },
    ]),
  )
  assert.throws(
    () =>
      validateBatchCredentialEntries(provider("aws", 33), "auto", [
        { apiKey: "invalid" },
      ]),
    /APIKey\|Region 或 AK\|SK\|Region/,
  )
})

test("validates raw Vertex service-account batches", () => {
  assert.throws(
    () =>
      validateBatchCredentialEntries(provider("vertex-ai", 41), "json", [
        { apiKey: '{"project_id":"missing-fields"}' },
      ]),
    /Vertex 服务账号/,
  )
})

test("marks OpenRouter for automatic provider-prefix remapping", () => {
  const config = getPublicChannelConfig("openrouter", 20)
  assert.equal(config.supportsModelFetch, true)
  assert.equal(config.autoMapProviderPrefix, true)
})
