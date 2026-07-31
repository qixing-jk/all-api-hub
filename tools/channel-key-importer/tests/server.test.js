import assert from "node:assert/strict"
import test from "node:test"

import {
  calculateScheduleDelay,
  normalizeChannelRoutingValue,
  startImporterServer,
} from "../src/server.js"

test("normalizes optional channel priority and weight", () => {
  assert.equal(normalizeChannelRoutingValue("", "渠道优先级"), null)
  assert.equal(normalizeChannelRoutingValue("12", "渠道优先级"), 12)
  assert.equal(normalizeChannelRoutingValue("80", "渠道权重", 0), 80)
  assert.throws(
    () => normalizeChannelRoutingValue("-1", "渠道权重", 0),
    /渠道权重必须是/,
  )
  assert.throws(
    () => normalizeChannelRoutingValue("1.5", "渠道优先级"),
    /渠道优先级必须是/,
  )
})

test("calculates a second-precision schedule delay", () => {
  assert.equal(
    calculateScheduleDelay(
      "2026-08-01T01:06:09.250Z",
      Date.parse("2026-08-01T01:06:08.000Z"),
    ),
    1250,
  )
  assert.equal(
    calculateScheduleDelay(
      "2026-08-01T01:06:07.000Z",
      Date.parse("2026-08-01T01:06:08.000Z"),
    ),
    0,
  )
})

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
