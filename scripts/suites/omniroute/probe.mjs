#!/usr/bin/env node
import { loadLocalEnv } from "../../utils/local-env.mjs"

/**
 * Live protocol probe for an OmniRoute deployment.
 *
 * Answers the questions the managed-site integration depends on, against the
 * deployment the operator actually runs:
 *   - does the supplied credential authenticate, and does it carry the `admin`
 *     scope that every provider write requires?
 *   - how large is the connection inventory and the model catalogue?
 *   - is the plaintext credential read (`GET /api/providers/client`) still open?
 *   - does a connection-level `providerSpecificData.baseUrl` override survive a
 *     create/read-back round trip?
 *
 * Read-only by default. `--write` additionally creates one throwaway connection,
 * verifies the round trip and deletes it again, reporting loudly if the delete
 * fails so no orphan is left silently behind.
 *
 * Never prints a credential value - only presence, length and a short prefix.
 * Contract notes and the verified upstream version live in
 * `src/constants/omniroute.ts` and `src/services/apiService/omniroute/`.
 */

const REQUEST_TIMEOUT_MS = 10_000
const THROWAWAY_BASE_URL = "https://omniroute-probe.example.invalid/v1"
/** Synthetic credential: safe to compare against, never a real operator secret. */
const THROWAWAY_KEY = "sk-probe-throwaway-credential-value"

const createHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
})

const senderLabel = (secret) =>
  typeof secret === "string" && secret
    ? `${secret.slice(0, 8)}…(len=${secret.length})`
    : "absent"

