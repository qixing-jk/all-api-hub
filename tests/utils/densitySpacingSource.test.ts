import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { expect, it } from "vitest"

/**
 * Formatting can place custom density classes before shorthand classes.
 * Tailwind Merge then silently removes the density axis from a single string.
 * Keep those axes explicit at the source; caller overrides remain supported.
 */
it("avoids order-dependent shorthand and density axes in UI class strings", () => {
  const root = fileURLToPath(new URL("../../src/", import.meta.url))
  const conflicts: string[] = []
  const visitDirectory = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visitDirectory(file)
        continue
      }
      if (!/\.tsx?$/.test(file)) continue
      const text = fs.readFileSync(file, "utf8")
      // Only parse possible conflicts. Escapes keep a file eligible because
      // TypeScript decodes them when reading string and template contents.
      if (
        !text.includes("\\") &&
        (!text.includes("-density-") || !/(?:p|px|py|gap)-\d/.test(text))
      ) {
        continue
      }
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        false,
      )
      const visit = (node: ts.Node) => {
        if (
          (ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node)) &&
          node.text.includes("-density-")
        ) {
          const tokens = node.text.split(/\s+/)
          for (const token of tokens) {
            const match = /^(.*:)?(p|px|py|gap)-(\d+(?:\.\d+)?)$/.exec(token)
            if (!match) continue
            const [, modifier = "", shorthand] = match
            const axes =
              shorthand === "p"
                ? ["px", "py", "pt", "pb", "pl", "pr"]
                : shorthand === "py"
                  ? ["pt", "pb"]
                  : shorthand === "px"
                    ? ["pl", "pr"]
                    : ["gap-x", "gap-y"]
            if (
              tokens.some((other) =>
                axes.some((axis) =>
                  other.startsWith(`${modifier}${axis}-density-`),
                ),
              )
            ) {
              const { line } = source.getLineAndCharacterOfPosition(
                node.getStart(source),
              )
              conflicts.push(
                `${path.relative(root, file)}:${line + 1}: ${token}`,
              )
            }
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  visitDirectory(root)
  expect(conflicts).toEqual([])
})
