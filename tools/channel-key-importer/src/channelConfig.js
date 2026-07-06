const MODEL_FETCHABLE_TYPES = new Set([
  1, 4, 14, 17, 20, 23, 24, 25, 26, 27, 31, 34, 35, 40, 42, 43, 47, 48,
])

// New API maps these public names to Bedrock model IDs before invocation.
// https://github.com/QuantumNous/new-api/blob/2281c9e3d8780c7f8c459f21bd0fff352cee98c6/relay/channel/aws/constants.go
const AWS_MODEL_IDS = Object.freeze({
  "claude-3-sonnet-20240229": "anthropic.claude-3-sonnet-20240229-v1:0",
  "claude-3-opus-20240229": "anthropic.claude-3-opus-20240229-v1:0",
  "claude-3-haiku-20240307": "anthropic.claude-3-haiku-20240307-v1:0",
  "claude-3-5-sonnet-20240620": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "claude-3-5-sonnet-20241022": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "claude-3-5-haiku-20241022": "anthropic.claude-3-5-haiku-20241022-v1:0",
  "claude-3-7-sonnet-20250219": "anthropic.claude-3-7-sonnet-20250219-v1:0",
  "claude-sonnet-4-20250514": "anthropic.claude-sonnet-4-20250514-v1:0",
  "claude-opus-4-20250514": "anthropic.claude-opus-4-20250514-v1:0",
  "claude-opus-4-1-20250805": "anthropic.claude-opus-4-1-20250805-v1:0",
  "claude-sonnet-4-5-20250929": "anthropic.claude-sonnet-4-5-20250929-v1:0",
  "claude-sonnet-4-6": "anthropic.claude-sonnet-4-6",
  "claude-haiku-4-5-20251001": "anthropic.claude-haiku-4-5-20251001-v1:0",
  "claude-opus-4-5-20251101": "anthropic.claude-opus-4-5-20251101-v1:0",
  "claude-opus-4-6": "anthropic.claude-opus-4-6-v1",
  "claude-opus-4-7": "anthropic.claude-opus-4-7",
  "claude-opus-4-8": "anthropic.claude-opus-4-8",
  "nova-micro-v1:0": "amazon.nova-micro-v1:0",
  "nova-lite-v1:0": "amazon.nova-lite-v1:0",
  "nova-pro-v1:0": "amazon.nova-pro-v1:0",
  "nova-premier-v1:0": "amazon.nova-premier-v1:0",
  "nova-canvas-v1:0": "amazon.nova-canvas-v1:0",
  "nova-reel-v1:0": "amazon.nova-reel-v1:0",
  "nova-reel-v1:1": "amazon.nova-reel-v1:1",
  "nova-sonic-v1:0": "amazon.nova-sonic-v1:0",
})
const AWS_MODELS = Object.keys(AWS_MODEL_IDS)

const part = (id, label, options = {}) => ({ id, label, ...options })

