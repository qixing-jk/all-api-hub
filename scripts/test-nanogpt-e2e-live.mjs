import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { runScenarioWithCleanup } from "../e2e/utils/scenarioErrors.ts"
import { NANOGPT_MANAGEMENT_TOKEN_PREFIX } from "../src/services/apiService/nanogpt/constants.ts"
import { connectWorktreeExtension, defaultCdpUrl } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runLiveSuites } from "./cdp/live-suites.mjs"
import { runNanoGptProbe } from "./suites/nanogpt/probe.mjs"
import {
  runNanoGptCatalog,
  runNanoGptCurrentTabDetection,
  runNanoGptDetection,
  runNanoGptOnboarding,
} from "./suites/nanogpt/ui.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

/** No remote writes, credential issuance or paid inference. Local saved accounts are owned and cleaned. */
export function parseArgs(args, env = process.env) {
  applyIsolateFlag(args)
  const value = (name, fallback) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ??
    fallback
  const suite = value("suite", "all")
  if (
    ![
      "all",
      "probe",
      "catalog",
      "detection",
      "onboarding",
      "current-tab",
    ].includes(suite)
  )
    throw new Error(
      "Invalid suite; use all, probe, catalog, detection, onboarding or current-tab",
    )
  const apiKey = env.NANOGPT_API_KEY?.trim() || ""
  if (apiKey.startsWith(NANOGPT_MANAGEMENT_TOKEN_PREFIX))
    throw new Error(
      "NanoGPT requires an inference API key, not a management token",
    )
  return {
    suite,
    apiKey,
    apiKeyFile: env.NANOGPT_API_KEY_FILE,
    expectedUserId: env.NANOGPT_USER_ID,
    cdpUrl: value("cdp", env.CDP_URL || defaultCdpUrl()),
    extensionPath: path.resolve(
      value("extension-path", ".output/chrome-mv3-dev"),
    ),
    evidenceDir: path.resolve(
      env.NANOGPT_EVIDENCE_DIR ||
        `.scratch/nanogpt-adaptation/evidence/cdp-${Date.now()}`,
    ),
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  if (!options.apiKey && options.apiKeyFile)
    options.apiKey = (await fs.readFile(options.apiKeyFile, "utf8")).trim()
  if (options.apiKey.startsWith(NANOGPT_MANAGEMENT_TOKEN_PREFIX))
    throw new Error(
      "NanoGPT requires an inference API key, not a management token",
    )
  await fs.mkdir(options.evidenceDir, { recursive: true })
  const sanitizeError = (error) => {
    let message = error instanceof Error ? error.message : String(error)
    const secrets = [options.cdpUrl, options.apiKey]
    try {
      const endpoint = new URL(options.cdpUrl)
      secrets.push(
        endpoint.href,
        endpoint.search,
        endpoint.username,
        endpoint.password,
      )
      for (const component of [endpoint.username, endpoint.password]) {
        try {
          secrets.push(decodeURIComponent(component))
        } catch {
          /* Keep encoded values. */
        }
      }
    } catch {
      /* Exact input redaction still works for invalid URLs. */
    }
    for (const secret of secrets
      .filter(Boolean)
      .sort((a, b) => b.length - a.length))
      message = message.replaceAll(secret, "[REDACTED]")
    return new Error(message)
  }
  let dev
  const environment = {
    targetUrl: "https://nano-gpt.com",
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: !!execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim(),
    extensionPath: options.extensionPath,
    // Do not persist a CDP endpoint or callback payload: either may contain credentials.
  }
  const runners = {
    probe: runNanoGptProbe,
    catalog: runNanoGptCatalog,
    detection: runNanoGptDetection,
    onboarding: runNanoGptOnboarding,
    "current-tab": runNanoGptCurrentTabDetection,
  }
  return runScenarioWithCleanup({
    run: () =>
      runLiveSuites({
        suite: options.suite,
        evidenceDir: options.evidenceDir,
        environment,
        suites: Object.entries(runners).map(([id, run]) => ({
          id,
          covers: [`nanogpt.${id}`],
          run: async () => {
            try {
              if (id !== "probe" && !dev)
                dev = await connectWorktreeExtension(options)
              if (dev) environment.extensionId = dev.extensionId
              return await run({ ...options, ...dev })
            } catch (error) {
              // Connection/assertion errors can contain raw endpoint/key values.
              throw sanitizeError(error)
            }
          },
        })),
      }),
    finalizers: [
      async () => {
        try {
          if (dev) await dev.close()
        } catch (error) {
          throw sanitizeError(error)
        }
      },
    ],
    cleanupMessage: "NanoGPT browser detach failed",
    failureMessage: "NanoGPT scenarios and cleanup failed",
  })
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes("--help")) {
    console.log(`NanoGPT live acceptance (read-only upstream):
  pnpm e2e:cdp:nanogpt -- --isolate --suite=all
  --suite=all|probe|catalog|detection|onboarding|current-tab
  --extension-path=<absolute build path> --cdp=<endpoint>
  NANOGPT_API_KEY / NANOGPT_API_KEY_FILE: existing inference key (never issued by this runner)
  NANOGPT_USER_ID: optional expected console UUID; NANOGPT_EVIDENCE_DIR: private local evidence
  all includes EVERY suite; missing session/key is incomplete and exits nonzero.
  catalog uses a clearly labelled local fixture and the real public endpoint.
  detection tests the actual empty-key guidance; onboarding keeps that same draft through save/reopen/refresh.
  current-tab checks popup detection before/after extension reload and webpage refresh.
  No key creation, invitation creation, redemption, or inference. Owned local accounts are removed.`)
  } else {
    await loadLocalEnv()
    main().catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
  }
}
