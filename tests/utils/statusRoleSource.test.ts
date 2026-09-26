import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

/**
 * The role contract pairs each status with three non-interchangeable spellings
 * (`src/styles/README.md`): a solid action, an inline text/icon mark, and a
 * tinted message or badge. Alpha over the solid role is none of them — it is a
 * fourth, undocumented spelling that lands on a different surface per mode, so
 * every call site ends up hand-writing a `dark:` repair next to it.
 *
 * The solid accent is not covered here: `hover:bg-primary/90` is the documented
 * hover for a solid action, and the appearance previews paint deliberately
 * miniaturised artwork rather than a themed surface.
 */
it("tints status surfaces with the soft role instead of the solid role at alpha", () => {
  const root = fileURLToPath(new URL("../../src/", import.meta.url))
  const solidStatus = /\bbg-(destructive|success|warning|info)\/\d+/u
  const offenders: string[] = []

  const visitDirectory = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visitDirectory(file)
        continue
      }
      if (!/\.tsx?$/.test(file)) continue

      for (const [index, line] of fs
        .readFileSync(file, "utf8")
        .split(/\r?\n/u)
        .entries()) {
        const match = solidStatus.exec(line)
        if (match) {
          offenders.push(
            `${path.relative(root, file)}:${index + 1}: ` +
              `${match[0]} — use bg-${match[1]}-soft`,
          )
        }
      }
    }
  }

  visitDirectory(root)
  expect(offenders).toEqual([])
})
