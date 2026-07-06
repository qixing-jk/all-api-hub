import assert from "node:assert/strict"
import test from "node:test"

import {
  applyGatewayUsage,
  calculateQuotaUsage,
  keyIdentity,
} from "../src/importStore.js"

test("stores only a masked hint and irreversible key fingerprint", () => {
  const identity = keyIdentity("sk-super-secret-1234")

  assert.equal(identity.keyHint, "••••1234")
  assert.equal(identity.keyFingerprint.length, 12)
  assert.equal(JSON.stringify(identity).includes("super-secret"), false)
})

test("calculates consumption from entered quota and provider balance", () => {
  assert.deepEqual(calculateQuotaUsage(20, 16.25), {
    spent: 3.75,
    usageStatus: "available",
  })
  assert.deepEqual(calculateQuotaUsage(20, null), {
    spent: 0,
    usageStatus: "awaiting-balance",
  })
})

test("does not invent per-key consumption for a shared multi-key channel", () => {
  assert.deepEqual(calculateQuotaUsage(20, 16.25, true), {
    spent: null,
    usageStatus: "shared-channel",
  })
})

test("uses New API gateway logs as the per-key usage source", () => {
  const updated = applyGatewayUsage(
    { id: "record", spent: null, usageStatus: "shared-channel" },
    {
      spentUsd: 1.25,
      requestCount: 3,
      promptTokens: 120,
      completionTokens: 30,
      lastUsedAt: 1_750_000_000,
    },
  )

  assert.equal(updated.spent, 1.25)
  assert.equal(updated.usageStatus, "gateway-usage")
  assert.equal(updated.requestCount, 3)
})

test("persists a corrected New API profile with refreshed usage", () => {
  const updated = applyGatewayUsage(
    { id: "record", profileId: "old-profile" },
    {
      spentUsd: 0,
      requestCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      lastUsedAt: null,
    },
    {
      profileId: "current-profile",
      targetName: "内部资源池",
      targetUrl: "http://47.77.237.243:3000",
    },
  )

  assert.equal(updated.profileId, "current-profile")
  assert.equal(updated.targetName, "内部资源池")
})
