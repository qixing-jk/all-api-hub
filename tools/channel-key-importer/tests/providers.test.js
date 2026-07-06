import assert from "node:assert/strict"
import test from "node:test"

import {
  getProvider,
  listPublicProviders,
  resolveProviderBaseUrl,
} from "../src/providers.js"

test("exposes every current New API built-in channel type", () => {
  const providers = listPublicProviders()
  const channelTypes = providers.map((provider) => provider.channelType)

  assert.equal(providers.length, 54)
  assert.equal(new Set(channelTypes).size, providers.length)
  assert.equal(getProvider("openai").channelType, 1)
  assert.equal(getProvider("replicate").channelType, 56)
  assert.equal(getProvider("codex").channelType, 57)
  assert.equal(getProvider("advanced-custom").channelType, 58)
})

test("marks New API flows that cannot be imported from a raw key", () => {
  assert.equal(getProvider("codex").importable, false)
  assert.equal(getProvider("advanced-custom").importable, false)
  assert.equal(getProvider("ollama").keyOptional, true)
})

test("resolves provider base URL defaults and validates overrides", () => {
  assert.equal(
    resolveProviderBaseUrl(getProvider("deepseek"), ""),
    "https://api.deepseek.com",
  )
  assert.equal(
    resolveProviderBaseUrl(
      getProvider("custom"),
      "https://proxy.example.com/v1/",
    ),
    "https://proxy.example.com/v1",
  )
  assert.throws(
    () => resolveProviderBaseUrl(getProvider("custom"), ""),
    /Base URL/,
  )
  assert.throws(
    () => resolveProviderBaseUrl(getProvider("custom"), "file:///tmp/key"),
    /HTTP/,
  )
})
