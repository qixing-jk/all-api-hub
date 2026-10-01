#!/usr/bin/env node
/**
 * Upstream contract probe for the OmniRoute / 9router managed-site spec.
 *
 * Answers the open items in `.scratch/router-gateway-sites/spec.md` against a real
 * deployment:
 *   - does `providerSpecificData.baseUrl` survive the channel list response?
 *   - is the channel credential readable at all?
 *   - is the gateway key list masked, and is there a reveal path?
 *   - how big is the provider catalog / node list the editor must render?
 *   - which auth bootstrap actually works on this deployment?
 *
 * Read-only by default. `--write` additionally creates one throwaway channel to
 * confirm the baseUrl passthrough rules, then deletes it; any cleanup failure is
 * reported loudly so no orphan is left silently behind.
 *
 * Never prints a credential value — only presence, length and a short prefix.
 *
 * Usage:
 *   node .scratch/router-gateway-sites/probe-upstream.mjs
 *   node .scratch/router-gateway-sites/probe-upstream.mjs --env-file=../.env
 *   node .scratch/router-gateway-sites/probe-upstream.mjs --write
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Defaults to this worktree's own `.env.local`. Operators who keep all live
 * values in one checkout pass `--env-file=<path>` instead.
 */
const DEFAULT_ENV_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".env.local",
)
const REQUEST_TIMEOUT_MS = 10_000

const args = process.argv.slice(2)
const envFilePath = resolve(
  args
    .find((arg) => arg.startsWith("--env-file="))
    ?.slice("--env-file=".length) ?? DEFAULT_ENV_FILE,
)
const allowWrite = args.includes("--write")

function parseEnvFile(path) {
  let raw
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    return null
  }
  const values = new Map()
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value) values.set(match[1], value)
  }
  return values
}

const envFileValues = parseEnvFile(envFilePath)
const readEnv = (name) => process.env[name]?.trim() || envFileValues?.get(name)

// ---------------------------------------------------------------- reporting

const out = []
const line = (text = "") => {
  out.push(text)
  console.log(text)
}

/** Never echo any part of a secret — length only. */
const present = (value) =>
  typeof value === "string" && value.length > 0
    ? `present(len=${value.length})`
    : "absent"

const truncate = (value, max = 160) => {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  if (text === undefined) return "undefined"
  return text.length > max ? `${text.slice(0, max)}…` : text
}

const looksMasked = (value) =>
  typeof value === "string" && /[*·]{3,}|^\*+$/.test(value)

// ---------------------------------------------------------------- transport

async function request(url, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      // Non-JSON bodies (HTML error pages, plain text) stay available via `text`.
    }
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      setCookies: response.headers.getSetCookie?.() ?? [],
      text,
      json,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error:
        error.name === "AbortError"
          ? `timeout after ${REQUEST_TIMEOUT_MS}ms`
          : String(error.cause?.code ?? error.message),
    }
  } finally {
    clearTimeout(timer)
  }
}

const join = (baseUrl, endpoint) => `${baseUrl.replace(/\/+$/, "")}${endpoint}`

// ---------------------------------------------------------------- auth

/** OmniRoute: prefer a supplied `oma_` token; `--write` may mint one from the password. */
async function resolveOmniRouteCredential(baseUrl) {
  const token = readEnv("AAH_E2E_OMNIROUTE_ADMIN_TOKEN")
  if (token) {
    return { kind: "token", token, note: "from AAH_E2E_OMNIROUTE_ADMIN_TOKEN" }
  }

  const password = readEnv("AAH_E2E_OMNIROUTE_PASSWORD")
  if (!password) return { kind: "none" }

  if (!allowWrite) {
    return {
      kind: "password-only",
      note: "password set but not exchanged; rerun with --write to mint a token via POST /api/cli/connect",
    }
  }

  const response = await request(join(baseUrl, "/api/cli/connect"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      password,
      name: "aah-contract-probe",
      scope: "admin",
    }),
  })
  line(
    `  POST /api/cli/connect → HTTP ${response.status} ${
      response.json?.success
        ? "success"
        : truncate(response.json?.error ?? response.text)
    }`,
  )
  if (response.json?.token) {
    line(
      `    returned fields: ${Object.keys(response.json).join(", ")} · scope=${
        response.json.scope ?? "?"
      } · expiresAt=${response.json.expiresAt ?? "null"}`,
    )
    line(
      "    NOTE: this created a persistent `oma_` access token on the deployment (name: aah-contract-probe, scope: admin).",
    )
    return {
      kind: "token",
      token: response.json.token,
      note: "minted via /api/cli/connect",
    }
  }
  return { kind: "none", note: "token exchange failed" }
}

