import fs from "node:fs/promises"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import {
  getTempContextTaskMetadata,
  PROTECTION_BYPASS_CAUSES,
  PROTECTION_BYPASS_FEATURE_TASK_KINDS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_OPERATIONS,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"

const repoRoot = process.cwd()
const runtimeMessagesPath = path.join(
  repoRoot,
  "src/entrypoints/background/runtimeMessages.ts",
)
const tempWindowFetchPath = path.join(
  repoRoot,
  "src/utils/browser/tempWindowFetch.ts",
)
const tempWindowPoolPath = path.join(
  repoRoot,
  "src/entrypoints/background/tempWindowPool.ts",
)
const tempWindowTypesPath = path.join(repoRoot, "src/types/tempWindowFetch.ts")
const protectionBypassContractsPath = path.join(
  repoRoot,
  "src/services/protectionBypass/contracts.ts",
)
const protectionBypassClientPath = path.join(
  repoRoot,
  "src/services/protectionBypass/client.ts",
)
const modelRedirectServicePath = path.join(
  repoRoot,
  "src/services/models/modelRedirect/ModelRedirectService.ts",
)

const obsoleteProtectionBypassIdentifiers = [
  "site_detection",
  "session_resync",
  "verify_protection",
  "PROTECTION_BYPASS_FEATURE_OPERATIONS",
  "surface_disabled",
  "manual_feature_disabled",
  "operation_not_permitted",
] as const

const dormantRenderedTitleHelper = "tempWindowGetRenderedTitle"
const dormantTaskKinds = new Set(["rendered_title", "open_context"])

const legacyProtectedHandlers = [
  "handleOpenTempWindow",
  "handleAutoDetectSite",
  "handleTempWindowFetch",
  "handleTempWindowCheckinPageAction",
  "handleTempWindowTurnstileFetch",
  "handleTempWindowGetRenderedTitle",
  "handleTempWindowOpenRouterManagementKeyAction",
] as const

type SourceFile = { relativePath: string; source: string }
type AnalyzedSourceFile = SourceFile & {
  dormantReferences: string[]
  obsoleteReferences: string[]
}
let sourceFilesPromise: Promise<SourceFile[]> | undefined
let analyzedSourceFilesPromise: Promise<AnalyzedSourceFile[]> | undefined

function readSourceFiles(): Promise<SourceFile[]> {
  sourceFilesPromise ??= (async () => {
    const srcRoot = path.join(repoRoot, "src")
    const relativePaths = await fs.readdir(srcRoot, { recursive: true })
    const sourcePaths = relativePaths.filter(
      (relativePath) =>
        typeof relativePath === "string" && /\.(?:ts|tsx)$/.test(relativePath),
    )
    return await Promise.all(
      sourcePaths.map(async (relativePath) => ({
        relativePath: path.posix.join(
          "src",
          relativePath.replaceAll("\\", "/"),
        ),
        source: await fs.readFile(path.join(srcRoot, relativePath), "utf8"),
      })),
    )
  })()
  return sourceFilesPromise
}

function readAnalyzedSourceFiles(): Promise<AnalyzedSourceFile[]> {
  analyzedSourceFilesPromise ??= readSourceFiles().then((sources) =>
    sources.map(({ source, relativePath }) => {
      if (!requiresStructuralAnalysis(source)) {
        return {
          source,
          relativePath,
          dormantReferences: [],
          obsoleteReferences: [],
        }
      }
      const parsedSource = parseSource(source, relativePath)
      return {
        source,
        relativePath,
        dormantReferences: findDormantArchitectureReferences(
          source,
          relativePath,
          parsedSource,
        ),
        obsoleteReferences: findObsoletePolicyReferences(
          source,
          relativePath,
          parsedSource,
        ),
      }
    }),
  )
  return analyzedSourceFilesPromise
}

function requiresStructuralAnalysis(source: string): boolean {
  return (
    obsoleteProtectionBypassIdentifiers.some((token) =>
      source.includes(token),
    ) ||
    source.includes(dormantRenderedTitleHelper) ||
    source.includes("tempWindowFetch") ||
    source.includes("rendered_title") ||
    source.includes("open_context") ||
    source.includes("TEMP_CONTEXT_TASK_KINDS")
  )
}

async function findAuthorizedAdapterImporters(): Promise<string[]> {
  const sources = await readSourceFiles()
  const adapterImportPattern =
    /import\s*\{[^}]*\bexecuteAuthorizedTempContextTask\b[^}]*\}\s*from\s*["'][^"']*tempWindowPool["']/s

  return sources
    .filter(({ source }) => adapterImportPattern.test(source))
    .map(({ relativePath }) => relativePath)
    .sort()
}

