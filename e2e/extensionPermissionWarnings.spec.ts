import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { chromium, expect, test } from "@playwright/test"

import { readE2eBuildVariant } from "./utils/e2eBuildVariants"
import { buildExtensionLaunchOptions } from "./utils/extensionLaunch"

/** Restrict recursive cleanup to the temporary fixture created by this test. */
async function removeFixture(directory: string) {
  if (
    !path
      .resolve(directory)
      .startsWith(path.join(os.tmpdir(), "aah-permission-warnings-"))
  )
    throw new Error("Unexpected fixture cleanup path")
  await fs.rm(directory, { recursive: true, force: true })
}

test("the current manifest adds no browser permission warnings to the approved baseline", async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe("chromium")
  expect(
    readE2eBuildVariant(),
    "Compare production permissions, without test-only required permissions",
  ).toBe("default")
  const baseline = JSON.parse(
    await fs.readFile("e2e/fixtures/permission-warnings-baseline.json", "utf8"),
  )
  const candidate = JSON.parse(
    await fs.readFile(".output/chrome-mv3-test/manifest.json", "utf8"),
  )
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "aah-permission-warnings-"),
  )
  let context:
    | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
    | undefined
  try {
    await fs.writeFile(
      path.join(directory, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Permission warning inspector",
        version: "1.0.0",
        background: { service_worker: "worker.js" },
      }),
    )
    await fs.writeFile(
      path.join(directory, "worker.js"),
      "chrome.runtime.onInstalled.addListener(() => {})",
    )
    context = await chromium.launchPersistentContext(
      "",
      buildExtensionLaunchOptions({
        extensionDir: directory,
        headless: true,
        chromeExecutablePath: process.env.AAH_E2E_CHROME_EXECUTABLE_PATH,
      }),
    )
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"))
    const warnings = await worker.evaluate(
      async ({ baseline, candidate }) => {
        const inspect = (manifest: Record<string, unknown>) =>
          new Promise<string[]>((resolve, reject) => {
            const copy: Record<string, unknown> = {
              ...manifest,
              name: "Permission warning probe",
              description: "Permission warning probe",
            }
            delete copy.default_locale
            chrome.management.getPermissionWarningsByManifest(
              JSON.stringify(copy),
              (warnings) => {
                const error = chrome.runtime.lastError
                if (error) reject(new Error(error.message))
                else resolve(warnings)
              },
            )
          })
        // The inspector is unpacked, but this API computes the supplied manifest's
        // native warnings; it does not infer them from the inspector's install mode.
        const control = {
          ...baseline,
          permissions: [...baseline.permissions, "notifications"],
          optional_permissions: baseline.optional_permissions.filter(
            (p: string) => p !== "notifications",
          ),
        }
        return {
          baseline: await inspect(baseline),
          candidate: await inspect(candidate),
          control: await inspect(control),
        }
      },
      { baseline, candidate },
    )
    const added = (values: string[]) =>
      values.filter((warning) => !warnings.baseline.includes(warning))
    await testInfo.attach("native-permission-warnings", {
      body: JSON.stringify(
        {
          browser: context.browser()!.version(),
          baseline,
          candidate,
          warnings,
          added: added(warnings.candidate),
        },
        null,
        2,
      ),
      contentType: "application/json",
    })
    expect(
      warnings.baseline.length,
      "The real browser must recognize the existing host access warning",
    ).toBeGreaterThan(0)
    expect(
      added(warnings.control).length,
      "Promoting ungranted optional notifications must produce a warning",
    ).toBeGreaterThan(0)
    expect(
      added(warnings.candidate),
      "New permission warnings require explicit review; do not auto-update the baseline",
    ).toEqual([])
  } finally {
    await context?.close()
    await removeFixture(directory)
  }
})
