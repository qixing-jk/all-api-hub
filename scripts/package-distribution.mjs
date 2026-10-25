import { execFileSync } from "node:child_process"
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { DISTRIBUTION_CHANNEL } from "../src/utils/core/distributionChannel.ts"
import {
  buildCrxUpdateManifest,
  CRX_ENV_VARS,
  deriveCrxExtensionId,
  getCrxAssetName,
  getCrxCodebaseUrl,
  getCrxSelfUpdateUrl,
  getCrxUpdateManifestAssetName,
  hasCrxPrivateKey,
  packCrx3,
  readCrxPrivateKey,
} from "./crx-self-update.mjs"

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
      // The unpacked ZIP must stay installable on stock browsers, so it never
      // carries `update_url`; the self-hosted CRX is a separate artifact.
      selfUpdate: false,
    })),
    {
      browser: "chrome",
      channel,
      store: false,
      selfUpdate: true,
      artifact: "crx",
      // Only the Chromium GitHub builds can self-update; Firefox needs an
      // AMO-signed XPI and Safari has no self-hosted update mechanism.
      outputDirectory: `.output/distribution/${channel}/chrome-crx`,
    },
    ...(stores
      ? [
          {
            browser: "chrome",
            channel: DISTRIBUTION_CHANNEL.ChromeWebStore,
            store: true,
            selfUpdate: false,
          },
          {
            browser: "edge",
            channel: DISTRIBUTION_CHANNEL.EdgeAddons,
            store: true,
            selfUpdate: false,
          },
          {
            browser: "firefox",
            channel: DISTRIBUTION_CHANNEL.FirefoxAmo,
            store: true,
            selfUpdate: false,
          },
        ]
      : []),
  ].map((item) => ({
    ...item,
    outputDirectory:
      item.outputDirectory ??
      `.output/distribution/${item.channel}/${item.browser}`,
  }))
}

/**
 * Report why the CRX pair cannot be produced, or null when it can.
 *
 * Signing is optional so a release still publishes its normal archives before
 * the key secret exists; `AAH_REQUIRE_CRX_SELF_UPDATE` turns the skip into a
 * failure once the channel is expected to serve self-hosted updates.
 */
export function getSelfUpdateSkipReason({ hasPrivateKey }) {
  if (hasPrivateKey) return null

  return "No CRX signing key configured; skipping the self-hosted CRX artifacts"
}

/** Fail a release that is expected to publish a self-update artifact. */
export function assertSelfUpdateSigningAvailable({
  hasPrivateKey,
  requireSigning,
}) {
  const skipReason = getSelfUpdateSkipReason({ hasPrivateKey })
  if (skipReason && requireSigning) {
    throw new Error(
      `A CRX signing key is required: set ${CRX_ENV_VARS.PrivateKeyBase64} or ${CRX_ENV_VARS.PrivateKeyPath}`,
    )
  }

  return skipReason
}

/** Whether this run must produce the self-update pair or fail. */
function isCrxSelfUpdateRequired() {
  const value = process.env[CRX_ENV_VARS.RequireCrxSelfUpdate]
    ?.trim()
    .toLowerCase()
  return value === "1" || value === "true"
}

/** Builds and validates the exact ZIP handed to each publisher. Requires unzip in CI. */
async function packageDistributions() {
  const channel =
    process.env.AAH_DISTRIBUTION_CHANNEL || DISTRIBUTION_CHANNEL.GithubRelease
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim()
  const plan = createDistributionBuildPlan(
    channel,
    process.argv.includes("--stores"),
  )
  const hasPrivateKey = hasCrxPrivateKey(process.env)
  const skipReason = assertSelfUpdateSigningAvailable({
    hasPrivateKey,
    requireSigning: isCrxSelfUpdateRequired(),
  })
  if (skipReason) console.warn(`::warning::${skipReason}`)
  const privateKeyPem = hasPrivateKey ? await readCrxPrivateKey() : null
  // Freeze the timestamp across all WXT manifest evaluations in this run.
  const buildTime = new Date().toISOString()

  for (const item of plan) {
    const outputRoot = path.resolve(".output/distribution")
    const outputDirectory = path.resolve(item.outputDirectory)
    if (!outputDirectory.startsWith(`${outputRoot}${path.sep}`))
      throw new Error(
        `Unsafe distribution output directory: ${outputDirectory}`,
      )
    rmSync(outputDirectory, { recursive: true, force: true })
    const selfUpdateUrl =
      item.selfUpdate && !skipReason
        ? getCrxSelfUpdateUrl(item.channel)
        : undefined
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
          [CRX_ENV_VARS.SelfUpdateUrl]: selfUpdateUrl ?? "",
          [CRX_ENV_VARS.BuildTime]: buildTime,
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
        if (item.selfUpdate) {
          if (isSources || skipReason) continue
          packageSelfUpdateArtifacts({
            channel: item.channel,
            sourceZip: source,
            target,
            privateKeyPem,
          })
          continue
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
      } else if (
        !item.store &&
        !item.selfUpdate &&
        name.startsWith(`${item.browser}-mv`)
      ) {
        cpSync(source, path.join(target, name), { recursive: true })
      }
    }
  }
}

/**
 * Sign the self-update build and publish the matching Chromium update manifest.
 *
 * The CRX must be signed with the same key as every previous release, or
 * installed copies keep their old version; the manifest's `version` must match
 * the CRX manifest exactly, so both are read from the same archive.
 */
function packageSelfUpdateArtifacts({
  channel,
  sourceZip,
  target,
  privateKeyPem,
}) {
  const manifestJson = JSON.parse(
    execFileSync("unzip", ["-p", sourceZip, "manifest.json"], {
      encoding: "utf8",
    }),
  )

  writeFileSync(
    path.join(target, getCrxAssetName(channel)),
    packCrx3({
      zipBuffer: readFileSync(sourceZip),
      privateKeyPem,
    }),
  )
  writeFileSync(
    path.join(target, getCrxUpdateManifestAssetName(channel)),
    buildCrxUpdateManifest({
      extensionId: deriveCrxExtensionId(privateKeyPem),
      version: manifestJson.version,
      codebase: getCrxCodebaseUrl(channel),
    }),
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await packageDistributions()
