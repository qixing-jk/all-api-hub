import assert from "node:assert/strict"
import test from "node:test"

import {
  applyQuotaLines,
  buildResourceChannelName,
  keyNameHint,
  parseBatchKeys,
} from "../src/batchKeys.js"

test("parses batch keys with per-line and fallback quotas", () => {
  assert.deepEqual(
    parseBatchKeys("sk-first | 25\nsk-second\nsk-first | 30", "10"),
    [
      { apiKey: "sk-first", quota: 30 },
      { apiKey: "sk-second", quota: 10 },
    ],
  )
})

test("rejects invalid quotas without exposing the full key", () => {
  assert.throws(() => parseBatchKeys("sk-sensitive-value | nope", ""), /alue/)
  assert.throws(() => parseBatchKeys("sk-key", "-1"), /默认额度/)
})

test("keeps a multiline JSON credential as one entry", () => {
  const credential = '{\n  "client_email": "service@example.com"\n}'

  assert.deepEqual(parseBatchKeys(credential, "12"), [
    { apiKey: credential, quota: 12 },
  ])
})

test("keeps composite provider credentials intact", () => {
  assert.deepEqual(
    parseBatchKeys(
      "AKIAFIRST|secret|us-east-1\nAKIASECOND|secret|eu-west-1",
      "20",
    ),
    [
      { apiKey: "AKIAFIRST|secret|us-east-1", quota: 20 },
      { apiKey: "AKIASECOND|secret|eu-west-1", quota: 20 },
    ],
  )
})

test("accepts x as an explicitly unknown quota", () => {
  assert.deepEqual(parseBatchKeys("sk-known | 12\nsk-unknown | x", "x"), [
    { apiKey: "sk-known", quota: 12 },
    { apiKey: "sk-unknown", quota: null },
  ])
})

test("splits many prefixed keys and trailing quotas from one pasted row", () => {
  assert.deepEqual(
    parseBatchKeys(
      "sk-first 20 sk-ant-second | x sk-or-v1-third,50 AIzaFourth:12",
      "",
    ),
    [
      { apiKey: "sk-first", quota: 20 },
      { apiKey: "sk-ant-second", quota: null },
      { apiKey: "sk-or-v1-third", quota: 50 },
      { apiKey: "AIzaFourth", quota: 12 },
    ],
  )
})

test("splits unprefixed key and quota pairs from one pasted row", () => {
  assert.deepEqual(parseBatchKeys("abcdef123456 20 fedcba654321 x", ""), [
    { apiKey: "abcdef123456", quota: 20 },
    { apiKey: "fedcba654321", quota: null },
  ])
})

test("keeps a composite credential while reading its trailing quota", () => {
  assert.deepEqual(parseBatchKeys("AK|SK|us-east-1 | 50", ""), [
    { apiKey: "AK|SK|us-east-1", quota: 50 },
  ])
})

test("pairs keys with u-suffixed quotas on following lines", () => {
  assert.deepEqual(
    parseBatchKeys("sk-ant-first\n\n485u\n\nsk-ant-second\n\n35u", ""),
    [
      { apiKey: "sk-ant-first", quota: 485 },
      { apiKey: "sk-ant-second", quota: 35 },
    ],
  )
})

test("parses colloquial dollar quota suffixes", () => {
  assert.deepEqual(
    parseBatchKeys(
      "sk-or-v1-first\n412刀\nsk-or-v1-second\n$35\nsk-or-v1-third\n20美元",
      "",
    ),
    [
      { apiKey: "sk-or-v1-first", quota: 412 },
      { apiKey: "sk-or-v1-second", quota: 35 },
      { apiKey: "sk-or-v1-third", quota: 20 },
    ],
  )
})

test("applies quota lines to keys by matching line number", () => {
  const entries = parseBatchKeys("sk-first\nsk-second", "", {
    allowInlineQuota: false,
  })
  assert.deepEqual(applyQuotaLines(entries, "20\nx"), [
    { apiKey: "sk-first", quota: 20 },
    { apiKey: "sk-second", quota: null },
  ])
  assert.throws(() => applyQuotaLines(entries, "20"), /Key 有 2 条/)
})

test("keeps duplicate input rows until their separate quotas are aligned", () => {
  const entries = parseBatchKeys("sk-same\nsk-same", "", {
    allowInlineQuota: false,
    deduplicate: false,
  })
  assert.deepEqual(applyQuotaLines(entries, "10\n20"), [
    { apiKey: "sk-same", quota: 10 },
    { apiKey: "sk-same", quota: 20 },
  ])
})

test("names an unknown-quota provider resource with date and x", () => {
  assert.equal(
    buildResourceChannelName("Anthropic", [{ apiKey: "secret", quota: null }], {
      date: new Date("2026-07-04T17:00:00Z"),
    }),
    "2026-07-05-Anthropic-Key-secret-额度为x资源",
  )
})

test("uses the entered quota and an index for separate batch channels", () => {
  assert.equal(
    buildResourceChannelName("OpenAI", [{ apiKey: "secret", quota: 20 }], {
      date: new Date("2026-07-04T17:00:00Z"),
      index: 1,
      total: 3,
    }),
    "2026-07-05-OpenAI-Key-secret-额度为20资源-2",
  )
})

test("uses the distinguishing start of common provider keys in channel names", () => {
  assert.equal(keyNameHint("sk-ant-api03-01cLTDxqr27grMrd"), "01cLTDxq")
  assert.equal(keyNameHint("sk-or-v1-bfcfbc86b09aeb54"), "bfcfbc86")
  assert.equal(keyNameHint("AKIAEXAMPLE|secret|us-east-1"), "EXAMPLE")
})
