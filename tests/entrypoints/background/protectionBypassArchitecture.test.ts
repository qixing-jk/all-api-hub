import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  getTempContextTaskMetadata,
  PROTECTION_BYPASS_CAUSES,
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
let sourceFilesPromise: Promise<SourceFile[]> | undefined

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
