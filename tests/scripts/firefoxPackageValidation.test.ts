import { execFileSync, spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, it } from "vitest"

import { bashPath, workflowCommand } from "./workflowCommand.mjs"

it.each([
  { size: 5 * 1024 * 1024 - 1, valid: true },
  { size: 5 * 1024 * 1024, valid: false },
  { size: 5 * 1024 * 1024 + 1, valid: false },
])(
  "validates the actual ZIP at the AMO size boundary: $size bytes",
  ({ size, valid }) => {
    const command = workflowCommand(
      "actions/validate-firefox-package/action.yml",
      "Validate Firefox store package",
    )
    const fixture = mkdtempSync(path.join(tmpdir(), "aah-firefox-validation-"))
    if (path.dirname(fixture) !== path.resolve(tmpdir()))
      throw new Error("Unexpected fixture directory")
    const cli = path.resolve("node_modules/web-ext/bin/web-ext.js")
    const source = path.join(fixture, "source")
    const artifacts = path.join(fixture, "artifacts")
    try {
      mkdirSync(source)
      writeFileSync(
        path.join(source, "manifest.json"),
        JSON.stringify({
          manifest_version: 2,
          name: "AMO boundary fixture",
          version: "1.0.0",
          background: { scripts: ["background.js"] },
          browser_specific_settings: { gecko: { id: "fixture@example.test" } },
        }),
      )
      writeFileSync(
        path.join(source, "background.js"),
        `/*${" ".repeat(size - 4)}*/`,
      )
      execFileSync(
        process.execPath,
        [
          cli,
          "build",
          "--source-dir",
          source,
          "--artifacts-dir",
          artifacts,
          "--no-config-discovery",
        ],
        { stdio: "pipe" },
      )
      const archive = readdirSync(artifacts).find((name) =>
        name.endsWith(".zip"),
      )
      if (!archive) throw new Error("Missing fixture ZIP")
      // Resolve only the package-manager boundary locally; execute the real Mozilla validator.
      const result = spawnSync(
        bashPath(),
        [
          "-e",
          "-o",
          "pipefail",
          "-c",
          'pnpm() { shift 2; "$AAH_NODE_PATH" "$AAH_WEB_EXT_PATH" "$@"; }\n' +
            command,
        ],
        {
          env: {
            ...process.env,
            FIREFOX_ZIP: path.join(artifacts, archive).replaceAll("\\", "/"),
            AAH_NODE_PATH: process.execPath.replaceAll("\\", "/"),
            AAH_WEB_EXT_PATH: cli.replaceAll("\\", "/"),
          },
          encoding: "utf8",
          timeout: 30_000,
        },
      )
      expect(result.error).toBeUndefined()
      if (valid) {
        expect(result.status, result.stdout + result.stderr).toBe(0)
      } else {
        expect(result.status).not.toBe(0)
        expect(result.stdout + result.stderr).toMatch(
          /FILE_TOO_LARGE|too large/i,
        )
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  },
)