const CHANNEL_CONFIGS = Object.freeze({
  aws: {
    // New API accepts AK|SK|Region or APIKey|Region and records the selected
    // format in settings.aws_key_type.
    // https://github.com/QuantumNous/new-api/blob/e514db20f762649014bce8950ef85b182f5f1b3f/relay/channel/aws/relay-aws.go
    credentialModes: [
      {
        id: "ak_sk",
        label: "Access Key / Secret Key",
        separator: "|",
        settings: { aws_key_type: "ak_sk" },
        batchHelp:
          "批量时每条必须是 AK|SK|Region，可在末尾继续写额度，例如 AK|SK|us-east-1 50。",
        parts: [
          part("accessKey", "Access Key ID"),
          part("secretKey", "Secret Access Key", { secret: true }),
          part("region", "推理地区", { placeholder: "例如：us-east-1" }),
        ],
      },
      {
        id: "api_key",
        label: "Bedrock API Key",
        separator: "|",
        settings: { aws_key_type: "api_key" },
        batchHelp:
          "批量时每条必须是 BedrockAPIKey|Region，可在末尾继续写额度。",
        parts: [
          part("apiKey", "Bedrock API Key", { secret: true }),
          part("region", "推理地区", { placeholder: "例如：us-east-1" }),
        ],
      },
    ],
    defaultModels: AWS_MODELS,
    modelHelp:
      "New API 不支持自动拉取 Bedrock 模型。这里使用 New API 当前支持的本地模型名，可按账号已开通模型删改。",
    // New API derives supported system cross-region profile IDs from the
    // source region. AWS also accepts a profile ID/ARN directly as modelId,
    // so application profiles are represented as model mappings here.
    // https://github.com/QuantumNous/new-api/blob/e514db20f762649014bce8950ef85b182f5f1b3f/relay/channel/aws/relay-aws.go
    // https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-use.html
    modelMappings: {
      label: "推理配置文件（可选）",
      placeholder:
        "claude-sonnet-4-6=arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/your-profile",
      help: "每行填写“对外模型名=Inference Profile ID 或 ARN”。留空时，New API 会按模型和源地区自动选择已支持的跨区推理配置。",
    },
    flags: [
      {
        id: "globalInference",
        label: "Global 跨区域推理",
        help: "为未手工指定 Profile 的模型使用 global. 推理配置 ID。请求可能路由到全球商业区域；需确认模型、源地区及 IAM/SCP 均支持。",
      },
    ],
  },
  "vertex-ai": {
    // Vertex key mode uses settings.vertex_key_type; deployment regions are
    // stored in channel.other with a required default entry.
    // https://github.com/QuantumNous/new-api/blob/e514db20f762649014bce8950ef85b182f5f1b3f/controller/channel.go
    credentialModes: [
      {
        id: "json",
        label: "服务账号 JSON",
        settings: { vertex_key_type: "json" },
        parts: [
          part("serviceAccountJson", "服务账号 JSON", {
            multiline: true,
            fileAccept: ".json,application/json",
          }),
        ],
      },
      {
        id: "api_key",
        label: "Vertex API Key",
        settings: { vertex_key_type: "api_key" },
        parts: [part("apiKey", "Vertex API Key", { secret: true })],
      },
    ],
    extra: {
      id: "region",
      label: "部署地区",
      multiline: true,
      placeholder:
        '{"default":"us-central1","claude-sonnet-4-6":"europe-west1"}',
      help: "可填写单个地区，或用 JSON 为不同模型指定地区；必须包含 default。",
      format: "vertex-region",
    },
    modelHelp:
      "New API 不支持自动拉取 Vertex 模型；请填写 Gemini、Claude 或开放模型的 New API 本地模型名。",
  },
  azure: {
    // New API stores Azure's default api-version in channel.other and builds
    // /openai/deployments/{deployment}/... from each configured model name.
    // https://github.com/QuantumNous/new-api/blob/2281c9e3d8780c7f8c459f21bd0fff352cee98c6/relay/channel/openai/adaptor.go
    extra: {
      id: "apiVersion",
      label: "Azure API Version",
      placeholder: "例如：2025-04-01-preview",
      defaultValue: "2025-04-01-preview",
      help: "写入 New API 的渠道 API Version；模型列表必须填写 Azure 部署名称。",
      format: "raw",
    },
    modelHelp:
      "每行填写一个 Azure 部署名称，不是 gpt-4o 等基础模型名称；New API 会拼接部署路径。",
  },
  baidu: {
    credentialModes: [
      {
        id: "default",
        label: "API Key / Secret Key",
        separator: "|",
        parts: [
          part("apiKey", "API Key"),
          part("secretKey", "Secret Key", { secret: true }),
        ],
      },
    ],
  },
  xunfei: {
    credentialModes: [
      {
        id: "default",
        label: "讯飞组合凭证",
        separator: "|",
        parts: [
          part("appId", "APP ID"),
          part("apiSecret", "API Secret", { secret: true }),
          part("apiKey", "API Key", { secret: true }),
        ],
      },
    ],
    extra: {
      id: "version",
      label: "模型版本",
      placeholder: "例如：v2.1",
      format: "raw",
    },
  },
  "aiproxy-library": {
    extra: {
      id: "knowledgeBaseId",
      label: "知识库 ID",
      placeholder: "例如：123456",
      format: "raw",
    },
  },
  tencent: {
    credentialModes: [
      {
        id: "default",
        label: "腾讯云组合凭证",
        separator: "|",
        parts: [
          part("appId", "App ID"),
          part("secretId", "Secret ID"),
          part("secretKey", "Secret Key", { secret: true }),
        ],
      },
    ],
  },
  cloudflare: {
    extra: {
      id: "accountId",
      label: "Cloudflare Account ID",
      format: "raw",
    },
  },
  kling: {
    credentialModes: [
      {
        id: "ak_sk",
        label: "Access Key / Secret Key",
        separator: "|",
        parts: [
          part("accessKey", "Access Key"),
          part("secretKey", "Secret Key", { secret: true }),
        ],
      },
      {
        id: "api_key",
        label: "上游 New API Key",
        parts: [part("apiKey", "API Key", { secret: true })],
      },
    ],
  },
  jimeng: {
    credentialModes: [
      {
        id: "default",
        label: "Access Key ID / Secret Access Key",
        separator: "|",
        parts: [
          part("accessKey", "Access Key ID"),
          part("secretKey", "Secret Access Key", { secret: true }),
        ],
      },
    ],
  },
  openrouter: {
    // OpenRouter /v1/models returns provider/model IDs. New API model_mapping
    // maps the public model name to that complete upstream ID.
    // https://github.com/QuantumNous/new-api/blob/main/relay/helper/model_mapped.go
    autoMapProviderPrefix: true,
  },
})

