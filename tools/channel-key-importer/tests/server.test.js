import assert from "node:assert/strict"
import test from "node:test"

import { startImporterServer } from "../src/server.js"

test("starts the packaged server on an available loopback port", async () => {
  const importer = await startImporterServer({ port: 0 })
  try {
    const response = await fetch(importer.url)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /dataeyesai/)
    assert.match(importer.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  } finally {
    await importer.close()
  }
})