/** 9router: dashboard password → `auth_token` cookie. */
async function resolveNineRouterCookie(baseUrl) {
  const password = readEnv("AAH_E2E_9ROUTER_PASSWORD")
  if (!password) return { kind: "none" }

  const status = await request(join(baseUrl, "/api/auth/status"))
  const statusBody = status.json
  if (statusBody) {
    line(
      `  GET /api/auth/status → HTTP ${status.status} · requireLogin=${statusBody.requireLogin} · authMode=${statusBody.authMode} · hasPassword=${statusBody.hasPassword}`,
    )
  }

  const login = await request(join(baseUrl, "/api/auth/login"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  })
  line(
    `  POST /api/auth/login → HTTP ${login.status} ${
      login.json?.success
        ? "success"
        : truncate(login.json?.error ?? login.text)
    }`,
  )
  if (login.status === 403 && login.json?.mustChangePassword) {
    line(
      "    → the deployment still uses a default/absent password and refuses sessions to non-loopback callers (the documented mustChangePassword gate).",
    )
  }
  const cookie = login.setCookies
    .map((entry) => entry.split(";")[0])
    .find((entry) => entry.startsWith("auth_token="))
  if (cookie) {
    line(
      `    set-cookie: auth_token cookie captured (${present(cookie.split("=")[1])})`,
    )
    return { kind: "cookie", cookie }
  }
  return { kind: "none", note: "no auth_token cookie in the login response" }
}

// ---------------------------------------------------------------- analysis

function describeConnection(connection) {
  const fields = Object.keys(connection).sort()
  const psd = connection.providerSpecificData ?? null
  const apiKey = connection.apiKey
  return {
    fields,
    apiKey:
      apiKey === undefined
        ? "field omitted entirely"
        : apiKey === null
          ? "null"
          : looksMasked(apiKey)
            ? "masked"
            : `${present(apiKey)} — PLAINTEXT`,
    psdKeys: psd ? Object.keys(psd).sort() : [],
    psdBaseUrl: psd?.baseUrl ?? null,
  }
}

function analyzeProviders(body) {
  const connections = body?.connections
  if (!Array.isArray(connections)) {
    return ["    (no `connections` array in the response)"]
  }
  const findings = [`    connections: ${connections.length}`]
  for (const connection of connections.slice(0, 5)) {
    const info = describeConnection(connection)
    findings.push(
      `    · provider=${connection.provider} name=${truncate(String(connection.name), 40)} authType=${connection.authType ?? "-"} isActive=${connection.isActive}`,
    )
    findings.push(`      apiKey: ${info.apiKey}`)
    findings.push(
      `      providerSpecificData keys: [${info.psdKeys.join(", ")}]`,
    )
    findings.push(
      `      providerSpecificData.baseUrl: ${info.psdBaseUrl ?? "ABSENT"}`,
    )
  }
  return findings
}

function analyzeKeys(body, isOmniRoute) {
  const keys = body?.keys
  if (!Array.isArray(keys)) return ["    (no `keys` array in the response)"]
  const findings = [`    keys: ${keys.length}`]
  if (isOmniRoute) {
    findings.push(
      `    total=${body.total ?? "-"} allowKeyReveal=${body.allowKeyReveal ?? "-"}`,
    )
  }
  for (const key of keys.slice(0, 3)) {
    findings.push(
      `    · id=${key.id} name=${truncate(String(key.name), 32)} isActive=${key.isActive} createdAt=${key.createdAt ?? "-"}`,
    )
    findings.push(
      `      key field: ${
        key.key === undefined
          ? "absent"
          : looksMasked(key.key)
            ? "masked"
            : `${present(key.key)} — PLAINTEXT`
      }`,
    )
  }
  return findings
}

function analyzeModels(body) {
  const list = Array.isArray(body) ? body : body?.models ?? body?.data ?? []
  if (!Array.isArray(list)) return ["    (no recognizable model array)"]
  const findings = [`    models: ${list.length}`]
  if (body && !Array.isArray(body)) {
    findings.push(
      `    top-level keys: [${Object.keys(body).sort().join(", ")}]`,
    )
  }
  findings.push(`    first entry: ${truncate(JSON.stringify(list[0]))}`)
  return findings
}

