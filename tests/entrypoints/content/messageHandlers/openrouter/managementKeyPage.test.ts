// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"

import { OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS } from "~/constants/openRouterBootstrap"
import {
  OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH,
  OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
  OPENROUTER_MANAGEMENT_KEYS_PATH,
  performOpenRouterManagementKeyPageAction,
} from "~/entrypoints/content/messageHandlers/openrouter/managementKeyPage"
import { OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH } from "~/services/apiAdapters/openrouter/managementKeySecret"

function pageEnvironment(pathname = OPENROUTER_MANAGEMENT_KEYS_PATH) {
  return {
    document,
    location: { origin: OPENROUTER_MANAGEMENT_KEYS_ORIGIN, pathname },
    MutationObserver,
  }
}

function installCreateFlow(
  label = "extension-request-example",
  onResultClose: () => void = () => {},
  accessToken = "sk-or-test-secret",
) {
  document.body.innerHTML = `
    <main>
      <h1>管理密钥</h1>
      <button type="button">New Key</button>
    </main>
  `
  document.querySelector("button")?.addEventListener("click", () => {
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    dialog.setAttribute("data-open", "")
    dialog.innerHTML = `
      <label for="name">Name</label>
      <input id="name" placeholder="Example label" />
      <button type="button" disabled data-disabled>Continue</button>
    `
    document.body.append(dialog)
    const input = dialog.querySelector<HTMLInputElement>("input")!
    const submit = dialog.querySelector<HTMLButtonElement>("button")!
    input.addEventListener("input", () => {
      submit.disabled = !input.value
      submit.toggleAttribute("data-disabled", submit.disabled)
    })
    submit.addEventListener("click", () => {
      const submittedLabel = input.value
      dialog.innerHTML = `
        <p>密钥已创建</p>
        <code>${accessToken}</code>
        <p>${submittedLabel}</p>
        <button type="button" aria-label="Dismiss">×</button>
      `
      dialog.querySelector("button")?.addEventListener("click", onResultClose)
    })
  })
  return label
}

