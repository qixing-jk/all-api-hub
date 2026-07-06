import assert from "node:assert/strict"
import test from "node:test"

import {
  isAllowedApiRequestOrigin,
  isAllowedHostHeader,
  isAllowedOrigin,
  normalizeTargetUrl,
  validateUserId,
} from "../src/security.js"

test("requires HTTPS for non-loopback New API targets", () => {
  assert.equal(
    normalizeTargetUrl("https://api.example.com/"),
    "https://api.example.com",
  )
  assert.equal(
    normalizeTargetUrl("http://127.0.0.1:3000/"),
    "http://127.0.0.1:3000",
  )
  assert.throws(
    () => normalizeTargetUrl("http://47.77.237.243:3000"),
    /必须使用 HTTPS/,
  )
  assert.equal(
    normalizeTargetUrl("http://47.77.237.243:3000/", {
      allowInsecureHttp: true,
    }),
    "http://47.77.237.243:3000",
  )
})

test("rejects target URLs with embedded credentials or query strings", () => {
  assert.throws(
    () => normalizeTargetUrl("https://admin:secret@example.com"),
    /用户名或密码/,
  )
  assert.throws(
    () => normalizeTargetUrl("https://example.com?token=secret"),
    /查询参数/,
  )
})

test("validates loopback host, origin, and admin user id", () => {
  assert.equal(isAllowedHostHeader("127.0.0.1:4179", 4179), true)
  assert.equal(isAllowedHostHeader("evil.example:4179", 4179), false)
  assert.equal(isAllowedOrigin("http://localhost:4179", 4179), true)
  assert.equal(isAllowedOrigin("https://evil.example", 4179), false)
  assert.equal(isAllowedApiRequestOrigin("GET", undefined, 4179), true)
  assert.equal(
    isAllowedApiRequestOrigin("GET", "https://evil.example", 4179),
    false,
  )
  assert.equal(isAllowedApiRequestOrigin("POST", undefined, 4179), false)
  assert.equal(
    isAllowedApiRequestOrigin("POST", "http://127.0.0.1:4179", 4179),
    true,
  )
  assert.equal(validateUserId(" 1 "), "1")
  assert.throws(() => validateUserId("admin"), /用户 ID/)
})
