interface ExtensionRuntimeBrowser {
  runtime?: {
    getURL?: (path: string) => string
  }
}

/**
 * Resolve a packaged extension asset without assuming one browser global.
 */
export function getExtensionResourceUrl(path: string) {
  const runtimeGlobal = globalThis as unknown as {
    browser?: ExtensionRuntimeBrowser
    chrome?: ExtensionRuntimeBrowser
  }
  const runtime =
    runtimeGlobal.browser?.runtime ?? runtimeGlobal.chrome?.runtime

  if (!runtime?.getURL) {
    throw new Error("Extension runtime.getURL is unavailable")
  }

  return runtime.getURL(path)
}