describe("OpenRouter Management Key page automation", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    vi.useRealTimers()
  })

  it("submits the exact caller label once and returns the one-time secret", async () => {
    const label = installCreateFlow()
    const onCreateDispatched = vi.fn().mockResolvedValue(true)

    const result = await performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-example",
        operation: { kind: "create", label },
      },
      pageEnvironment(),
      onCreateDispatched,
    )

    expect(onCreateDispatched).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      requestId: "request-example",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-test-secret",
      label,
    })
    expect(document.body.textContent).toContain(label)
  })

  it("settles the captured secret without clicking the result Close control", async () => {
    const closeClick = vi.fn()
    const label = installCreateFlow("extension-request-example", closeClick)

    const result = await performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-no-result-close",
        operation: { kind: "create", label },
      },
      pageEnvironment(),
      vi.fn().mockResolvedValue(true),
    )

    expect(result).toMatchObject({
      mutationState: "created",
      accessToken: "sk-or-test-secret",
    })
    expect(closeClick).not.toHaveBeenCalled()
  })

  it("accepts a one-time secret at the defensive protocol length boundary", async () => {
    const accessToken = `sk-or-${"a".repeat(
      OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH - "sk-or-".length,
    )}`
    const label = installCreateFlow(
      "extension-request-boundary",
      undefined,
      accessToken,
    )

    await expect(
      performOpenRouterManagementKeyPageAction(
        {
          requestId: "request-boundary-secret",
          operation: { kind: "create", label },
        },
        pageEnvironment(),
        vi.fn().mockResolvedValue(true),
      ),
    ).resolves.toMatchObject({ mutationState: "created", accessToken })
  })

  it("does not expose an oversized one-time secret", async () => {
    vi.useFakeTimers()
    const accessToken = `sk-or-${"a".repeat(
      OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH - "sk-or-".length + 1,
    )}`
    const label = installCreateFlow(
      "extension-request-oversized",
      undefined,
      accessToken,
    )
    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-oversized-secret",
        operation: { kind: "create", label },
      },
      pageEnvironment(),
      vi.fn().mockResolvedValue(true),
    )
    await vi.runAllTimersAsync()

    const result = await action
    expect(result).toMatchObject({
      mutationState: "dispatched_unconfirmed",
      attemptOutcome: "timeout",
    })
    expect(result).not.toHaveProperty("accessToken")
    expect(JSON.stringify(result)).not.toContain(accessToken)
  })

  it.each([
    '<a href="/auth/login">Sign in</a>',
    '<a href="/auth/login" hidden>Sign in</a>',
  ])(
    "prefers authenticated controls when the page also contains a sign-in artifact: %s",
    async (signInArtifact) => {
      const label = installCreateFlow()
      document.body.insertAdjacentHTML("beforeend", signInArtifact)

      const result = await performOpenRouterManagementKeyPageAction(
        {
          requestId: "request-authenticated-with-sign-in-artifact",
          operation: { kind: "create", label },
        },
        pageEnvironment(),
        vi.fn().mockResolvedValue(true),
      )

      expect(result).toMatchObject({
        mutationState: "created",
        attemptOutcome: "success",
      })
    },
  )

  it("fails closed when main contains multiple New Key controls", async () => {
    vi.useFakeTimers()
    const firstClick = vi.fn()
    const secondClick = vi.fn()
    document.body.innerHTML = `
      <main>
        <button type="button">New Key</button>
        <button type="button">New Key</button>
      </main>
    `
    const [first, second] = Array.from(document.querySelectorAll("button"))
    first.addEventListener("click", firstClick)
    second.addEventListener("click", secondClick)

    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-ambiguous-new-key",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn(),
    )
    await vi.runAllTimersAsync()

    await expect(action).resolves.toMatchObject({
      mutationState: "not_dispatched",
      attemptOutcome: "page_changed",
    })
    expect(firstClick).not.toHaveBeenCalled()
    expect(secondClick).not.toHaveBeenCalled()
  })

  it("fails closed when New Key opens multiple eligible create dialogs", async () => {
    const submitClicks = [vi.fn(), vi.fn()]
    const onCreateDispatched = vi.fn()
    document.body.innerHTML = `
      <main><button type="button">New Key</button></main>
    `
    document.querySelector("button")?.addEventListener("click", () => {
      for (const [index, submitClick] of submitClicks.entries()) {
        const dialog = document.createElement("div")
        dialog.setAttribute("role", "dialog")
        dialog.setAttribute("data-open", "")
        dialog.innerHTML = `
          <label for="name">Name ${index}</label>
          <input id="name" />
          <button type="button" disabled data-disabled>Continue</button>
        `
        dialog.querySelector("button")?.addEventListener("click", submitClick)
        document.body.append(dialog)
      }
    })

    const result = await performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-ambiguous-create-dialog",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      onCreateDispatched,
    )

    expect(result).toMatchObject({
      mutationState: "not_dispatched",
      attemptOutcome: "page_changed",
    })
    expect(onCreateDispatched).not.toHaveBeenCalled()
    expect(submitClicks[0]).not.toHaveBeenCalled()
    expect(submitClicks[1]).not.toHaveBeenCalled()
  })

  it("uses a pre-mounted create dialog after New Key makes it visible", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <main>
        <h1>Management Keys</h1>
        <button type="button">New Key</button>
      </main>
      <div role="dialog" hidden data-closed>
        <label for="name">Name</label>
        <input id="name" placeholder="Example label" />
        <button type="button" disabled data-disabled>Continue</button>
      </div>
    `
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const createButton = dialog.querySelector<HTMLButtonElement>(
      "button[data-disabled]",
    )!
    document.querySelector("button")?.addEventListener("click", () => {
      dialog.hidden = false
      dialog.removeAttribute("data-closed")
      dialog.setAttribute("data-open", "")
    })
    dialog.querySelector("input")?.addEventListener("input", (event) => {
      createButton.disabled = !(event.currentTarget as HTMLInputElement).value
      createButton.toggleAttribute("data-disabled", createButton.disabled)
    })
    createButton.addEventListener("click", () => {
      dialog.innerHTML = `
        <p>Created</p>
        <code>sk-or-premounted-secret</code>
        <button type="button" aria-label="Dismiss">×</button>
      `
    })

    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-premounted-dialog",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn().mockResolvedValue(true),
    )
    await vi.runAllTimersAsync()

    await expect(action).resolves.toMatchObject({
      mutationState: "created",
      accessToken: "sk-or-premounted-secret",
    })
  })

  it("waits for React to enable Create in a later disabled-attribute update", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <main>
        <h1>Management Keys</h1>
        <button type="button">New Key</button>
      </main>
      <div role="dialog" hidden data-closed>
        <label for="name">Name</label>
        <input id="name" placeholder="Example label" />
        <button type="button" disabled data-disabled>Continue</button>
      </div>
    `
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const input = dialog.querySelector("input")!
    const createButton = dialog.querySelector<HTMLButtonElement>("button")!
    document.querySelector("button")?.addEventListener("click", () => {
      dialog.hidden = false
      dialog.removeAttribute("data-closed")
      dialog.setAttribute("data-open", "")
    })
    input.addEventListener("input", () => {
      setTimeout(() => {
        createButton.disabled = false
        createButton.removeAttribute("data-disabled")
      }, 10)
    })
    createButton.addEventListener("click", () => {
      dialog.innerHTML = `
        <p>Created</p>
        <code>sk-or-async-enable-secret</code>
        <button type="button" aria-label="Dismiss">×</button>
      `
    })

    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-async-enable",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn().mockResolvedValue(true),
    )
    await vi.runAllTimersAsync()

    await expect(action).resolves.toMatchObject({
      mutationState: "created",
      accessToken: "sk-or-async-enable-secret",
    })
  })

  it("observes an in-place text update for the one-time secret code", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <main><button type="button">New Key</button></main>
    `
    document.querySelector("button")?.addEventListener("click", () => {
      const dialog = document.createElement("div")
      dialog.setAttribute("role", "dialog")
      dialog.setAttribute("data-open", "")
      dialog.innerHTML = `
        <label for="name">Name</label>
        <input id="name" />
        <button type="button" disabled data-disabled>Continue</button>
      `
      const input = dialog.querySelector<HTMLInputElement>("input")!
      const submit = dialog.querySelector<HTMLButtonElement>("button")!
      input.addEventListener("input", () => {
        submit.disabled = !input.value
        submit.toggleAttribute("data-disabled", submit.disabled)
      })
      submit.addEventListener("click", () => {
        dialog.innerHTML = `<code>pending</code><button type="button">×</button>`
        const codeText = dialog.querySelector("code")?.firstChild
        setTimeout(() => {
          if (codeText) codeText.nodeValue = "sk-or-in-place-secret"
        }, 10)
      })
      document.body.append(dialog)
    })

    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-in-place-secret",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn().mockResolvedValue(true),
    )
    await vi.runAllTimersAsync()

    await expect(action).resolves.toMatchObject({
      mutationState: "created",
      accessToken: "sk-or-in-place-secret",
    })
  })

  it("does not click a stale submit control after the dispatch marker awaits", async () => {
    vi.useFakeTimers()
    const label = installCreateFlow()
    let releaseMarker: (() => void) | undefined
    const marker = new Promise<void>((resolve) => {
      releaseMarker = resolve
    })
    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-stale-submit",
        operation: { kind: "create", label },
      },
      pageEnvironment(),
      async () => {
        await marker
        return true
      },
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const submit = dialog.querySelector<HTMLButtonElement>("button")!
    const submitClick = vi.fn()
    submit.addEventListener("click", submitClick)
    dialog.remove()
    releaseMarker?.()
    await vi.runAllTimersAsync()

    await expect(action).resolves.toMatchObject({
      mutationState: "dispatched_unconfirmed",
      attemptOutcome: "failed",
    })
    expect(submitClick).not.toHaveBeenCalled()
  })

  it("does not click the original submit when another create candidate appears during the marker await", async () => {
    vi.useFakeTimers()
    const label = installCreateFlow()
    let releaseMarker: (() => void) | undefined
    const marker = new Promise<void>((resolve) => {
      releaseMarker = resolve
    })
    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-ambiguous-after-marker",
        operation: { kind: "create", label },
      },
      pageEnvironment(),
      async () => {
        await marker
        return true
      },
    )
    await vi.advanceTimersByTimeAsync(0)
    const originalDialog =
      document.querySelector<HTMLElement>('[role="dialog"]')!
    const originalSubmit =
      originalDialog.querySelector<HTMLButtonElement>("button")!
    const originalSubmitClick = vi.fn()
    originalSubmit.addEventListener("click", originalSubmitClick)

    const competingDialog = document.createElement("div")
    competingDialog.setAttribute("role", "dialog")
    competingDialog.setAttribute("data-open", "")
    competingDialog.innerHTML = `
      <label for="name">Other name</label>
      <input id="name" />
      <button type="button" disabled data-disabled>Continue</button>
    `
    const competingSubmitClick = vi.fn()
    competingDialog
      .querySelector("button")
      ?.addEventListener("click", competingSubmitClick)
    document.body.append(competingDialog)
    releaseMarker?.()
    await vi.runAllTimersAsync()

    await expect(action).resolves.toMatchObject({
      mutationState: "dispatched_unconfirmed",
      attemptOutcome: "failed",
    })
    expect(originalSubmitClick).not.toHaveBeenCalled()
    expect(competingSubmitClick).not.toHaveBeenCalled()
  })

  it("accepts a unique fresh success dialog after the create form is removed", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <main>
        <h1>Management Keys</h1>
        <button type="button">New Key</button>
      </main>
    `
    document.querySelector("button")?.addEventListener("click", () => {
      const createDialog = document.createElement("div")
      createDialog.setAttribute("role", "dialog")
      createDialog.setAttribute("data-open", "")
      createDialog.innerHTML = `
        <label for="name">Name</label>
        <input id="name" placeholder="Example label" />
        <button type="button" disabled data-disabled>Continue</button>
      `
      const input = createDialog.querySelector("input")!
      const createButton = createDialog.querySelector("button")!
      input.addEventListener("input", () => {
        createButton.disabled = !input.value
        createButton.toggleAttribute("data-disabled", createButton.disabled)
      })
      createButton.addEventListener("click", () => {
        createDialog.remove()
        const successDialog = document.createElement("div")
        successDialog.setAttribute("role", "dialog")
        successDialog.setAttribute("data-open", "")
        successDialog.innerHTML = `
          <p>Created elsewhere</p>
          <code>sk-or-remounted-secret</code>
          <button type="button" aria-label="Dismiss">×</button>
        `
        document.body.append(successDialog)
      })
      document.body.append(createDialog)
    })

    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-remounted-result",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn().mockResolvedValue(true),
    )
    await vi.runAllTimersAsync()

    await expect(action).resolves.toMatchObject({
      mutationState: "created",
      accessToken: "sk-or-remounted-secret",
    })
  })

  it("does not accept a pre-existing hidden result dialog that becomes visible", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <main><button type="button">New Key</button></main>
      <div role="dialog" hidden data-closed>
        <code>sk-or-stale-hidden</code>
      </div>
    `
    const staleDialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    document.querySelector("button")?.addEventListener("click", () => {
      const createDialog = document.createElement("div")
      createDialog.setAttribute("role", "dialog")
      createDialog.setAttribute("data-open", "")
      createDialog.innerHTML = `
        <label for="name">Name</label>
        <input id="name" />
        <button type="button" disabled data-disabled>Continue</button>
      `
      const input = createDialog.querySelector<HTMLInputElement>("input")!
      const submit = createDialog.querySelector<HTMLButtonElement>("button")!
      input.addEventListener("input", () => {
        submit.disabled = !input.value
        submit.toggleAttribute("data-disabled", submit.disabled)
      })
      submit.addEventListener("click", () => {
        staleDialog.hidden = false
        staleDialog.removeAttribute("data-closed")
        staleDialog.setAttribute("data-open", "")
      })
      document.body.append(createDialog)
    })

    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-stale-hidden-result",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn().mockResolvedValue(true),
    )
    await vi.runAllTimersAsync()

    await expect(action).resolves.toMatchObject({
      mutationState: "dispatched_unconfirmed",
      attemptOutcome: "timeout",
    })
    await expect(action).resolves.not.toHaveProperty("accessToken")
  })

  it.each([
    "",
    "   ",
    "x".repeat(OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH + 1),
  ])(
    "rejects invalid labels without opening the create dialog",
    async (label) => {
      installCreateFlow()
      const result = await performOpenRouterManagementKeyPageAction(
        {
          requestId: "request-invalid-label",
          operation: { kind: "create", label },
        },
        pageEnvironment(),
        vi.fn(),
      )

      expect(result).toMatchObject({
        requestId: "request-invalid-label",
        operation: "create",
        mutationState: "not_dispatched",
        attemptOutcome: "page_changed",
        label,
      })
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    },
  )

  it("rejects a non-canonical observed origin before mutation", async () => {
    installCreateFlow()
    const onCreateDispatched = vi.fn()
    const result = await performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-wrong-origin",
        operation: { kind: "create", label: "extension-request-example" },
      },
      {
        ...pageEnvironment(),
        location: {
          origin: "https://example.invalid",
          pathname: OPENROUTER_MANAGEMENT_KEYS_PATH,
        },
      },
      onCreateDispatched,
    )

    expect(result).toMatchObject({
      mutationState: "not_dispatched",
      attemptOutcome: "invalid_origin",
    })
    expect(onCreateDispatched).not.toHaveBeenCalled()
  })

  it("classifies an unexpected path on the canonical origin as page_changed", async () => {
    installCreateFlow()

    const result = await performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-wrong-path",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment("/settings/other"),
      vi.fn(),
    )

    expect(result).toMatchObject({
      mutationState: "not_dispatched",
      attemptOutcome: "page_changed",
    })
  })

  it("does not click Create when the dispatch marker is rejected", async () => {
    installCreateFlow()
    const marker = vi.fn().mockResolvedValue(false)

    const result = await performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-marker-rejected",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      marker,
    )

    expect(marker).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      mutationState: "not_dispatched",
      attemptOutcome: "cancelled_before_create",
    })
    expect(document.body.textContent).not.toContain("sk-or-test-secret")
  })

  it("does not click Create when the dispatch marker stalls until the deadline", async () => {
    vi.useFakeTimers()
    installCreateFlow()

    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-marker-timeout",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      () => new Promise(() => {}),
    )
    await vi.advanceTimersByTimeAsync(OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS)

    await expect(action).resolves.toMatchObject({
      mutationState: "not_dispatched",
      attemptOutcome: "timeout",
    })
    expect(document.body.textContent).not.toContain("sk-or-test-secret")
  })

  it("classifies an explicit sign-in page as logged out", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<a href="/auth/login">Sign in</a>'
    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-logged-out",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn(),
    )
    await vi.advanceTimersByTimeAsync(OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS)

    await expect(action).resolves.toMatchObject({
      mutationState: "not_dispatched",
      attemptOutcome: "logged_out",
    })
  })

  it("does not classify hidden sign-in controls as logged out", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<a href="/auth/login" hidden>Sign in</a>'
    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-hidden-login",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn(),
    )
    await vi.advanceTimersByTimeAsync(OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS)

    await expect(action).resolves.toMatchObject({
      mutationState: "not_dispatched",
      attemptOutcome: "timeout",
    })
  })

  it("does not treat an unrelated login-history link as a sign-in control", async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<a href="/settings/login-history">Review login history</a>'
    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-login-history",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn(),
    )
    await vi.advanceTimersByTimeAsync(OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS)

    await expect(action).resolves.toMatchObject({
      mutationState: "not_dispatched",
      attemptOutcome: "timeout",
    })
  })

  it("times out at the implementation-owned deadline without dispatch", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = "<main></main>"
    const action = performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-timeout",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn(),
    )
    await vi.runAllTimersAsync()

    await expect(action).resolves.toMatchObject({
      mutationState: "not_dispatched",
      attemptOutcome: "timeout",
    })
  })

  it("does not discover a remote ID by matching the caller label", async () => {
    const label = installCreateFlow()
    const duplicateRow = document.createElement("div")
    duplicateRow.dataset.managementKeyId = "wrong-duplicate-id"
    duplicateRow.textContent = label
    document.body.append(duplicateRow)

    const result = await performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-no-label-search",
        operation: { kind: "create", label },
      },
      pageEnvironment(),
      vi.fn().mockResolvedValue(true),
    )

    expect(result).toMatchObject({ mutationState: "created" })
    expect(result).not.toHaveProperty("remoteCredentialId")
  })

  it("extracts the secret only from the new result dialog", async () => {
    document.body.innerHTML = `
      <code>sk-or-stale-secret</code>
      <main>
        <h1>Management Keys</h1>
        <button type="button">New Key</button>
      </main>
    `
    document.querySelector("button")?.addEventListener("click", () => {
      const dialog = document.createElement("div")
      dialog.setAttribute("role", "dialog")
      dialog.setAttribute("data-open", "")
      dialog.innerHTML = `<label for="name">Name</label><input id="name" placeholder="Example label" /><button disabled data-disabled>Continue</button>`
      const input = dialog.querySelector<HTMLInputElement>("input")!
      const button = dialog.querySelector<HTMLButtonElement>("button")!
      input.addEventListener("input", () => {
        button.disabled = !input.value
        button.toggleAttribute("data-disabled", button.disabled)
      })
      button.addEventListener("click", () => {
        dialog.innerHTML = `<p>Created</p><code>sk-or-new-secret</code><button aria-label="Dismiss">×</button>`
      })
      document.body.append(dialog)
    })

    const result = await performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-new-secret",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn().mockResolvedValue(true),
    )

    expect(result).toMatchObject({ accessToken: "sk-or-new-secret" })
  })

  it("ignores pre-existing result dialogs and unrelated create controls", async () => {
    const hiddenCreateClick = vi.fn()
    document.body.innerHTML = `
      <main>
        <h1>Management Keys</h1>
        <button type="button">New Key</button>
      </main>
      <div role="dialog" hidden data-closed><code>sk-or-stale-hidden</code></div>
      <div role="dialog" data-open><code>sk-or-stale-visible</code></div>
      <label for="name">Unrelated</label>
      <input id="name" />
      <button disabled data-disabled>Continue</button>
    `
    const newKey = document.querySelector<HTMLButtonElement>(
      'button[type="button"]',
    )!
    newKey.addEventListener("click", () => {
      const hiddenDialog = document.createElement("div")
      hiddenDialog.setAttribute("role", "dialog")
      hiddenDialog.setAttribute("data-open", "")
      hiddenDialog.style.display = "none"
      hiddenDialog.innerHTML = `<label for="name">Hidden</label><input id="name" /><button disabled data-disabled>Continue</button>`
      hiddenDialog
        .querySelector("button")
        ?.addEventListener("click", hiddenCreateClick)
      document.body.append(hiddenDialog)

      const dialog = document.createElement("div")
      dialog.setAttribute("role", "dialog")
      dialog.setAttribute("data-open", "")
      dialog.innerHTML = `
        <label for="name">Name</label>
        <input id="name" placeholder="Example label" />
        <button type="button" disabled data-disabled>Continue</button>
      `
      const input = dialog.querySelector<HTMLInputElement>("input")!
      const submit = dialog.querySelector<HTMLButtonElement>("button")!
      input.addEventListener("input", () => {
        submit.disabled = !input.value
        submit.toggleAttribute("data-disabled", submit.disabled)
      })
      submit.addEventListener("click", () => {
        dialog.innerHTML = `<p>Created</p><code>sk-or-fresh-secret</code><button aria-label="Dismiss">×</button>`
      })
      document.body.append(dialog)
    })

    const result = await performOpenRouterManagementKeyPageAction(
      {
        requestId: "request-fresh-dialog",
        operation: { kind: "create", label: "extension-request-example" },
      },
      pageEnvironment(),
      vi.fn().mockResolvedValue(true),
    )

    expect(result).toMatchObject({ accessToken: "sk-or-fresh-secret" })
    expect(JSON.stringify(result)).not.toContain("sk-or-stale")
    expect(hiddenCreateClick).not.toHaveBeenCalled()
  })
})
