import { execFileSync } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const workflow = readFileSync(".github/workflows/nightly-release.yml", "utf8")

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "aah-nightly-precheck-"))
  directories.push(directory)
  return directory
}

/** The guard step's actual shell, so the test exercises what CI runs. */
function guardScript() {
  const start = workflow.indexOf("- name: Compare with the published nightly")
  expect(start).toBeGreaterThan(-1)
  const block = workflow.slice(start, workflow.indexOf("- name:", start + 10))
  const lines = block.replace(/\r/g, "").split("\n")
  const bodyStart = lines.findIndex(
    (line) => line.trimEnd() === "        run: |",
  )
  expect(bodyStart).toBeGreaterThan(-1)
  const body: string[] = []
  for (const line of lines.slice(bodyStart + 1)) {
    // The script is the run of lines indented under it; a blank line inside the script
    // is fine, a dedent ends it.
    if (line.trim() !== "" && !line.startsWith("          ")) break
    body.push(line.slice(10))
  }
  expect(body.join("\n")).toContain("gh api")
  return body.join("\n")
}

const COMPLETE_ASSETS = [
  "all-api-hub-nightly-chrome.zip",
  "all-api-hub-nightly-firefox.zip",
  "all-api-hub-nightly-safari.zip",
  "all-api-hub-nightly-sources.zip",
].join("\n")

/**
 * Runs the guard with a stub `gh` that answers from a fixed publication state.
 * @param options Publication the stub reports and the workflow inputs it receives.
 * @param options.tagMode Published tag shape: a commit, an annotated tag, or absent.
 * @param options.assets Newline-delimited asset names on the nightly release.
 * @param options.target The commit the guard compares against.
 * @param options.published Commit the stub's tag points at; defaults to the target.
 * @param options.force Value of the workflow's force input.
 */
function runGuard({
  tagMode = "commit",
  assets = COMPLETE_ASSETS,
  target = "abc123",
  published = target,
  force = "false",
  body = "<!-- all-api-hub-release-extra:start -->",
  apiError = "",
}: {
  tagMode?: "commit" | "annotated" | "missing"
  assets?: string
  target?: string
  published?: string
  force?: string
  body?: string
  apiError?: string
} = {}) {
  const cwd = temporaryDirectory()
  const bin = path.join(cwd, "bin")
  mkdirSync(bin)
  const gh = path.join(bin, "gh")
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
args="$*"
if [ -n "\${API_ERROR}" ]; then echo "\${API_ERROR}" >&2; exit 1; fi
case "$args" in
  *"releases/tags/nightly"*)
    case "$args" in
      *".body"*) printf '%s\\n' "\${BODY}" ;;
      *) printf '%s\\n' "\${ASSETS}" ;;
    esac
    exit 0 ;;
esac
case "$args" in
  *"git/ref/tags/nightly"*)
    case "\${TAG_MODE}" in
      missing) echo "gh: Not Found (HTTP 404)" >&2; exit 1 ;;
      annotated)
        case "$args" in
          *".object.type"*) echo "tag" ;;
          *) echo "TAG_OBJECT_SHA" ;;
        esac
        ;;
      *) case "$args" in
           *".object.type"*) echo "commit" ;;
           *) echo "\${PUBLISHED_SHA}" ;;
         esac ;;
    esac
    exit 0
    ;;
  *"git/tags/TAG_OBJECT_SHA"*) echo "\${PUBLISHED_SHA}"; exit 0 ;;
esac
exit 1
`,
  )
  chmodSync(gh, 0o755)
  const output = path.join(cwd, "github-output")
  writeFileSync(output, "")
  execFileSync(
    process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash",
    ["-e", "-c", guardScript()],
    {
      env: {
        ...process.env,
        PATH: `${process.platform === "win32" ? bin.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`) : bin}:${process.env.PATH ?? ""}`,
        GH_TOKEN: "test-token",
        GH_REPO: "example/project",
        TAG_MODE: tagMode,
        ASSETS: assets,
        TARGET_SHA: target,
        PUBLISHED_SHA: published,
        FORCE: force,
        BODY: body,
        API_ERROR: apiError,
        GITHUB_OUTPUT: output,
      },
      stdio: "ignore",
    },
  )
  return readFileSync(output, "utf8")
}

