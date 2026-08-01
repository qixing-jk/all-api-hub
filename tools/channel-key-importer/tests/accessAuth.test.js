import assert from "node:assert/strict"
import test from "node:test"

import {
  AccessSessionManager,
  hashAccessKey,
  verifyAccessKey,
} from "../src/accessAuth.js"

test("hashes the system access key and creates an expiring cookie session", () => {
  let now = Date.parse("2026-08-02T00:00:00.000Z")
  const accessKey = "server-access-key-123"
  const accessKeyHash = hashAccessKey(accessKey, Buffer.alloc(16, 7))
  assert.equal(verifyAccessKey(accessKey, accessKeyHash), true)
  assert.equal(verifyAccessKey("wrong-access-key", accessKeyHash), false)

  const sessions = new AccessSessionManager({
    accessKeyHash,
    sessionMs: 60_000,
    now: () => now,
  })
  const login = sessions.login("198.51.100.10", accessKey)
  assert.match(login.cookie, /dataeyesai_access=/)
  assert.match(login.cookie, /HttpOnly/)
  assert.match(login.cookie, /SameSite=Strict/)
  assert.equal(sessions.authenticate(login.cookie), true)

  now += 60_001
  assert.equal(sessions.authenticate(login.cookie), false)
})

test("rate limits repeated invalid system access keys", () => {
  const sessions = new AccessSessionManager({
    accessKeyHash: hashAccessKey("correct-server-key"),
  })
  for (let index = 0; index < 5; index += 1) {
    assert.throws(
      () => sessions.login("203.0.113.8", "incorrect-key-value"),
      /密钥不正确/,
    )
  }
  assert.throws(
    () => sessions.login("203.0.113.8", "correct-server-key"),
    /15 分钟/,
  )
})
