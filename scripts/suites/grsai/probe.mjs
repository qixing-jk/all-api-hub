/**
 * Live protocol probe for the Grsai console API.
 *
 * Grsai is a provider-owned REST console, not a One API / New API deployment,
 * so the probe answers two questions the adapter depends on:
 *   - is this host really the Grsai console (its own envelope), rather than a
 *     New API backend that the account-site detector must reject?
 *   - does the saved session token still drive the read endpoints the account
 *     data, key inventory and model catalogue are projected from?
 *
 * Read-only by design. The mutating endpoints are signed with `xtx`, built from
 * per-call material that only the extension's own implementation reproduces
 * (`src/services/apiService/grsai/signature.ts`); duplicating that algorithm here
 * would let the two drift apart silently, so the create/rename/delete round trip
 * is exercised through the extension UI instead (`suites/grsai/ui.mjs`).
 *
 * Never prints a credential value, including credential prefixes.
 */

const GRSAI_CONSOLE_API_ORIGIN = "https://eb.grsaiapi.com"
/** The console frontend host, used for the "not a New API backend" check. */
const GRSAI_CONSOLE_ORIGIN = "https://grsai.com"

const REQUEST_TIMEOUT_MS = 10_000

/** Envelope codes the deployment is documented to answer with. */
const SUCCESS_CODE = 0
const UNAUTHENTICATED_CODE = -10000

const senderLabel = (secret) =>
  typeof secret === "string" && secret
    ? `present (len=${secret.length})`
    : "absent"

