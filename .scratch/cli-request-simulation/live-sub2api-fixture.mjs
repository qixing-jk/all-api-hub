import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { loadLocalEnv } from "../../scripts/utils/local-env.mjs"

loadLocalEnv()

const baseUrl = process.env.AAH_E2E_SUB2API_BASE_URL
const adminToken = process.env.AAH_E2E_SUB2API_ADMIN_TOKEN
assert(baseUrl && adminToken, "Sub2API live configuration is required")
const experiment = process.env.AAH_CLI_PROFILE_EXPERIMENT ?? "live-sub2api"
assert(/^[a-z0-9-]+$/.test(experiment), "Invalid experiment name")
const outputDir = new URL(`./artifacts/${experiment}/`, import.meta.url)
const stateFile = new URL("./state.private.json", outputDir)
const action = process.argv[2] ?? "inspect"
const modelId = "gpt-5.4-mini"
let state

async function save() {
  await mkdir(outputDir, { recursive: true })
  // Only newly generated fixture secrets are retained. Never store the admin key
  // or an existing upstream inference key. This directory is feature-ignored.
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  })
}

async function api(path, { method = "GET", body, bearer } = {}) {
  const res = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      "content-type": "application/json",
      ...(bearer
        ? { authorization: `Bearer ${bearer}` }
        : { "x-api-key": adminToken }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  })
  let payload
  try {
    payload = await res.json()
  } catch {
    throw new Error(`${method} ${path} returned non-JSON HTTP ${res.status}`)
  }
  if (!res.ok || (payload.code !== undefined && payload.code !== 0)) {
    throw new Error(
      `${method} ${path} failed: HTTP ${res.status}, code=${String(payload.code ?? "none")}`,
    )
  }
  return payload.data ?? payload
}

async function getGone(path) {
  const res = await fetch(new URL(path, baseUrl), {
    headers: { "x-api-key": adminToken },
    signal: AbortSignal.timeout(20_000),
  })
  return res.status
}

async function inspect() {
  const version = await api("/api/v1/admin/system/version")
  const account = await api("/api/v1/admin/accounts/1")
  const groups = await api("/api/v1/admin/groups?page_size=100")
  console.log(
    JSON.stringify({
      version: version.version,
      account: {
        id: account.id,
        type: account.type,
        platform: account.platform,
        status: account.status,
        groupIds: account.group_ids,
        hasKey: account.credentials_status?.has_api_key,
      },
      groups: groups.items.map((g) => ({
        id: g.id,
        platform: g.platform,
        claudeCodeOnly: g.claude_code_only,
      })),
    }),
  )
}

