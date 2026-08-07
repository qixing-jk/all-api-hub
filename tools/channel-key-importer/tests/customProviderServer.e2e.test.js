import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

test("manages named OpenAI-compatible providers through the server API", async () => {
  const root = await mkdtemp(join(tmpdir(), "dataeyesai-custom-provider-"))
  const previousDataDir = process.env.DATAEYESAI_DATA_DIR
  process.env.DATAEYESAI_DATA_DIR = root
  let importer

  try {
    const { startImporterServer } = await import("../src/server.js")
    importer = await startImporterServer({ port: 0 })
    const bootstrapResponse = await fetch(`${importer.url}/api/bootstrap`)
    const bootstrap = await bootstrapResponse.json()
    const api = async (path, { method = "POST", body } = {}) => {
      const response = await fetch(`${importer.url}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Importer-Session": bootstrap.sessionToken,
          Origin: importer.url,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const payload = await response.json()
      assert.equal(response.status, 200, payload.error)
      return payload
    }

    await api("/api/custom-providers", {
      body: {
        name: "供应商 10",
        baseUrl: "https://ten.example.com/v1",
      },
    })
    const created = await api("/api/custom-providers", {
      body: {
        name: "供应商 2",
        baseUrl: "https://two.example.com/v1",
      },
    })

    assert.deepEqual(
      created.customProviders.map((provider) => provider.name),
      ["供应商 2", "供应商 10"],
    )
    const customCards = created.providers.filter(
      (provider) => provider.customProvider,
    )
    assert.equal(customCards.length, 2)
    assert.equal(customCards[0].channelType, 1)
    assert.equal(customCards[0].baseUrl, "https://two.example.com/v1")

    const refreshed = await fetch(`${importer.url}/api/bootstrap`)
    const refreshedBootstrap = await refreshed.json()
    assert.deepEqual(
      refreshedBootstrap.customProviders.map((provider) => provider.name),
      ["供应商 2", "供应商 10"],
    )

    const selected = created.customProviders[0]
    const removed = await api(
      `/api/custom-providers/${encodeURIComponent(selected.id)}`,
      { method: "DELETE" },
    )
    assert.deepEqual(
      removed.customProviders.map((provider) => provider.name),
      ["供应商 10"],
    )
  } finally {
    if (importer) await importer.close()
    if (previousDataDir === undefined) delete process.env.DATAEYESAI_DATA_DIR
    else process.env.DATAEYESAI_DATA_DIR = previousDataDir
    await rm(root, { force: true, recursive: true })
  }
})
