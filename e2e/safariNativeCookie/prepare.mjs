import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

/** Copy the release build before adding validation-only instrumentation. */
export function prepareInstrumentedExtension({
  source,
  output,
  probe,
  appName,
}) {
  fs.cpSync(source, output, { recursive: true })
  fs.copyFileSync(probe, path.join(output, "native-probe.js"))
  const manifestPath = path.join(output, "manifest.json")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  assert(manifest.permissions.includes("nativeMessaging"))
  assert(Array.isArray(manifest.background.scripts))
  manifest.name = appName
  manifest.background.scripts.push("native-probe.js")
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  const optionsPath = path.join(output, "options.html")
  const options = fs.readFileSync(optionsPath, "utf8")
  assert(options.includes("</body>"))
  fs.writeFileSync(
    optionsPath,
    options.replace(
      "</body>",
      '<script src="native-probe.js"></script></body>',
    ),
  )
}

function main() {
  assert.equal(
    process.platform,
    "darwin",
    "Native Safari preparation requires this Mac",
  )
  assert(
    fs.existsSync("safari/native/SafariWebExtensionHandler.swift"),
    "Run from the repository root",
  )
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "")
  const runRoot = path.resolve(".scratch/safari-native-cookie/runs", stamp)
  const appName = `All API Hub Native Cookie Trial ${stamp}`
  const bundleId = `io.github.qixingjk.allapihub.nativeCookieTrial.run${stamp}`
  const env = { ...process.env }
  const run = (command, args, extraEnv = {}) => {
    const result = spawnSync(command, args, {
      env: { ...env, ...extraEnv },
      stdio: "inherit",
    })
    if (result.error) throw result.error
    assert.equal(result.status, 0, `${command} failed`)
  }
  run("pnpm", ["run", "build:safari"])
  run("pnpm", [
    "exec",
    "vite",
    "build",
    "--config",
    "e2e/safariNativeCookie/probe.config.ts",
  ])
  const output = path.join(runRoot, "extension")
  prepareInstrumentedExtension({
    source: path.resolve(".output/safari-mv2"),
    output,
    probe: ".scratch/safari-native-cookie/bundle/native-probe.js",
    appName,
  })
  const projectRoot = path.join(runRoot, "project")
  run("bash", ["scripts/prepare-safari-native-cookie-experiment.sh"], {
    SAFARI_EXTENSION_DIR: output,
    SAFARI_PROJECT_DIR: projectRoot,
    SAFARI_APP_NAME: appName,
    SAFARI_BUNDLE_IDENTIFIER: bundleId,
  })
  fs.writeFileSync(
    path.join(runRoot, "identity.json"),
    JSON.stringify({ appName, bundleId, projectRoot }, null, 2),
  )
  console.log(`Prepared independent trial: ${runRoot}`)
  console.log(
    "Build the listed scheme and enable only this trial in Safari; see e2e/safariNativeCookie/README.md.",
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
}