async function findProtectedTaskActionReferences(): Promise<string[]> {
  const sources = await readSourceFiles()

  return sources
    .filter(({ source }) =>
      source.includes("RuntimeActionIds.ProtectionBypassExecuteTask"),
    )
    .map(({ relativePath }) => relativePath)
    .sort()
}

function parseSource(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function findProtectionBypassReferences(sourceFile: ts.SourceFile): string[] {
  const references = new Set<string>()

  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /protectionBypass/i.test(node.moduleSpecifier.text)
    ) {
      references.add(`import:${node.moduleSpecifier.text}`)
    }
    if (ts.isIdentifier(node) && /protectionBypass/i.test(node.text)) {
      references.add(`identifier:${node.text}`)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...references].sort()
}

function isInsideFunction(node: ts.Node, functionName: string): boolean {
  let current: ts.Node | undefined = node.parent
  while (current) {
    if (
      ts.isFunctionDeclaration(current) &&
      current.name?.text === functionName
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function isTempWindowFetchImplementation(fileName: string): boolean {
  const normalizedFileName = fileName.replaceAll("\\", "/")
  return (
    normalizedFileName === "src/utils/browser/tempWindowFetch.ts" ||
    normalizedFileName.endsWith("/src/utils/browser/tempWindowFetch.ts")
  )
}

function isRenderedTitleHelperDeclaration(
  node: ts.Identifier,
  fileName: string,
): boolean {
  return (
    isTempWindowFetchImplementation(fileName) &&
    ts.isFunctionDeclaration(node.parent) &&
    node.parent.name === node
  )
}

function targetsTempWindowFetch(moduleSpecifier: ts.Expression): boolean {
  if (!ts.isStringLiteral(moduleSpecifier)) return false
  return /(?:^|\/)tempWindowFetch$/.test(moduleSpecifier.text)
}

const unresolvedAlias = Symbol("unresolvedAlias")
const tempContextTaskKindsCatalog = Symbol("tempContextTaskKindsCatalog")

type AliasValue = ts.Expression | typeof unresolvedAlias
type ResolvedDormantTaskKind =
  | string
  | typeof tempContextTaskKindsCatalog
  | undefined
type AliasBinding = {
  name: string
  scope: ts.Node
  value: AliasValue
}
type ScopeAliases = ReadonlyMap<ts.Node, ReadonlyMap<string, AliasBinding>>
type ResolutionState =
  | { state: "in_progress" }
  | { state: "resolved"; value: ResolvedDormantTaskKind }
type DormantTaskKindResolver = {
  aliases: ScopeAliases
  bindingStates: Map<AliasBinding, ResolutionState>
  expressionStates: Map<ts.Expression, ResolutionState>
}

function findLexicalScope(node: ts.Node): ts.Node | undefined {
  let current: ts.Node | undefined = node.parent
  while (current) {
    if (
      ts.isBlock(current) ||
      ts.isCaseBlock(current) ||
      ts.isSourceFile(current) ||
      ts.isForStatement(current) ||
      ts.isForInStatement(current) ||
      ts.isForOfStatement(current)
    ) {
      return current
    }
    current = current.parent
  }
  return undefined
}

function getFunctionBody(node: ts.Node): ts.ConciseBody | undefined {
  if (!ts.isFunctionLike(node) || !("body" in node)) return undefined
  return node.body as ts.ConciseBody | undefined
}

function findFunctionScope(node: ts.Node): ts.Node | undefined {
  let current: ts.Node | undefined = node.parent
  while (current) {
    const body = getFunctionBody(current)
    if (body) return body
    current = current.parent
  }
  return undefined
}

function addScopeBinding(
  aliases: Map<ts.Node, Map<string, AliasBinding>>,
  scope: ts.Node | undefined,
  name: string,
  value: AliasValue = unresolvedAlias,
): void {
  if (!scope) return

  const scopeAliases = aliases.get(scope) ?? new Map<string, AliasBinding>()
  const existingBinding = scopeAliases.get(name)
  if (existingBinding) {
    existingBinding.value = unresolvedAlias
  } else {
    scopeAliases.set(name, { name, scope, value })
  }
  aliases.set(scope, scopeAliases)
}

function addBindingName(
  aliases: Map<ts.Node, Map<string, AliasBinding>>,
  scope: ts.Node | undefined,
  name: ts.BindingName,
  value: AliasValue = unresolvedAlias,
): void {
  if (ts.isIdentifier(name)) {
    addScopeBinding(aliases, scope, name.text, value)
    return
  }

  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      addBindingName(aliases, scope, element.name)
    }
  }
}

function collectScopeAliases(parsedSource: ts.SourceFile): ScopeAliases {
  const aliases = new Map<ts.Node, Map<string, AliasBinding>>()

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isVariableDeclarationList(node.parent)
    ) {
      const declarationList = node.parent
      const isSimpleConstAlias =
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (declarationList.flags & ts.NodeFlags.Const) !== 0
      const scope =
        (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0
          ? findLexicalScope(node)
          : findFunctionScope(node) ?? findLexicalScope(node)
      addBindingName(
        aliases,
        scope,
        node.name,
        isSimpleConstAlias ? node.initializer : unresolvedAlias,
      )
    }
    const functionBody = getFunctionBody(node)
    if (functionBody && ts.isFunctionLike(node)) {
      for (const parameter of node.parameters) {
        addBindingName(aliases, node, parameter.name)
      }
    }
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      addBindingName(aliases, node.block, node.variableDeclaration.name)
    }
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause
      if (importClause?.name && !importClause.isTypeOnly) {
        addScopeBinding(aliases, parsedSource, importClause.name.text)
      }
      const namedBindings = importClause?.namedBindings
      if (
        namedBindings &&
        ts.isNamespaceImport(namedBindings) &&
        !importClause.isTypeOnly
      ) {
        addScopeBinding(aliases, parsedSource, namedBindings.name.text)
      }
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          if (!importClause.isTypeOnly && !element.isTypeOnly) {
            addScopeBinding(aliases, parsedSource, element.name.text)
          }
        }
      }
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
      addScopeBinding(aliases, parsedSource, node.name.text)
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node)) &&
      node.name
    ) {
      addScopeBinding(aliases, findLexicalScope(node), node.name.text)
    }
    if (ts.isFunctionExpression(node) && node.name && node.body) {
      addScopeBinding(aliases, node, node.name.text)
    }
    if (ts.isClassExpression(node) && node.name) {
      addScopeBinding(aliases, node, node.name.text)
    }
    ts.forEachChild(node, visit)
  }

  visit(parsedSource)
  return aliases
}