async function call({ baseUrl, path, token, method = "GET", body, timeoutMs }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...createHeaders(token),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
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

/** Reports the credential-bearing fields without ever echoing a value. */
function describeCredentialPresence(connections) {
  return connections.map((connection) => ({
    name: connection?.name,
    provider: connection?.provider,
    apiKey: senderLabel(connection?.apiKey),
    baseUrlOverride: connection?.providerSpecificData?.baseUrl ?? "absent",
  }))
}

/**
 * Run the OmniRoute protocol probe.
 * @param options Probe options.
 * @param options.baseUrl Deployment root.
 * @param options.token `oma_` access token with the `admin` scope.
 * @param options.allowWrite Also exercise the create/delete round trip.
 * @param options.timeoutMs Per-request timeout.
 */
export async function runOmniRouteProbe({
  baseUrl,
  token,
  allowWrite = false,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (!baseUrl || !token) {
    throw new Error("OmniRoute 探测需要 baseUrl 与 admin 作用域令牌")
  }

  const root = baseUrl.replace(/\/+$/, "")
  console.log(`\n🔍 开始针对 OmniRoute 部署进行协议级探测: ${root}`)
  const findings = { ok: false, connectionCount: null, modelCount: null }

  // 1. Identity and scope: every provider write requires `admin`.
  const whoami = await call({
    baseUrl: root,
    path: "/api/cli/whoami",
    token,
    timeoutMs,
  })
  if (!whoami.ok) {
    throw new Error(
      `GET /api/cli/whoami 失败: HTTP ${whoami.status} - 令牌无效或作用域不足`,
    )
  }
  const scope = whoami.payload?.scope ?? "unknown"
  console.log("  [身份与作用域]:", {
    authenticated: whoami.payload?.authenticated,
    viaAccessToken: whoami.payload?.viaAccessToken,
    scope,
  })
  if (scope !== "admin") {
    console.warn(
      `  ⚠️ 令牌作用域为 '${scope}'，渠道写入需要 'admin'；写路径探测已跳过。`,
    )
  }

  // 2. Inventory. This is the same route the channel table reads.
  const inventory = await call({
    baseUrl: root,
    path: "/api/providers?limit=100",
    token,
    timeoutMs,
  })
  if (!inventory.ok) {
    throw new Error(`GET /api/providers 失败: HTTP ${inventory.status}`)
  }
  const connections = Array.isArray(inventory.payload?.connections)
    ? inventory.payload.connections
    : []
  findings.connectionCount = connections.length
  console.log("  [渠道清单]:", {
    connections: connections.length,
    total: inventory.payload?.total ?? null,
  })

  // 3. The catalogue is the deployment's own view of which providers it serves.
  const models = await call({
    baseUrl: root,
    path: "/api/models",
    token,
    timeoutMs,
  })
  const modelEntries = Array.isArray(models.payload?.models)
    ? models.payload.models
    : []
  findings.modelCount = modelEntries.length
  const providerIds = [
    ...new Set(modelEntries.map((entry) => entry?.provider)),
  ].filter(Boolean)
  console.log("  [模型目录]:", {
    models: modelEntries.length,
    providers: providerIds.length,
    sampleProviders: providerIds.slice(0, 8),
  })

  // 4. The plaintext read the key-based channel matching depends on. It is the
  //    one upstream behaviour that could be tightened without notice, so the
  //    probe reports whether it still answers in the clear. A connection that
  //    stores no credential (a no-auth provider) cannot answer this either way,
  //    so the count of credential-bearing rows is reported alongside.
  const clientRead = await call({
    baseUrl: root,
    path: "/api/providers/client",
    token,
    timeoutMs,
  })
  const clientConnections = Array.isArray(clientRead.payload?.connections)
    ? clientRead.payload.connections
    : []
  const credentialBearing = clientConnections.filter(
    (connection) => typeof connection?.apiKey === "string" && connection.apiKey,
  )
  const plaintextVisible = credentialBearing.some(
    (connection) => !connection.apiKey.includes("****"),
  )
  console.log("  [明文凭据读出口 GET /api/providers/client]:", {
    status: clientRead.status,
    connections: clientConnections.length,
    credentialBearing: credentialBearing.length,
    plaintextVisible:
      credentialBearing.length === 0
        ? "undetermined (无带凭据的渠道)"
        : plaintextVisible,
  })
  console.log(
    "  [打码矩阵样本]:",
    describeCredentialPresence(connections.slice(0, 3)),
  )
  findings.plaintextVisible =
    credentialBearing.length === 0 ? null : plaintextVisible

  // 5. Optional write path: one throwaway connection, then remove it.
  if (allowWrite && scope === "admin") {
    const probeName = `AAH E2E OmniRouteProbe ${Date.now().toString(36)}`
    console.log(`\n✍️ 写入探测: 创建并回收临时渠道 [${probeName}]`)
    const before = connections.length
    let createdId = null

    try {
      const created = await call({
        baseUrl: root,
        path: "/api/providers",
        token,
        method: "POST",
        timeoutMs,
        body: {
          provider: "openai",
          name: probeName,
          apiKey: THROWAWAY_KEY,
          providerSpecificData: { baseUrl: THROWAWAY_BASE_URL },
        },
      })
      if (!created.ok) {
        throw new Error(`POST /api/providers 失败: HTTP ${created.status}`)
      }
      createdId = created.payload?.connection?.id ?? null
      if (!createdId) {
        throw new Error(
          `POST /api/providers 成功但未返回渠道 id（同步为未知状态，需手动按名称清理）: ${probeName}`,
        )
      }
      console.log("  [创建]:", { status: created.status, id: createdId })

      const detail = await call({
        baseUrl: root,
        path: `/api/providers/${encodeURIComponent(createdId)}`,
        token,
        timeoutMs,
      })
      const override = detail.payload?.connection?.providerSpecificData?.baseUrl
      console.log("  [回读]:", {
        status: detail.status,
        isActive: detail.payload?.connection?.isActive,
        baseUrlOverride: override,
      })
      findings.baseUrlOverrideSurvives = override === THROWAWAY_BASE_URL
      if (!findings.baseUrlOverrideSurvives) {
        console.warn(
          "  ⚠️ 连接级 baseUrl 覆盖未按预期回读，单步导入自定义中转的前提已变化。",
        )
      }

      // The throwaway connection stores a credential, so it settles the
      // plaintext question that a credential-free inventory cannot answer.
      const listed = await call({
        baseUrl: root,
        path: "/api/providers",
        token,
        timeoutMs,
      })
      const listedKey = (listed.payload?.connections ?? []).find(
        (connection) => connection?.id === createdId,
      )?.apiKey
      const client = await call({
        baseUrl: root,
        path: "/api/providers/client",
        token,
        timeoutMs,
      })
      const clientKey = (client.payload?.connections ?? []).find(
        (connection) => connection?.id === createdId,
      )?.apiKey
      findings.plaintextVisible = clientKey === THROWAWAY_KEY
      findings.listMasked =
        typeof listedKey === "string" && listedKey.includes("****")
      console.log("  [凭据可见性矩阵]:", {
        inventory: senderLabel(listedKey),
        clientRoute: senderLabel(clientKey),
        listMasked: findings.listMasked,
        clientRoutePlaintext: findings.plaintextVisible,
      })
      if (!findings.plaintextVisible) {
        console.warn(
          "  ⚠️ /api/providers/client 未返回明文，按密钥匹配的渠道去重将回落为地址与名称匹配。",
        )
      }
    } finally {
      if (createdId) {
        const removed = await call({
          baseUrl: root,
          path: `/api/providers/${encodeURIComponent(createdId)}`,
          token,
          method: "DELETE",
        })
        console.log("  [清理]:", { status: removed.status, id: createdId })
      }
      const after = await call({
        baseUrl: root,
        path: "/api/providers?limit=100",
        token,
      })
      const remaining = Array.isArray(after.payload?.connections)
        ? after.payload.connections.length
        : null
      findings.restored = remaining === before
      console.log("  [现场复原]:", {
        before,
        after: remaining,
        restored: findings.restored,
      })
      if (remaining !== before) {
        console.error(
          "  ❌ 临时渠道未被完全回收，请检查该部署上的 AAH E2E 前缀渠道。",
        )
      }
    }
  } else if (allowWrite) {
    console.warn("  ⚠️ 写入探测需要 admin 作用域令牌，本次跳过。")
  }

  findings.ok =
    findings.connectionCount !== null &&
    findings.modelCount > 0 &&
    scope === "admin" &&
    (findings.restored ?? true)

  return findings
}

// Allow running this suite directly: node scripts/suites/omniroute/probe.mjs
if (process.argv[1] && process.argv[1].endsWith("probe.mjs")) {
  loadLocalEnv()
  const baseUrl =
    process.argv[2] ||
    process.env.OMNIROUTE_BASE_URL ||
    process.env.AAH_E2E_OMNIROUTE_BASE_URL
  const token =
    process.argv[3] ||
    process.env.OMNIROUTE_ADMIN_TOKEN ||
    process.env.AAH_E2E_OMNIROUTE_ADMIN_TOKEN

  runOmniRouteProbe({
    baseUrl,
    token,
    allowWrite: process.argv.includes("--write"),
  })
    .then((result) => {
      console.log(
        "\n✅ 探测完成:",
        result.ok ? "部署契约与适配器预期一致" : "存在与适配器预期不一致之处",
      )
      if (!result.ok) process.exitCode = 1
    })
    .catch((error) => {
      console.error("\n❌ 探测失败:", error.message)
      process.exit(1)
    })
}
