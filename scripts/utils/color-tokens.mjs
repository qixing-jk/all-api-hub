import postcss from "postcss"
import ts from "typescript"

// Exceptions are color-definition owners, not entire UI or chart directories.
const colorDefinitionFiles = new Set([
  "src/styles/colors.css",
  "src/styles/appearance.css",
  "src/styles/themePresets.css",
  "src/services/sharing/shareSnapshots/meshGradient.ts",
  "src/services/sharing/shareSnapshots/meshGradientBackground.ts",
  "src/public/react-devtools-backend.js",
])

const paletteNames =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const colorUtilities =
  "bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|shadow|divide|from|via|to|fill|stroke|accent|decoration|caret"
const rawUtilities = new RegExp(
  `(?<![\\w-])(?:${colorUtilities})-(?:(?:${paletteNames})-(?:50|[1-9]00|950)|white|black)(?![\\w-])`,
  "g",
)
const arbitraryUtilities = new RegExp(
  `(?<![\\w-])(?:${colorUtilities})-\\[[^\\]\\r\\n]*\\]`,
  "g",
)
const rawColors =
  /#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{4}\b|#[\da-f]{3}\b|\b(?:(?:rgb|hsl)a?|hwb|(?:ok)?l(?:ab|ch))\(\s*[\d.+-][^)]*\)|\bcolor\(\s*(?:srgb(?:-linear)?|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz(?:-d50|-d65)?)[\s_]+[\d.+-][^)]*\)/gi
const rawPaletteVariables = new RegExp(
  `--color-(?:(?:${paletteNames})-(?:50|[1-9]00|950)|white|black)(?![\\w-])`,
  "g",
)

/** Recognize explicit style names, including camelCase and constant names. */
function isColorName(name) {
  return /(?:^|[^a-z0-9])(?:class(?:es|names?)?|css|styles?|colors?|fill|stroke|background|border|outline|shadow|palette|gradient|axis)(?:$|[^a-z0-9])/i.test(
    name.replace(/([a-z0-9])([A-Z])/g, "$1-$2"),
  )
}

/** Inspect local syntax only; ordinary references and JSX attributes are data. */
function hasColorContext(node) {
  for (let current = node; current.parent; current = current.parent) {
    const parent = current.parent
    if (
      (ts.isConditionalExpression(parent) && current === parent.condition) ||
      (ts.isElementAccessExpression(parent) &&
        current === parent.argumentExpression)
    ) {
      return false
    }
    if (ts.isJsxAttribute(parent)) return isColorName(parent.name.getText())
    if (
      ts.isPropertyAssignment(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isPropertyDeclaration(parent)
    ) {
      if (current === parent.name) return false
      if (isColorName(parent.name.getText())) return true
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      current === parent.right &&
      isColorName(parent.left.getText())
    ) {
      return true
    }
    if (ts.isCallExpression(parent) && parent.arguments.includes(current)) {
      const callee = parent.expression
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.getText()
        : callee.getText()
      if (isColorName(name)) return true
      if (
        ["setProperty", "setAttribute"].includes(name) &&
        current === parent.arguments[1] &&
        ts.isStringLiteralLike(parent.arguments[0]) &&
        isColorName(parent.arguments[0].text)
      ) {
        return true
      }
      // A selector/helper argument is not necessarily the returned style value.
      if (
        parent.parent &&
        ts.isPropertyAssignment(parent.parent) &&
        parent.parent.initializer === parent &&
        isColorName(parent.parent.name.getText())
      ) {
        continue
      }
      return false
    }
    if (ts.isStatement(parent)) break
  }
  return false
}

/** Find source color literals while excluding comments and color-definition owners. */
export function findColorTokenViolations(file, source) {
  const path = file.replaceAll("\\", "/")
  if (colorDefinitionFiles.has(path) || path.startsWith("src/assets/")) {
    return []
  }

  const violations = []
  const addMatches = (
    value,
    offset,
    expressions = [rawUtilities, rawColors, rawPaletteVariables],
  ) => {
    // SVG paint references and asset URL fragments are not color literals.
    value = value.replace(/\burl\([^)]*\)/gi, (url) =>
      url.replace(/[^\r\n]/g, " "),
    )
    for (const expression of expressions) {
      for (const match of value.matchAll(expression)) {
        const position = offset + match.index
        const prefix = source.slice(0, position)
        violations.push({
          token: match[0],
          line: prefix.split("\n").length,
          column: position - prefix.lastIndexOf("\n"),
        })
      }
    }
  }

  const inspectCss = (css, offset = 0) => {
    const root = postcss.parse(css, { from: path })
    root.walkDecls((declaration) => {
      const start = declaration.source.start.offset
      const valueOffset = css.indexOf(declaration.value, start)
      addMatches(declaration.value, offset + valueOffset)
    })
    root.walkAtRules("apply", (rule) => {
      addMatches(
        rule.params,
        offset + css.indexOf(rule.params, rule.source.start.offset),
      )
    })
  }

  if (/\.css$/.test(path)) {
    inspectCss(source)
  } else if (/\.html$/.test(path)) {
    // Preserve offsets when removing comments, including commented-out tags.
    const html = source.replace(/<!--[\s\S]*?-->/g, (comment) =>
      comment.replace(/[^\r\n]/g, " "),
    )
    for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      inspectCss(match[1], match.index + match[0].indexOf(">") + 1)
    }
    for (const match of html.matchAll(
      /\b(?:class|style|fill|stroke|color)\s*=\s*(["'])(.*?)\1/gis,
    )) {
      addMatches(match[2], match.index + match[0].indexOf(match[1]) + 1)
    }
  } else {
    const parsed = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
    )
    const visit = (node) => {
      if (
        ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        const value = node.getText(parsed)
        const offset = node.getStart(parsed)
        // Utility/variable spellings are unambiguous even in detached constants.
        addMatches(value, offset, [rawUtilities, rawPaletteVariables])
        if (hasColorContext(node)) {
          addMatches(value, offset, [rawColors])
        } else {
          for (const match of value.matchAll(arbitraryUtilities)) {
            addMatches(match[0], offset + match.index, [rawColors])
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
  }
  return violations.sort((a, b) => a.line - b.line || a.column - b.column)
}

/** Require existing debt to shrink, and reject new colors or extra occurrences. */
export function compareColorTokenBaseline(file, violations, baseline = {}) {
  const allowance = baseline[file]?.tokens ?? {}
  const observed = {}
  const errors = []
  for (const violation of violations) {
    const count = (observed[violation.token] ?? 0) + 1
    observed[violation.token] = count
    if (count > (allowance[violation.token] ?? 0)) {
      errors.push(
        `${file}:${violation.line}:${violation.column} Use a color role instead of ${violation.token}.`,
      )
    }
  }
  for (const [token, count] of Object.entries(allowance)) {
    if ((observed[token] ?? 0) < count) {
      errors.push(`${file}: Remove the unused baseline allowance for ${token}.`)
    }
  }
  return errors
}
