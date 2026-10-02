import { describe, expect, it } from "vitest"

import {
  toProtocolRoot,
  toVersionedProtocolMount,
} from "~/services/aiApi/protocolAddress"

describe("protocol addresses", () => {
  describe("toProtocolRoot", () => {
    it.each([
      [
        "openai-compatible",
        "https://relay.example.invalid",
        "https://relay.example.invalid",
      ],
      [
        "openai-compatible",
        "https://relay.example.invalid/v1",
        "https://relay.example.invalid",
      ],
      [
        "openai-compatible",
        "https://relay.example.invalid/openai/v1/",
        "https://relay.example.invalid/openai",
      ],
      // A provider-owned path version is not the protocol's own version
      // segment, so Volcengine Ark's `/api/v3` mount must survive intact.
      [
        "openai-compatible",
        "https://ark.example.invalid/api/v3",
        "https://ark.example.invalid/api/v3",
      ],
      [
        "anthropic",
        "https://api.moonshot.cn/anthropic",
        "https://api.moonshot.cn/anthropic",
      ],
      [
        "anthropic",
        "https://api.moonshot.cn/anthropic/v1",
        "https://api.moonshot.cn/anthropic",
      ],
      [
        "anthropic",
        "https://ark.example.invalid/api/compatible",
        "https://ark.example.invalid/api/compatible",
      ],
      [
        "google",
        "https://google.example.invalid/v1beta",
        "https://google.example.invalid",
      ],
    ] as const)(
      "reduces the %s mount %s to its protocol root",
      (apiType, input, expected) => {
        expect(toProtocolRoot(apiType, input)).toBe(expected)
      },
    )

    it.each([
      [
        "openai-compatible",
        "https://relay.example.invalid/v1/chat/completions",
        "https://relay.example.invalid",
      ],
      [
        "openai-compatible",
        "https://relay.example.invalid/openai/v1/responses",
        "https://relay.example.invalid/openai",
      ],
      [
        "anthropic",
        "https://api.moonshot.cn/anthropic/v1/messages",
        "https://api.moonshot.cn/anthropic",
      ],
      [
        "google",
        "https://google.example.invalid/v1beta/models",
        "https://google.example.invalid",
      ],
    ] as const)(
      "drops the pasted operation path from %s %s",
      (apiType, input, expected) => {
        expect(toProtocolRoot(apiType, input)).toBe(expected)
      },
    )

    it.each([
      ["openai-compatible", "not a url"],
      ["anthropic", ""],
      ["google", "/v1beta/models"],
    ] as const)("rejects the unusable %s input %s", (apiType, input) => {
      expect(toProtocolRoot(apiType, input)).toBeNull()
    })
  })

  describe("toVersionedProtocolMount", () => {
    it.each([
      [
        "openai-compatible",
        "https://relay.example.invalid",
        "https://relay.example.invalid/v1",
      ],
      [
        "openai-compatible",
        "https://relay.example.invalid/v1",
        "https://relay.example.invalid/v1",
      ],
      [
        "openai-compatible",
        "https://relay.example.invalid/openai/v1/chat/completions",
        "https://relay.example.invalid/openai/v1",
      ],
      ["openai", "https://api.openai.com", "https://api.openai.com/v1"],
      // Ark's complete prefix already names its own version.
      [
        "openai-compatible",
        "https://ark.example.invalid/api/v3",
        "https://ark.example.invalid/api/v3",
      ],
      [
        "anthropic",
        "https://api.moonshot.cn/anthropic",
        "https://api.moonshot.cn/anthropic/v1",
      ],
      [
        "anthropic",
        "https://ark.example.invalid/api/compatible",
        "https://ark.example.invalid/api/compatible/v1",
      ],
      [
        "google",
        "https://google.example.invalid",
        "https://google.example.invalid/v1beta",
      ],
      [
        "google",
        "https://google.example.invalid/v1beta",
        "https://google.example.invalid/v1beta",
      ],
    ] as const)(
      "upgrades the %s address %s to its versioned mount",
      (apiType, input, expected) => {
        expect(toVersionedProtocolMount(apiType, input)).toBe(expected)
      },
    )

    it.each([
      ["openai-compatible", "not a url"],
      ["google", ""],
    ] as const)("rejects the unusable %s input %s", (apiType, input) => {
      expect(toVersionedProtocolMount(apiType, input)).toBeNull()
    })

    it("round-trips every root through its versioned mount", () => {
      const root = toProtocolRoot(
        "anthropic",
        "https://api.moonshot.cn/anthropic",
      )
      expect(toVersionedProtocolMount("anthropic", root!)).toBe(
        "https://api.moonshot.cn/anthropic/v1",
      )
      expect(
        toProtocolRoot("anthropic", "https://api.moonshot.cn/anthropic/v1"),
      ).toBe(root)
    })
  })
})
