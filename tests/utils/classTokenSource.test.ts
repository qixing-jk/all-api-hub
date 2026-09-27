import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { expect, it } from "vitest"

/**
 * A class token whose colour role runs straight into the next utility, such as
 * `text-muted-foregroundtruncate`, names no utility at all: Tailwind emits
 * nothing and the stylesheet silently drops the intended rule. A missing
 * separator is invisible to every other gate, because the string is still valid
 * and prettier does not reformat inside a string literal.
 *
 * `-foreground` and `-background` are terminal in every role this codebase
 * defines, so any identifier character directly after them is always a
 * concatenation rather than a role name.
 *
 * Only `className` expressions are inspected, so prose and translation text
 * cannot reach the rule. It fences this concatenation specifically; it is not a
 * general validator of Tailwind utility names.
 */
const CONCATENATED_ROLE = /[a-z-]*(?:foreground|background)[a-z]/

it("keeps Tailwind utility names inside className separated", () => {
  const root = fileURLToPath(new URL("../../src/", import.meta.url))
  const offenders: string[] = []

  const inspect = (file: string) => {
    const text = fs.readFileSync(file, "utf8")
    if (!/className/.test(text)) return

    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    )

    const checkLiterals = (node: ts.Node) => {
      if (ts.isStringLiteralLike(node)) {
        for (const token of node.text.split(/\s+/)) {
          if (!CONCATENATED_ROLE.test(token)) continue
          const { line } = source.getLineAndCharacterOfPosition(
            node.getStart(source),
          )
          offenders.push(`${path.relative(root, file)}:${line + 1}: ${token}`)
        }
      }
      ts.forEachChild(node, checkLiterals)
    }

    const visit = (node: ts.Node) => {
      if (
        ts.isJsxAttribute(node) &&
        node.name.getText(source) === "className" &&
        node.initializer
      ) {
        // Covers `className="..."`, template literals, and the string
        // arguments of helpers such as `cn(...)`.
        checkLiterals(node.initializer)
        return
      }
      ts.forEachChild(node, visit)
    }

    visit(source)
  }

  const visitDirectory = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visitDirectory(file)
      else if (/\.tsx?$/.test(file)) inspect(file)
    }
  }

  visitDirectory(root)
  expect(offenders).toEqual([])
})
