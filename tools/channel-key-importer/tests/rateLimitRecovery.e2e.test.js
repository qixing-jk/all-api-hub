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

test("recovers only the rate-limited keys through the encrypted queue", async () => {
  const root = await mkdtemp(join(tmpdir(), "dataeyesai-recovery-e2e-"))
  const previousDataDir = process.env.DATAEYESAI_DATA_DIR
  const previousStorage = process.env.DATAEYESAI_STORAGE
  process.env.DATAEYESAI_DATA_DIR = root
  delete process.env.DATAEYESAI_STORAGE

  const channels = []
  let mutationAttempts = 0
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
      if (mutationAttempts === 2) {
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
    const created = await api("/api/create", {
      previewId: preview.previewId,
      confirmDuplicates: true,
      existingChannelId: null,
      manualModels: [],
      mappings: [],
      combineKeys: false,
    })

    assert.equal(created.successCount, 1)
    assert.ok(created.recoverySchedule, JSON.stringify(created))
    assert.equal(created.recoverySchedule.counts.pending, 2)
    assert.equal(mutationAttempts, 2)
    const completed = await api(
      `/api/schedules/${created.recoverySchedule.id}/run`,
      {},
    )
    assert.equal(completed.schedule.counts.pending, 0)
    assert.equal(completed.schedule.counts.imported, 2)
    assert.equal(completed.schedule.status, "completed")
    assert.equal(mutationAttempts, 4)
    assert.deepEqual(
      channels.map((channel) => channel.name),
      ["Mock batch · 1", "Mock batch · 2", "Mock batch · 3"],
    )

    const scheduleFile = await readFile(join(root, "schedules.json"), "utf8")
    assert.equal(scheduleFile.includes("sk-mock-second-value"), false)
    assert.equal(scheduleFile.includes("sk-mock-third-value"), false)
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
