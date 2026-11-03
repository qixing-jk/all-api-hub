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
    echo probe >> "$BROWSER_TEST_DIRECTORY/probes"
    if [ "$BROWSER_TEST_SCENARIO" = browser-crashed ]; then
      echo 'Browser process crashed unexpectedly' >&2
      exit 1
    fi
    if [ "$BROWSER_TEST_SCENARIO" != ready ] && [ ! -f "$BROWSER_TEST_DIRECTORY/apt-installed" ]; then
      if [ "$BROWSER_TEST_SCENARIO" = loader-missing ]; then
        echo 'chrome-headless-shell: error while loading shared libraries: libexample.so: cannot open shared object file' >&2
      else
        echo 'Host system is missing dependencies to run browsers.' >&2
      fi
      exit 1
    fi
    if [ "$BROWSER_TEST_SCENARIO" = still-broken ]; then
      echo 'Browser process crashed after installing libraries' >&2
      exit 1
    fi
    touch "$BROWSER_TEST_DIRECTORY/browser-started"
    ;;
  *) echo "Unexpected external command: $*" >&2; exit 2 ;;
esac
`

function install(context, scenario) {
  const directory = mkdtempSync(join(tmpdir(), "unit-browser-install-"))
  context.after(() => {
    assert.ok(directory.startsWith(join(tmpdir(), "unit-browser-install-")))
    rmSync(directory, { recursive: true, force: true })
  })
  const bin = join(directory, "bin")
  mkdirSync(bin)
  writeFileSync(join(bin, "pnpm"), pnpm, { mode: 0o755 })
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
        BROWSER_TEST_SCENARIO: scenario,
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
  }
}

test("a working headless browser avoids installing system packages", (context) => {
  const result = install(context, "ready")
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.started, true)
  assert.equal(result.installedDeps, false)
  assert.equal(result.probes, 1)
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
