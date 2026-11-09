/**
 * Live protocol probe for the AI/ML API saved-key routes.
 *
 * AI/ML API is a provider-owned gateway, not a One API / New API deployment:
 * its error body is an RFC7807-style problem document and its routes live on a
 * separate API origin from the Nuxt console. The probe answers the questions
 * the adapter depends on:
 *
 *   - is the public model catalogue still the documented `{object:"list"}` shape
 *     the provider model catalog projects from?
 *   - does the management key still own `/v1/keys` and get rejected by the
 *     billing routes, which the account split depends on?
 *   - does the regular API key still read balance/usage and stay locked out of
 *     key management?
 *
 * Read-only by design; the create/rename/delete round trip is exercised through
 * the extension UI (suites/aimlapi/ui.mjs) so the probe cannot drift from the
 * adapter's wire format. Never prints a credential value, including prefixes.
 */

const AIMLAPI_API_ORIGIN = "https://api.aimlapi.com"
const REQUEST_TIMEOUT_MS = 15_000

const senderLabel = (secret) =>
  typeof secret === "string" && secret
    ? `present (len=${secret.length})`
    : "absent"

async function getJson({ path, key, timeoutMs }) {
  const response = await fetch(`${AIMLAPI_API_ORIGIN}${path}`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
    signal: AbortSignal.timeout(timeoutMs ?? REQUEST_TIMEOUT_MS),
  })
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  return { status: response.status, ok: response.ok, payload }
}

const readMessage = (payload) => {
  if (
    payload &&
    typeof payload === "object" &&
    typeof payload.message === "string"
  ) {
    return payload.message
  }
  return ""
}

/**
 * Run the AI/ML API probe.
 * @param options Probe options.
 * @param options.managementKey Management key that owns `/v1/keys`. Without it
 *   only the anonymous catalogue check runs.
 * @param options.apiKey Regular API key that reads balance and usage. Without
 *   it the billing scope is skipped.
 * @param options.timeoutMs Per-request timeout.
 */
export async function runAimlapiProbe({
  managementKey = "",
  apiKey = "",
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  const results = []
  const record = (name, ok, detail) => {
    results.push({ name, ok, detail })
    console.log(`  ${ok ? "✅" : "❌"} ${name}: ${detail}`)
  }

  console.log(
    `\n🔌 AI/ML API 协议探测 (管理密钥: ${senderLabel(managementKey)}; 普通 API key: ${senderLabel(apiKey)})`,
  )

  // 1. Public catalogue. The provider model catalog maps this route; it is the
  //    only fact that must hold for the model list to render at all.
  const models = await getJson({ path: "/v1/models", key: "", timeoutMs })
  const modelsOk =
    models.ok &&
    models.payload?.object === "list" &&
    Array.isArray(models.payload?.data) &&
    models.payload.data.length > 0 &&
    typeof models.payload.data[0]?.id === "string"
  record(
    "公开模型目录",
    Boolean(modelsOk),
    modelsOk
      ? `object=list, ${models.payload.data.length} models`
      : `status=${models.status}, unexpected shape`,
  )

  // 2. Management key scope: owns key management, is rejected by billing.
  if (managementKey) {
    const keys = await getJson({
      path: "/v1/keys",
      key: managementKey,
      timeoutMs,
    })
    const keysOk =
      keys.ok &&
      Array.isArray(keys.payload?.data) &&
      keys.payload.data.length > 0
    record(
      "管理密钥读取密钥清单",
      Boolean(keysOk),
      keysOk
        ? `${keys.payload.data.length} keys, first prefix length ${String(keys.payload.data[0]?.prefix ?? "").length}`
        : `status=${keys.status}`,
    )

    const billing = await getJson({
      path: "/v2/billing",
      key: managementKey,
      timeoutMs,
    })
    record(
      "管理密钥被余额路由拒绝 (403)",
      billing.status === 403,
      `status=${billing.status}${billing.ok ? " (unexpected 200)" : ` (${readMessage(billing.payload).slice(0, 60)})`}`,
    )
  } else {
    console.log("  ℹ️ 未提供管理密钥，跳过密钥管理范围探测。")
  }

  // 3. Regular API key scope: reads money, is locked out of key management.
  if (apiKey) {
    const balance = await getJson({
      path: "/v2/billing",
      key: apiKey,
      timeoutMs,
    })
    const balanceOk =
      balance.ok &&
      typeof balance.payload?.current_balance === "number" &&
      balance.payload?.currency === "USD"
    record(
      "普通密钥读取余额",
      Boolean(balanceOk),
      balanceOk
        ? `current_balance=${balance.payload.current_balance} USD`
        : `status=${balance.status}`,
    )

    const usage = await getJson({
      path: "/v2/usage?period=1d",
      key: apiKey,
      timeoutMs,
    })
    const usageOk =
      usage.ok &&
      typeof usage.payload?.spend === "number" &&
      typeof usage.payload?.requests === "number"
    record(
      "普通密钥读取用量",
      Boolean(usageOk),
      usageOk
        ? `spend=${usage.payload.spend}, requests=${usage.payload.requests}`
        : `status=${usage.status}`,
    )

    // Repeat only GET: historical first-call permission anomalies must never
    // cause an audit to create keys, even when cleanup credentials are missing.
    await getJson({ path: "/v1/keys", key: apiKey, timeoutMs })
    const steadyRead = await getJson({
      path: "/v1/keys",
      key: apiKey,
      timeoutMs,
    })
    record(
      "普通密钥在密钥清单上被拒绝 (稳态 403)",
      steadyRead.status === 403,
      `status=${steadyRead.status}`,
    )
  } else {
    console.log("  ℹ️ 未提供普通 API key，跳过余额范围探测。")
  }

  const failed = results.filter((result) => !result.ok)
  return { ok: failed.length === 0, checked: results.length, failed }
}