function findSimpleConstAlias(
  identifier: ts.Identifier,
  aliases: ScopeAliases,
): AliasBinding | undefined {
  let current: ts.Node | undefined = identifier.parent
  while (current) {
    const scopeAliases = aliases.get(current)
    if (scopeAliases?.has(identifier.text)) {
      return scopeAliases.get(identifier.text)
    }
    current = current.parent
  }
  return undefined
}

function createDormantTaskKindResolver(
  parsedSource: ts.SourceFile,
): DormantTaskKindResolver {
  return {
    aliases: collectScopeAliases(parsedSource),
    bindingStates: new Map(),
    expressionStates: new Map(),
  }
}

function unwrapTaskKindExpression(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function resolveDormantTaskKind(
  expression: ts.Expression,
  resolver: DormantTaskKindResolver,
): string | undefined {
  const resolved = resolveDormantTaskKindValue(expression, resolver)
  return typeof resolved === "string" ? resolved : undefined
}

function resolveDormantTaskKindValue(
  expression: ts.Expression,
  resolver: DormantTaskKindResolver,
): ResolvedDormantTaskKind {
  return resolveMemoized(resolver.expressionStates, expression, () =>
    resolveDormantTaskKindUncached(expression, resolver),
  )
}

function resolveMemoized<T extends object>(
  states: Map<T, ResolutionState>,
  key: T,
  resolve: () => ResolvedDormantTaskKind,
): ResolvedDormantTaskKind {
  const existingState = states.get(key)
  if (existingState) {
    return existingState.state === "resolved" ? existingState.value : undefined
  }

  states.set(key, { state: "in_progress" })
  const value = resolve()
  states.set(key, { state: "resolved", value })
  return value
}

function resolveAliasBinding(
  binding: AliasBinding,
  resolver: DormantTaskKindResolver,
): ResolvedDormantTaskKind {
  const aliasValue = binding.value
  if (aliasValue === unresolvedAlias) return undefined

  return resolveMemoized(resolver.bindingStates, binding, () =>
    resolveDormantTaskKindValue(aliasValue, resolver),
  )
}

function resolveDormantTaskKindUncached(
  expression: ts.Expression,
  resolver: DormantTaskKindResolver,
): ResolvedDormantTaskKind {
  const unwrapped = unwrapTaskKindExpression(expression)
  if (
    ts.isStringLiteral(unwrapped) ||
    ts.isNoSubstitutionTemplateLiteral(unwrapped)
  ) {
    return dormantTaskKinds.has(unwrapped.text) ? unwrapped.text : undefined
  }
  if (
    ts.isPropertyAccessExpression(unwrapped) &&
    resolveDormantTaskKindValue(unwrapped.expression, resolver) ===
      tempContextTaskKindsCatalog
  ) {
    if (unwrapped.name.text === "RenderedTitle") return "rendered_title"
    if (unwrapped.name.text === "OpenContext") return "open_context"
  }
  if (
    ts.isElementAccessExpression(unwrapped) &&
    resolveDormantTaskKindValue(unwrapped.expression, resolver) ===
      tempContextTaskKindsCatalog &&
    unwrapped.argumentExpression &&
    ts.isStringLiteral(unwrapped.argumentExpression)
  ) {
    if (unwrapped.argumentExpression.text === "RenderedTitle") {
      return "rendered_title"
    }
    if (unwrapped.argumentExpression.text === "OpenContext") {
      return "open_context"
    }
  }
  if (ts.isIdentifier(unwrapped)) {
    if (unwrapped.text === "TEMP_CONTEXT_TASK_KINDS") {
      return tempContextTaskKindsCatalog
    }
    const alias = findSimpleConstAlias(unwrapped, resolver.aliases)
    if (alias) return resolveAliasBinding(alias, resolver)
  }
  return undefined
}

function getConstructedDormantTaskKind(
  node: ts.ObjectLiteralExpression,
  resolver: DormantTaskKindResolver,
): string | undefined {
  const kindProperty = node.properties.find(
    (
      property,
    ): property is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
      (ts.isPropertyAssignment(property) &&
        ((ts.isIdentifier(property.name) && property.name.text === "kind") ||
          (ts.isStringLiteral(property.name) &&
            property.name.text === "kind"))) ||
      (ts.isShorthandPropertyAssignment(property) &&
        property.name.text === "kind"),
  )
  if (!kindProperty) return undefined

  const initializer = ts.isPropertyAssignment(kindProperty)
    ? kindProperty.initializer
    : kindProperty.name
  return resolveDormantTaskKind(initializer, resolver)
}

function findDormantArchitectureReferences(
  source: string,
  fileName: string,
  parsedSource = parseSource(source, fileName),
): string[] {
  const findings = new Set<string>()
  const normalizedFileName = fileName.replaceAll("\\", "/")
  const resolver = createDormantTaskKindResolver(parsedSource)

  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      node.text === dormantRenderedTitleHelper &&
      !isRenderedTitleHelperDeclaration(node, normalizedFileName)
    ) {
      findings.add(`helper:${dormantRenderedTitleHelper}`)
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text === dormantRenderedTitleHelper
    ) {
      findings.add(`helper:${dormantRenderedTitleHelper}`)
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      targetsTempWindowFetch(node.moduleSpecifier) &&
      (!node.exportClause || ts.isNamespaceExport(node.exportClause))
    ) {
      findings.add(`helper:${dormantRenderedTitleHelper}`)
    }
    if (ts.isObjectLiteralExpression(node)) {
      const taskKind = getConstructedDormantTaskKind(node, resolver)
      const allowedHelperConstruction =
        taskKind === "rendered_title" &&
        isTempWindowFetchImplementation(normalizedFileName) &&
        isInsideFunction(node, dormantRenderedTitleHelper)
      if (taskKind && !allowedHelperConstruction) {
        findings.add(`task:${taskKind}`)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(parsedSource)
  return [...findings]
}

function findObsoletePolicyReferences(
  source: string,
  fileName: string,
  parsedSource = parseSource(source, fileName),
): string[] {
  const obsoleteTokens = new Set<string>(obsoleteProtectionBypassIdentifiers)
  const findings = new Set<string>()

  const visit = (node: ts.Node) => {
    const token =
      ts.isIdentifier(node) ||
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
        ? node.text
        : undefined
    if (token && obsoleteTokens.has(token)) {
      findings.add(`obsolete:${token}`)
    }
    ts.forEachChild(node, visit)
  }

  visit(parsedSource)
  return [...findings]
}

describe("architecture source analysis", () => {
  const dormantReferenceCases = [
    {
      name: "namespace helper access",
      source: `
        import * as helpers from "~/utils/browser/tempWindowFetch"
        void helpers.tempWindowGetRenderedTitle
      `,
      expected: "helper:tempWindowGetRenderedTitle",
    },
    {
      name: "named helper re-export",
      source: `
        export { tempWindowGetRenderedTitle } from "~/utils/browser/tempWindowFetch"
      `,
      expected: "helper:tempWindowGetRenderedTitle",
    },
    {
      name: "wildcard helper re-export",
      source: `export * from "~/utils/browser/tempWindowFetch"`,
      expected: "helper:tempWindowGetRenderedTitle",
    },
    {
      name: "dynamic helper import",
      source: `
        const { tempWindowGetRenderedTitle: readTitle } = await import(
          "~/utils/browser/tempWindowFetch"
        )
        void readTitle
      `,
      expected: "helper:tempWindowGetRenderedTitle",
    },
    {
      name: "enum rendered-title task construction",
      source: `
        execute({ kind: TEMP_CONTEXT_TASK_KINDS.RenderedTitle, params: {} })
      `,
      expected: "task:rendered_title",
    },
    {
      name: "literal rendered-title task construction",
      source: `execute({ kind: "rendered_title", params: {} })`,
      expected: "task:rendered_title",
    },
    {
      name: "enum open-context task construction",
      source: `
        execute({ kind: TEMP_CONTEXT_TASK_KINDS.OpenContext, params: {} })
      `,
      expected: "task:open_context",
    },
    {
      name: "literal open-context task construction",
      source: `execute({ kind: "open_context", params: {} })`,
      expected: "task:open_context",
    },
    {
      name: "as-const task construction",
      source: `execute({ kind: "open_context" as const, params: {} })`,
      expected: "task:open_context",
    },
    {
      name: "parenthesized enum task construction",
      source: `
        execute({ kind: (TEMP_CONTEXT_TASK_KINDS.RenderedTitle), params: {} })
      `,
      expected: "task:rendered_title",
    },
    {
      name: "template-literal task construction",
      source: "execute({ kind: `rendered_title`, params: {} })",
      expected: "task:rendered_title",
    },
    {
      name: "type-asserted task construction",
      source: `
        execute({ kind: <TempContextTask["kind"]>"rendered_title", params: {} })
      `,
      expected: "task:rendered_title",
    },
    {
      name: "satisfies-wrapped task construction",
      source: `
        execute({
          kind: "open_context" satisfies TempContextTask["kind"],
          params: {},
        })
      `,
      expected: "task:open_context",
    },
    {
      name: "const-alias task construction",
      source: `
        const alias = TEMP_CONTEXT_TASK_KINDS.OpenContext
        execute({ kind: alias, params: {} })
      `,
      expected: "task:open_context",
    },
    {
      name: "const catalog alias property-access task construction",
      source: `
        const kinds = TEMP_CONTEXT_TASK_KINDS
        execute({ kind: kinds.RenderedTitle, params: {} })
      `,
      expected: "task:rendered_title",
    },
    {
      name: "const catalog alias element-access task construction",
      source: `
        const kinds = TEMP_CONTEXT_TASK_KINDS
        execute({ kind: kinds["OpenContext"], params: {} })
      `,
      expected: "task:open_context",
    },
    {
      name: "shorthand const-alias task construction",
      source: `
        const kind = "rendered_title"
        execute({ kind, params: {} })
      `,
      expected: "task:rendered_title",
    },
    {
      name: "lexically scoped shorthand const-alias task construction",
      source: `
        {
          const kind = "ordinary_task"
          execute({ kind, params: {} })
        }
        {
          const kind = "open_context"
          execute({ kind, params: {} })
        }
      `,
      expected: "task:open_context",
    },
  ] as const

  for (const { name, source, expected } of dormantReferenceCases) {
    it(`detects ${name}`, () => {
      expect(findDormantArchitectureReferences(source, "fixture.ts")).toContain(
        expected,
      )
    })
  }

  const shadowedAliasCases: readonly {
    name: string
    source: string
    expectSourceScopeBarrier?: boolean
  }[] = [
    {
      name: "function parameter",
      source: `
        const kind = "open_context"
        function run(kind: string) {
          use({ kind, params: {} })
        }
      `,
    },
    {
      name: "expression-bodied arrow parameter",
      source: `
        const kind = "rendered_title"
        const run = (kind: string) => use({ kind, params: {} })
      `,
    },
    {
      name: "block-local let binding",
      source: `
        const kind = "open_context"
        {
          let kind = "ordinary_task"
          use({ kind, params: {} })
        }
      `,
    },
    {
      name: "destructuring binding",
      source: `
        const kind = "rendered_title"
        {
          const { kind } = input
          use({ kind, params: {} })
        }
      `,
    },
    {
      name: "catch binding",
      source: `
        const kind = "open_context"
        try {
          use(input)
        } catch (kind) {
          use({ kind, params: {} })
        }
      `,
    },
    {
      name: "function declaration",
      source: `
        const kind = "rendered_title"
        {
          function kind() {}
          use({ kind, params: {} })
        }
      `,
    },
    {
      name: "named function-expression body binding",
      source: `
        const kind = "open_context"
        const run = function kind() {
          use({ kind, params: {} })
        }
      `,
    },
    {
      name: "import binding",
      source: `
        import { kind } from "./fixture"
        export {}
        use({ kind, params: {} })
      `,
      expectSourceScopeBarrier: true,
    },
  ] as const

  for (const { name, source, expectSourceScopeBarrier } of shadowedAliasCases) {
    it(`ignores an outer dormant alias shadowed by a ${name}`, () => {
      const parsedSource = parseSource(source, "fixture.ts")

      expect(
        findDormantArchitectureReferences(source, "fixture.ts", parsedSource),
      ).toEqual([])
      if (expectSourceScopeBarrier) {
        expect(
          collectScopeAliases(parsedSource).get(parsedSource)?.get("kind")
            ?.value,
        ).toBe(unresolvedAlias)
      }
    })
  }

  const defaultParameterCases = [
    {
      name: "function parameter",
      source: `
        const kind = "open_context"
        function run(kind = use({ kind, params: {} })) {}
      `,
      expected: [],
    },
    {
      name: "expression-bodied arrow parameter",
      source: `
        const kind = "rendered_title"
        const run = (kind = use({ kind, params: {} })) => undefined
      `,
      expected: [],
    },
    {
      name: "method parameter",
      source: `
        const kind = "open_context"
        class Runner {
          run(kind = use({ kind, params: {} })) {}
        }
      `,
      expected: [],
    },
    {
      name: "named function-expression parameter initializer",
      source: `
        const kind = "open_context"
        const run = function kind(value = use({ kind, params: {} })) {}
      `,
      expected: [],
    },
    {
      name: "unshadowed function parameter initializer",
      source: `
        const kind = "open_context"
        function run(value = use({ kind, params: {} })) {}
      `,
      expected: ["task:open_context"],
    },
    {
      name: "unshadowed arrow parameter initializer with an ordinary alias",
      source: `
        const kind = "ordinary_task"
        const run = (value = use({ kind, params: {} })) => undefined
      `,
      expected: [],
    },
  ] as const

  for (const { name, source, expected } of defaultParameterCases) {
    it(`resolves default ${name} scope without leaking outer aliases`, () => {
      expect(findDormantArchitectureReferences(source, "fixture.ts")).toEqual(
        expected,
      )
    })
  }

  it("resolves repeated alias chains once and terminates alias cycles", () => {
    const aliasChain = Array.from(
      { length: 40 },
      (_, index) =>
        `const alias${index + 1} = ${index === 0 ? "root" : `alias${index}`}`,
    ).join("\n")
    const repeatedUses = Array.from(
      { length: 8 },
      () => "use({ kind: alias40, params: {} })",
    ).join("\n")

    expect(
      findDormantArchitectureReferences(
        `
          const root = "open_context"
          ${aliasChain}
          const cycleLeft = cycleRight
          const cycleRight = cycleLeft
          ${repeatedUses}
          use({ kind: cycleLeft, params: {} })
        `,
        "fixture.ts",
      ),
    ).toEqual(["task:open_context"])
  })

  it("ignores obsolete-token comments and generic prose", () => {
    expect(
      findObsoletePolicyReferences(
        `
          // operation_not_permitted was removed.
          const explanation = "The operation_not_permitted state was removed"
        `,
        "fixture.ts",
      ),
    ).toEqual([])
  })

  it("detects exact obsolete string values and symbol identifiers", () => {
    expect(
      findObsoletePolicyReferences(
        `
          const reason = "operation_not_permitted"
          const PROTECTION_BYPASS_FEATURE_OPERATIONS = {}
        `,
        "fixture.ts",
      ),
    ).toEqual([
      "obsolete:operation_not_permitted",
      "obsolete:PROTECTION_BYPASS_FEATURE_OPERATIONS",
    ])
  })
})

describe("protection bypass architecture", () => {
  it("routes protected runtime handlers only through the Coordinator", async () => {
    const source = await fs.readFile(runtimeMessagesPath, "utf8")

    expect(source).toMatch(
      /import\s*\{\s*protectionBypassCoordinator\s*\}\s*from\s*"\.\/protectionBypassCoordinator"/,
    )
    for (const handler of legacyProtectedHandlers) {
      expect(source).not.toMatch(
        new RegExp(
          `import\\s*\\{[^}]*\\b${handler}\\b[^}]*\\}\\s*from\\s*["'][^"']*tempWindowPool["']`,
          "s",
        ),
      )
    }
  })

  it("keeps tempWindowFetch independent from the background pool", async () => {
    const source = await fs.readFile(tempWindowFetchPath, "utf8")

    expect(source).not.toMatch(
      /import\s*\{\s*protectionBypassCoordinator\s*\}\s*from\s*["'][^"']*background\/protectionBypassCoordinator["']/,
    )
    expect(source).not.toMatch(
      /(?:import|export)\s+[\s\S]*?from\s*["'][^"']*tempWindowPool["']/,
    )
    expect(source).not.toMatch(/\bDEFAULT_PREFERENCES\b/)
    expect(source).toMatch(/preferences:\s*TempWindowFallbackPreferences/)
  })

  it("keeps intent only in the Coordinator envelope", async () => {
    const [typesSource, contractsSource, clientSource] = await Promise.all([
      fs.readFile(tempWindowTypesPath, "utf8"),
      fs.readFile(protectionBypassContractsPath, "utf8"),
      fs.readFile(protectionBypassClientPath, "utf8"),
    ])

    expect(contractsSource).toContain("execution: ProtectionBypassExecution")
    expect(contractsSource).not.toMatch(
      /params:[\s\S]{0,200}protectionBypassExecution/,
    )
    expect(contractsSource).not.toMatch(
      /params:[\s\S]{0,200}tempWindowRequestSource/,
    )
    expect(clientSource).not.toMatch(
      /runtimeActions|sendRuntimeActionMessage|protectionBypassCoordinator/,
    )
    expect(typesSource).toContain(
      "protectionBypassExecution: ProtectionBypassExecution",
    )
  })

  it("keeps protected implementations private while browser context work stays in the pool", async () => {
    const source = await fs.readFile(tempWindowPoolPath, "utf8")

    for (const handler of legacyProtectedHandlers) {
      expect(source).not.toMatch(
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${handler}\\b`),
      )
    }
    for (const browserCall of [
      "createTab",
      "createWindow",
      "openTabInCompositeWindow",
      "acquireTempContext",
    ]) {
      expect(source).toMatch(new RegExp(`\\b${browserCall}\\(`))
    }

    const exportedFunctions = Array.from(
      source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\b/gm),
      (match) => match[1],
    ).sort()
    expect(exportedFunctions).toEqual([
      "cleanupTempContextsOnSuspend",
      "executeAuthorizedTempContextTask",
      "handleCloseTempWindow",
      "setupTempWindowListeners",
    ])
  })

  it("allows only the Coordinator to import the authorized pool adapter", async () => {
    await expect(findAuthorizedAdapterImporters()).resolves.toEqual([
      "src/entrypoints/background/protectionBypassCoordinator.ts",
    ])
  })

  it("allows only the shared transport and runtime listener to reference the protected task action", async () => {
    await expect(findProtectedTaskActionReferences()).resolves.toEqual([
      "src/entrypoints/background/runtimeMessages.ts",
      "src/utils/browser/tempWindowFetch.ts",
    ])
  })

  it("keeps every canonical task kind in the policy metadata catalog", () => {
    const knownOperations = new Set(Object.values(PROTECTION_BYPASS_OPERATIONS))
    const knownCauses = new Set(Object.values(PROTECTION_BYPASS_CAUSES))

    for (const kind of Object.values(TEMP_CONTEXT_TASK_KINDS)) {
      const metadata = getTempContextTaskMetadata({ kind })
      expect(knownOperations.has(metadata.operation)).toBe(true)
      expect(knownCauses.has(metadata.cause)).toBe(true)
    }
  })

  it("defines task ownership for every feature without authorizing dormant tasks", () => {
    for (const feature of Object.values(PROTECTION_BYPASS_FEATURES)) {
      const ownedTaskKinds = PROTECTION_BYPASS_FEATURE_TASK_KINDS[feature]

      expect(ownedTaskKinds).toBeDefined()
      expect(ownedTaskKinds).not.toContain(
        TEMP_CONTEXT_TASK_KINDS.RenderedTitle,
      )
      expect(ownedTaskKinds).not.toContain(TEMP_CONTEXT_TASK_KINDS.OpenContext)
    }
  })

  it("keeps deleted policy values and compatibility symbols out of production source", async () => {
    const sources = await readAnalyzedSourceFiles()

    for (const obsoleteIdentifier of obsoleteProtectionBypassIdentifiers) {
      const references = sources
        .filter(({ obsoleteReferences }) =>
          obsoleteReferences.includes(`obsolete:${obsoleteIdentifier}`),
        )
        .map(({ relativePath }) => relativePath)

      expect(references, obsoleteIdentifier).toEqual([])
    }
  })

  it("keeps ModelRedirectService outside protection-bypass execution ownership", async () => {
    const source = await fs.readFile(modelRedirectServicePath, "utf8")

    expect(
      findProtectionBypassReferences(
        parseSource(source, modelRedirectServicePath),
      ),
    ).toEqual([])
  })

  it("keeps rendered-title and open-context helpers dormant in production", async () => {
    const references = (await readAnalyzedSourceFiles()).flatMap(
      ({ dormantReferences, relativePath }) =>
        dormantReferences.map((reference) => `${relativePath}:${reference}`),
    )
    expect(references).toEqual([])

    const [fetchSource, poolSource, contractsSource] = await Promise.all([
      fs.readFile(tempWindowFetchPath, "utf8"),
      fs.readFile(tempWindowPoolPath, "utf8"),
      fs.readFile(protectionBypassContractsPath, "utf8"),
    ])
    expect(fetchSource).toMatch(
      /export\s+async\s+function\s+tempWindowGetRenderedTitle\b/,
    )
    expect(poolSource).toMatch(/async\s+function\s+executeOpenTempContext\b/)
    expect(poolSource).not.toMatch(
      /export\s+async\s+function\s+executeOpenTempContext\b/,
    )
    expect(contractsSource).toMatch(
      /export\s+interface\s+OpenTempContextParams\b/,
    )
  })

  it("keeps removed grant and continuation state out of source", async () => {
    const allProtectionBypassSource = (await readSourceFiles())
      .map(({ source }) => source)
      .join("\n")
    const clientSource = await fs.readFile(protectionBypassClientPath, "utf8")

    expect(allProtectionBypassSource).not.toMatch(
      /grantRegistry|verifiedContinuation|beginUserCommand|endUserCommand|grantId/,
    )
    expect(clientSource).not.toMatch(
      /runtimeActions|sendRuntimeActionMessage|protectionBypassCoordinator/,
    )
  })
})
