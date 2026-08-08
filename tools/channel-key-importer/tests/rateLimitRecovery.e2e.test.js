import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const listen = async (server) =>
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })

const close = async (server) =>
  server.listening
    ? await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    : undefined

const readJson = async (request) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
}

test("writes an unchecked bulk import immediately and only queues rate-limited keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "dataeyesai-recovery-e2e-"))
  const previousDataDir = process.env.DATAEYESAI_DATA_DIR
  const previousStorage = process.env.DATAEYESAI_STORAGE
  process.env.DATAEYESAI_DATA_DIR = root
  delete process.env.DATAEYESAI_STORAGE

  const channels = []
  let mutationAttempts = 0
  let rateLimitNextMutation = false
  const upstream = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1")
    const send = (status, payload, headers = {}) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        ...headers,
      })
      response.end(payload == null ? "" : JSON.stringify(payload))
    }
    if (request.method === "POST" && url.pathname === "/api/channel/") {
      mutationAttempts += 1
      if (rateLimitNextMutation) {
        rateLimitNextMutation = false
        send(429, null, { "Retry-After": "60" })
        return
      }
      const body = await readJson(request)
      channels.push({
        id: 100 + channels.length,
        name: body.channel.name,
        type: body.channel.type,
        base_url: body.channel.base_url,
      })
      send(200, { success: true, message: "" })
      return
    }
    if (url.pathname === "/api/channel/search") {
      const keyword = url.searchParams.get("keyword") || ""
      send(200, {
        success: true,
        data: { items: channels.filter((item) => item.name === keyword) },
      })
      return
    }
    if (url.pathname === "/api/channel/") {
      send(200, { success: true, data: { items: [...channels].reverse() } })
      return
    }
    if (url.pathname === "/api/group/") {
      send(200, { success: true, data: ["default"] })
      return
    }
    if (url.pathname === "/api/status") {
      send(200, { success: true, data: { system_name: "Mock New API" } })
      return
    }
    send(404, { success: false, message: "not found" })
  })

  let importer
  try {
    await listen(upstream)
    const upstreamAddress = upstream.address()
    const targetUrl = `http://127.0.0.1:${upstreamAddress.port}`
    const { startImporterServer } = await import("../src/server.js")
    importer = await startImporterServer({ port: 0 })

    const bootstrapResponse = await fetch(`${importer.url}/api/bootstrap`)
    const bootstrap = await bootstrapResponse.json()
    const api = async (path, body) => {
      const response = await fetch(`${importer.url}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Importer-Session": bootstrap.sessionToken,
          Origin: importer.url,
        },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      assert.equal(response.status, 200, payload.error)
      return payload
    }

    await api("/api/config", {
      targetUrl,
      adminToken: "mock-admin-token-value",
      rememberToken: false,
      allowInsecureHttp: true,
    })
    const preview = await api("/api/preview", {
      providerId: "openai",
      name: "Mock batch",
      automaticName: false,
      groups: ["default"],
      priority: "0",
      weight: "0",
      prioritySequence: { enabled: false, step: "1" },
      configSource: "manual",
      baseUrl: "https://api.openai.com",
      apiKey: [
        "sk-mock-first-value",
        "sk-mock-second-value",
        "sk-mock-third-value",
      ].join("\n"),
      quotaMode: "uniform",
      uniformQuota: "x",
      quotaLines: "",
      credentialMode: "",
      credentialParts: {},
      providerExtra: "",
      providerFlags: {},
      providerModels: "gpt-4o-mini",
      providerModelMappings: "",
    })
    const immediate = await api("/api/create", {
      previewId: preview.previewId,
      confirmDuplicates: true,
      existingChannelId: null,
      manualModels: [],
      mappings: [],
      combineKeys: false,
    })

    assert.equal(immediate.successCount, 3)
    assert.equal(immediate.failedCount, 0)
    assert.equal(immediate.continuationSchedule, undefined)
    assert.equal(immediate.recoverySchedule, undefined)
    assert.equal(mutationAttempts, 3)
    assert.deepEqual(
      channels.map((channel) => channel.name),
      ["Mock batch · 1", "Mock batch · 2", "Mock batch · 3"],
    )

    const recoveryPreview = await api("/api/preview", {
      providerId: "openai",
      name: "Recovery batch",
      automaticName: false,
      groups: ["default"],
      priority: "0",
      weight: "0",
      prioritySequence: { enabled: false, step: "1" },
      configSource: "manual",
      baseUrl: "https://api.openai.com",
      apiKey: [
        "sk-recovery-first-value",
        "sk-recovery-second-value",
        "sk-recovery-third-value",
      ].join("\n"),
      quotaMode: "uniform",
      uniformQuota: "x",
      quotaLines: "",
      credentialMode: "",
      credentialParts: {},
      providerExtra: "",
      providerFlags: {},
      providerModels: "gpt-4o-mini",
      providerModelMappings: "",
    })
    rateLimitNextMutation = true
    const rateLimited = await api("/api/create", {
      previewId: recoveryPreview.previewId,
      confirmDuplicates: true,
      existingChannelId: null,
      manualModels: [],
      mappings: [],
      combineKeys: false,
    })

    assert.equal(rateLimited.successCount, 0)
    assert.ok(rateLimited.recoverySchedule, JSON.stringify(rateLimited))
    assert.equal(rateLimited.recoverySchedule.counts.pending, 3)
    assert.equal(rateLimited.recoverySchedule.batchSize, 1)
    assert.equal(mutationAttempts, 4)
    let recovered
    for (let index = 0; index < 3; index += 1) {
      recovered = await api(
        `/api/schedules/${rateLimited.recoverySchedule.id}/run`,
        {},
      )
    }
    assert.equal(recovered.schedule.counts.pending, 0)
    assert.equal(recovered.schedule.counts.imported, 3)
    assert.equal(recovered.schedule.status, "completed")
    assert.equal(mutationAttempts, 7)
    assert.deepEqual(
      channels.slice(3).map((channel) => channel.name),
      ["Recovery batch · 1", "Recovery batch · 2", "Recovery batch · 3"],
    )

    const scheduleFile = await readFile(join(root, "schedules.json"), "utf8")
    assert.equal(scheduleFile.includes("sk-mock-second-value"), false)
    assert.equal(scheduleFile.includes("sk-mock-third-value"), false)
    assert.equal(scheduleFile.includes("sk-recovery-first-value"), false)
    assert.equal(scheduleFile.includes("sk-recovery-third-value"), false)
  } finally {
    if (importer) await importer.close()
    await close(upstream)
    if (previousDataDir === undefined) delete process.env.DATAEYESAI_DATA_DIR
    else process.env.DATAEYESAI_DATA_DIR = previousDataDir
    if (previousStorage === undefined) delete process.env.DATAEYESAI_STORAGE
    else process.env.DATAEYESAI_STORAGE = previousStorage
    await rm(root, { force: true, recursive: true })
  }
})