function analyzeNodes(body) {
  const nodes = body?.nodes ?? body?.data
  if (!Array.isArray(nodes)) return ["    (no `nodes` array in the response)"]
  const findings = [`    provider nodes: ${nodes.length}`]
  for (const node of nodes.slice(0, 3)) {
    findings.push(`    · ${truncate(JSON.stringify(node), 180)}`)
  }
  return findings
}

// ---------------------------------------------------------------- write probes

const PROBE_PROVIDER = "openai"
const PROBE_BASE_URL = "https://probe.invalid/v1"
const PROBE_API_KEY = "sk-aah-contract-probe-invalid"

const findConnection = (body, id) => {
  const list = body?.connections
  return Array.isArray(list)
    ? list.find((entry) => entry.id === id) ?? null
    : null
}

/** Reports how a credential field is exposed; never echoes its value. */
function describeCredential(connection) {
  if (!connection) return "absent from this response"
  const apiKey = connection.apiKey
  if (apiKey === undefined) return "field omitted"
  if (apiKey === null) return "null"
  if (looksMasked(apiKey)) return `masked (${apiKey})`
  return `PLAINTEXT (${present(apiKey)})`
}

const countConnections = (body) =>
  Array.isArray(body?.connections) ? body.connections.length : -1
const countNodes = (body) =>
  Array.isArray(body?.nodes) ? body.nodes.length : -1

async function readInventory(site, credential) {
  const headers = site.authHeaders(credential)
  const [list, client, nodes] = await Promise.all([
    request(join(site.baseUrl, "/api/providers"), { headers }),
    request(join(site.baseUrl, "/api/providers/client"), { headers }),
    request(join(site.baseUrl, "/api/provider-nodes"), { headers }),
  ])
  return { list: list.json, client: client.json, nodes: nodes.json }
}

/**
 * Asks every candidate read surface whether it carries the stored channel
 * credential. Reports presence only — the response body is never printed, and
 * the DB-export surface returns a full backup that stays in memory.
 */
async function probeSecretSurfaces(site, credential, connectionId) {
  line(
    "  secret-read surfaces (response contains the stored channel credential?)",
  )
  for (const surface of site.secretSurfaces) {
    const response = await request(
      join(site.baseUrl, surface.path(connectionId)),
      {
        headers: {
          ...site.authHeaders(credential),
          ...(surface.headers?.() ?? {}),
        },
      },
    )
    const body = response.text ?? ""
    const found = body.includes(PROBE_API_KEY)
    line(
      `    ${found ? "YES" : "no "} ${surface.label} → HTTP ${response.status} (${body.length} bytes)`,
    )
  }
}

/** Confirms the baseUrl passthrough-rule reading against a real deployment. */
async function writeProbeOmniRoute(site, credential) {
  const headers = {
    "content-type": "application/json",
    ...site.authHeaders(credential),
  }
  const before = await readInventory(site, credential)
  const name = `aah-contract-probe-${Date.now()}`

  line(
    `  create: POST /api/providers provider=${PROBE_PROVIDER} providerSpecificData.baseUrl=${PROBE_BASE_URL}`,
  )
  const create = await request(join(site.baseUrl, "/api/providers"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: PROBE_PROVIDER,
      name,
      apiKey: PROBE_API_KEY,
      providerSpecificData: { baseUrl: PROBE_BASE_URL },
    }),
  })
  const id = create.json?.connection?.id ?? create.json?.id
  line(
    `    → HTTP ${create.status} id=${id ?? "none"} ${truncate(create.json?.error ?? "", 200)}`,
  )
  if (!id) {
    line(`    body: ${truncate(create.text, 300)}`)
    return
  }

  const detail = await request(join(site.baseUrl, `/api/providers/${id}`), {
    headers: site.authHeaders(credential),
  })
  const storedBaseUrl = detail.json?.connection?.providerSpecificData?.baseUrl
  line(`  detail: GET /api/providers/${id} → HTTP ${detail.status}`)
  line(`    providerSpecificData.baseUrl = ${storedBaseUrl ?? "ABSENT"}`)
  line(
    storedBaseUrl === PROBE_BASE_URL
      ? "    ✓ a caller-supplied baseUrl persists on a built-in provider (single-step create holds)"
      : "    ✗ caller-supplied baseUrl did NOT round-trip",
  )

  const after = await readInventory(site, credential)
  line(
    `  masked form on the list endpoint: apiKey ${describeCredential(findConnection(after.list, id))}`,
  )
  await probeSecretSurfaces(site, credential, id)

  const cleanup = await request(join(site.baseUrl, `/api/providers/${id}`), {
    method: "DELETE",
    headers: site.authHeaders(credential),
  })
  line(`  cleanup: DELETE /api/providers/${id} → HTTP ${cleanup.status}`)

  const restored = await readInventory(site, credential)
  const beforeCount = countConnections(before.list)
  const restoredCount = countConnections(restored.list)
  line(
    `  restored: connections ${beforeCount} → ${restoredCount} ${
      beforeCount === restoredCount ? "✓" : `✗ STILL DIFFERS (probe id=${id})`
    }`,
  )
}

