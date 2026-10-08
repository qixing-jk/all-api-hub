import { act, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ClearModelRedirectMappingsDialog } from "~/features/BasicSettings/components/dialogs/ClearModelRedirectMappingsDialog"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import type { ManagedModelMappingPreview } from "~/types/managedResourceModels"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const { list, clear, success, warning, error } = vi.hoisted(() => ({
  list: vi.fn(),
  clear: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))
vi.mock("~/services/models/modelRedirect", () => ({
  ModelRedirectService: {
    listManagedSiteChannels: list,
    clearChannelModelMappings: clear,
  },
}))
vi.mock("~/lib/notify", () => ({ default: { success, warning, error } }))

const alpha: ManagedModelMappingPreview = {
  ref: createManagedChannelResourceRef(
    SITE_TYPES.NEW_API,
    "https://first.example",
    "1",
  ),
  name: "Alpha",
  modelMapping: '{"a":"b"}',
}
const beta: ManagedModelMappingPreview = {
  ref: createManagedChannelResourceRef(
    SITE_TYPES.NEW_API,
    "https://second.example",
    "1",
  ),
  name: "Beta",
  modelMapping: "{}",
}
const options = { withUserPreferencesProvider: false, withThemeProvider: false }
const cleared = {
  success: true,
  clearedChannels: 2,
  skippedChannels: 0,
  failedChannels: 0,
  totalSelected: 2,
  errors: [],
}

async function confirmSelection() {
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", {
      name: "modelRedirect:bulkClear.actions.continue",
    }),
  )
  await user.click(
    screen.getByRole("button", {
      name: "modelRedirect:bulkClear.actions.confirm",
    }),
  )
}

describe("ClearModelRedirectMappingsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({
      success: true,
      channels: [alpha, beta],
      errors: [],
    })
    clear.mockResolvedValue(cleared)
  })

  it.each(["rejection", "failure"])(
    "blocks clearing when preview loading reports %s",
    async (kind) => {
      if (kind === "rejection")
        list.mockRejectedValueOnce(new Error("Preview unavailable"))
      else
        list.mockResolvedValueOnce({
          success: false,
          channels: [],
          errors: ["Preview unavailable"],
          message: "",
        })
      const onClose = vi.fn()
      render(
        <ClearModelRedirectMappingsDialog isOpen onClose={onClose} />,
        options,
      )
      await screen.findByText("modelRedirect:bulkClear.status.loadFailed")
      await waitFor(() =>
        expect(
          screen.getByRole("button", {
            name: "modelRedirect:bulkClear.actions.continue",
          }),
        ).toBeDisabled(),
      )
      await waitFor(() =>
        expect(
          screen.queryByRole("checkbox", { name: "Alpha (#1)" }),
        ).not.toBeInTheDocument(),
      )
      expect(clear).not.toHaveBeenCalled()
      await userEvent.click(
        screen.getByRole("button", {
          name: "modelRedirect:bulkClear.actions.close",
        }),
      )
      expect(onClose).toHaveBeenCalledOnce()
    },
  )

  it.each(["rejection", "failure"])(
    "retains the selected preview after a clearing %s",
    async (kind) => {
      if (kind === "rejection")
        clear.mockRejectedValueOnce(new Error("Clear unavailable"))
      else
        clear.mockResolvedValueOnce({
          ...cleared,
          success: false,
          clearedChannels: 0,
          failedChannels: 2,
          errors: ["Clear unavailable"],
        })
      const onClose = vi.fn()
      render(
        <ClearModelRedirectMappingsDialog isOpen onClose={onClose} />,
        options,
      )
      await screen.findByRole("checkbox", { name: "Alpha (#1)" })
      await confirmSelection()
      expect(await screen.findByText("Clear unavailable")).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole("checkbox", { name: "Alpha (#1)" })).toBeChecked()
      clear.mockResolvedValueOnce(cleared)
      await confirmSelection()
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    },
  )

  it("keeps selection across search and distinguishes equal resource ids from different sites", async () => {
    const onClose = vi.fn()
    render(
      <ClearModelRedirectMappingsDialog isOpen onClose={onClose} />,
      options,
    )
    await screen.findByRole("checkbox", { name: "Alpha (#1)" })
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "modelRedirect:bulkClear.search.label",
      }),
      { target: { value: "Alpha" } },
    )
    await userEvent.click(
      screen.getByRole("button", {
        name: "modelRedirect:bulkClear.actions.selectNone",
      }),
    )
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "modelRedirect:bulkClear.search.label",
      }),
      { target: { value: "" } },
    )
    expect(screen.getByRole("checkbox", { name: "Beta (#1)" })).toBeChecked()
    expect(
      screen.getByRole("checkbox", { name: "Alpha (#1)" }),
    ).not.toBeChecked()
    await confirmSelection()
    expect(clear).toHaveBeenCalledExactlyOnceWith([beta.ref])
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it("retains the preview and recovery feedback after partial clearing", async () => {
    clear.mockResolvedValue({
      ...cleared,
      success: false,
      clearedChannels: 1,
      failedChannels: 1,
      errors: ["Beta unavailable"],
    })
    const onClose = vi.fn()
    render(
      <ClearModelRedirectMappingsDialog isOpen onClose={onClose} />,
      options,
    )
    await screen.findByRole("checkbox", { name: "Alpha (#1)" })
    await confirmSelection()
    expect(await screen.findByText("Beta unavailable")).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("checkbox", { name: "Beta (#1)" })).toBeChecked()
  })

  it("discards a preview load from a closed session", async () => {
    const pending = createDeferred<{
      success: boolean
      channels: ManagedModelMappingPreview[]
      errors: string[]
    }>()
    list.mockReturnValueOnce(pending.promise)
    const { rerender } = render(
      <ClearModelRedirectMappingsDialog isOpen onClose={vi.fn()} />,
      options,
    )
    rerender(
      <ClearModelRedirectMappingsDialog isOpen={false} onClose={vi.fn()} />,
    )
    list.mockResolvedValueOnce({ success: true, channels: [beta], errors: [] })
    rerender(<ClearModelRedirectMappingsDialog isOpen onClose={vi.fn()} />)
    await screen.findByRole("checkbox", { name: "Beta (#1)" })
    await act(async () =>
      pending.resolve({ success: true, channels: [alpha], errors: [] }),
    )
    expect(
      screen.queryByRole("checkbox", { name: "Alpha (#1)" }),
    ).not.toBeInTheDocument()
  })

  it.each(["resolve", "reject"])(
    "does not close or notify the reopened dialog when an earlier clearing settles by %s",
    async (settlement) => {
      const pending = createDeferred<typeof cleared>()
      clear.mockReturnValueOnce(pending.promise)
      const onClose = vi.fn()
      const { rerender } = render(
        <ClearModelRedirectMappingsDialog isOpen onClose={onClose} />,
        options,
      )
      await screen.findByRole("checkbox", { name: "Alpha (#1)" })
      await confirmSelection()
      rerender(
        <ClearModelRedirectMappingsDialog isOpen={false} onClose={onClose} />,
      )
      rerender(<ClearModelRedirectMappingsDialog isOpen onClose={onClose} />)
      await screen.findByRole("checkbox", { name: "Alpha (#1)" })
      await act(async () => {
        if (settlement === "resolve") pending.resolve(cleared)
        else pending.reject(new Error("Old session unavailable"))
      })
      expect(onClose).not.toHaveBeenCalled()
      expect(success).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(
        screen.getByRole("button", {
          name: "modelRedirect:bulkClear.actions.continue",
        }),
      ).toBeEnabled()
    },
  )
})
