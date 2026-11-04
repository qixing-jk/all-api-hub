import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { bashPath, workflowCommand } from "./workflowCommand.mjs"

// Model the external package manager and browser process, including absent libraries.
const pnpm = `#!/usr/bin/env bash
set -e
case "$1 $2 $3" in
  "exec playwright install")
    if [[ " $* " == *" --with-deps "* ]]; then
      touch "$BROWSER_TEST_DIRECTORY/apt-installed"
    fi
    if [ "$BROWSER_TEST_SCENARIO" = download-failed ]; then
      echo 'Browser download failed' >&2
      exit 16
    fi
    touch "$BROWSER_TEST_DIRECTORY/browser-installed"
    if [[ " $* " != *" --only-shell "* ]]; then
      touch "$BROWSER_TEST_DIRECTORY/headed-installed"
    fi
    ;;
  "exec playwright install-deps")
    if [ "$BROWSER_TEST_SCENARIO" = apt-failed ]; then
      echo 'System dependency install failed' >&2
      exit 7
    fi
    touch "$BROWSER_TEST_DIRECTORY/apt-installed"
    ;;
  "exec node --input-type=module")
    shift 2
    "$BROWSER_TEST_NODE" "$@"
    ;;
  *) echo "Unexpected external command: $*" >&2; exit 2 ;;
esac
`

const playwright = `import { appendFileSync, existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
const directory = process.env.BROWSER_TEST_NODE_DIRECTORY
export const chromium = {
  async launch(options) {
    appendFileSync(join(directory, "probes"), JSON.stringify(options.channel ?? null) + "\\n")
    const scenario = process.env.BROWSER_TEST_SCENARIO
    if (scenario === "browser-crashed") throw new Error("Browser process crashed unexpectedly")
    // Model a launch that completes after 20 seconds, within Playwright's default budget.
    if (scenario === "slow-browser" && (options.timeout ?? 180000) < 20000) {
      throw new Error("browserType.launch: Timeout exceeded before the browser became ready")
    }
    if (scenario === "launch-timeout") throw new Error("browserType.launch: Timeout exceeded")
    const missing = scenario === "full-chromium-missing" ? options.channel === "chromium" : !["ready", "slow-browser"].includes(scenario)
    if (missing && !existsSync(join(directory, "apt-installed"))) {
      throw new Error(scenario === "loader-missing"
        ? "chrome-headless-shell: error while loading shared libraries: libexample.so: cannot open shared object file"
        : "Host system is missing dependencies to run browsers.")
    }
    if (scenario === "still-broken") throw new Error("Browser process crashed after installing libraries")
    writeFileSync(join(directory, "browser-started"), "")
    return { async close() {} }
  },
}
`

