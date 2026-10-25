import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, it } from "vitest"

const bash =
  process.platform === "win32"
    ? path.resolve(
        execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim(),
        "../../../bin/bash.exe",
      )
    : "bash"

/** Exercise the actual workflow shell, replacing only GitHub inputs and uploads. */
function readStep(file: string, name: string): string {
  const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n")
  const step = source.split(`- name: ${name}\n`)[1]?.split(/\n {6}- name:/)[0]
  const body = step?.split("run: |\n")[1]
  const indent = body?.match(/^ +/)?.[0]
  const script =
    indent && body?.match(new RegExp(`^(?:${indent}.*(?:\\n|$)|\\n)+`))?.[0]
  if (!script) throw new Error(`Missing shell step: ${name}`)
  return script
    .replace(new RegExp(`^${indent}`, "gm"), "")
    .replace(/\$\{\{.*?\}\}/g, ".")
}

it.each([false, true])(
  "collects only existing self-update artifacts (signed: %s)",
  (signed) => {
    const fixture = mkdtempSync(path.join(tmpdir(), "aah-crx-assets-"))
    if (path.dirname(fixture) !== path.resolve(tmpdir()))
      throw new Error("Unexpected fixture directory")
    try {
      mkdirSync(path.join(fixture, ".output"))
      writeFileSync(path.join(fixture, "package.json"), '{"version":"4.6.0"}')
      for (const name of [
        "test-chrome.zip",
        "test-firefox.zip",
        "test-sources.zip",
        ...(signed ? ["test.crx", "updates.xml"] : []),
      ]) {
        writeFileSync(path.join(fixture, ".output", name), "fixture")
      }
      execFileSync(
        bash,
        [
          "-e",
          "-c",
          readStep(
            ".github/actions/package-extension/action.yml",
            "Collect artifact metadata",
          ),
        ],
        {
          cwd: fixture,
          env: { ...process.env, GITHUB_OUTPUT: "outputs.txt" },
        },
      )
      const output = readFileSync(path.join(fixture, "outputs.txt"), "utf8")
      const assets = output
        .split("crx_files<<EOF\n")[1]
        ?.split("EOF")[0]
        ?.trim()
      expect(assets).toBe(signed ? "test.crx\nupdates.xml" : "")
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  },
)

it.each(
  (
    [
      [
        ".github/workflows/build-and-publish.yml",
        "Upload release artifacts",
        ".output",
      ],
      [
        ".github/workflows/nightly-release.yml",
        "Upload nightly assets",
        "source/.output/nightly",
      ],
    ] as const
  ).flatMap(([file, name, directory]) =>
    [false, true].map((signed) => [file, name, directory, signed] as const),
  ),
)(
  "uploads only existing assets in %s (step: %s, directory: %s, signed: %s)",
  (file, name, outputDirectory, signed) => {
    const fixture = mkdtempSync(path.join(tmpdir(), "aah-crx-upload-"))
    if (path.dirname(fixture) !== path.resolve(tmpdir()))
      throw new Error("Unexpected fixture directory")
    try {
      mkdirSync(path.join(fixture, outputDirectory), { recursive: true })
      writeFileSync(path.join(fixture, outputDirectory, "test.zip"), "fixture")
      if (signed) {
        writeFileSync(
          path.join(fixture, outputDirectory, "test.crx"),
          "fixture",
        )
        writeFileSync(
          path.join(fixture, outputDirectory, "updates.xml"),
          "fixture",
        )
      }
      // Stub the remote upload boundary and reject any nonexistent local asset.
      const validate =
        'for asset in "$@"; do case "$asset" in *.zip|*.crx|*.xml) test -f "$asset" || exit 1;; esac; done; printf "%s\\n" "$@"'
      mkdirSync(path.join(fixture, "workflow-tools/scripts"), {
        recursive: true,
      })
      writeFileSync(
        path.join(
          fixture,
          "workflow-tools/scripts/upload-release-assets-if-missing.sh",
        ),
        validate,
      )
      const output = execFileSync(
        bash,
        ["-e", "-c", `gh() { ${validate}; };\n${readStep(file, name)}`],
        { cwd: fixture, encoding: "utf8" },
      )
      expect(output).toContain("test.zip")
      expect(output.includes("updates.xml")).toBe(signed)
      expect(output.includes("test.crx")).toBe(signed)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  },
)