/** 9router needs a provider node before a custom endpoint can be connected. */
async function writeProbeNineRouter(site, credential) {
  const headers = {
    "content-type": "application/json",
    ...site.authHeaders(credential),
  }
  const before = await readInventory(site, credential)
  const stamp = Date.now()

  const nodeRes = await request(join(site.baseUrl, "/api/provider-nodes"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `aah-probe-${stamp}`,
      prefix: `aahprobe${stamp}`,
      apiType: "chat",
      baseUrl: PROBE_BASE_URL,
      type: "openai-compatible",
    }),
  })
  const nodeId = nodeRes.json?.node?.id
  line(
    `  node: POST /api/provider-nodes → HTTP ${nodeRes.status} id=${nodeId ?? "none"}`,
  )
  if (!nodeId) {
    line(`    body: ${truncate(nodeRes.json?.error ?? nodeRes.text, 300)}`)
    return
  }

  const create = await request(join(site.baseUrl, "/api/providers"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: nodeId,
      name: `aah-contract-probe-${stamp}`,
      apiKey: PROBE_API_KEY,
    }),
  })
  const id = create.json?.connection?.id ?? create.json?.id
  line(
    `  create: POST /api/providers provider=${nodeId} → HTTP ${create.status} id=${id ?? "none"}`,
  )
  if (!id) {
    line(`    body: ${truncate(create.json?.error ?? create.text, 300)}`)
    line(
      `    !! NODE LEFT BEHIND: ${nodeId} (delete cleanup below will still run)`,
    )
  } else {
    const after = await readInventory(site, credential)
    const inList = findConnection(after.list, id)
    line(
      `    providerSpecificData.baseUrl snapshot = ${inList?.providerSpecificData?.baseUrl ?? "ABSENT"}`,
    )
    line(
      inList?.providerSpecificData?.baseUrl === PROBE_BASE_URL
        ? "    ✓ connection snapshotted the node's baseUrl"
        : "    ✗ node baseUrl was not snapshotted onto the connection",
    )
    await probeSecretSurfaces(site, credential, id)

    const cleanup = await request(join(site.baseUrl, `/api/providers/${id}`), {
      method: "DELETE",
      headers: site.authHeaders(credential),
    })
    line(`  cleanup: DELETE /api/providers/${id} → HTTP ${cleanup.status}`)
  }

  const nodeCleanup = await request(
    join(site.baseUrl, `/api/provider-nodes/${nodeId}`),
    {
      method: "DELETE",
      headers: site.authHeaders(credential),
    },
  )
  line(
    `  cleanup: DELETE /api/provider-nodes/${nodeId} → HTTP ${nodeCleanup.status}`,
  )

  const restored = await readInventory(site, credential)
  const beforeCount = countConnections(before.list)
  const restoredCount = countConnections(restored.list)
  const beforeNodes = countNodes(before.nodes)
  const restoredNodes = countNodes(restored.nodes)
  line(
    `  restored: connections ${beforeCount} → ${restoredCount} ${
      beforeCount === restoredCount
        ? "✓"
        : `✗ STILL DIFFERS (probe id=${id ?? "?"})`
    } · nodes ${beforeNodes} → ${restoredNodes} ${
      beforeNodes === restoredNodes
        ? "✓"
        : `✗ STILL DIFFERS (node id=${nodeId})`
    }`,
  )
}

// ---------------------------------------------------------------- sites