function install(context, scenario, channel = "") {
  const directory = mkdtempSync(join(tmpdir(), "unit-browser-install-"))
  context.after(() => {
    assert.ok(directory.startsWith(join(tmpdir(), "unit-browser-install-")))
    rmSync(directory, { recursive: true, force: true })
  })
  const bin = join(directory, "bin")
  mkdirSync(bin)
  writeFileSync(join(bin, "pnpm"), pnpm, { mode: 0o755 })
  const module = join(directory, "node_modules", "@playwright", "test")
  mkdirSync(module, { recursive: true })
  writeFileSync(
    join(module, "package.json"),
    JSON.stringify({ type: "module", exports: "./index.js" }),
  )
  writeFileSync(join(module, "index.js"), playwright)
  const setup =
    process.platform === "win32"
      ? 'export BROWSER_TEST_BIN="$(cygpath -u "$BROWSER_TEST_BIN")"\nexport BROWSER_TEST_DIRECTORY="$(cygpath -u "$BROWSER_TEST_DIRECTORY")"\nexport RUNNER_TEMP="$(cygpath -u "$RUNNER_TEMP")"\n'
      : ""
  const command =
    setup +
    'export PATH="$BROWSER_TEST_BIN:$PATH"\n' +
    workflowCommand(
      "actions/setup-unit-test-browser/action.yml",
      "Install Chromium for browser-backed unit tests",
    )
  const result = spawnSync(
    bashPath(),
    ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", command],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        BROWSER_TEST_BIN: bin.replaceAll("\\", "/"),
        RUNNER_TEMP: directory.replaceAll("\\", "/"),
        BROWSER_TEST_DIRECTORY: directory.replaceAll("\\", "/"),
        BROWSER_TEST_NODE_DIRECTORY: directory.replaceAll("\\", "/"),
        BROWSER_TEST_NODE: process.execPath.replaceAll("\\", "/"),
        BROWSER_TEST_SCENARIO: scenario,
        PLAYWRIGHT_CHROMIUM_CHANNEL: channel,
      },
    },
  )
  const probes = join(directory, "probes")
  return {
    ...result,
    started: existsSync(join(directory, "browser-started")),
    installedDeps: existsSync(join(directory, "apt-installed")),
    headedAvailable: existsSync(join(directory, "headed-installed")),
    probes: existsSync(probes)
      ? readFileSync(probes, "utf8").trim().split("\n").length
      : 0,
    channels: existsSync(probes)
      ? readFileSync(probes, "utf8").trim().split("\n").map(JSON.parse)
      : [],
  }
}

test("a working headless browser avoids installing system packages", (context) => {
  const result = install(context, "ready")
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.started, true)
  assert.equal(result.installedDeps, false)
  assert.equal(result.probes, 1)
  assert.deepEqual(result.channels, [null])
})

test("E2E preparation probes the full Chromium channel used by extension fixtures", (context) => {
  const result = install(context, "ready", "chromium")
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.deepEqual(result.channels, ["chromium"])
  assert.equal(result.installedDeps, false)
})

test("a slow browser within the normal launch budget does not fail preparation", (context) => {
  const result = install(context, "slow-browser", "chromium")
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.started, true)
  assert.equal(result.installedDeps, false)
  assert.equal(result.probes, 1)
})

test("an expired launch budget still fails without invoking apt", (context) => {
  const result = install(context, "launch-timeout")
  assert.equal(result.status, 1)
  assert.equal(result.installedDeps, false)
  assert.equal(result.started, false)
  assert.equal(result.probes, 1)
})

test("missing full Chromium libraries are repaired even when the headless shell works", (context) => {
  const result = install(context, "full-chromium-missing", "chromium")
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.installedDeps, true)
  assert.deepEqual(result.channels, ["chromium", "chromium"])
})

test("the shared E2E browser cache also retains headed Chromium", (context) => {
  const result = install(context, "ready")
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.headedAvailable, true)
})

for (const scenario of ["missing-libraries", "loader-missing"]) {
  test(`${scenario} is repaired before a second successful launch`, (context) => {
    const result = install(context, scenario)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(result.started, true)
    assert.equal(result.installedDeps, true)
    assert.equal(result.probes, 2)
  })
}

test("unrelated launch errors fail without invoking apt", (context) => {
  const result = install(context, "browser-crashed")
  assert.equal(result.status, 1)
  assert.equal(result.installedDeps, false)
  assert.match(result.stdout + result.stderr, /Browser process crashed/)
})

test("a failed browser download stops before any launch or apt fallback", (context) => {
  const result = install(context, "download-failed")
  assert.equal(result.status, 16)
  assert.equal(result.installedDeps, false)
  assert.equal(result.probes, 0)
})

test("failed system installation keeps its failure status", (context) => {
  const result = install(context, "apt-failed")
  assert.equal(result.status, 7)
  assert.equal(result.started, false)
})

test("a browser that still cannot launch after installing libraries fails", (context) => {
  const result = install(context, "still-broken")
  assert.equal(result.status, 1)
  assert.equal(result.installedDeps, true)
  assert.equal(result.started, false)
  assert.equal(result.probes, 2)
})
