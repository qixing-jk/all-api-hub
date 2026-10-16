/**
 * Runs a self-contained function in the page world of a tab.
 * Returns null when the scripting API is unavailable or the page rejects it.
 */
export async function executeMainWorldFunction<TResult>(
  tabId: number,
  func: (...args: any[]) => TResult,
  args: unknown[] = [],
): Promise<TResult | null> {
  const scripting = browser.scripting
  if (typeof scripting?.executeScript !== "function") return null

  try {
    const [injection] = await scripting.executeScript({
      target: { tabId },
      args,
      func,
      world: "MAIN",
    } as unknown as browser.scripting.ScriptInjection)
    if (injection?.error) return null
    return (injection?.result ?? null) as TResult | null
  } catch {
    return null
  }
}
