interface ExtensionStorageBrowser {
  storage?: {
    local?: {
      get: (keys: string | string[] | null) => Promise<Record<string, unknown>>
    }
  }
}

/**
 * Read extension storage during startup without loading application helpers.
 * `null` enumerates the area, which ownership-marker scans need because tab ids
 * cannot be guessed.
 */
export async function getLocalStorage(keys: string | string[] | null) {
  const runtimeGlobal = globalThis as unknown as {
    browser?: ExtensionStorageBrowser
    chrome?: ExtensionStorageBrowser
  }
  const storage =
    runtimeGlobal.browser?.storage?.local ??
    runtimeGlobal.chrome?.storage?.local

  if (typeof storage?.get !== "function") {
    throw new Error("Extension storage.local.get is unavailable")
  }

  return await storage.get(keys)
}
