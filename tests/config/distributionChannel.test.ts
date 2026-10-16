import { afterEach, expect, it, vi } from "vitest"

import { DISTRIBUTION_CHANNEL } from "~/utils/core/distributionChannel"
import wxtConfig from "~~/wxt.config"

afterEach(() => vi.unstubAllEnvs())

it("keeps store source archives reproducible without Git metadata", async () => {
  vi.stubEnv("AAH_DISTRIBUTION_CHANNEL", DISTRIBUTION_CHANNEL.FirefoxAmo)
  vi.stubEnv("AAH_BUILD_REVISION", "a".repeat(40))
  const vite = wxtConfig.vite
  if (typeof vite !== "function") throw new Error("Expected Vite factory")
  const config = await vite({
    command: "build",
    mode: "production",
    browser: "firefox",
    manifestVersion: 2,
  })
  expect(config.define?.__AAH_BUILD_REVISION__).toBe("null")
})

it.each([
  ["", "build", "unknown"],
  ["", "serve", "local-development"],
])(
  "uses an explicit fallback for an unmarked %s %s",
  async (requested, command, expected) => {
    vi.stubEnv("AAH_DISTRIBUTION_CHANNEL", requested)
    const vite = wxtConfig.vite
    if (typeof vite !== "function") throw new Error("Expected Vite factory")
    const config = await vite({
      command: command as "build" | "serve",
      browser: "chrome",
      mode: "production",
      manifestVersion: 3,
    })
    expect(config.define?.__AAH_DISTRIBUTION_CHANNEL__).toBe(
      JSON.stringify(expected),
    )
  },
)

it.each([
  [DISTRIBUTION_CHANNEL.ChromeWebStore, "chrome"],
  [DISTRIBUTION_CHANNEL.EdgeAddons, "edge"],
  [DISTRIBUTION_CHANNEL.FirefoxAmo, "firefox"],
  [DISTRIBUTION_CHANNEL.GithubRelease, "chrome"],
  [DISTRIBUTION_CHANNEL.GithubNightly, "firefox"],
])("bakes %s into its %s build", async (channel, browser) => {
  vi.stubEnv("AAH_DISTRIBUTION_CHANNEL", channel)
  const vite = wxtConfig.vite
  if (typeof vite !== "function") throw new Error("Expected Vite factory")
  const config = await vite({
    command: "build",
    mode: "production",
    browser,
    manifestVersion: 3,
  })
  expect(config.define?.__AAH_DISTRIBUTION_CHANNEL__).toBe(
    JSON.stringify(channel),
  )
})

it("rejects a store channel for the wrong browser", async () => {
  vi.stubEnv("AAH_DISTRIBUTION_CHANNEL", DISTRIBUTION_CHANNEL.FirefoxAmo)
  const vite = wxtConfig.vite
  if (typeof vite !== "function") throw new Error("Expected Vite factory")
  expect(() =>
    vite({
      command: "build",
      mode: "production",
      browser: "chrome",
      manifestVersion: 3,
    }),
  ).toThrow(/channel/i)
})

it("rejects invalid channel metadata before building", () => {
  vi.stubEnv("AAH_DISTRIBUTION_CHANNEL", "untrusted-channel")
  const vite = wxtConfig.vite
  if (typeof vite !== "function") throw new Error("Expected Vite factory")
  expect(() =>
    vite({
      command: "build",
      mode: "production",
      browser: "chrome",
      manifestVersion: 3,
    }),
  ).toThrow("Invalid distribution channel")
})
