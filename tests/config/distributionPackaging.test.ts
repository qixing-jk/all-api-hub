import { expect, it } from "vitest"

import { DISTRIBUTION_CHANNEL } from "~/utils/core/distributionChannel"
import { createDistributionBuildPlan } from "~~/scripts/package-distribution.mjs"

it("keeps every store artifact separate from GitHub artifacts", () => {
  const plan = createDistributionBuildPlan(
    DISTRIBUTION_CHANNEL.GithubRelease,
    true,
  )
  expect(plan.map((item) => [item.browser, item.channel])).toEqual([
    ["chrome", "github-release"],
    ["firefox", "github-release"],
    ["safari", "github-release"],
    ["chrome", "chrome-web-store"],
    ["edge", "edge-addons"],
    ["firefox", "firefox-amo"],
  ])
  expect(new Set(plan.map((item) => item.outputDirectory)).size).toBe(6)
})

it("never builds store packages for nightly", () => {
  expect(
    createDistributionBuildPlan(DISTRIBUTION_CHANNEL.GithubNightly, false).map(
      (item) => item.channel,
    ),
  ).toEqual(["github-nightly", "github-nightly", "github-nightly"])
})
