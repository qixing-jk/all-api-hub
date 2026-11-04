import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { expect, it } from "vitest"

it.each(["unknown", "", "keys,unknown"])(
  "rejects invalid page selection before capturing (%s)",
  async (pages) => {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), "doc-cli-test-"))
    try {
      await expect(
        promisify(execFile)(
          process.execPath,
          [
            "scripts/generate-doc-screenshots.mjs",
            `--pages=${pages}`,
            `--output=${output}`,
          ],
          { timeout: 20000 },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("Unknown page"),
      })
      expect(await fs.readdir(output)).toEqual([])
    } finally {
      await fs.rm(output, { recursive: true, force: true })
    }
  },
  25000,
)