describe("nightly rebuild guard", () => {
  it("fails closed on inconclusive API reads but rebuilds for HTTP 404", () => {
    expect(() =>
      runGuard({ apiError: "gh: server error (HTTP 503)" }),
    ).toThrow()
    expect(runGuard({ apiError: "gh: Not Found (HTTP 404)" })).toContain(
      "current=false",
    )
  })
  it("retries when usage notes are missing", () => {
    expect(runGuard({ body: "Rolling prerelease" })).toContain("current=false")
  })
  it("skips only when the published tag already names the target commit", () => {
    expect(runGuard({ tagMode: "commit" })).toContain("current=true")
    expect(runGuard({ tagMode: "annotated" })).toContain("current=true")
    expect(runGuard({ tagMode: "missing" })).toContain("current=false")
    expect(runGuard({ target: "def456", published: "abc123" })).toContain(
      "current=false",
    )
  })

  it("dereferences an annotated tag before comparing", () => {
    // The stub reports a tag object whose commit equals the target; a guard that
    // compared the tag object's own SHA would rebuild on every run.
    expect(runGuard({ tagMode: "annotated" })).toContain("current=true")
  })

  it("retries a release whose Safari assets never arrived", () => {
    // The Safari job can fail after the tag has moved; treating that as published
    // would leave the nightly release permanently missing a download.
    const withoutSafari = COMPLETE_ASSETS.split("\n")
      .filter((asset) => !asset.includes("safari"))
      .join("\n")
    expect(runGuard({ assets: withoutSafari })).toContain("current=false")
  })

  it("rebuilds on request", () => {
    expect(runGuard({ force: "true" })).toContain("current=false")
  })
})

describe("nightly release scheduling", () => {
  it("gates the build job so new steps cannot escape the guard", () => {
    const start = workflow.indexOf("  nightly:")
    const job = workflow.slice(
      start,
      workflow.indexOf("  safari-nightly-assets:"),
    )
    expect(job).toContain("needs: precheck")
    expect(job).toContain("if: ${{ needs.precheck.outputs.current != 'true' }}")
    // Running the guard as a step instead would leave every later step to opt in.
    expect(job).not.toContain("- name: Compare with the published nightly")
  })

  it("pins the build to the commit the guard compared", () => {
    expect(workflow).toContain("ref: ${{ needs.precheck.outputs.commit_sha }}")
    const start = workflow.indexOf("  nightly:")
    const job = workflow.slice(
      start,
      workflow.indexOf("  safari-nightly-assets:"),
    )
    expect(job).not.toContain("id: target")
  })

  it("publishes the tag last, so it marks a complete build", () => {
    const upload = workflow.indexOf("- name: Upload nightly assets")
    const moveTag = workflow.indexOf("- name: Move nightly tag")
    expect(upload).toBeGreaterThan(-1)
    expect(moveTag).toBeGreaterThan(upload)
    expect(moveTag).toBeGreaterThan(
      workflow.indexOf("- name: Upload Safari nightly assets"),
    )
    expect(moveTag).toBeGreaterThan(
      workflow.indexOf("- name: Refresh nightly release usage notes"),
    )
  })

  it("exposes a deliberate rebuild switch", () => {
    const start = workflow.indexOf("  workflow_dispatch:")
    const block = workflow.slice(start, workflow.indexOf("concurrency:"))
    expect(block).toContain("force:")
    expect(block).toContain("type: boolean")
  })

  it("keeps one producer for the rolling release", () => {
    const start = workflow.indexOf("concurrency:")
    const block = workflow.slice(start, workflow.indexOf("permissions:"))
    // Per-event groups would let two builds clobber the same fixed asset names.
    expect(block).not.toContain("github.event_name")
  })
})
