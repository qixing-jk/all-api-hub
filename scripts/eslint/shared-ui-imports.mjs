import { relative } from "node:path"

const workflowOwner = "src/components/icons/WorkflowTransitionIcon.tsx"
const helpOwners = new Set([
  "src/components/icons/productIcons.ts",
  // These glyphs represent unknown state or confirmation, not a help affordance.
  "src/components/ui/Dialog/ConfirmDialog.tsx",
  "src/features/ModelList/presentation/ModelVendorMark.tsx",
  "src/features/AccountManagement/components/AccountList/rows/SiteInfoCheckInIndicators.tsx",
  "src/features/AutoCheckin/workspace/FilterBar.tsx",
])
const workflowNames =
  /^(?:ArrowUpRight|ExternalLink|SquareArrowOutUpRight|ArrowUpRightFromSquare)(?:Icon)?$/
const helpNames =
  /^(?:CircleHelp|HelpCircle|CircleQuestionMark|CircleQuestion)(?:Icon)?$/

/**
 * Resolve the module source of an import/export node.
 * `import(\`react-tooltip\`)` parses to a TemplateLiteral, which has no `.value`,
 * so a constant template literal is read through its cooked quasis instead.
 */
const resolveSource = (node) => {
  const source = node.source
  if (typeof source?.value === "string") return source.value
  if (source?.type !== "TemplateLiteral" || source.expressions.length > 0) {
    return null
  }
  const cooked = source.quasis[0]?.value?.cooked
  return cooked ?? null
}

/** Enforce shared UI owners without guessing the meaning of generic Info icons. */
export const sharedUiImportsRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      workflow:
        "Use ~/components/icons/WorkflowTransitionIcon for workflow/link arrows.",
      help: "Use HelpHintIcon from ~/components/icons/productIcons for help affordances. Non-help question glyphs need an explicit owner in scripts/eslint/shared-ui-imports.mjs.",
      tooltip:
        "Use ~/components/Tooltip so appearance and accessible interaction stay shared.",
      namespace:
        "Use named lucide-react imports so shared help and workflow icon boundaries can be checked.",
    },
  },
  create(context) {
    const file = relative(context.cwd, context.filename).replaceAll("\\", "/")
    const check = (node) => {
      const source = resolveSource(node)
      if (typeof source !== "string") return
      if (/^react-tooltip(?:\/|$)/.test(source)) {
        if (file !== "src/components/Tooltip.tsx") {
          context.report({ node, messageId: "tooltip" })
        }
        return
      }
      if (source !== "lucide-react") return
      if (
        node.type === "ExportAllDeclaration" ||
        node.type === "ImportExpression"
      ) {
        context.report({ node, messageId: "namespace" })
        return
      }
      for (const specifier of node.specifiers ?? []) {
        if (
          specifier.type === "ImportNamespaceSpecifier" ||
          specifier.type === "ExportNamespaceSpecifier"
        ) {
          context.report({ node: specifier, messageId: "namespace" })
          continue
        }
        const name =
          specifier.imported?.name ??
          specifier.imported?.value ??
          specifier.local?.name
        if (workflowNames.test(name) && file !== workflowOwner) {
          context.report({ node: specifier, messageId: "workflow" })
        }
        if (helpNames.test(name) && !helpOwners.has(file)) {
          context.report({ node: specifier, messageId: "help" })
        }
      }
    }
    return {
      ImportDeclaration: check,
      ImportExpression: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    }
  },
}
