import fs from "node:fs/promises"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()
const LOCALES_DIR = path.join(REPO_ROOT, "src", "locales")
const SRC_DIR = path.join(REPO_ROOT, "src")
const UI_LANGUAGES = ["en", "zh_CN"] as const

type LocaleMap = Record<string, Set<string>>

/**
 * Flattens nested locale objects into dotted translation keys.
 */
function flattenLocaleKeys(
  value: Record<string, unknown>,
  prefix = "",
): string[] {
  const keys: string[] = []

  for (const [key, child] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key

    if (child && typeof child === "object" && !Array.isArray(child)) {
      keys.push(...flattenLocaleKeys(child as Record<string, unknown>, nextKey))
      continue
    }

    keys.push(nextKey)
  }

  return keys
}

/**
 * Loads one language's locale bundles keyed by namespace.
 */
async function readLocaleMap(language: (typeof UI_LANGUAGES)[number]) {
  const languageDir = path.join(LOCALES_DIR, language)
  const files = (await fs.readdir(languageDir))
    .filter((name) => name.endsWith(".json"))
    .sort()
  const localeMap: LocaleMap = {}

  for (const file of files) {
    const namespace = path.basename(file, ".json")
    const content = JSON.parse(
      await fs.readFile(path.join(languageDir, file), "utf8"),
    ) as Record<string, unknown>
    localeMap[namespace] = new Set(flattenLocaleKeys(content))
  }

  return localeMap
}

/**
 * Recursively finds TypeScript source files under the given directory.
 */
async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(fullPath)))
      continue
    }

    if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Reads a static string literal or template literal with no expressions.
 */
function readStaticString(node: ts.Expression | undefined) {
  if (!node) return undefined

  if (
    ts.isStringLiteralLike(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.text
  }

  return undefined
}

/**
 * Extracts an explicit `ns` option from a translation call.
 */
function readNamespaceOption(node: ts.Expression | undefined) {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined

  for (const property of node.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === "ns") ||
        (ts.isStringLiteral(property.name) && property.name.text === "ns"))
    ) {
      return readStaticString(property.initializer)
    }
  }

  return undefined
}

/**
 * Resolves the default namespace list passed to `useTranslation(...)`.
 */
function readUseTranslationNamespaces(call: ts.CallExpression) {
  const firstArg = call.arguments[0]

  if (!firstArg) return []

  if (ts.isArrayLiteralExpression(firstArg)) {
    return firstArg.elements
      .map((element) => readStaticString(element as ts.Expression))
      .filter((value): value is string => Boolean(value))
  }

  const namespace = readStaticString(firstArg)
  return namespace ? [namespace] : []
}

/**
 * Converts a translation call into a normalized `namespace:key` string.
 */
function normalizeTranslationKey(params: {
  text: string
  defaultNamespaces: string[] | null
  optionsNode?: ts.Expression
}) {
  if (params.text.includes(":")) {
    return params.text
  }

  const explicitNamespace = readNamespaceOption(params.optionsNode)
  const namespace = explicitNamespace || params.defaultNamespaces?.[0]

  return namespace ? `${namespace}:${params.text}` : null
}

/**
 * Formats repo-relative file paths for stable test failure output.
 */
function getRelativePath(filePath: string) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/")
}

