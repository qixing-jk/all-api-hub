import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { DISTRIBUTION_CHANNEL } from "../src/utils/core/distributionChannel.ts"

/** One build per publication target; stores never reuse release artifacts. */
export function createDistributionBuildPlan(channel, stores) {
  if (
    ![
      DISTRIBUTION_CHANNEL.GithubRelease,
      DISTRIBUTION_CHANNEL.GithubNightly,
    ].includes(channel)
  )
    throw new Error("Invalid release channel")
  if (stores && channel !== DISTRIBUTION_CHANNEL.GithubRelease)
    throw new Error("Nightly cannot publish to stores")
  return [
    ...["chrome", "firefox", "safari"].map((browser) => ({
      browser,
      channel,
      store: false,
    })),
    ...(stores
      ? [
          {
            browser: "chrome",
            channel: DISTRIBUTION_CHANNEL.ChromeWebStore,
            store: true,
          },
          {
            browser: "edge",
            channel: DISTRIBUTION_CHANNEL.EdgeAddons,
            store: true,
          },
          {
            browser: "firefox",
            channel: DISTRIBUTION_CHANNEL.FirefoxAmo,
            store: true,
          },
        ]
      : []),
  ].map((item) => ({
    ...item,
    outputDirectory: `.output/distribution/${item.channel}/${item.browser}`,
  }))
}

/** Builds and validates the exact ZIP handed to each publisher. Requires unzip in CI. */
function packageDistributions() {
  const channel =
    process.env.AAH_DISTRIBUTION_CHANNEL || DISTRIBUTION_CHANNEL.GithubRelease
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim()
  for (const item of createDistributionBuildPlan(
    channel,
    process.argv.includes("--stores"),
  )) {
    const outputRoot = path.resolve(".output/distribution")
    const outputDirectory = path.resolve(item.outputDirectory)
    if (!outputDirectory.startsWith(`${outputRoot}${path.sep}`))
      throw new Error(
        `Unsafe distribution output directory: ${outputDirectory}`,
      )
    rmSync(outputDirectory, { recursive: true, force: true })
    execFileSync(
      process.execPath,
      ["node_modules/wxt/bin/wxt.mjs", "zip", "-b", item.browser],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          AAH_DISTRIBUTION_CHANNEL: item.channel,
          AAH_DISTRIBUTION_OUT_DIR: item.outputDirectory,
          AAH_BUILD_REVISION: revision,
        },
      },
    )
    const target = item.store ? ".output/stores" : ".output"
    mkdirSync(target, { recursive: true })
    for (const name of readdirSync(item.outputDirectory)) {
      const source = path.join(item.outputDirectory, name)
      if (name.endsWith(".zip")) {
        const isSources = name.includes("sources")
        if (!isSources) {
          const metadata = JSON.parse(
            execFileSync("unzip", ["-p", source, "distribution.json"], {
              encoding: "utf8",
            }),
          )
          if (
            metadata.channel !== item.channel ||
            metadata.browser !== item.browser
          )
            throw new Error(`Wrong channel in ${source}`)
        }
        cpSync(
          source,
          path.join(
            target,
            item.store
              ? `${item.channel}${isSources ? "-sources" : ""}.zip`
              : name,
          ),
        )
      } else if (!item.store && name.startsWith(`${item.browser}-mv`)) {
        cpSync(source, path.join(target, name), { recursive: true })
      }
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  packageDistributions()