async function setup() {
  try {
    await readFile(stateFile)
    throw new Error("Fixture state already exists; inspect or clean it first")
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  const sourceAccount = await api("/api/v1/admin/accounts/1")
  assert.equal(sourceAccount.platform, "openai")
  assert.equal(sourceAccount.type, "apikey")
  assert(sourceAccount.credentials_status?.has_api_key)
  assert(sourceAccount.group_ids.includes(3))
  state = {
    runId: `cli-simulation-${Date.now()}-${randomBytes(3).toString("hex")}`,
    createdAt: new Date().toISOString(),
    baseUrl,
    modelId,
    sourceAccountId: sourceAccount.id,
    sourceAccountGroupIds: sourceAccount.group_ids,
    ids: {},
    credentials: {},
    cleanup: [],
  }
  await save()
  const dispatchGroup = await api("/api/v1/admin/groups", {
    method: "POST",
    body: {
      name: `${state.runId}-dispatch`,
      description: "Temporary owned CLI simulation acceptance; no fallback",
      platform: "openai",
      rate_multiplier: 1,
      is_exclusive: true,
      subscription_type: "standard",
      allow_messages_dispatch: true,
      claude_code_only: false,
      default_mapped_model: modelId,
      copy_accounts_from_group_ids: [3],
    },
  })
  state.ids.dispatchGroup = dispatchGroup.id
  await save()
  const strictGroup = await api("/api/v1/admin/groups", {
    method: "POST",
    body: {
      name: `${state.runId}-strict`,
      description: "Temporary Claude Code only acceptance; no fallback",
      platform: "anthropic",
      rate_multiplier: 1,
      is_exclusive: true,
      subscription_type: "standard",
      claude_code_only: true,
    },
  })
  state.ids.strictGroup = strictGroup.id
  await save()
  const email = `${state.runId}@example.invalid`
  const password = randomBytes(24).toString("base64url")
  const user = await api("/api/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      role: "user",
      balance: 1,
      concurrency: 4,
      allowed_groups: [dispatchGroup.id, strictGroup.id],
      restrict_public_groups: true,
      notes: state.runId,
    },
  })
  state.ids.user = user.id
  await save()
  const login = await api("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  })
  assert(
    login.access_token,
    "Fixture user login did not return an access token",
  )
  state.credentials.userAccessToken = login.access_token
  await save()
  for (const [name, groupId] of [
    ["bridge", dispatchGroup.id],
    ["outer", strictGroup.id],
  ]) {
    const key = await api("/api/v1/keys", {
      method: "POST",
      bearer: login.access_token,
      body: {
        name: `${state.runId}-${name}`,
        group_id: groupId,
        quota: 0.5,
        expires_in_days: 1,
      },
    })
    assert(key.key, "Fixture key creation did not return a key")
    state.ids[`${name}Key`] = key.id
    state.credentials[`${name}ApiKey`] = key.key
    await save()
  }
  const upstream = await api("/api/v1/admin/accounts", {
    method: "POST",
    body: {
      name: `${state.runId}-bridge-upstream`,
      notes:
        "Generated key points ONLY to owned OpenAI dispatch group; no recursion or fallback",
      platform: "anthropic",
      type: "apikey",
      credentials: {
        base_url: baseUrl.replace(/\/$/, ""),
        api_key: state.credentials.bridgeApiKey,
      },
      extra: {},
      concurrency: 1,
      priority: 1,
      group_ids: [strictGroup.id],
      upstream_billing_probe_enabled: false,
    },
  })
  state.ids.bridgeUpstream = upstream.id
  await save()
  await assertFixture()
  console.log(
    JSON.stringify({
      action: "setup",
      ids: state.ids,
      privateStateFile: fileURLToPath(stateFile),
      modelId,
    }),
  )
}

async function assertFixture() {
  const strict = await api(`/api/v1/admin/groups/${state.ids.strictGroup}`)
  const dispatch = await api(`/api/v1/admin/groups/${state.ids.dispatchGroup}`)
  const upstream = await api(
    `/api/v1/admin/accounts/${state.ids.bridgeUpstream}`,
  )
  assert.equal(strict.platform, "anthropic")
  assert.equal(strict.claude_code_only, true)
  assert.equal(strict.fallback_group_id, null)
  assert.equal(strict.fallback_group_id_on_invalid_request, null)
  assert.equal(dispatch.platform, "openai")
  assert.equal(dispatch.allow_messages_dispatch, true)
  assert.equal(dispatch.claude_code_only, false)
  assert.equal(dispatch.fallback_group_id, null)
  assert.equal(upstream.platform, "anthropic")
  assert.deepEqual(upstream.group_ids, [strict.id])
}

