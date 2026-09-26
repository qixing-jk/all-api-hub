import { describe, expect, it } from "vitest"

import { toRightCodeChannelInfos } from "~/services/apiAdapters/rightcode/channels"
import {
  resolveRightCodeChannelBaseUrl,
  resolveRightCodeKeyBaseUrl,
} from "~/services/apiService/rightcode/channelBaseUrl"

const origin = "https://console.example.invalid"

describe("resolveRightCodeChannelBaseUrl", () => {
  it("appends /v1 when the channel's own copy rule says so", () => {
    expect(
      resolveRightCodeChannelBaseUrl({
        origin,
        prefix: "/codex",
        copyWithV1: true,
        protocol: "responses",
      }),
    ).toBe("https://console.example.invalid/codex/v1")
  })

  it("keeps the bare prefix when the channel's copy rule omits /v1", () => {
    expect(
      resolveRightCodeChannelBaseUrl({
        origin,
        prefix: "/claude",
        copyWithV1: false,
        protocol: "messages",
      }),
    ).toBe("https://console.example.invalid/claude")
  })

  it("falls back to the protocol rule when the channel does not declare one", () => {
    expect(
      resolveRightCodeChannelBaseUrl({
        origin,
        prefix: "/deepseek",
        protocol: "completions",
      }),
    ).toBe("https://console.example.invalid/deepseek/v1")
    expect(
      resolveRightCodeChannelBaseUrl({
        origin,
        prefix: "/gemini",
        protocol: "gemini",
      }),
    ).toBe("https://console.example.invalid/gemini")
  })

  it("normalizes a prefix that is missing its leading slash and trailing origin slash", () => {
    expect(
      resolveRightCodeChannelBaseUrl({
        origin: `${origin}/`,
        prefix: "codex",
        copyWithV1: true,
      }),
    ).toBe("https://console.example.invalid/codex/v1")
  })

  it("returns the origin when the channel is rooted at the site domain", () => {
    expect(resolveRightCodeChannelBaseUrl({ origin, prefix: "/" })).toBe(origin)
  })
})

describe("resolveRightCodeKeyBaseUrl", () => {
  it("addresses a channel-bound key through its channel", () => {
    expect(
      resolveRightCodeKeyBaseUrl({
        origin,
        key: { allowed_prefixes: null },
        boundChannel: {
          prefix: "/codex",
          copyWithV1: true,
          protocol: "responses",
        },
      }),
    ).toBe("https://console.example.invalid/codex/v1")
  })

  it("addresses a legacy key through its first allowed prefix", () => {
    expect(
      resolveRightCodeKeyBaseUrl({
        origin,
        key: { allowed_prefixes: ["/claude-aws", "/claude"] },
        boundChannel: null,
      }),
    ).toBe("https://console.example.invalid/claude-aws")
  })

  it("returns null when neither a channel nor a prefix identifies the key", () => {
    expect(
      resolveRightCodeKeyBaseUrl({
        origin,
        key: { allowed_prefixes: null },
        boundChannel: null,
      }),
    ).toBeNull()
  })
})

describe("toRightCodeChannelInfos", () => {
  it("extracts channel info and models from upstreams", () => {
    const channels = toRightCodeChannelInfos([
      {
        upstream_id: 1,
        name: "Codex",
        prefix: "/codex",
        default_protocol: "responses",
        copy_with_v1: true,
        models: [
          { model_id: 1, name: "gpt-5", is_available: true },
          { model_id: 2, name: "gpt-4", is_available: false },
        ],
      },
      {
        upstream_id: Number.NaN,
        prefix: "/invalid-id",
      } as never,
      {
        upstream_id: 2,
        prefix: "   ",
      } as never,
    ])

    expect(channels).toEqual([
      {
        id: 1,
        name: "Codex",
        prefix: "/codex",
        protocol: "responses",
        copyWithV1: true,
        models: ["gpt-5"],
      },
    ])
  })
})
