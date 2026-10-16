import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, it } from "vitest"

import { DISTRIBUTION_CHANNEL } from "~/utils/core/distributionChannel"
import { createDistributionBuildPlan } from "~~/scripts/package-distribution.mjs"

it("publishes only current archives when a target contains an older build", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "aah-packaging-"))
  // Validate the absolute task-owned directory before recursive cleanup.
  if (path.dirname(fixture) !== path.resolve(tmpdir()))
    throw new Error("Unexpected fixture directory")
  const script = path.resolve("scripts/package-distribution.mjs")
  const gitDirectory = execFileSync(
    "git",
    ["rev-parse", "--absolute-git-dir"],
    { encoding: "utf8" },
  ).trim()
  try {
    const plan = createDistributionBuildPlan(
      DISTRIBUTION_CHANNEL.GithubRelease,
      false,
    )
    for (const target of plan) {
      const directory = path.join(fixture, target.outputDirectory)
      mkdirSync(directory, { recursive: true })
      writeFileSync(path.join(directory, "old-sources.zip"), "old")
    }
    const wxtDirectory = path.join(fixture, "node_modules/wxt/bin")
    mkdirSync(wxtDirectory, { recursive: true })
    writeFileSync(
      path.join(wxtDirectory, "wxt.mjs"),
      `
      import { mkdirSync, writeFileSync } from "node:fs"
      import path from "node:path"
      const directory = process.env.AAH_DISTRIBUTION_OUT_DIR
      mkdirSync(directory, { recursive: true })
      writeFileSync(path.join(directory, process.argv.at(-1) + "-current-sources.zip"), "current")
    `,
    )
    execFileSync(process.execPath, [script], {
      cwd: fixture,
      env: {
        ...process.env,
        GIT_DIR: gitDirectory,
        AAH_DISTRIBUTION_CHANNEL: DISTRIBUTION_CHANNEL.GithubRelease,
      },
      stdio: "pipe",
    })
    expect(
      readdirSync(path.join(fixture, ".output"))
        .filter((name) => name.endsWith(".zip"))
        .sort(),
    ).toEqual([
      "chrome-current-sources.zip",
      "firefox-current-sources.zip",
      "safari-current-sources.zip",
    ])
    expect(existsSync(path.join(fixture, ".output/old-sources.zip"))).toBe(
      false,
    )
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

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