describe("i18n locale validation", () => {
  it("keeps locale namespaces and key sets aligned", async () => {
    const [baseLanguage, ...otherLanguages] = UI_LANGUAGES
    const baseLocaleMap = await readLocaleMap(baseLanguage)
    const baseNamespaces = Object.keys(baseLocaleMap).sort()

    for (const language of otherLanguages) {
      const localeMap = await readLocaleMap(language)
      const namespaces = Object.keys(localeMap).sort()

      expect(namespaces, `${language} namespaces`).toEqual(baseNamespaces)

      for (const namespace of baseNamespaces) {
        expect(
          [...localeMap[namespace]].sort(),
          `${language}:${namespace} keys`,
        ).toEqual([...baseLocaleMap[namespace]].sort())
      }
    }
  })

  it("resolves static translation keys referenced in src", async () => {
    const localeMap = await readLocaleMap("zh_CN")
    const sourceFiles = await listSourceFiles(SRC_DIR)
    const missingKeys: string[] = []

    for (const file of sourceFiles) {
      const sourceText = await fs.readFile(file, "utf8")
      const sourceFile = ts.createSourceFile(
        file,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      const translationBindings = new Map<string, string[] | null>()
      const transComponentBindings = new Set<string>()

      const verifyKey = (key: string, line: number) => {
        const match = key.match(/^([^:]+):(.+)$/)
        if (!match) return

        const [, namespace, localeKey] = match
        const localeKeys = localeMap[namespace]

        if (!localeKeys?.has(localeKey)) {
          missingKeys.push(`${getRelativePath(file)}:${line} ${key}`)
        }
      }

      const visit = (node: ts.Node) => {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const moduleName = node.moduleSpecifier.text
          const namedBindings = node.importClause?.namedBindings

          if (namedBindings && ts.isNamedImports(namedBindings)) {
            for (const element of namedBindings.elements) {
              const importedName =
                element.propertyName?.text || element.name.text
              const localName = element.name.text

              if (moduleName === "react-i18next" && importedName === "Trans") {
                transComponentBindings.add(localName)
              }

              if (
                (moduleName === "~/utils/i18n/core" ||
                  moduleName === "i18next") &&
                importedName === "t"
              ) {
                translationBindings.set(localName, null)
              }
            }
          }
        }

        if (
          ts.isVariableDeclaration(node) &&
          node.initializer &&
          ts.isCallExpression(node.initializer) &&
          ts.isIdentifier(node.initializer.expression) &&
          node.initializer.expression.text === "useTranslation" &&
          ts.isObjectBindingPattern(node.name)
        ) {
          const namespaces = readUseTranslationNamespaces(node.initializer)

          for (const element of node.name.elements) {
            if (!ts.isIdentifier(element.name)) continue

            const propertyName =
              element.propertyName && ts.isIdentifier(element.propertyName)
                ? element.propertyName.text
                : element.name.text

            if (propertyName === "t") {
              translationBindings.set(element.name.text, namespaces)
            }
          }
        }

        if (ts.isCallExpression(node)) {
          const firstArg = node.arguments[0]
          const secondArg = node.arguments[1]
          const keyText = readStaticString(firstArg)
          let defaultNamespaces: string[] | null | undefined

          if (
            ts.isIdentifier(node.expression) &&
            translationBindings.has(node.expression.text)
          ) {
            defaultNamespaces = translationBindings.get(node.expression.text)
          } else if (
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "t"
          ) {
            defaultNamespaces = null
          }

          if (defaultNamespaces !== undefined && keyText) {
            const normalizedKey = normalizeTranslationKey({
              text: keyText,
              defaultNamespaces,
              optionsNode: secondArg,
            })

            if (normalizedKey) {
              const line =
                sourceFile.getLineAndCharacterOfPosition(node.getStart()).line +
                1
              verifyKey(normalizedKey, line)
            }
          }
        }

        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = node.tagName

          if (
            ts.isIdentifier(tagName) &&
            transComponentBindings.has(tagName.text)
          ) {
            for (const property of node.attributes.properties) {
              if (
                ts.isJsxAttribute(property) &&
                ts.isIdentifier(property.name) &&
                property.name.text === "i18nKey" &&
                property.initializer &&
                ts.isStringLiteral(property.initializer)
              ) {
                const line =
                  sourceFile.getLineAndCharacterOfPosition(property.getStart())
                    .line + 1
                verifyKey(property.initializer.text, line)
              }
            }
          }
        }

        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
    }

    expect(missingKeys).toEqual([])
  })
})
