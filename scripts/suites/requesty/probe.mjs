/**
 * Live protocol probe for the Requesty management API.
 *
 * Requesty splits its surface in two: the console (`app.requesty.ai`, a Clerk
 * session with no API access) and the management API (`api-v2.requesty.ai`,
 * authenticated by a Bearer `rqsty-` manage key). The adapter only ever talks
 * to the management API, so the probe answers:
 *   - does the unauthenticated envelope still match the `{ error: { origin,
 *     message } }` shape the transport's status mapping relies on?
 *   - does the supplied manage key still drive the reads the account data,
 *     key inventory and model catalogue are projected from?
 *
 * Read-only by design. Mutations (create/limit/expiry/delete) return 200 with
 * an empty body, so their round trip is exercised through the extension UI in
 * `suites/requesty/ui.mjs` instead of being duplicated here.
 *
 * Never prints a credential value, including credential prefixes.
 */

import { ProxyAgent } from "undici"

import {
  REQUESTY_API_BASE_URL,
  REQUESTY_MANAGE_API_ORIGIN,
} from "../../../src/services/accountSiteDefinitions/identifiers.ts"

const REQUEST_TIMEOUT_MS = 15_000

/** String-decimal fields the normalizer coerces; keeps the probe honest about shape. */
function looksLikeStringDecimal(value) {
  return (
    typeof value === "string" && value !== "" && !Number.isNaN(Number(value))
  )
}

function buildDispatcher() {
  if (process.env.NO_PROXY === "*") return undefined
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  return proxy ? new ProxyAgent(proxy) : undefined
}

async function getJson({ url, key, timeoutMs }) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    dispatcher: buildDispatcher(),
    signal: AbortSignal.timeout(timeoutMs ?? REQUEST_TIMEOUT_MS),
  })
  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  return { status: response.status, ok: response.ok, payload, text }
}

/**
 * Run the Requesty management API probe.
 * @param options Probe options.
 * @param options.key Manage key (`rqsty-...`). Omit to run only the
 *   credential-free envelope checks.
 * @param options.timeoutMs Per-request timeout.
 */
export async function runRequestyProbe({
  key,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  console.log(
    `\n🔍 开始针对 Requesty 管理 API 进行协议级探测: ${REQUESTY_MANAGE_API_ORIGIN}`,
  )
  const findings = {
    ok: false,
    envelopeOk: false,
    orgOk: false,
    selfKeyOk: false,
    keysOk: false,
    modelsOk: false,
    skipped: !key,
  }

  // 1. Unauthenticated call: the API answers 401 with its own error envelope.
  //    This is the structural fingerprint the transport's error mapping relies
  //    on (a One API backend would answer a `{ message }` shape instead).
  const anonymous = await getJson({
    url: `${REQUESTY_MANAGE_API_ORIGIN}/v1/manage/org`,
    key: "",
    timeoutMs,
  })
  findings.envelopeOk =
    anonymous.status === 401 &&
    Boolean(anonymous.payload?.error?.message) &&
    typeof anonymous.payload?.error?.origin === "string"
  console.log("  [未授权信封指纹 GET /v1/manage/org]:", {
    status: anonymous.status,
    origin: anonymous.payload?.error?.origin ?? "(none)",
    message: anonymous.payload?.error?.message
      ? String(anonymous.payload.error.message).slice(0, 80)
      : "(none)",
    matchesErrorEnvelope: findings.envelopeOk,
  })

  if (!key) {
    console.log(
      "  ℹ️ 未提供管理密钥，跳过已授权读接口探测（信封指纹仍然有效）。",
    )
    findings.ok = findings.envelopeOk
    return findings
  }

  // 2. Org balance: string-decimal `balance` the account card projects.
  const org = await getJson({
    url: `${REQUESTY_MANAGE_API_ORIGIN}/v1/manage/org`,
    key,
    timeoutMs,
  })
  findings.orgOk =
    org.status === 200 && looksLikeStringDecimal(org.payload?.balance)
  console.log("  [组织与余额 GET /v1/manage/org]:", {
    status: org.status,
    name: typeof org.payload?.name === "string" ? org.payload.name : "(none)",
    balance: looksLikeStringDecimal(org.payload?.balance)
      ? `(string decimal, len=${org.payload.balance.length})`
      : `(unexpected: ${typeof org.payload?.balance})`,
  })

  // 3. Calling-key metadata is credential-scoped, separate from account identity.
  const selfKey = await getJson({
    url: `${REQUESTY_MANAGE_API_ORIGIN}/v1/manage/apikey/self`,
    key,
    timeoutMs,
  })
  findings.selfKeyOk =
    selfKey.status === 200 &&
    Boolean(selfKey.payload?.id) &&
    Boolean(selfKey.payload?.name)
  console.log("  [调用密钥身份 GET /v1/manage/apikey/self]:", {
    status: selfKey.status,
    hasKeyId: Boolean(selfKey.payload?.id),
    permissions: selfKey.payload?.permissions?.manage ?? "(none)",
  })

  // 4. Key inventory (readback source for the native editor).
  const keys = await getJson({
    url: `${REQUESTY_MANAGE_API_ORIGIN}/v1/manage/apikey`,
    key,
    timeoutMs,
  })
  const keyList = Array.isArray(keys.payload?.keys) ? keys.payload.keys : []
  findings.keysOk = keys.status === 200 && Array.isArray(keys.payload?.keys)
  console.log("  [密钥清单 GET /v1/manage/apikey]:", {
    status: keys.status,
    total: keyList.length,
  })

  // 5. Model catalogue via the inference gateway (pricing view source).
  const models = await getJson({
    url: `${REQUESTY_API_BASE_URL}/models`,
    key,
    timeoutMs,
  })
  const modelList = Array.isArray(models.payload?.data)
    ? models.payload.data
    : []
  findings.modelsOk = models.status === 200 && modelList.length > 0
  findings.modelCount = modelList.length
  console.log("  [模型目录 GET router/v1/models]:", {
    status: models.status,
    models: modelList.length,
    sample: modelList[0]?.id ?? "(none)",
  })

  findings.ok =
    findings.envelopeOk &&
    findings.orgOk &&
    findings.selfKeyOk &&
    findings.keysOk &&
    findings.modelsOk

  return findings
}

// Allow running this suite directly: node scripts/suites/requesty/probe.mjs [key]
if (process.argv[1] && process.argv[1].endsWith("probe.mjs")) {
  const key = process.argv[2] || process.env.REQUESTY_MANAGE_KEY || ""

  runRequestyProbe({ key })
    .then((result) => {
      console.log(
        "\n✅ 探测完成:",
        result.ok
          ? "管理 API 契约与适配器预期一致"
          : "存在与适配器预期不一致之处",
      )
      if (!result.ok) process.exitCode = 1
    })
    .catch((error) => {
      console.error("\n❌ 探测失败:", error.message)
      process.exit(1)
    })
}
