import { act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StrictMode, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  AccountKeyResourceEditorDialog,
  type AccountKeyResourceEditorDialogState,
} from "~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceEditorDialog"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/components/OneTimeSecretDialog"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
  OPENROUTER_KEY_LIMIT_RESETS,
} from "~/services/apiAdapters/openrouter/keyResourceFields"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const field = OPENROUTER_KEY_FIELD_IDS

const editor = (mode: "create" | "edit" = "create") => ({
  editorId: 1,
  mode,
  fields: [
    { fieldId: field.Name, type: "text" as const, required: true },
    {
      fieldId: field.Workspace,
      type: "select" as const,
      required: true,
      readOnly: mode === "edit",
      options: [
        { value: "workspace-example", displayLabel: "Example team" },
        { value: "workspace-next", displayLabel: "Next team" },
      ],
    },
    {
      fieldId: field.Creator,
      type: "select" as const,
      nullable: true,
      readOnly: mode === "edit",
      options: [],
      ...(mode === "create"
        ? { optionLoader: { dependsOn: [field.Workspace] } }
        : {}),
    },
    {
      fieldId: field.LimitMode,
      type: "select" as const,
      required: true,
      options: Object.values(OPENROUTER_KEY_LIMIT_MODES).map((value) => ({
        value,
      })),
    },
    { fieldId: field.Limit, type: "number" as const, nullable: true, min: 0 },
    {
      fieldId: field.LimitReset,
      type: "select" as const,
      required: true,
      options: Object.values(OPENROUTER_KEY_LIMIT_RESETS).map((value) => ({
        value,
      })),
    },
    {
      fieldId: field.ExpiresAt,
      type: "date-time" as const,
      nullable: true,
      readOnly: mode === "edit",
    },
    ...(mode === "edit"
      ? [{ fieldId: field.Disabled, type: "boolean" as const }]
      : []),
    { fieldId: field.IncludeByokInLimit, type: "boolean" as const },
  ],
  initialValues: {
    [field.Name]: "Example key",
    [field.Workspace]: "workspace-example",
    [field.Creator]: "member-example",
    [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Unlimited,
    [field.Limit]: null,
    [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.None,
    [field.ExpiresAt]: "2030-01-01T00:00",
    [field.Disabled]: false,
    [field.IncludeByokInLimit]: false,
  },
  values: {
    [field.Name]: "Example key",
    [field.Workspace]: "workspace-example",
    [field.Creator]: "member-example",
    [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Unlimited,
    [field.Limit]: null,
    [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.None,
    [field.ExpiresAt]: "2030-01-01T00:00",
    [field.Disabled]: false,
    [field.IncludeByokInLimit]: false,
  },
})

describe("AccountKeyResourceEditorDialog", () => {
  it("lets the user dismiss loading and failed launches while preserving retry", async () => {
    const retry = vi.fn()
    const cancel = vi.fn()
    const openingProps: any = {
      opening: {
        attemptId: 4,
        status: "failure",
        failure: { code: "unavailable" },
      },
      onRetryOpening: retry,
      onCancelOpening: cancel,
    }
    const { rerender } = render(
      <AccountKeyResourceEditorDialog
        editor={null}
        {...openingProps}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByRole("alert")).toHaveTextContent(
      "keyManagement:openRouter.editor.opening.failed",
    )
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "common:actions.close" })
        .find((button) => button.textContent === "common:actions.close")!,
    )
    expect(cancel).toHaveBeenCalledWith(4)
    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.opening.retry",
      }),
    )
    expect(retry).toHaveBeenCalledWith(4)

    rerender(
      <AccountKeyResourceEditorDialog
        editor={null}
        opening={{ attemptId: 5, status: "loading" }}
        onCancelOpening={cancel}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "common:actions.cancel",
      }),
    )
    expect(cancel).toHaveBeenLastCalledWith(5)

    rerender(
      <AccountKeyResourceEditorDialog
        editor={null}
        opening={{ attemptId: 6, status: "loading" }}
        onCancelOpening={cancel}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
    )
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(cancel).toHaveBeenLastCalledWith(6)

    rerender(
      <AccountKeyResourceEditorDialog
        editor={null}
        opening={{
          attemptId: 7,
          status: "failure",
          failure: { code: "unavailable" },
        }}
        onCancelOpening={cancel}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
    )
    fireEvent.click(document.querySelector('[data-slot="modal-overlay"]')!)
    expect(cancel).toHaveBeenLastCalledWith(7)
  })

  it("uses fixed single-column sections and only reveals limited spending controls when needed", () => {
    render(
      <AccountKeyResourceEditorDialog
        editor={editor()}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(
      screen
        .getAllByRole("group")
        .map(
          (section) =>
            section.getAttribute("aria-label") ??
            section.querySelector("legend")?.textContent,
        ),
    ).toEqual([
      "keyManagement:openRouter.editor.sections.basic",
      "keyManagement:openRouter.editor.sections.spending",
      "keyManagement:openRouter.editor.sections.lifecycle",
      "keyManagement:openRouter.editor.sections.advanced",
    ])
    expect(
      screen.queryByLabelText(
        "keyManagement:openRouter.editor.fields.limit.label",
      ),
    ).toBeNull()
    fireEvent.click(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.limitMode\.label/,
      }),
    )
    fireEvent.click(
      screen.getByRole("option", {
        name: "keyManagement:openRouter.editor.options.limitMode.limited",
      }),
    )
    expect(
      screen.getByLabelText(
        "keyManagement:openRouter.editor.fields.limit.label",
      ),
    ).toHaveValue(null)
    expect(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.limitReset\.label/,
      }),
    ).toBeVisible()
    expect(
      screen.getByText("keyManagement:openRouter.editor.summary"),
    ).toBeVisible()
    const cancel = screen.getByRole("button", {
      name: "keyManagement:openRouter.editor.actions.cancel",
    })
    const save = screen.getByRole("button", {
      name: "keyManagement:openRouter.editor.actions.save",
    })
    expect(cancel.parentElement).toBe(save.parentElement)
    expect(cancel.parentElement).toHaveClass("flex-wrap")
    const footer = screen.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.nativeEditorFooter,
    )
    expect(footer).toBeVisible()
    expect(footer).toContainElement(cancel)
    expect(footer).toContainElement(save)
  })

  it("keeps edit-only workspace, creator, and expiry fields read-only and associates field issues", () => {
    render(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor("edit"),
          feedback: {
            code: "validation_failed" as const,
            fieldIssues: [{ fieldId: field.Name, code: "required" as const }],
          },
        }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.workspace\.label/,
      }),
    ).toBeDisabled()
    expect(
      screen.getByLabelText(
        "keyManagement:openRouter.editor.fields.creator.label",
      ),
    ).toBeDisabled()
    expect(screen.getByDisplayValue("2030-01-01T00:00")).toHaveAttribute(
      "readonly",
    )
    expect(
      screen.getByRole("textbox", {
        name: /keyManagement:openRouter\.editor\.fields\.name\.label/,
      }),
    ).toHaveAttribute("aria-invalid", "true")
    expect(
      screen.getByText("keyManagement:openRouter.editor.issues.required"),
    ).toHaveAttribute("role", "alert")
  })

  it("delegates member loading and clears the creator in its local projection after the workspace changes", async () => {
    const onLoadOptions = vi.fn()
    const onValuesChange = vi.fn()
    render(
      <AccountKeyResourceEditorDialog
        editor={editor()}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={onValuesChange}
        onLoadOptions={onLoadOptions}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledTimes(1))
    fireEvent.click(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.workspace\.label/,
      }),
    )
    fireEvent.click(screen.getByRole("option", { name: "Next team" }))
    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledTimes(2))
    expect(onValuesChange).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        [field.Workspace]: "workspace-next",
        [field.Creator]: null,
      }),
    )
  })

  it("starts each editor session with its own projection before loading dependent options", async () => {
    const onLoadOptions = vi.fn()
    const SessionHarness = () => {
      const [session, setSession] =
        useState<AccountKeyResourceEditorDialogState | null>(null)
      const open = (editorId: number, workspace: string) =>
        setSession({
          ...editor(),
          editorId,
          initialValues: {
            ...editor().initialValues,
            [field.Workspace]: workspace,
          },
          values: { ...editor().values, [field.Workspace]: workspace },
        })
      return (
        <>
          <button type="button" onClick={() => open(1, "workspace-example")}>
            Open first session
          </button>
          <button type="button" onClick={() => open(2, "workspace-next")}>
            Open next session
          </button>
          <AccountKeyResourceEditorDialog
            editor={session}
            onClose={() => undefined}
            onSubmit={() => undefined}
            onValuesChange={(_, values) =>
              setSession((current) =>
                current ? { ...current, values } : current,
              )
            }
            onLoadOptions={onLoadOptions}
          />
        </>
      )
    }
    const user = userEvent.setup()
    render(<SessionHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(screen.getByRole("button", { name: "Open first session" }))
    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledTimes(1))
    expect(onLoadOptions).toHaveBeenLastCalledWith(
      1,
      field.Creator,
      expect.objectContaining({ [field.Workspace]: "workspace-example" }),
    )

    onLoadOptions.mockClear()
    await user.click(screen.getByRole("button", { name: "Open next session" }))
    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledTimes(1))
    expect(onLoadOptions).toHaveBeenLastCalledWith(
      2,
      field.Creator,
      expect.objectContaining({ [field.Workspace]: "workspace-next" }),
    )
  })

  it("keeps typed values through controller rehydration and submits its latest corrected creator", async () => {
    const submit = vi.fn()
    const user = userEvent.setup()
    const ControllerDialogHarness = () => {
      const [controllerEditor, setControllerEditor] =
        useState<AccountKeyResourceEditorDialogState>(editor())
      return (
        <>
          <button
            type="button"
            onClick={() =>
              setControllerEditor((current) => ({
                ...current,
                initialValues: {
                  ...current.initialValues,
                  [field.Workspace]: "workspace-next",
                  [field.Creator]: null,
                },
                values: {
                  ...current.values,
                  [field.Workspace]: "workspace-next",
                  [field.Creator]: null,
                },
              }))
            }
          >
            Rehydrate workspace
          </button>
          <AccountKeyResourceEditorDialog
            editor={controllerEditor}
            onClose={() => undefined}
            onSubmit={submit}
            onValuesChange={(_, values) =>
              setControllerEditor((current) => ({ ...current, values }))
            }
          />
        </>
      )
    }
    render(<ControllerDialogHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const name = screen.getByRole("textbox", {
      name: /keyManagement:openRouter\.editor\.fields\.name\.label/,
    })
    await user.clear(name)
    await user.type(name, "Typed key")
    await user.click(
      screen.getByRole("button", { name: "Rehydrate workspace" }),
    )

    expect(name).toHaveValue("Typed key")
    expect(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.workspace\.label/,
      }),
    ).toHaveTextContent("Next team")
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )
    expect(submit).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        [field.Name]: "Typed key",
        [field.Workspace]: "workspace-next",
        [field.Creator]: null,
      }),
    )
  })

  it("keeps an optional creator unavailable while allowing a null creator submission", async () => {
    const retry = vi.fn()
    const submit = vi.fn()
    const { rerender } = render(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          values: { ...editor().values, [field.Creator]: null },
          loadingFieldIds: [field.Creator],
        }}
        onClose={() => undefined}
        onSubmit={submit}
        onLoadOptions={retry}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
    expect(
      screen.getByText("common:status.loading").closest("[role=status]"),
    ).toHaveTextContent("common:status.loading")
    expect(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.creator\.label/,
      }),
    ).toBeDisabled()
    const save = screen.getByRole("button", {
      name: "keyManagement:openRouter.editor.actions.save",
    })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(submit).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ [field.Creator]: null }),
    )
    await waitFor(() => expect(save).toBeEnabled())

    rerender(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          values: { ...editor().values, [field.Creator]: null },
          optionsByField: { [field.Creator]: [] },
          optionFailuresByField: {
            [field.Creator]: {
              code: "permission_denied",
              message: "safe sentinel permission detail",
              upstreamCode: "safe_sentinel_permission_code",
            },
          },
        }}
        onClose={() => undefined}
        onSubmit={submit}
        onLoadOptions={retry}
        onValuesChange={() => undefined}
      />,
    )
    const unavailable = screen.getByText(
      "keyManagement:openRouter.editor.options.creator.unavailable",
    )
    expect(unavailable).toBeVisible()
    expect(unavailable.closest("[role=status]")).toHaveAttribute(
      "aria-live",
      "polite",
    )
    expect(
      screen.queryByText(
        "keyManagement:openRouter.editor.feedback.permissionDenied",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("safe sentinel permission detail"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("safe_sentinel_permission_code"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.creator\.label/,
      }),
    ).toBeDisabled()
    expect(save).toBeEnabled()
    expect(
      screen.queryByRole("button", { name: /common:actions\.retry/ }),
    ).not.toBeInTheDocument()
    submit.mockClear()
    fireEvent.click(save)
    expect(submit).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ [field.Creator]: null }),
    )
    await waitFor(() => expect(save).toBeEnabled())

    rerender(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          values: { ...editor().values, [field.Creator]: null },
          optionsByField: { [field.Creator]: [] },
          optionFailuresByField: {
            [field.Creator]: { code: "unavailable" },
          },
        }}
        onClose={() => undefined}
        onSubmit={submit}
        onLoadOptions={retry}
        onValuesChange={() => undefined}
      />,
    )
    expect(
      screen.getByText("keyManagement:openRouter.editor.feedback.unavailable"),
    ).toHaveAttribute("role", "alert")
    const loadCallCountBeforeRetry = retry.mock.calls.length
    fireEvent.click(
      screen.getByRole("button", { name: /common:actions\.retry/ }),
    )
    expect(retry).toHaveBeenCalledTimes(loadCallCountBeforeRetry + 1)
    expect(retry).toHaveBeenLastCalledWith(1, field.Creator, expect.any(Object))

    rerender(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          values: { ...editor().values, [field.Creator]: null },
          optionsByField: { [field.Creator]: [] },
        }}
        onClose={() => undefined}
        onSubmit={submit}
        onLoadOptions={retry}
        onValuesChange={() => undefined}
      />,
    )
    expect(
      screen.getByText("keyManagement:openRouter.editor.options.creator.empty"),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    ).toBeEnabled()
  })

  it("lets a selected optional creator be cleared before submitting", async () => {
    const submit = vi.fn()
    const user = userEvent.setup()
    render(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          optionsByField: {
            [field.Creator]: [
              { value: "member-example", displayLabel: "Example member" },
            ],
          },
        }}
        onClose={() => undefined}
        onSubmit={submit}
        onValuesChange={() => undefined}
        onLoadOptions={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    await user.click(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.creator\.label/,
      }),
    )
    await user.click(
      screen.getByRole("option", {
        name: "keyManagement:openRouter.editor.options.creator.none",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )
    expect(submit).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ [field.Creator]: null }),
    )
  })

  it("keeps a raw creator identifier out of the rendered select state", async () => {
    const rawCreatorId = "raw-member-id-example"
    const user = userEvent.setup()
    render(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          initialValues: {
            ...editor().initialValues,
            [field.Creator]: rawCreatorId,
          },
          values: {
            ...editor().values,
            [field.Creator]: rawCreatorId,
          },
          optionsByField: {
            [field.Creator]: [
              {
                value: "creator-option-1",
                displayLabel: "Unknown member",
              },
            ],
          },
        }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    await user.click(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.creator\.label/,
      }),
    )
    expect(
      screen.getByRole("option", {
        name: "keyManagement:openRouter.editor.options.creator.unknown",
      }),
    ).toBeVisible()
    expect(document.body.innerHTML).not.toContain(rawCreatorId)
  })

  it("keeps focus in the stable dialog when opening controls are replaced", async () => {
    const cancel = vi.fn()
    const close = vi.fn()
    const { rerender } = render(
      <AccountKeyResourceEditorDialog
        editor={null}
        opening={{
          attemptId: 1,
          status: "failure",
          failure: { code: "unavailable" },
        }}
        onRetryOpening={() => undefined}
        onCancelOpening={cancel}
        onClose={close}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const retry = screen.getByRole("button", {
      name: "keyManagement:openRouter.editor.opening.retry",
    })
    retry.focus()
    rerender(
      <AccountKeyResourceEditorDialog
        editor={null}
        opening={{ attemptId: 1, status: "loading" }}
        onCancelOpening={cancel}
        onClose={close}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
    )
    const dialog = screen.getByRole("dialog")
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(cancel).toHaveBeenCalledWith(1)

    const loadingCancel = screen.getByRole("button", {
      name: "common:actions.cancel",
    })
    loadingCancel.focus()
    rerender(
      <AccountKeyResourceEditorDialog
        editor={editor()}
        onClose={close}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
    )
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(close).toHaveBeenCalledWith(1)
  })

  it("renders private opening detail beneath the localized recovery message", () => {
    render(
      <AccountKeyResourceEditorDialog
        editor={null}
        opening={{
          attemptId: 1,
          status: "failure",
          failure: {
            code: "permission_denied",
            message: "Workspace policy blocks this key.",
            upstreamCode: "workspace_policy",
          },
        }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(
      "keyManagement:openRouter.editor.feedback.permissionDenied",
    )
    expect(alert).toHaveTextContent("Workspace policy blocks this key.")
    expect(alert).toHaveTextContent("workspace_policy")
  })

  it("settles a terminal editor close through Modal before removing its shell", async () => {
    const user = userEvent.setup()
    const FocusHarness = () => {
      const [activeEditor, setActiveEditor] =
        useState<AccountKeyResourceEditorDialogState | null>(null)
      return (
        <>
          <button type="button" onClick={() => setActiveEditor(editor())}>
            Open terminal editor
          </button>
          <AccountKeyResourceEditorDialog
            editor={activeEditor}
            onClose={() => setActiveEditor(null)}
            onSubmit={() =>
              setActiveEditor((current) =>
                current ? { ...current, terminalClose: true } : current,
              )
            }
            onValuesChange={() => undefined}
          />
        </>
      )
    }
    render(<FocusHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const trigger = screen.getByRole("button", {
      name: "Open terminal editor",
    })
    await user.click(trigger)
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it("settles a terminal close while its original submit promise is still pending", async () => {
    let resolveSubmit!: () => void
    const pendingSubmit = new Promise<void>((resolve) => {
      resolveSubmit = resolve
    })
    const user = userEvent.setup()
    const FocusHarness = () => {
      const [activeEditor, setActiveEditor] =
        useState<AccountKeyResourceEditorDialogState | null>(null)
      return (
        <>
          <button type="button" onClick={() => setActiveEditor(editor())}>
            Open deferred terminal editor
          </button>
          <AccountKeyResourceEditorDialog
            editor={activeEditor}
            onClose={() => setActiveEditor(null)}
            onSubmit={() => {
              setActiveEditor((current) =>
                current ? { ...current, terminalClose: true } : current,
              )
              return pendingSubmit
            }}
            onValuesChange={() => undefined}
          />
        </>
      )
    }
    render(<FocusHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const trigger = screen.getByRole("button", {
      name: "Open deferred terminal editor",
    })
    await user.click(trigger)
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(trigger).toHaveFocus()
    resolveSubmit()
  })

  it("keeps one focus workflow through an editor create into final secret close", async () => {
    let resolveCreate!: () => void
    const create = new Promise<void>((resolve) => {
      resolveCreate = resolve
    })
    const user = userEvent.setup()
    const FocusHarness = () => {
      const [editorPhase, setEditorPhase] = useState<
        "idle" | "editor" | "terminal"
      >("idle")
      const [hasSecret, setHasSecret] = useState(false)
      const focusWorkflowId = "editor-secret-workflow"
      return (
        <>
          <button type="button" onClick={() => setEditorPhase("editor")}>
            Launch native key editor
          </button>
          <AccountKeyResourceEditorDialog
            editor={
              editorPhase === "idle"
                ? null
                : {
                    ...editor(),
                    ...(editorPhase === "terminal"
                      ? { terminalClose: true }
                      : {}),
                  }
            }
            onClose={() => setEditorPhase("idle")}
            onSubmit={async () => {
              await create
              setEditorPhase("terminal")
              setHasSecret(true)
            }}
            onValuesChange={() => undefined}
            focusWorkflowId={focusWorkflowId}
          />
          <OneTimeSecretDialog
            isOpen={hasSecret}
            result={
              hasSecret
                ? {
                    displayName: "Example key",
                    secret: "one-time-secret-example",
                  }
                : null
            }
            onClose={() => {
              setHasSecret(false)
              setEditorPhase("idle")
            }}
            autoCopy={false}
            focusWorkflowId={focusWorkflowId}
          />
        </>
      )
    }
    render(<FocusHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const launcher = screen.getByRole("button", {
      name: "Launch native key editor",
    })
    await user.click(launcher)
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )
    await act(async () => resolveCreate())
    await screen.findByDisplayValue("one-time-secret-example")
    await user.click(
      screen.getByTestId("key-management-one-time-key-close-button"),
    )
    await user.click(
      screen.getByTestId("key-management-one-time-key-confirm-close-button"),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(launcher).toHaveFocus()
  })

  it("normalizes canonical UTC edit expiry values for datetime-local fields", () => {
    const expiresAt = "2030-01-01T00:00:00Z"
    const expected = new Date(expiresAt)
    const expectedLocalValue = `${expected.getFullYear()}-${String(
      expected.getMonth() + 1,
    ).padStart(2, "0")}-${String(expected.getDate()).padStart(2, "0")}T${String(
      expected.getHours(),
    ).padStart(2, "0")}:${String(expected.getMinutes()).padStart(2, "0")}`

    render(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor("edit"),
          initialValues: {
            ...editor("edit").initialValues,
            [field.ExpiresAt]: expiresAt,
          },
          values: {
            ...editor("edit").values,
            [field.ExpiresAt]: expiresAt,
          },
        }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(
      screen.getByLabelText(
        "keyManagement:openRouter.editor.fields.expiresAt.label",
      ),
    ).toHaveValue(expectedLocalValue)
  })

  it("summarizes the live spending, BYOK, and expiry rules and discloses non-default BYOK settings", () => {
    render(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          initialValues: {
            ...editor().initialValues,
            [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
            [field.Limit]: 0,
            [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.Daily,
            [field.IncludeByokInLimit]: true,
          },
          values: {
            ...editor().values,
            [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
            [field.Limit]: 0,
            [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.Daily,
            [field.IncludeByokInLimit]: true,
          },
        }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(
      screen.getByText("keyManagement:openRouter.editor.summaryRules.limit", {
        exact: false,
      }),
    ).toBeVisible()
    expect(
      screen.getByLabelText(
        "keyManagement:openRouter.editor.fields.limit.label",
      ),
    ).toHaveValue(0)
    expect(
      screen.getByText(
        "keyManagement:openRouter.editor.summaryRules.byok.included",
        {
          exact: false,
        },
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        "keyManagement:openRouter.editor.summaryRules.expiresAt",
        {
          exact: false,
        },
      ),
    ).toBeVisible()
    expect(
      screen.getByRole("group", {
        name: "keyManagement:openRouter.editor.sections.advanced",
      }),
    ).toHaveAttribute("open")
  })

  it("only summarizes reset cadence for limited spending and keeps BYOK disclosure user-controlled", async () => {
    const user = userEvent.setup()
    const initialEditor = {
      ...editor(),
      initialValues: {
        ...editor().initialValues,
        [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.Daily,
        [field.IncludeByokInLimit]: true,
      },
      values: {
        ...editor().values,
        [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.Daily,
        [field.IncludeByokInLimit]: true,
      },
    }
    const { rerender } = render(
      <AccountKeyResourceEditorDialog
        editor={initialEditor}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const summary = screen.getByRole("status")
    expect(summary).not.toHaveTextContent(
      "keyManagement:openRouter.editor.summaryRules.reset.daily",
    )
    const advanced = screen.getByRole("group", {
      name: "keyManagement:openRouter.editor.sections.advanced",
    })
    await user.click(advanced.querySelector("summary")!)
    expect(advanced).not.toHaveAttribute("open")

    rerender(
      <AccountKeyResourceEditorDialog
        editor={{ ...initialEditor, feedback: { code: "unavailable" } }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
    )
    expect(advanced).not.toHaveAttribute("open")

    await user.click(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.limitMode\.label/,
      }),
    )
    await user.click(
      screen.getByRole("option", {
        name: "keyManagement:openRouter.editor.options.limitMode.limited",
      }),
    )
    expect(summary).toHaveTextContent(
      "keyManagement:openRouter.editor.summaryRules.reset.daily",
    )
  })

  it("maps authentication and uncertain feedback with weekly and monthly reset summaries", () => {
    const weeklyEditor: AccountKeyResourceEditorDialogState = {
      ...editor(),
      feedback: { code: "authentication_failed" },
      values: {
        ...editor().values,
        [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
        [field.Limit]: 10,
        [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.Weekly,
      },
    }
    const { rerender } = render(
      <AccountKeyResourceEditorDialog
        editor={weeklyEditor}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByRole("alert")).toHaveTextContent(
      "keyManagement:openRouter.editor.feedback.authenticationFailed",
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:openRouter.editor.summaryRules.reset.weekly",
    )

    rerender(
      <AccountKeyResourceEditorDialog
        editor={{
          ...weeklyEditor,
          feedback: { code: "mutation_state_uncertain" },
          values: {
            ...weeklyEditor.values,
            [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.Monthly,
          },
        }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "keyManagement:openRouter.editor.feedback.uncertain",
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:openRouter.editor.summaryRules.reset.monthly",
    )
  })

  it("distinguishes unset limited spending limits from zero USD", () => {
    const { rerender } = render(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          initialValues: {
            ...editor().initialValues,
            [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
            [field.Limit]: null,
          },
          values: {
            ...editor().values,
            [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
            [field.Limit]: null,
          },
        }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:openRouter.editor.summaryRules.limitUnset",
    )
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "keyManagement:openRouter.editor.summaryRules.limit ·",
    )

    rerender(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          initialValues: {
            ...editor().initialValues,
            [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
            [field.Limit]: "",
          },
          values: {
            ...editor().values,
            [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
            [field.Limit]: "",
          },
        }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:openRouter.editor.summaryRules.limitUnset",
    )

    rerender(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          initialValues: {
            ...editor().initialValues,
            [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
            [field.Limit]: 0,
          },
          values: {
            ...editor().values,
            [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
            [field.Limit]: 0,
          },
        }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onValuesChange={() => undefined}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:openRouter.editor.summaryRules.limit ·",
    )
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "keyManagement:openRouter.editor.summaryRules.limitUnset",
    )
  })

  it("prevents double submission and confirms unsaved close", async () => {
    const submit = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    )
    const close = vi.fn()
    render(
      <AccountKeyResourceEditorDialog
        editor={editor()}
        onClose={close}
        onSubmit={submit}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )
    expect(submit).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "keyManagement:openRouter.editor.actions.save",
        }),
      ).not.toBeDisabled(),
    )
    fireEvent.change(
      screen.getByRole("textbox", {
        name: /keyManagement:openRouter\.editor\.fields\.name\.label/,
      }),
      { target: { value: "Changed key" } },
    )
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )
    expect(
      screen.getByText("keyManagement:openRouter.editor.unsaved.title"),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.unsaved.keepEditing",
      }),
    )
    expect(
      screen.queryByText("keyManagement:openRouter.editor.unsaved.title"),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.unsaved.discard",
      }),
    )
    expect(close).toHaveBeenCalledOnce()
  })

  it("binds commands and sanitized private failure detail to the editor session", async () => {
    const submit = vi.fn()
    const close = vi.fn()
    render(
      <AccountKeyResourceEditorDialog
        editor={{
          ...editor(),
          feedback: {
            code: "upstream_rejected",
            message: "The selected workspace cannot create this key.",
            upstreamCode: "workspace_policy",
          },
        }}
        onClose={close}
        onSubmit={submit}
        onValuesChange={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const feedback = screen.getByRole("alert")
    expect(feedback).toHaveTextContent(
      "keyManagement:openRouter.editor.feedback.error",
    )
    expect(feedback).toHaveTextContent(
      "The selected workspace cannot create this key.",
    )
    expect(feedback).toHaveTextContent("workspace_policy")

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )
    expect(submit).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ [field.Workspace]: "workspace-example" }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "keyManagement:openRouter.editor.actions.save",
        }),
      ).not.toBeDisabled(),
    )
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )
    expect(close).toHaveBeenCalledWith(1)
  })

  it("moves focus into its mounted modal and returns it to the trigger after Escape closes it", async () => {
    const user = userEvent.setup()
    const FocusHarness = () => {
      const [isOpen, setIsOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open editor
          </button>
          {isOpen ? (
            <AccountKeyResourceEditorDialog
              editor={editor()}
              onClose={() => setIsOpen(false)}
              onSubmit={() => undefined}
              onValuesChange={() => undefined}
            />
          ) : null}
        </>
      )
    }
    render(<FocusHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const trigger = screen.getByRole("button", { name: "Open editor" })
    await user.click(trigger)
    const dialog = await screen.findByRole("dialog")
    expect(dialog.contains(document.activeElement)).toBe(true)

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it("preserves the original launcher focus through opening and a keyed editor rehydration", async () => {
    const user = userEvent.setup()
    const FocusHarness = () => {
      const [phase, setPhase] = useState<"idle" | "opening" | "editor">("idle")
      const [editorId, setEditorId] = useState(1)
      return (
        <>
          <button type="button" onClick={() => setPhase("opening")}>
            Open editor
          </button>
          <button type="button" onClick={() => setPhase("editor")}>
            Resolve editor
          </button>
          <button type="button" onClick={() => setEditorId(2)}>
            Rehydrate editor
          </button>
          <AccountKeyResourceEditorDialog
            editor={phase === "editor" ? { ...editor(), editorId } : null}
            opening={
              phase === "opening"
                ? { attemptId: 1, status: "loading" }
                : { attemptId: 1, status: "idle" }
            }
            onCancelOpening={() => setPhase("idle")}
            onClose={() => setPhase("idle")}
            onSubmit={() => undefined}
            onValuesChange={() => undefined}
          />
        </>
      )
    }
    render(
      <StrictMode>
        <FocusHarness />
      </StrictMode>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const trigger = screen.getByRole("button", { name: "Open editor" })
    await user.click(trigger)
    await screen.findByRole("dialog")
    fireEvent.click(screen.getByRole("button", { name: "Resolve editor" }))
    fireEvent.click(screen.getByRole("button", { name: "Rehydrate editor" }))
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(trigger).toHaveFocus()
  })
})