const SITES = [
  {
    key: "OMNIROUTE",
    label: "OmniRoute",
    envPrefix: "AAH_E2E_OMNIROUTE",
    isOmniRoute: true,
    endpoints: [
      ["/api/providers", "providers"],
      ["/api/keys", "keys"],
      ["/api/models", "models"],
      ["/api/provider-nodes", "nodes"],
      ["/api/providers/client", "providers"],
    ],
    resolve: resolveOmniRouteCredential,
    writeProbe: writeProbeOmniRoute,
    secretSurfaces: [
      { label: "GET /api/providers       ", path: () => "/api/providers" },
      {
        label: "GET /api/providers/{id}  ",
        path: (id) => `/api/providers/${id}`,
      },
      {
        label: "GET /api/providers/client",
        path: () => "/api/providers/client",
      },
    ],
    authHeaders: (credential) =>
      credential.kind === "token"
        ? { authorization: `Bearer ${credential.token}` }
        : {},
  },
  {
    key: "9ROUTER",
    label: "9router",
    envPrefix: "AAH_E2E_9ROUTER",
    isOmniRoute: false,
    endpoints: [
      ["/api/providers", "providers"],
      ["/api/providers/client", "providers"],
      ["/api/keys", "keys"],
      ["/api/models", "models"],
      ["/api/provider-nodes", "nodes"],
    ],
    resolve: resolveNineRouterCookie,
    writeProbe: writeProbeNineRouter,
    secretSurfaces: [
      { label: "GET /api/providers       ", path: () => "/api/providers" },
      {
        label: "GET /api/providers/{id}  ",
        path: (id) => `/api/providers/${id}`,
      },
      {
        label: "GET /api/providers/client",
        path: () => "/api/providers/client",
      },
      {
        label: "GET /api/settings/database",
        path: () => "/api/settings/database",
        headers: () => ({
          "x-9r-password": readEnv("AAH_E2E_9ROUTER_PASSWORD") ?? "",
        }),
      },
    ],
    authHeaders: (credential) =>
      credential.kind === "cookie" ? { cookie: credential.cookie } : {},
  },
]

const ANALYZERS = {
  providers: analyzeProviders,
  keys: analyzeKeys,
  models: analyzeModels,
  nodes: analyzeNodes,
}

async function probeSite(site) {
  line("")
  line("=".repeat(72))
  line(`${site.label}`)
  line("=".repeat(72))

  const baseUrl = readEnv(`${site.envPrefix}_BASE_URL`)
  if (!baseUrl) {
    line(`  skipped: ${site.envPrefix}_BASE_URL is not set`)
    return
  }
  site.baseUrl = baseUrl
  line(`  baseUrl: ${baseUrl}`)
  line(`  env file: ${envFilePath}${envFileValues ? "" : " (NOT FOUND)"}`)

  const credential = await site.resolve(baseUrl)
  line(
    `  credential: ${credential.kind}${credential.note ? ` (${credential.note})` : ""}`,
  )
  if (credential.kind === "none" || credential.kind === "password-only") {
    line("  no usable credential — probing public endpoints only")
  }

  for (const [endpoint, kind] of site.endpoints) {
    const response = await request(join(baseUrl, endpoint), {
      headers: site.authHeaders(credential),
    })
    line("")
    line(
      `  GET ${endpoint} → HTTP ${response.status}${response.error ? ` (${response.error})` : ""}`,
    )
    if (!response.json) {
      line(`    body: ${truncate(response.text, 200)}`)
      continue
    }
    for (const finding of ANALYZERS[kind](response.json, site.isOmniRoute))
      line(finding)
  }

  if (site.isOmniRoute && credential.kind === "token") {
    const whoami = await request(join(baseUrl, "/api/cli/whoami"), {
      headers: site.authHeaders(credential),
    })
    line("")
    line(
      `  GET /api/cli/whoami → HTTP ${whoami.status} · ${truncate(whoami.json)}`,
    )
  }

  if (
    allowWrite &&
    (credential.kind === "token" || credential.kind === "cookie")
  ) {
    line("")
    line(
      "  -- write probe: creates one throwaway channel, then restores the original state --",
    )
    await site.writeProbe(site, credential)
  }
}

line(
  `probe: ${allowWrite ? "read + write" : "read-only"} · env file ${envFilePath}`,
)
for (const site of SITES) {
  await probeSite(site)
}
line("")
line("done.")
