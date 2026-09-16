import postcss from "postcss"
import ts from "typescript"

// Explicit exceptions are reviewed artwork, exported images, or renderer inputs.
const ICON_SIZES = {
  "src/components/icons/InitialsIcon.tsx": new Set(["8px", "9px"]),
  "src/features/ModelList/components/ModelVendorMark.tsx": new Set([
    "11px",
    "12px",
  ]),
}
const CHART_SOURCES = new Set([
  "src/components/charts/chartTypography.ts",
  "src/features/BalanceHistory/echartsOptions.ts",
  "src/features/UsageAnalytics/charts/echartsOptions.ts",
])
const RELATIVE_SIZE =
  /^(?:inherit|initial|unset|revert|revert-layer|0|[\d.]+(?:em|%)|var\(--(?:font-size|text-size|text-)|calc\([^;]*var\(--text-size-increment\))/u

/** Find source-owned typography that bypasses the shared scale or chart adapter. */
export function findTypographyViolations(file, source) {
  const problems = []
  const report = (position, message) =>
    problems.push({
      line: source.slice(0, position).split("\n").length,
      message,
    })
  const inspectText = (text, position) => {
    for (const match of text.matchAll(/text-\[(?:length:)?([^\]]+)\]/gu)) {
      const value = match[1]
      // Color arbitrary values are unrelated to font sizing.
      if (
        !match[0].includes("length:") &&
        !/(?:\d(?:px|rem|em|%|vw|vh|pt|pc|cm|mm|in)|calc\(|clamp\()/u.test(
          value,
        )
      )
        continue
      if (RELATIVE_SIZE.test(value) || ICON_SIZES[file]?.has(value)) continue
      report(
        position + match.index,
        `Use shared text utilities for ${match[0]}`,
      )
    }
    for (const match of text.matchAll(
      /(?<![-\w])font(?:-size)?\s*:\s*([^;"'}]+)/gu,
    )) {
      if (!RELATIVE_SIZE.test(match[1].trim()))
        report(
          position + match.index,
          "Inline CSS typography must use shared tokens",
        )
    }
  }
  if (file.endsWith(".css")) {
    const root = postcss.parse(source, { from: file })
    root.walkAtRules("apply", (rule) => {
      inspectText(
        rule.params,
        source.indexOf(rule.params, rule.source?.start?.offset ?? 0),
      )
    })
    root.walkDecls(/^(?:font-size|font)$/u, (decl) => {
      if (!RELATIVE_SIZE.test(decl.value))
        report(
          decl.source?.start?.offset ?? 0,
          "CSS typography must use shared tokens",
        )
    })
    return problems
  }
  if (file.endsWith(".html")) {
    inspectText(source, 0)
    return problems
  }
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const visit = (node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      inspectText(node.text, node.getStart(ast))
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isJsxAttribute(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      ["fontSize", "font-size", "font"].includes(
        node.name.getText(ast).replace(/["']/gu, ""),
      ) &&
      !CHART_SOURCES.has(file)
    ) {
      const value = node.initializer
      if (
        !value ||
        !ts.isStringLiteralLike(value) ||
        !RELATIVE_SIZE.test(value.text)
      )
        report(
          node.getStart(ast),
          "Use shared typography instead of inline font sizing",
        )
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      ["font", "fontSize"].includes(node.left.name.text) &&
      !(
        node.left.name.text === "fontSize" &&
        ts.isStringLiteralLike(node.right) &&
        RELATIVE_SIZE.test(node.right.text)
      ) &&
      file !== "src/services/sharing/shareSnapshots/shareSnapshotOverlay.ts"
    )
      report(
        node.getStart(ast),
        "Font assignments need shared typography or an explicit adapter",
      )
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "setProperty" &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      ["font", "font-size"].includes(node.arguments[0].text)
    ) {
      const value = node.arguments[1]
      if (
        !value ||
        !ts.isStringLiteralLike(value) ||
        !RELATIVE_SIZE.test(value.text)
      )
        report(
          node.getStart(ast),
          "Dynamic CSS typography must use shared tokens",
        )
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return problems
}
