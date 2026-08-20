import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { SITE_TYPES } from "~/constants/siteType"
import { ManagedResourceCreateDialog } from "~/features/ManagedSiteChannels/components/ManagedResourceCreateDialog"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  ManagedResourceError,
  type ResourceEditor,
  type ResourceFieldIssue,
  type ResourceFieldValue,
} from "~/services/apiAdapters/contracts/managedResourceNative"

const { getManagedResourceFieldPolicyMock } = vi.hoisted(() => ({
  getManagedResourceFieldPolicyMock: vi.fn(),
}))

interface EditorBodyHarnessProps {
  values: ResourceEditor["initialValues"]
  fieldIssues: readonly ResourceFieldIssue[]
  disabled: boolean
  onValueChange: (fieldId: string, value: ResourceFieldValue) => void
  onLoadOptions?: ResourceEditor["loadOptions"]
}

vi.mock(
  "~/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody",
  () => ({
    ManagedResourceEditorBody: ({
      values,
      fieldIssues,
      disabled,
      onValueChange,
      onLoadOptions,
    }: EditorBodyHarnessProps) => (
      <div data-testid="native-resource-editor-body">
        <span data-testid="native-resource-editor-values">
          {String(values.name)}
        </span>
        <span data-testid="native-resource-editor-issues">
          {fieldIssues
            .map(({ fieldId, code }) => `${fieldId}:${code}`)
            .join(",")}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onValueChange("name", "Updated channel")}
        >
          Edit native name
        </button>
        {onLoadOptions ? (
          <button
            type="button"
            onClick={() => void onLoadOptions("name", values)}
          >
            Load native options
          </button>
        ) : null}
      </div>
    ),
  }),
)

vi.mock(
  "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy",
  () => ({
    MANAGED_RESOURCE_EDITOR_MODES: { Create: "create", Edit: "edit" },
    getManagedResourceFieldPolicy: getManagedResourceFieldPolicyMock,
  }),
)

const createEditor = (
  submit: ResourceEditor["submit"],
  overrides: Partial<ResourceEditor> = {},
): ResourceEditor => ({
  fields: [],
  initialValues: { name: "Imported channel" },
  validate: () => ({ valid: true }),
  submit,
  ...overrides,
})

