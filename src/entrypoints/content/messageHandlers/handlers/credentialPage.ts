/** Read-only capability check. Never clicks token controls or reads their values. */
export async function handleInspectCredentialPage(
  _request: unknown,
  sendResponse: (value: unknown) => void,
) {
  const inspect = (): "credential" | "not_found" | "unknown" => {
    if (document.querySelector("section[aria-labelledby=security-access]"))
      return "credential"
    const buttons = [...document.querySelectorAll("button")]
    if (
      buttons.some((button) =>
        /^(access token|system token|访问令牌|存取權杖|系统访问令牌|システムトークン)/i.test(
          button.textContent?.trim() ?? "",
        ),
      )
    )
      return "credential"
    if (
      [...document.querySelectorAll("h1")].some(
        (node) => node.textContent?.trim() === "404",
      )
    )
      return "not_found"
    return "unknown"
  }
  let state = inspect()
  if (state === "unknown") {
    state = await new Promise<"credential" | "not_found" | "unknown">(
      (resolve) => {
        const observer = new MutationObserver(() => {
          const next = inspect()
          if (next !== "unknown") {
            observer.disconnect()
            clearTimeout(timer)
            resolve(next)
          }
        })
        const timer = setTimeout(() => {
          observer.disconnect()
          resolve("unknown")
        }, 5000)
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        })
      },
    )
  }
  sendResponse({ success: true, state })
}