const normalizeModels = (value) => [
  ...new Set(
    String(value || "")
      .split(/[\n,]/)
      .map((model) => model.trim())
      .filter(Boolean),
  ),
]

export function buildAwsInferenceProfileMappings(
  models,
  region,
  forceGlobal = false,
) {
  const normalizedRegion = String(region || "").trim()
  const prefix = forceGlobal
    ? "global"
    : normalizedRegion.startsWith("us-")
      ? "us"
      : normalizedRegion.startsWith("eu-")
        ? "eu"
        : "global"
  return normalizeModels(models).map((model) => ({
    standardModel: model,
    actualModel: `${prefix}.${AWS_MODEL_IDS[model] || model}`,
  }))
}

export function getAwsRuntimeBaseUrl(apiKey) {
  const region = String(apiKey || "")
    .split("|")
    .at(-1)
    ?.trim()
  return region ? `https://bedrock-runtime.${region}.amazonaws.com` : ""
}

export function getPublicChannelConfig(providerId, channelType) {
  const config = CHANNEL_CONFIGS[providerId] || {}
  return {
    ...config,
    supportsModelFetch: MODEL_FETCHABLE_TYPES.has(channelType),
  }
}

export function resolveChannelInput(provider, body) {
  const config = getPublicChannelConfig(provider.id, provider.channelType)
  const useTemplate = body.configSource === "template"
  let apiKey = String(body.apiKey || "").trim()
  let channelSettings = {}

  if (config.credentialModes?.length) {
    const mode =
      config.credentialModes.find(
        (item) => item.id === String(body.credentialMode || ""),
      ) || config.credentialModes[0]
    channelSettings = mode.settings || {}
    if (body.useRawCredentials === true) {
      apiKey = ""
    } else {
      const values = mode.parts.map((field) => {
        const value = String(body.credentialParts?.[field.id] || "").trim()
        if (!value) throw new Error(`请填写${field.label}`)
        return value
      })
      apiKey = mode.separator ? values.join(mode.separator) : values[0]
    }
    if (
      body.useRawCredentials !== true &&
      provider.id === "vertex-ai" &&
      mode.id === "json"
    ) {
      try {
        const parsed = JSON.parse(apiKey)
        if (
          !parsed?.project_id ||
          !parsed?.client_email ||
          !parsed?.private_key
        ) {
          throw new Error("missing fields")
        }
        apiKey = JSON.stringify(parsed)
      } catch {
        throw new Error("Vertex AI 服务账号文件缺少必要字段或不是有效 JSON")
      }
    }
  }

  let channelOther = ""
  if (config.extra && !useTemplate) {
    const raw = String(body.providerExtra || "").trim()
    if (!raw) throw new Error(`请填写${config.extra.label}`)
    if (config.extra.format === "vertex-region") {
      try {
        const parsed = raw.startsWith("{") ? JSON.parse(raw) : { default: raw }
        if (!parsed.default || typeof parsed.default !== "string") {
          throw new Error("missing default")
        }
        channelOther = JSON.stringify(parsed)
      } catch {
        throw new Error("部署地区必须是包含 default 的 JSON，或单个地区名称")
      }
    } else {
      channelOther = raw
    }
  }

  const suppliedModels = normalizeModels(body.providerModels)
  const models = config.supportsModelFetch
    ? suppliedModels
    : suppliedModels.length
      ? suppliedModels
      : config.defaultModels || []
  if (
    !useTemplate &&
    body.configSource !== "fetch" &&
    body.configSource !== "new-api" &&
    !config.supportsModelFetch &&
    models.length === 0
  ) {
    throw new Error("该渠道不能自动拉取模型，请先填写模型或部署名称")
  }

  const providerMappings = []
  if (config.modelMappings && !useTemplate) {
    const seen = new Set()
    for (const line of String(body.providerModelMappings || "").split("\n")) {
      const value = line.trim()
      if (!value) continue
      const separator = value.indexOf("=")
      const standardModel = value.slice(0, separator).trim()
      const actualModel = value.slice(separator + 1).trim()
      if (separator < 1 || !standardModel || !actualModel) {
        throw new Error("推理配置文件必须按“模型名=Profile ID 或 ARN”填写")
      }
      if (!models.includes(standardModel)) {
        throw new Error(`推理配置对应的模型不在模型列表中：${standardModel}`)
      }
      if (seen.has(standardModel)) {
        throw new Error(`同一模型填写了多个推理配置：${standardModel}`)
      }
      seen.add(standardModel)
      providerMappings.push({ standardModel, actualModel })
    }
  }

  const forceGlobal = body.providerFlags?.globalInference === true
  const awsRegion = String(body.credentialParts?.region || "").trim()
  const awsApiKeyMode = body.credentialMode === "api_key"
  if (
    provider.id === "aws" &&
    (forceGlobal ||
      (awsApiKeyMode && body.useRawCredentials !== true && awsRegion))
  ) {
    const manuallyMapped = new Set(
      providerMappings.map((mapping) => mapping.standardModel),
    )
    for (const mapping of buildAwsInferenceProfileMappings(
      models,
      awsRegion,
      forceGlobal,
    )) {
      if (manuallyMapped.has(mapping.standardModel)) continue
      providerMappings.push(mapping)
    }
  }

  return {
    apiKey,
    channelOther,
    channelSettings,
    models,
    providerMappings,
    awsEntryRouting:
      provider.id === "aws" &&
      awsApiKeyMode &&
      body.useRawCredentials === true &&
      !forceGlobal,
    config,
  }
}

export function validateBatchCredentialEntries(
  provider,
  credentialMode,
  entries,
) {
  if (provider.id === "aws") {
    const mode = credentialMode === "api_key" ? "api_key" : "ak_sk"
    const expectedParts = mode === "api_key" ? 2 : 3
    for (const [index, entry] of entries.entries()) {
      const parts = entry.apiKey.split("|").map((value) => value.trim())
      if (parts.length !== expectedParts || parts.some((value) => !value)) {
        const format = mode === "api_key" ? "APIKey|Region" : "AK|SK|Region"
        throw new Error(`第 ${index + 1} 条 AWS 凭证必须是 ${format}`)
      }
      const region = parts.at(-1)
      if (!/^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/.test(region)) {
        throw new Error(`第 ${index + 1} 条 AWS 推理地区格式不正确`)
      }
    }
  }

  if (provider.id === "vertex-ai" && credentialMode !== "api_key") {
    for (const [index, entry] of entries.entries()) {
      try {
        const parsed = JSON.parse(entry.apiKey)
        if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
          throw new Error("missing fields")
        }
      } catch {
        throw new Error(`第 ${index + 1} 条 Vertex 服务账号不是有效 JSON`)
      }
    }
  }
}
