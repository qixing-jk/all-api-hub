import { act, renderHook, waitFor } from "@testing-library/react"
import type { TFunction } from "i18next"
import { expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useManagedResourceEditorPresentation } from "~/features/ManagedSiteChannels/editor/useManagedResourceEditorPresentation"
import toast from "~/lib/notify"
import { MANAGED_RESOURCE_FAILURE_CODES as codes } from "~/services/apiAdapters/contracts/managedResourceNative"

type Input = Parameters<typeof useManagedResourceEditorPresentation>[0]
const input = (): Input => ({
  siteType: SITE_TYPES.NEW_API,
  primaryKind: "channel",
  mutation: {
    editor: null,
    editorMode: null,
    editorFailure: null,
    editorFeedback: null,
    opening: { attemptId: 0, status: "idle" },
    submit: vi.fn().mockResolvedValue(undefined),
    closeEditor: vi.fn(),
  },
  runRead: vi.fn(async (operation) => await operation()),
  t: ((key: string) => key) as TFunction,
})

it("denies unavailable native field loaders", async () => {
  const props = input()
  const { result } = renderHook(() =>
    useManagedResourceEditorPresentation(props),
  )
  await expect(result.current.loadEditorSecret("key")).rejects.toMatchObject({
    failure: { code: codes.PermissionDenied },
  })
  await expect(
    result.current.loadEditorOptions("group", {}),
  ).rejects.toMatchObject({ failure: { code: codes.PermissionDenied } })
  expect(props.runRead).not.toHaveBeenCalled()
})

it("passes field reads and cancellation to the shared read interaction", async () => {
  const props = input()
  const loadSecret = vi.fn().mockResolvedValue("secret")
  const loadOptions = vi
    .fn()
    .mockResolvedValue([{ value: "group", label: "Group" }])
  props.mutation.editor = {
    fields: [],
    initialValues: {},
    validate: () => ({ valid: true }),
    submit: vi.fn(),
    loadSecret,
    loadOptions,
  } as NonNullable<Input["mutation"]["editor"]>
  const { result } = renderHook(() =>
    useManagedResourceEditorPresentation(props),
  )
  const signal = new AbortController().signal
  await expect(
    result.current.loadEditorSecret("key", { signal }),
  ).resolves.toBe("secret")
  await expect(
    result.current.loadEditorOptions("group", { name: "draft" }, { signal }),
  ).resolves.toEqual([{ value: "group", label: "Group" }])
  expect(loadSecret).toHaveBeenCalledWith("key", { signal })
  expect(loadOptions).toHaveBeenCalledWith(
    "group",
    { name: "draft" },
    { signal },
  )
  expect(props.runRead).toHaveBeenCalledWith(
    expect.any(Function),
    "channelDialog:title.edit",
    signal,
  )
})

it("leaves validation failures in the editor and reports resource changes", () => {
  const error = vi.spyOn(toast, "error").mockImplementation(() => "toast")
  const props = input()
  props.mutation.editorFeedback = {
    kind: "save-failed",
    failure: {
      code: codes.ValidationFailed,
      fieldIssues: [{ fieldId: "name", code: "required" }],
    },
  } as Input["mutation"]["editorFeedback"]
  const { rerender } = renderHook(
    (value) => useManagedResourceEditorPresentation(value),
    { initialProps: props },
  )
  expect(error).not.toHaveBeenCalled()
  rerender({
    ...props,
    mutation: {
      ...props.mutation,
      editorFeedback: {
        kind: "save-failed",
        failure: { code: codes.ResourceChanged },
      },
    },
  })
  expect(error).toHaveBeenCalledWith(
    "managedSiteChannels:alerts.resourceChanged.description",
  )
})

it("closes the editor and reports uncertainty when submission unexpectedly rejects", async () => {
  const error = vi.spyOn(toast, "error").mockImplementation(() => "toast")
  const props = input()
  props.mutation.submit = vi.fn().mockRejectedValue(new Error("unexpected"))
  const { result } = renderHook(() =>
    useManagedResourceEditorPresentation(props),
  )
  act(() => {
    result.current.handleSubmitEditor()
  })
  await waitFor(() => expect(props.mutation.closeEditor).toHaveBeenCalledOnce())
  expect(error).toHaveBeenCalledWith(
    "managedSiteChannels:alerts.partialMutation.description",
  )
})
