import assert from "node:assert/strict"
import test from "node:test"

import {
  calculateScheduleDelay,
  normalizeChannelRoutingValue,
  normalizePrioritySequence,
  resolveEntryPriority,
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

test("assigns descending priorities in original key order", () => {
  const prioritySequence = normalizePrioritySequence(
    { enabled: true, step: "2" },
    100,
    3,
  )
  const preview = { priority: 100, prioritySequence }
  assert.equal(resolveEntryPriority(preview, {}, 0), 100)
  assert.equal(resolveEntryPriority(preview, {}, 1), 98)
  assert.equal(resolveEntryPriority(preview, { priorityIndex: 8 }, 0), 84)
})

test("rejects an invalid descending priority step", () => {
  assert.throws(
    () => normalizePrioritySequence({ enabled: true, step: "0" }, 100, 3),
    /优先级递减步长必须是/,
  )
})

test("starts the packaged server on an available loopback port", async () => {
  const importer = await startImporterServer({ port: 0 })
  try {
    const response = await fetch(importer.url)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /dataeyesai/)
    assert.match(importer.url, /^http:\/\/127\.0\.0\.1:\d+$/)

    const viewState = await fetch(`${importer.url}/viewState.js`)
    assert.equal(viewState.status, 200)
    assert.match(viewState.headers.get("content-type"), /^text\/javascript/)

    const artwork = await fetch(`${importer.url}/assets/operations-board.jpg`)
    assert.equal(artwork.status, 200)
    assert.equal(artwork.headers.get("content-type"), "image/jpeg")
    assert.ok((await artwork.arrayBuffer()).byteLength > 100_000)
  } finally {
    await importer.close()
  }
})
