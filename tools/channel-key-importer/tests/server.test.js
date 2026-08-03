import assert from "node:assert/strict"
import test from "node:test"

import { AccessSessionManager, hashAccessKey } from "../src/accessAuth.js"
import { keyIdentity } from "../src/importStore.js"
import {
  calculateScheduleDelay,
  deduplicateCredentialEntries,
  normalizeChannelRoutingValue,
  normalizePrioritySequence,
  resolveEntryPriority,
  startImporterServer,
} from "../src/server.js"

test("deduplicates pasted, imported and queued keys before preview", () => {
  const imported = new Set([keyIdentity("sk-imported").keyFingerprint])
  const queued = new Set([keyIdentity("sk-queued").keyFingerprint])
  const result = deduplicateCredentialEntries(
    [
      { apiKey: "sk-new", quota: 20 },
      { apiKey: "sk-new", quota: 50 },
      { apiKey: "sk-imported", quota: 30 },
      { apiKey: "sk-queued", quota: 40 },
    ],
    imported,
    queued,
  )

  assert.deepEqual(result.keys, [{ apiKey: "sk-new", quota: 20 }])
  assert.deepEqual(result.summary, {
    inputCount: 4,
    inputDuplicateCount: 1,
    existingDuplicateCount: 1,
    queuedDuplicateCount: 1,
    acceptedCount: 1,
    skippedCount: 3,
  })
})

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

test("protects the shared server UI with an independent access key", async () => {
  const accessKey = "shared-server-access-key"
  const importer = await startImporterServer({
    port: 0,
    accessSessions: new AccessSessionManager({
      accessKeyHash: hashAccessKey(accessKey),
    }),
  })
  try {
    const loginPage = await fetch(importer.url)
    assert.equal(loginPage.status, 200)
    assert.match(await loginPage.text(), /输入系统访问密钥/)

    const unauthorized = await fetch(`${importer.url}/api/bootstrap`)
    assert.equal(unauthorized.status, 401)

    const login = await fetch(`${importer.url}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: importer.url,
      },
      body: JSON.stringify({ accessKey }),
    })
    assert.equal(login.status, 200)
    const cookie = login.headers.get("set-cookie")
    assert.match(cookie, /dataeyesai_access=/)

    const workspace = await fetch(importer.url, {
      headers: { Cookie: cookie },
    })
    assert.equal(workspace.status, 200)
    assert.match(await workspace.text(), /导入渠道/)

    const bootstrap = await fetch(`${importer.url}/api/bootstrap`, {
      headers: { Cookie: cookie },
    })
    assert.equal(bootstrap.status, 200)
  } finally {
    await importer.close()
  }
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
