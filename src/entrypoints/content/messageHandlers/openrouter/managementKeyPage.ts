import {
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
  OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS,
  type OpenRouterBootstrapCreatedAttemptOutcome,
  type OpenRouterBootstrapCreatedMutationState,
  type OpenRouterBootstrapDispatchedUnconfirmedMutationState,
  type OpenRouterBootstrapNotDispatchedAttemptOutcome,
  type OpenRouterBootstrapNotDispatchedMutationState,
} from "~/constants/openRouterBootstrap"
import {
  OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH,
  OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
  OPENROUTER_MANAGEMENT_KEYS_PATH,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import type {
  TempWindowOpenRouterManagementKeyActionParams,
  TempWindowOpenRouterManagementKeyActionResult,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import { normalizeOpenRouterManagementKeySecret } from "~/services/apiAdapters/openrouter/managementKeySecret"

export {
  OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH,
  OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
  OPENROUTER_MANAGEMENT_KEYS_PATH,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"

type PageEnvironment = {
  document: Document
  location: Pick<Location, "origin" | "pathname">
  MutationObserver: typeof MutationObserver
}

type PageActionResult = TempWindowOpenRouterManagementKeyActionResult

/** Returns the live page primitives used by the isolated automation. */
function defaultEnvironment(): PageEnvironment {
  return {
    document,
    location: window.location,
    MutationObserver,
  }
}

/** Normalizes visible text for exact selector matching. */
function text(value: Element | null | undefined) {
  return value?.textContent?.replace(/\s+/g, " ").trim() ?? ""
}

/** Checks an element's complete visible text without substring matches. */
function exactText(element: Element, expected: string) {
  return text(element) === expected
}

/** Excludes hidden dialogs and controls from page-action selection. */
function isVisible(element: Element) {
  const view = element.ownerDocument.defaultView
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const node = current as HTMLElement
    if (
      node.hidden ||
      node.hasAttribute("inert") ||
      node.getAttribute("aria-hidden") === "true"
    )
      return false
    const style = view?.getComputedStyle(node)
    if (
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse"
    )
      return false
  }
  return true
}

/** Finds buttons whose complete visible label matches the expected copy. */
function buttonsByText(root: ParentNode, expected: string) {
  return Array.from(root.querySelectorAll("button")).filter(
    (button) => isVisible(button) && exactText(button, expected),
  )
}

/** Returns the only element in a candidate set, failing closed on ambiguity. */
function only<T>(values: T[]) {
  return values.length === 1 ? values[0] : null
}

/** Detects a visible, explicit sign-in control after authenticated readiness fails. */
function isLoggedOut(document: Document) {
  return Array.from(document.querySelectorAll("a,button")).some((element) => {
    if (!isVisible(element)) return false
    const label = text(element).toLowerCase()
    const href = element.getAttribute("href")
    let loginPath = false
    if (href) {
      try {
        const pathname = new URL(href, document.baseURI).pathname.replace(
          /\/+$/,
          "",
        )
        loginPath = pathname === "/auth/login" || pathname === "/login"
      } catch {
        loginPath = false
      }
    }
    return (
      label === "sign in" ||
      label === "log in" ||
      label === "login" ||
      loginPath
    )
  })
}

/** Waits for a DOM predicate until the shared action deadline. */
function waitUntil(
  environment: PageEnvironment,
  predicate: () => boolean,
  deadlineAt: number,
): Promise<boolean> {
  if (predicate()) return Promise.resolve(true)

  return new Promise((resolve) => {
    let settled = false
    const observer = new environment.MutationObserver(() => {
      if (!predicate() || settled) return
      settled = true
      clearTimeout(timeout)
      observer.disconnect()
      resolve(true)
    })
    observer.observe(environment.document.body, {
      attributes: true,
      attributeFilter: [
        "aria-controls",
        "aria-hidden",
        "aria-labelledby",
        "class",
        "data-closed",
        "data-open",
        "disabled",
        "hidden",
        "id",
        "inert",
        "role",
        "style",
      ],
      childList: true,
      characterData: true,
      subtree: true,
    })
    const timeout = setTimeout(
      () => {
        if (settled) return
        settled = true
        observer.disconnect()
        resolve(false)
      },
      Math.max(0, deadlineAt - Date.now()),
    )
  })
}

/** Builds a pre-mutation create result with no secret-bearing fields. */
function notDispatched(
  requestId: string,
  label: string,
  attemptOutcome: OpenRouterBootstrapNotDispatchedAttemptOutcome,
): PageActionResult {
  return {
    requestId,
    operation: "create",
    mutationState:
      OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched as OpenRouterBootstrapNotDispatchedMutationState,
    attemptOutcome,
    label,
  }
}

/** Converts malformed input into a controlled page-shape failure. */
function invalidOperation(requestId: string): PageActionResult {
  return notDispatched(
    requestId,
    "",
    OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged,
  )
}

/**
 * The official OpenRouter `/auth/keys` API is a PKCE exchange for a
 * user-controlled API key; it is not the private Management Keys page-creation
 * protocol (https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml).
 * This module intentionally automates only the authenticated page flow verified
 * on 2026-07-24. It relies on the page's roles and ownership attributes, keeps
 * the private page action opaque, and fails closed when any mutating control is
 * ambiguous.
 */
export async function performOpenRouterManagementKeyPageAction(
  request: TempWindowOpenRouterManagementKeyActionParams,
  environment: PageEnvironment = defaultEnvironment(),
  onCreateDispatched: () => boolean | Promise<boolean> = () => true,
): Promise<PageActionResult> {
  if (
    !request ||
    typeof request.requestId !== "string" ||
    !request.operation ||
    typeof request.operation !== "object" ||
    request.operation.kind !== "create" ||
    typeof request.operation.label !== "string"
  ) {
    return invalidOperation(
      typeof request?.requestId === "string" ? request.requestId : "",
    )
  }
  const deadlineAt = Date.now() + OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS

  if (environment.location.origin !== OPENROUTER_MANAGEMENT_KEYS_ORIGIN) {
    return notDispatched(
      request.requestId,
      request.operation.label,
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.InvalidOrigin,
    )
  }
  if (environment.location.pathname !== OPENROUTER_MANAGEMENT_KEYS_PATH) {
    return notDispatched(
      request.requestId,
      request.operation.label,
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged,
    )
  }

  if (request.operation.kind === "create") {
    const label = request.operation.label
    if (
      typeof label !== "string" ||
      !label.trim() ||
      label.length > OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH
    ) {
      return notDispatched(
        request.requestId,
        label ?? "",
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged,
      )
    }
    const findNewKeyButtons = () => {
      const main = environment.document.querySelector("main")
      return main ? buttonsByText(main, "New Key") : []
    }
    const ready = await waitUntil(
      environment,
      () => findNewKeyButtons().length > 0,
      deadlineAt,
    )
    if (!ready) {
      return notDispatched(
        request.requestId,
        label,
        isLoggedOut(environment.document)
          ? OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut
          : OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout,
      )
    }

    const newKeyButton = only(findNewKeyButtons())
    if (!newKeyButton)
      return notDispatched(
        request.requestId,
        label,
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged,
      )

    const dialogVisibilityBeforeOpen = new Map(
      Array.from(
        environment.document.querySelectorAll<HTMLElement>('[role="dialog"]'),
      ).map((dialog) => [dialog, isVisible(dialog)]),
    )
    newKeyButton.click()
    const findCreateFormDialogs = () =>
      Array.from(
        environment.document.querySelectorAll<HTMLElement>('[role="dialog"]'),
      ).filter((dialog) => {
        if (
          !dialog.hasAttribute("data-open") ||
          !isVisible(dialog) ||
          dialogVisibilityBeforeOpen.get(dialog) === true
        )
          return false
        const inputs = Array.from(
          dialog.querySelectorAll<HTMLInputElement>("input#name"),
        ).filter((candidate) => isVisible(candidate))
        const labels = Array.from(
          dialog.querySelectorAll<HTMLLabelElement>('label[for="name"]'),
        ).filter((candidate) => isVisible(candidate))
        return inputs.length === 1 && labels.length === 1
      })
    const findInitialCreateCandidates = () =>
      findCreateFormDialogs().flatMap((dialog) => {
        const input = only(
          Array.from(
            dialog.querySelectorAll<HTMLInputElement>("input#name"),
          ).filter((candidate) => isVisible(candidate)),
        )
        const submitButtons = Array.from(
          dialog.querySelectorAll<HTMLButtonElement>("button[data-disabled]"),
        ).filter((candidate) => isVisible(candidate) && candidate.disabled)
        const createButton = only(submitButtons)
        return input && createButton ? [{ dialog, input, createButton }] : []
      })
    const dialogReady = await waitUntil(
      environment,
      () => findInitialCreateCandidates().length > 0,
      deadlineAt,
    )
    if (!dialogReady)
      return notDispatched(
        request.requestId,
        label,
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged,
      )

    const createCandidate = only(findInitialCreateCandidates())
    if (!createCandidate)
      return notDispatched(
        request.requestId,
        label,
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged,
      )
    const { dialog: createDialog, input, createButton } = createCandidate

    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    setter?.call(input, label)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
    const createEnabled = await waitUntil(
      environment,
      () =>
        createDialog.isConnected &&
        createDialog.hasAttribute("data-open") &&
        isVisible(createDialog) &&
        createDialog.contains(createButton) &&
        isVisible(createButton) &&
        !createButton.disabled &&
        !createButton.hasAttribute("data-disabled"),
      deadlineAt,
    )
    if (!createEnabled) {
      return notDispatched(
        request.requestId,
        label,
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged,
      )
    }
    let markerTimeout: ReturnType<typeof setTimeout> | undefined
    let markerResult: boolean | "timeout" | "failed"
    try {
      markerResult = await Promise.race([
        Promise.resolve(onCreateDispatched()),
        new Promise<"timeout">((resolve) => {
          markerTimeout = setTimeout(
            () => resolve("timeout"),
            Math.max(0, deadlineAt - Date.now()),
          )
        }),
      ])
    } catch {
      markerResult = "failed"
    } finally {
      if (markerTimeout) clearTimeout(markerTimeout)
    }
    if (markerResult !== true) {
      return notDispatched(
        request.requestId,
        label,
        markerResult === "timeout"
          ? OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout
          : markerResult === false
            ? OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledBeforeCreate
            : OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      )
    }
    const currentCreateForm = only(findCreateFormDialogs())
    const currentInputs = Array.from(
      createDialog.querySelectorAll<HTMLInputElement>("input#name"),
    ).filter((candidate) => isVisible(candidate))
    const currentLabels = Array.from(
      createDialog.querySelectorAll<HTMLLabelElement>('label[for="name"]'),
    ).filter((candidate) => isVisible(candidate))
    const competingSubmitButtons = Array.from(
      createDialog.querySelectorAll<HTMLButtonElement>("button[data-disabled]"),
    ).filter((candidate) => isVisible(candidate) && candidate.disabled)
    if (
      currentCreateForm !== createDialog ||
      only(currentInputs) !== input ||
      currentLabels.length !== 1 ||
      competingSubmitButtons.length !== 0 ||
      !createDialog.isConnected ||
      !createDialog.hasAttribute("data-open") ||
      !isVisible(createDialog) ||
      !createDialog.contains(createButton) ||
      !isVisible(createButton) ||
      createButton.disabled ||
      createButton.hasAttribute("data-disabled")
    ) {
      return {
        requestId: request.requestId,
        operation: "create",
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed as OpenRouterBootstrapDispatchedUnconfirmedMutationState,
        attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
        label,
      }
    }
    const dialogVisibilityBeforeCreate = new Map(
      Array.from(
        environment.document.querySelectorAll<HTMLElement>('[role="dialog"]'),
      ).map((dialog) => [dialog, isVisible(dialog)]),
    )
    createButton.click()

    const findCreatedKeyCandidates = () =>
      Array.from(
        environment.document.querySelectorAll<HTMLElement>(
          '[role="dialog"][data-open]',
        ),
      ).flatMap((dialog) => {
        if (
          !isVisible(dialog) ||
          (dialog !== createDialog && dialogVisibilityBeforeCreate.has(dialog))
        )
          return []
        const codes = Array.from(dialog.querySelectorAll("code"))
        if (codes.length !== 1 || !isVisible(codes[0])) return []
        const secret = normalizeOpenRouterManagementKeySecret(text(codes[0]))
        return secret ? [{ dialog, secret }] : []
      })
    const secretReady = await waitUntil(
      environment,
      () => findCreatedKeyCandidates().length > 0,
      deadlineAt,
    )
    if (!secretReady) {
      return {
        requestId: request.requestId,
        operation: "create",
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed as OpenRouterBootstrapDispatchedUnconfirmedMutationState,
        attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout,
        label,
      }
    }

    const createdKey = only(findCreatedKeyCandidates())
    if (!createdKey) {
      return {
        requestId: request.requestId,
        operation: "create",
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed as OpenRouterBootstrapDispatchedUnconfirmedMutationState,
        attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
        label,
      }
    }

    return {
      requestId: request.requestId,
      operation: "create",
      mutationState:
        OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created as OpenRouterBootstrapCreatedMutationState,
      attemptOutcome:
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success as OpenRouterBootstrapCreatedAttemptOutcome,
      accessToken: createdKey.secret,
      label,
    }
  }

  return invalidOperation(request.requestId)
}