async function postConsole({ path, token, body = {}, timeoutMs }) {
  const response = await fetch(`${GRSAI_CONSOLE_API_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs ?? REQUEST_TIMEOUT_MS),
  })

  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  return { status: response.status, ok: response.ok, payload }
}

/**
 * Run the Grsai console probe.
 * @param options Probe options.
 * @param options.token Saved console session token (JWT). Omit to run only the
 *   credential-free structural checks.
 * @param options.timeoutMs Per-request timeout.
 * @param options.siteUrl Console origin to check for a conflicting New API backend.
 */
export async function runGrsaiProbe({
  token,
  siteUrl = GRSAI_CONSOLE_ORIGIN,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  console.log(
    `\n🔍 开始针对 Grsai 控制台 API 进行协议级探测: ${GRSAI_CONSOLE_API_ORIGIN}`,
  )
  const findings = {
    ok: false,
    consoleEnvelopeOk: false,
    notNewApi: false,
    sessionOk: false,
    accountOk: false,
    keysOk: false,
    modelsOk: false,
    skipped: !token,
  }

  // 1. Unauthenticated call: the console answers HTTP 200 with its own
  //    `{ code, data, msg }` envelope and code -10000. A New API backend would
  //    answer a JSON `{ success, message }` shape (or 404) here instead, so this
  //    is the structural fingerprint the detector relies on.
  const anonymous = await postConsole({
    path: "/client/grsai/getUserInfo",
    token: "",
    timeoutMs,
  })
  const anonymousCode = anonymous.payload?.code
  findings.consoleEnvelopeOk =
    anonymous.status === 200 && anonymousCode === UNAUTHENTICATED_CODE
  console.log("  [未授权信封指纹 POST /client/grsai/getUserInfo]:", {
    status: anonymous.status,
    code: anonymousCode ?? "(none)",
    matchesConsoleEnvelope: findings.consoleEnvelopeOk,
  })

  // 2. The same origin must not present a New API `/api/status` payload. A
  //    deployment that did would be misdetected by the New API family.
  let newApiShaped = false
  let statusChecked = false
  try {
    const status = await fetch(`${siteUrl}/api/status`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await status.text()
    statusChecked = status.status < 500
    try {
      const parsed = JSON.parse(text)
      // New API reports a `data.version`/`data.system_name` payload here.
      newApiShaped = Boolean(parsed?.data?.version || parsed?.data?.system_name)
    } catch {
      newApiShaped = false
    }
  } catch (error) {
    console.warn(`  ⚠️ /api/status 探测异常: ${error.message}`)
  }
  findings.notNewApi = statusChecked && !newApiShaped
  console.log("  [New API 后端排除检查 GET /api/status]:", {
    newApiShaped,
    rejected: findings.notNewApi,
  })

  if (!token) {
    console.log(
      "  ℹ️ 未提供控制台会话 token，跳过已登录读接口探测（结构指纹仍然有效）。",
    )
    findings.ok = findings.consoleEnvelopeOk && findings.notNewApi
    return findings
  }

  // 3. `getConfig` exchanges the stored token for the session token the reads
  //    authenticate with. It also returns the per-call signing material.
  const config = await postConsole({
    path: "/client/common/getConfig",
    token: "",
    body: { token, referrer: "" },
    timeoutMs,
  })
  const configData = config.payload?.data
  const sessionToken =
    typeof configData?.token === "string" ? configData.token : ""
  findings.sessionOk =
    config.payload?.code === SUCCESS_CODE &&
    configData?.isAuth === true &&
    Boolean(sessionToken)
  console.log("  [会话换取 POST /client/common/getConfig]:", {
    code: config.payload?.code ?? "(none)",
    issuedToken: senderLabel(sessionToken),
    isAuth: configData?.isAuth ?? null,
    hasSigningMaterial: Boolean(
      configData?.kis &&
        configData?.ra1 &&
        configData?.ra2 &&
        configData?.random,
    ),
  })
  if (!findings.sessionOk) {
    console.warn(
      "  ⚠️ 未能换取会话 token：保存的凭据已失效，账号需要重新从浏览器会话同步。",
    )
    // A supplied token that cannot be exchanged is a failed run even though the
    // origin itself is confirmed to be the console: the account-side contract
    // (reads, keys, models) could not be verified.
    findings.ok = false
    return findings
  }

  // 4. Account identity and credits.
  const userInfo = await postConsole({
    path: "/client/grsai/getUserInfo",
    token: sessionToken,
    timeoutMs,
  })
  const account = userInfo.payload?.data
  findings.accountOk =
    userInfo.payload?.code === SUCCESS_CODE &&
    Number.isFinite(Number(account?.credits))
  console.log("  [账号身份 POST /client/grsai/getUserInfo]:", {
    code: userInfo.payload?.code ?? "(none)",
    hasAccountId: Boolean(account?.id),
    hasEmail: Boolean(account?.mail),
    credits: account?.credits ?? "(none)",
  })

  // 5. Consumption figures the account card projects.
  const dashboard = await postConsole({
    path: "/client/grsai/getDashboardData",
    token: sessionToken,
    timeoutMs,
  })
  const dashboardData = dashboard.payload?.data
  console.log("  [余额与消耗 POST /client/grsai/getDashboardData]:", {
    code: dashboard.payload?.code ?? "(none)",
    credits: dashboardData?.credits ?? "(none)",
    todayConsumed: dashboardData?.todayConsumed ?? "(none)",
    totalConsumed: dashboardData?.totalConsumed ?? "(none)",
  })

  // 6. Key inventory. The console re-reveals `sk-` secrets on every read, which
  //    is what makes the inventory exportable; report only presence and shape.
  const keyList = await postConsole({
    path: "/client/grsai/getAPIKeyList",
    token: sessionToken,
    body: { page: 1, size: 100 },
    timeoutMs,
  })
  const keys = Array.isArray(keyList.payload?.data?.list)
    ? keyList.payload.data.list
    : []
  const plaintextKeys = keys.filter(
    (key) => typeof key?.key === "string" && key.key.startsWith("sk-"),
  )
  findings.keysOk = keyList.payload?.code === SUCCESS_CODE
  findings.plaintextKeyCount = plaintextKeys.length
  console.log("  [密钥清单 POST /client/grsai/getAPIKeyList]:", {
    code: keyList.payload?.code ?? "(none)",
    total: keyList.payload?.data?.total ?? keys.length,
    plaintextSecrets: plaintextKeys.length,
    sample: senderLabel(plaintextKeys[0]?.key),
  })

  // 7. Model catalogue the pricing view projects. The deployment answers
  //    `GET /v1/models` with 404, so this console route is the only source.
  const models = await postConsole({
    path: "/client/serverGrsai/getModelList",
    token: sessionToken,
    timeoutMs,
  })
  const modelList = Array.isArray(models.payload?.data)
    ? models.payload.data
    : Array.isArray(models.payload?.data?.list)
      ? models.payload.data.list
      : []
  findings.modelsOk =
    models.payload?.code === SUCCESS_CODE && modelList.length > 0
  findings.modelCount = modelList.length
  console.log("  [模型目录 POST /client/serverGrsai/getModelList]:", {
    code: models.payload?.code ?? "(none)",
    models: modelList.length,
    sample: modelList[0]?.model ?? "(none)",
  })

  findings.ok =
    findings.consoleEnvelopeOk &&
    findings.notNewApi &&
    findings.sessionOk &&
    findings.accountOk &&
    findings.keysOk &&
    findings.modelsOk

  return findings
}

// Allow running this suite directly: node scripts/suites/grsai/probe.mjs [token]
if (process.argv[1] && process.argv[1].endsWith("probe.mjs")) {
  const token = process.argv[2] || process.env.GRSAI_SESSION_TOKEN || ""

  runGrsaiProbe({ token })
    .then((result) => {
      console.log(
        "\n✅ 探测完成:",
        result.ok ? "控制台契约与适配器预期一致" : "存在与适配器预期不一致之处",
      )
      if (!result.ok) process.exitCode = 1
    })
    .catch((error) => {
      console.error("\n❌ 探测失败:", error.message)
      process.exit(1)
    })
}
