import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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

it.each([
  ["all-api-hub-chrome.crx", false, true],
  ["updates.xml", false, true],
  ["", true, true],
  ["all-api-hub-chrome.crx\nupdates.xml", true, true],
  ["updates.xml", true, false],
] as const)(
  "preserves complete CRX pairs (existing: %s, allowed: %s, pair supplied: %s)",
  (existing, allowed, includePair) => {
    const fixture = mkdtempSync(path.join(tmpdir(), "aah-release-pair-"))
    if (path.dirname(fixture) !== path.resolve(tmpdir()))
      throw new Error("Unexpected fixture directory")
    try {
      for (const name of [
        "test.zip",
        "all-api-hub-chrome.crx",
        "updates.xml",
      ]) {
        writeFileSync(path.join(fixture, name), "fixture")
      }
      const script = readFileSync(
        "scripts/upload-release-assets-if-missing.sh",
        "utf8",
      )
      writeFileSync(path.join(fixture, "upload.sh"), script)
      const run = () =>
        execFileSync(
          bash,
          [
            "-e",
            "-c",
            `
        gh() {
          if [ "$2" = view ]; then printf '%s\\n' "$TEST_EXISTING";
          else printf '%s\\n' "$*" >> uploaded.txt; fi
        }
        export -f gh
        bash upload.sh v4.6.0 test.zip ${includePair ? "all-api-hub-chrome.crx updates.xml" : ""}
      `,
          ],
          {
            cwd: fixture,
            env: {
              ...process.env,
              GH_REPO: "fixture/repo",
              TEST_EXISTING: existing,
            },
            stdio: "pipe",
          },
        )
      if (allowed) {
        expect(run).not.toThrow()
        const uploads = readFileSync(path.join(fixture, "uploaded.txt"), "utf8")
        expect(uploads).toContain("test.zip")
        expect(uploads.includes("all-api-hub-chrome.crx")).toBe(
          !existing && includePair,
        )
        expect(uploads.includes("updates.xml")).toBe(!existing && includePair)
      } else {
        expect(run).toThrow()
        expect(() => readFileSync(path.join(fixture, "uploaded.txt"))).toThrow()
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  },
)
