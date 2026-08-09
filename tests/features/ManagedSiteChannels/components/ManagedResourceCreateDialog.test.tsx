import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { SITE_TYPES } from "~/constants/siteType"
import { ManagedResourceCreateDialog } from "~/features/ManagedSiteChannels/components/ManagedResourceCreateDialog"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type { ResourceEditor } from "~/services/apiAdapters/contracts/managedResourceNative"

vi.mock(
  "~/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody",
  () => ({
    ManagedResourceEditorBody: () => (
      <div data-testid="native-resource-editor-body" />
    ),
  }),
)

vi.mock(
  "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy",
  () => ({
    MANAGED_RESOURCE_EDITOR_MODES: { Create: "create", Edit: "edit" },
    getManagedResourceFieldPolicy: () => ({
      fields: [],
      hiddenFields: [],
    }),
  }),
)

const createEditor = (submit: ResourceEditor["submit"]): ResourceEditor => ({
  fields: [],
  initialValues: { name: "Imported channel" },
  validate: () => ({ valid: true }),
  submit,
})

describe("ManagedResourceCreateDialog", () => {
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

  it("keeps an uncertain non-idempotent create from being submitted again", async () => {
    const submit = vi.fn().mockResolvedValue({
      outcome: "uncertain",
      diagnostic: { message: "unknown" },
    })

    render(
      <ManagedResourceCreateDialog
        isOpen
        siteType={SITE_TYPES.AXON_HUB}
        kind={MANAGED_RESOURCE_KINDS.Channel}
        editor={createEditor(submit)}
        onClose={vi.fn()}
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
  })
})
