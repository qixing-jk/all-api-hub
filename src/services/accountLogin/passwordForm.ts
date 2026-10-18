const AGREEMENT_WAIT_MS = 2_000
const AGREEMENT_POLL_INTERVAL_MS = 100

/** Excludes hidden forms and controls without relying on page-specific classes. */
export function isVisiblePasswordControl(element: HTMLElement) {
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node)
    if (
      node.hidden ||
      node.getAttribute("aria-hidden") === "true" ||
      style.display === "none" ||
      style.visibility === "hidden"
    )
      return false
  }
  return element.isConnected
}

/** Adopt only a provider's verified native password-choice labels, never OAuth. */
export function enterPasswordLogin(labels: readonly string[]): boolean {
  const normalize = (text: string) => text.replace(/\s+/g, "").toLowerCase()
  const expected = new Set(labels.map(normalize))
  const entries = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .filter(isVisiblePasswordControl)
    .filter((button) => expected.has(normalize(button.textContent ?? "")))
  if (!entries.length) return false
  if (
    entries.length === 1 &&
    !entries[0]!.disabled &&
    !entries[0]!.closest("form")
  )
    entries[0]!.click()
  // A disabled or ambiguous known entry needs a person, not an API bypass.
  return true
}
/** Only adopt an unambiguous same-origin password form. */
export function findPasswordLoginForm() {
  const passwords = [
    ...document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
  ].filter(isVisiblePasswordControl)
  if (passwords.length !== 1) return null
  const password = passwords[0]!
  const form = password.closest("form")
  if (
    !form ||
    new URL(form.action, location.href).origin !== location.origin ||
    form.querySelector('input[autocomplete="new-password"]')
  )
    return null
  const identities = [
    ...form.querySelectorAll<HTMLInputElement>(
      'input[type="email"], input[name="username"], input[name="email"], input[autocomplete="username"], input[type="text"]',
    ),
  ].filter(isVisiblePasswordControl)
  if (identities.length !== 1) return null
  const buttons = [
    ...form.querySelectorAll<HTMLButtonElement>(
      'button[type="submit"], button:not([type])',
    ),
  ].filter(isVisiblePasswordControl)
  if (
    buttons.length !== 1 ||
    new URL(buttons[0]!.formAction || form.action, location.href).origin !==
      location.origin
  )
    return null
  return { form, password, identity: identities[0]!, submit: buttons[0]! }
}
/** Notify native React/Vue controls through their normal input events. */
export function fillPasswordInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}
/** Use site-owned consent events; optional preferences are never selected. */
export async function acceptLoginAgreement(
  form: HTMLFormElement,
): Promise<boolean> {
  const controls = [
    ...form.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      'input[type="checkbox"], button[role="checkbox"]',
    ),
  ].filter((control) => {
    if (!isVisiblePasswordControl(control)) return false
    if (["legal-consent", "login-agreement-consent"].includes(control.id))
      return true
    // Semi UI nests its checkbox and legal links in the same native label.
    return [...(control.labels ?? [])].some((label) =>
      [...label.querySelectorAll<HTMLAnchorElement>("a[href]")].some((link) => {
        const url = new URL(link.href, location.href)
        return (
          url.origin === location.origin &&
          ["/user-agreement", "/privacy-policy"].includes(url.pathname)
        )
      }),
    )
  })
  const checked = (control: HTMLInputElement | HTMLButtonElement) =>
    control instanceof HTMLInputElement
      ? control.checked
      : control.getAttribute("aria-checked") === "true"
  for (const control of controls) {
    if (checked(control)) continue
    if (control.disabled || control.getAttribute("aria-disabled") === "true")
      return false
    control.click()
    // React/Vue must commit the native acceptance and enable login controls.
    const deadline = Date.now() + AGREEMENT_WAIT_MS
    do {
      await new Promise((resolve) =>
        setTimeout(resolve, AGREEMENT_POLL_INTERVAL_MS),
      )
    } while (control.isConnected && !checked(control) && Date.now() < deadline)
    if (!control.isConnected || !checked(control)) return false
  }
  return true
}