async function probe() {
  await assertFixture()
  const observations = []
  for (const simulated of [false, true]) {
    const session = randomUUID()
    const body = {
      model: modelId,
      max_tokens: 16,
      stream: false,
      messages: [{ role: "user", content: "Reply with exactly OK" }],
      ...(simulated
        ? {
            system: [
              {
                type: "text",
                text: "You are Claude Code, Anthropic's official CLI for Claude.",
              },
            ],
            metadata: {
              user_id: JSON.stringify({
                device_id: randomBytes(32).toString("hex"),
                account_uuid: "",
                session_id: session,
              }),
            },
          }
        : {}),
    }
    const res = await fetch(new URL("/v1/messages", baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": state.credentials.outerApiKey,
        "anthropic-version": "2023-06-01",
        ...(simulated
          ? {
              "user-agent": "claude-cli/2.1.306 (external, cli)",
              "x-app": "cli",
              "anthropic-beta":
                "claude-code-20250219,interleaved-thinking-2025-05-14",
            }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    })
    let payload
    const raw = await res.text()
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = {}
    }
    const text = (payload.content ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("")
    let safeMessage = String(
      (typeof payload.error === "string"
        ? payload.error
        : payload.error?.message) ??
        payload.message ??
        "",
    )
    for (const secret of [adminToken, ...Object.values(state.credentials)]) {
      if (secret) safeMessage = safeMessage.replaceAll(secret, "[redacted]")
    }
    observations.push({
      simulated,
      status: res.status,
      errorType: payload.error?.type,
      errorMessage: safeMessage.slice(0, 500),
      responseContentType: res.headers.get("content-type"),
      htmlTitle: raw.match(/<title>([^<]+)/)?.[1],
      restrictionRejected: /(?:restricted to|only allows) Claude Code/i.test(
        safeMessage,
      ),
      messageType: payload.type,
      generatedOK: /^OK[.!]?$/i.test(text.trim()),
      usage: payload.usage,
    })
  }
  const evidence = {
    runId: state.runId,
    at: new Date().toISOString(),
    ids: state.ids,
    modelId,
    observations,
  }
  const reportFile = new URL(`./evidence-${Date.now()}.json`, outputDir)
  await writeFile(reportFile, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify(evidence))
  assert.equal(observations[0].restrictionRejected, true)
  assert.equal(observations[1].restrictionRejected, false)
  // This fixture verifies client admission. Its existing upstreams need not
  // provide working inference; the ordinary control must still hit the gate.
  assert([200, 502].includes(observations[1].status))
}

async function cleanup() {
  if (state.cleanedAt) {
    console.log(
      JSON.stringify({ action: "cleanup", cleanedAt: state.cleanedAt }),
    )
    return
  }
  if (state.ids.bridgeUpstream) {
    const path = `/api/v1/admin/accounts/${state.ids.bridgeUpstream}`
    if ((await getGone(path)) !== 404) await api(path, { method: "DELETE" })
    assert.equal(await getGone(path), 404)
    state.cleanup.push({
      kind: "bridgeUpstream",
      id: state.ids.bridgeUpstream,
      status: 404,
    })
    await save()
  }
  for (const name of ["outerKey", "bridgeKey"]) {
    if (!state.ids[name]) continue
    const path = `/api/v1/keys/${state.ids[name]}`
    const status = await fetch(new URL(path, baseUrl), {
      headers: { authorization: `Bearer ${state.credentials.userAccessToken}` },
    }).then((r) => r.status)
    if (status !== 404)
      await api(path, {
        method: "DELETE",
        bearer: state.credentials.userAccessToken,
      })
    const readback = await fetch(new URL(path, baseUrl), {
      headers: { authorization: `Bearer ${state.credentials.userAccessToken}` },
    }).then((r) => r.status)
    assert.equal(readback, 404)
    state.cleanup.push({ kind: name, id: state.ids[name], status: readback })
    await save()
  }
  for (const [kind, path] of [
    ["user", `/api/v1/admin/users/${state.ids.user}`],
    ["strictGroup", `/api/v1/admin/groups/${state.ids.strictGroup}`],
    ["dispatchGroup", `/api/v1/admin/groups/${state.ids.dispatchGroup}`],
  ]) {
    if (!state.ids[kind]) continue
    const existing = await getGone(path)
    if (existing !== 404) await api(path, { method: "DELETE" })
    const status = await getGone(path)
    assert.equal(status, 404, `${kind} cleanup was not confirmed`)
    state.cleanup.push({ kind, id: state.ids[kind], status })
    await save()
  }
  const source = await api(`/api/v1/admin/accounts/${state.sourceAccountId}`)
  assert.deepEqual(
    [...source.group_ids].sort(),
    [...state.sourceAccountGroupIds].sort(),
  )
  state.sourceMembershipRestored = true
  state.cleanedAt = new Date().toISOString()
  state.credentials = {}
  await save()
  console.log(
    JSON.stringify({
      action: "cleanup",
      cleanup: state.cleanup,
      sourceMembershipRestored: true,
    }),
  )
}

if (action === "setup") await setup()
else if (action === "inspect") await inspect()
else {
  state = JSON.parse(await readFile(stateFile, "utf8"))
  assert.equal(
    state.baseUrl,
    baseUrl,
    "Configured site differs from fixture owner",
  )
  if (action === "probe") await probe()
  else if (action === "cleanup") await cleanup()
  else if (action === "check") {
    await assertFixture()
    console.log(JSON.stringify({ action, ids: state.ids }))
  } else throw new Error("Expected setup, inspect, check, probe, or cleanup")
}