describe("ManagedResourceCreateDialog", () => {
  beforeEach(() => {
    getManagedResourceFieldPolicyMock.mockReset()
    getManagedResourceFieldPolicyMock.mockReturnValue({
      fields: [],
      hiddenFields: [],
    })
  })

  it("submits the native editor and forwards a legacy-compatible success result", async () => {
    let resolveSubmit: ((result: unknown) => void) | undefined
    const submission = new Promise((resolve) => {
      resolveSubmit = resolve
    })
    const submit = vi.fn().mockReturnValue(submission)
    const successResult = {
      outcome: "succeeded",
      data: {
        ref: {
          siteType: SITE_TYPES.AXON_HUB,
          kind: MANAGED_RESOURCE_KINDS.Channel,
          scopeKey: "https://managed.example.com",
          resourceId: "channel-id",
        },
        displayName: "Imported channel",
        status: "enabled",
        fields: [],
        actions: { canUpdate: true, canDelete: true },
      },
      confirmedEffects: [
        {
          kind: "resource-created",
          resourceKind: MANAGED_RESOURCE_KINDS.Channel,
          resourceId: "channel-id",
        },
      ],
      message: "created",
    }
    const onSuccess = vi.fn()

    render(
      <ManagedResourceCreateDialog
        isOpen
        siteType={SITE_TYPES.AXON_HUB}
        kind={MANAGED_RESOURCE_KINDS.Channel}
        editor={createEditor(submit)}
        onClose={vi.fn()}
        onCloseComplete={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByTestId("native-resource-editor-body")).toBeVisible()
    fireEvent.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton))

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(
        { name: "Imported channel" },
        { signal: expect.any(AbortSignal) },
      )
    })
    expect(submit.mock.calls[0]?.[1]?.signal.aborted).toBe(false)
    resolveSubmit?.(successResult)
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ displayName: "Imported channel" }),
        message: "created",
      })
    })
  })

  it("forwards the provider option loader to the shared editor body", async () => {
    const loadOptions = vi.fn().mockResolvedValue([{ value: "model-example" }])
    const runRead = vi.fn(
      async (read: () => Promise<any>, _label: string, _signal?: AbortSignal) =>
        await read(),
    )
    render(
      <ManagedResourceCreateDialog
        isOpen
        siteType={SITE_TYPES.AXON_HUB}
        kind={MANAGED_RESOURCE_KINDS.Channel}
        editor={createEditor(vi.fn(), { loadOptions })}
        runRead={runRead}
        onClose={vi.fn()}
        onCloseComplete={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Load native options" }))
    await waitFor(() =>
      expect(loadOptions).toHaveBeenCalledWith(
        "name",
        { name: "Imported channel" },
        undefined,
      ),
    )
    expect(runRead).toHaveBeenCalledWith(
      expect.any(Function),
      "channelDialog:title.add",
      undefined,
    )
  })

  it("shows an import advisory and forwards success without an optional message", async () => {
    const submit = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      data: { displayName: "Imported channel" },
      confirmedEffects: [
        {
          kind: "resource-created",
          resourceKind: MANAGED_RESOURCE_KINDS.Channel,
          resourceId: "channel-id",
        },
      ],
    })
    const onSuccess = vi.fn()

    render(
      <ManagedResourceCreateDialog
        isOpen
        siteType={SITE_TYPES.AXON_HUB}
        kind={MANAGED_RESOURCE_KINDS.Channel}
        editor={createEditor(submit)}
        advisoryWarning={{
          kind: "review-required",
          title: "Review imported models",
          description: "Confirm the provider-owned defaults before creating.",
        }}
        onClose={vi.fn()}
        onCloseComplete={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByText("Review imported models")).toBeVisible()
    fireEvent.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        success: true,
        data: { displayName: "Imported channel" },
      })
    })
  })

  it.each([
    {
      label: "partial",
      result: {
        outcome: "partial",
        confirmedEffects: [
          {
            kind: "resource-created",
            resourceKind: MANAGED_RESOURCE_KINDS.Channel,
            resourceId: "channel-id",
          },
        ],
        completion: "rejected",
        diagnostic: { message: "partially applied" },
      },
    },
    {
      label: "uncertain",
      result: {
        outcome: "uncertain",
        diagnostic: { message: "unknown" },
      },
    },
  ] as const)(
    "keeps a $label non-idempotent create from being submitted again",
    async ({ result }) => {
      const submit = vi.fn().mockResolvedValue(result)

      render(
        <ManagedResourceCreateDialog
          isOpen
          siteType={SITE_TYPES.AXON_HUB}
          kind={MANAGED_RESOURCE_KINDS.Channel}
          editor={createEditor(submit)}
          onClose={vi.fn()}
          onCloseComplete={vi.fn()}
          onSuccess={vi.fn()}
        />,
      )

      const submitButton = screen.getByTestId(
        CHANNEL_DIALOG_TEST_IDS.submitButton,
      )
      fireEvent.click(submitButton)

      await waitFor(() => expect(submitButton).toBeDisabled())
      fireEvent.click(submitButton)
      expect(submit).toHaveBeenCalledOnce()
    },
  )

  it("shows local validation issues without dispatching a create", async () => {
    const submit = vi.fn()
    const issue = {
      fieldId: "name",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    } as const

    render(
      <ManagedResourceCreateDialog
        isOpen
        siteType={SITE_TYPES.AXON_HUB}
        kind={MANAGED_RESOURCE_KINDS.Channel}
        editor={createEditor(submit, {
          validate: () => ({ valid: false, issues: [issue] }),
        })}
        onClose={vi.fn()}
        onCloseComplete={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    fireEvent.submit(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.form))

    await waitFor(() => {
      expect(
        screen.getByTestId("native-resource-editor-issues"),
      ).toHaveTextContent("name:required")
    })
    expect(submit).not.toHaveBeenCalled()
  })

  it("shows a definite rejection and clears it after the user edits a field", async () => {
    const submit = vi.fn().mockResolvedValue({
      outcome: "rejected",
      diagnostic: { message: "not applied" },
    })

    render(
      <ManagedResourceCreateDialog
        isOpen
        siteType={SITE_TYPES.AXON_HUB}
        kind={MANAGED_RESOURCE_KINDS.Channel}
        editor={createEditor(submit)}
        onClose={vi.fn()}
        onCloseComplete={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton))
    await screen.findByText("managedSiteChannels:alerts.editorSaveError.title")

    fireEvent.click(screen.getByRole("button", { name: "Edit native name" }))
    await waitFor(() => {
      expect(
        screen.queryByText("managedSiteChannels:alerts.editorSaveError.title"),
      ).toBeNull()
    })
    fireEvent.click(screen.getByRole("button", { name: "Edit native name" }))
    expect(
      screen.getByTestId("native-resource-editor-values"),
    ).toHaveTextContent("Updated channel")
  })

  it("maps provider validation failures back to the native fields", async () => {
    const submit = vi.fn().mockRejectedValue(
      new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
        fieldIssues: [
          {
            fieldId: "name",
            code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
          },
        ],
      }),
    )

    render(
      <ManagedResourceCreateDialog
        isOpen
        siteType={SITE_TYPES.AXON_HUB}
        kind={MANAGED_RESOURCE_KINDS.Channel}
        editor={createEditor(submit)}
        onClose={vi.fn()}
        onCloseComplete={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton))

    await waitFor(() => {
      expect(
        screen.getByTestId("native-resource-editor-issues"),
      ).toHaveTextContent("name:invalid_value")
    })
    expect(
      screen.queryByText("managedSiteChannels:alerts.editorSaveError.title"),
    ).toBeNull()
  })

  it("shows a local save failure when the provider throws an unknown error", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("provider unavailable"))

    render(
      <ManagedResourceCreateDialog
        isOpen
        siteType={SITE_TYPES.AXON_HUB}
        kind={MANAGED_RESOURCE_KINDS.Channel}
        editor={createEditor(submit)}
        onClose={vi.fn()}
        onCloseComplete={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton))

    expect(
      await screen.findByText(
        "managedSiteChannels:alerts.editorSaveError.title",
      ),
    ).toBeVisible()
  })

  it("aborts an in-flight provider create when its dialog is removed", async () => {
    let submittedSignal: AbortSignal | undefined
    const submit = vi.fn<ResourceEditor["submit"]>((_values, options) => {
      submittedSignal = options?.signal
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"))
        })
      })
    })
    const { unmount } = render(
      <ManagedResourceCreateDialog
        isOpen
        siteType={SITE_TYPES.AXON_HUB}
        kind={MANAGED_RESOURCE_KINDS.Channel}
        editor={createEditor(submit)}
        onClose={vi.fn()}
        onCloseComplete={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton))
    await waitFor(() => expect(submittedSignal).toBeDefined())

    unmount()

    expect(submittedSignal?.aborted).toBe(true)
  })

  it("fails closed when the provider editor policy is unavailable", () => {
    getManagedResourceFieldPolicyMock.mockReturnValue(null)
    const submit = vi.fn()

    render(
      <ManagedResourceCreateDialog
        isOpen
        siteType={SITE_TYPES.AXON_HUB}
        kind={MANAGED_RESOURCE_KINDS.Channel}
        editor={createEditor(submit)}
        onClose={vi.fn()}
        onCloseComplete={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(
      screen.getByText("managedSiteChannels:alerts.editorLoadError.title"),
    ).toBeVisible()
    expect(screen.queryByTestId("native-resource-editor-body")).toBeNull()
    expect(
      screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeDisabled()
    const formId = screen
      .getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton)
      .getAttribute("form")
    expect(formId).not.toBeNull()
    fireEvent.submit(document.getElementById(formId!)!)
    expect(submit).not.toHaveBeenCalled()
  })
})
