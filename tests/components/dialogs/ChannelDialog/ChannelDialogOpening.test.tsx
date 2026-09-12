import { act, renderHook, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { ChannelDialogOpening } from "~/components/dialogs/ChannelDialog/components/ChannelDialogOpening"
import {
  ChannelDialogProvider,
  useChannelDialogContext,
  type NativeChannelCreateDialogConfig,
} from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import enChannel from "~/locales/en/channelDialog.json"
import enCommon from "~/locales/en/common.json"
import enManaged from "~/locales/en/managedSiteChannels.json"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { createManagedResourceEditor } from "~~/tests/test-utils/managedResourceWorkspace"
import { render, screen } from "~~/tests/test-utils/render"

const i18n = await createResourceTestI18n({
  en: {
    channelDialog: enChannel,
    common: enCommon,
    managedSiteChannels: enManaged,
  },
})
const renderOpening = (node: ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const configuration = (name: string): NativeChannelCreateDialogConfig => ({
  siteType: "new-api",
  kind: "channel",
  editor: createManagedResourceEditor({ initialValues: { name } }),
  showModelPrefillWarning: false,
  advisoryWarning: null,
})

describe("channel preparation", () => {
  it("shows visible progress without submit and allows closing before readiness", async () => {
    const onClose = vi.fn()
    renderOpening(
      <ChannelDialogOpening
        opening={{
          attemptId: 1,
          status: "loading",
          mode: "edit",
          reveal: "delayed",
        }}
        onClose={onClose}
        onRetry={vi.fn()}
      />,
    )
    expect(await screen.findByRole("dialog")).toBeVisible()
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      "Loading channel configuration",
    )
    expect(
      screen.queryByRole("button", { name: "Save Changes" }),
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveClass("sr-only"),
    )
    expect(screen.getAllByText("Loading channel configuration…")).toHaveLength(
      1,
    )
    await userEvent.setup().keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("keeps failure in the dialog with retry and no editable defaults", async () => {
    const retry = vi.fn()
    renderOpening(
      <ChannelDialogOpening
        opening={{
          attemptId: 1,
          status: "failure",
          mode: "create",
          failure: { code: "unexpected" },
        }}
        onClose={vi.fn()}
        onRetry={retry}
      />,
    )
    expect(await screen.findByRole("alert")).toBeVisible()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it("keeps recovery guidance alongside provider diagnostics when editing fails", async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    const message = "Invalid Octopus v0.13 channel response: custom_header"
    renderOpening(
      <ChannelDialogOpening
        opening={{
          attemptId: 1,
          status: "failure",
          mode: "edit",
          failure: { code: "unexpected", message },
        }}
        onClose={vi.fn()}
        onRetry={retry}
      />,
    )
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(enManaged.alerts.editorLoadError.title)
    expect(alert).toHaveTextContent(
      enManaged.alerts.editorLoadError.description,
    )
    expect(alert).toHaveTextContent(message)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Retry" }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it("cancels a global preparation and suppresses its late result", async () => {
    const gate = deferred<NativeChannelCreateDialogConfig>()
    let signal!: AbortSignal
    const { result } = renderHook(useChannelDialogContext, {
      wrapper: ChannelDialogProvider,
    })
    let pending!: Promise<boolean>
    act(() => {
      pending = result.current.prepareNativeCreateDialog({
        load: (value) => {
          signal = value
          return gate.promise
        },
      })
    })
    expect(result.current.opening.status).toBe("loading")
    act(() => result.current.closeDialog())
    expect(signal.aborted).toBe(true)
    await act(async () => {
      gate.resolve(configuration("late"))
      expect(await pending).toBe(false)
    })
    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.opening.status).toBe("idle")
  })

  it("discards a preparation whose originating action is no longer current", async () => {
    const { result } = renderHook(useChannelDialogContext, {
      wrapper: ChannelDialogProvider,
    })
    await act(async () => {
      expect(
        await result.current.prepareNativeCreateDialog({
          load: async () => configuration("expired"),
          shouldContinue: () => false,
        }),
      ).toBe(false)
    })
    expect(result.current.opening.status).toBe("idle")
    expect(result.current.state.isOpen).toBe(false)
  })

  it("ignores a failed request after the user closes preparation", async () => {
    const gate = deferred<void>()
    const { result } = renderHook(useChannelDialogContext, {
      wrapper: ChannelDialogProvider,
    })
    let pending!: Promise<boolean>
    act(() => {
      pending = result.current.prepareNativeCreateDialog({
        load: async () => {
          await gate.promise
          throw new Error("late failure")
        },
      })
    })
    act(() => result.current.closeDialog())
    await act(async () => {
      gate.resolve()
      expect(await pending).toBe(false)
    })
    expect(result.current.opening.status).toBe("idle")
    expect(result.current.state.isOpen).toBe(false)
  })

  it("retries failed preparation without restarting credential acquisition", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("private error"))
      .mockResolvedValueOnce(configuration("retried"))
    const { result } = renderHook(useChannelDialogContext, {
      wrapper: ChannelDialogProvider,
    })
    await act(async () => {
      await result.current.prepareNativeCreateDialog({ load })
    })
    expect(result.current.opening).toMatchObject({
      status: "failure",
      failure: { code: "unexpected" },
    })
    expect(result.current.state.isOpen).toBe(false)
    act(() => result.current.retryNativePreparation())
    await waitFor(() => expect(result.current.state.isOpen).toBe(true))
    expect(load).toHaveBeenCalledTimes(2)
    expect(result.current.state.nativeCreate?.editor.initialValues.name).toBe(
      "retried",
    )
  })

  it("a newer global preparation wins over an abort-insensitive earlier one", async () => {
    const gate = deferred<NativeChannelCreateDialogConfig>()
    const { result } = renderHook(useChannelDialogContext, {
      wrapper: ChannelDialogProvider,
    })
    let old!: Promise<boolean>
    act(() => {
      old = result.current.prepareNativeCreateDialog({
        load: () => gate.promise,
      })
    })
    await act(async () => {
      await result.current.prepareNativeCreateDialog({
        load: async () => configuration("current"),
      })
    })
    await act(async () => {
      gate.resolve(configuration("late"))
      await old
    })
    expect(result.current.state.nativeCreate?.editor.initialValues.name).toBe(
      "current",
    )
  })
})
