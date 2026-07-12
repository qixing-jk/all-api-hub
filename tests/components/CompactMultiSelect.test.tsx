import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState, type ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CompactMultiSelect } from "~/components/ui/CompactMultiSelect"
import { render } from "~~/tests/test-utils/render"

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: toastMocks,
}))

const renderCompact = (ui: ReactElement) =>
  render(ui, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })

describe("CompactMultiSelect", () => {
  beforeEach(() => {
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })

  it("uses a dedicated clear button instead of a clear option item", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderCompact(
      <CompactMultiSelect
        displayMode="chips"
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
        selected={["a"]}
        onChange={onChange}
      />,
    )

    // Clear-selection is a separate button, not a selectable row in the options list.
    const cancelSelectedButton = await screen.findByRole("button", {
      name: "ui:multiSelect.cancelSelected",
    })
    expect(cancelSelectedButton).toBeInTheDocument()

    await user.click(await screen.findByRole("combobox"))
    expect(
      screen.queryByRole("option", { name: "ui:multiSelect.cancelSelected" }),
    ).not.toBeInTheDocument()

    await user.click(cancelSelectedButton)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("supports chips display mode and filters by label", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderCompact(
      <CompactMultiSelect
        displayMode="chips"
        options={[
          { value: "id-alpha", label: "Alpha" },
          { value: "id-beta", label: "Beta" },
        ]}
        selected={[]}
        onChange={onChange}
        placeholder="Pick"
        searchPlaceholder="Search"
      />,
    )

    const input = await screen.findByPlaceholderText("Pick")
    await user.click(input)
    await user.type(input, "alp")

    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument()
    expect(
      screen.queryByRole("option", { name: "Beta" }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("option", { name: "Alpha" }))
    expect(onChange).toHaveBeenCalledWith(["id-alpha"])
  })

  it("copies chip text when the selected chip label is clicked", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    renderCompact(
      <CompactMultiSelect
        displayMode="chips"
        options={[
          { value: "id-alpha", label: "Alpha" },
          { value: "id-beta", label: "Beta" },
        ]}
        selected={["id-alpha"]}
        onChange={onChange}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:multiSelect.copyChipValue",
      }),
    )

    expect(writeText).toHaveBeenCalledWith("Alpha")
    expect(onChange).not.toHaveBeenCalled()
    expect(toastMocks.success).toHaveBeenCalledWith("ui:multiSelect.chipCopied")
  })

  it("shows an error toast when chip text copying fails", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard blocked"))

    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    renderCompact(
      <CompactMultiSelect
        displayMode="chips"
        options={[{ value: "id-alpha", label: "Alpha" }]}
        selected={["id-alpha"]}
        onChange={vi.fn()}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:multiSelect.copyChipValue",
      }),
    )

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("ui:multiSelect.copyError")
    })
  })

  it("shows a clear button for the search input", async () => {
    const user = userEvent.setup()

    renderCompact(
      <CompactMultiSelect
        displayMode="summary"
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
        selected={[]}
        onChange={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole("combobox"))
    const input = await screen.findByPlaceholderText(
      "ui:searchableSelect.searchPlaceholder",
    )

    expect(
      screen.queryByRole("button", { name: "ui:multiSelect.clearInput" }),
    ).not.toBeInTheDocument()

    await user.type(input, "alp")
    const clearInputButton = screen.getByRole("button", {
      name: "ui:multiSelect.clearInput",
    })

    await user.click(clearInputButton)
    expect(input).toHaveValue("")
    await waitFor(() => {
      expect(input).toHaveFocus()
    })
  })

  it("shows a bulk toggle button when the chips control is tall", async () => {
    const user = userEvent.setup()

    // Restore the prototype method after the test to avoid leaking the mocked
    // implementation into other suites.
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const slot = this?.getAttribute?.("data-slot")
        const height = slot === "combobox-chips" ? 80 : 0

        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: height,
          width: 0,
          height,
          toJSON: () => "",
        } as DOMRect
      })

    try {
      /**
       * Harness component to let `CompactMultiSelect` manage its own selection state
       * while the test focuses on layout-driven behavior (chips height).
       */
      function Harness() {
        const [selected, setSelected] = useState<string[]>([])

        return (
          <CompactMultiSelect
            displayMode="chips"
            options={[
              { value: "a", label: "Alpha" },
              { value: "b", label: "Beta" },
            ]}
            selected={selected}
            onChange={setSelected}
          />
        )
      }

      renderCompact(<Harness />)

      const selectAllButton = await screen.findByRole("button", {
        name: "ui:multiSelect.selectAll",
      })
      const cancelSelectedButton = await screen.findByRole("button", {
        name: "ui:multiSelect.cancelSelected",
      })

      expect(selectAllButton).toBeEnabled()
      expect(cancelSelectedButton).toBeDisabled()

      await user.click(selectAllButton)

      expect(selectAllButton).toBeDisabled()
      expect(cancelSelectedButton).toBeEnabled()
      expect(
        await screen.findByRole("button", {
          name: "ui:multiSelect.cancelSelected",
        }),
      ).toBeInTheDocument()
    } finally {
      getBoundingClientRectSpy.mockRestore()
    }
  })

  it("hides chips bulk action buttons when the option count is below the configured threshold", async () => {
    renderCompact(
      <CompactMultiSelect
        displayMode="chips"
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
          { value: "c", label: "Gamma" },
          { value: "d", label: "Delta" },
        ]}
        selected={["a"]}
        onChange={vi.fn()}
        bulkActionsMinOptions={5}
      />,
    )

    expect(
      screen.queryByTestId("compact-multiselect-bulk-actions"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "ui:multiSelect.selectAll" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "ui:multiSelect.cancelSelected" }),
    ).not.toBeInTheDocument()
  })

  it("splits pasted custom values on newlines when allowCustom is enabled", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderCompact(
      <CompactMultiSelect
        displayMode="chips"
        allowCustom
        options={[]}
        selected={[]}
        onChange={onChange}
        placeholder="Pick"
      />,
    )

    const input = await screen.findByPlaceholderText("Pick")
    await user.click(input)

    fireEvent.paste(input, {
      clipboardData: {
        getData: () => "alpha\nbeta\r\ngamma\n\n",
      },
    })

    expect(onChange).toHaveBeenCalledWith(["alpha", "beta", "gamma"])
  })

  it("commits a single custom value on Enter when no option matches", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderCompact(
      <CompactMultiSelect
        displayMode="chips"
        allowCustom
        options={[{ value: "alpha", label: "Alpha" }]}
        selected={[]}
        onChange={onChange}
        placeholder="Pick"
      />,
    )

    const input = await screen.findByPlaceholderText("Pick")
    await user.click(input)
    await user.type(input, "gamma")
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onChange).toHaveBeenCalledWith(["gamma"])
  })

  it("lets Enter select the matching option instead of committing the raw query", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderCompact(
      <CompactMultiSelect
        displayMode="chips"
        allowCustom
        options={[{ value: "gamma", label: "Gamma" }]}
        selected={[]}
        onChange={onChange}
        placeholder="Pick"
      />,
    )

    const input = await screen.findByPlaceholderText("Pick")
    await user.click(input)
    await user.type(input, "gam")
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onChange).toHaveBeenCalledWith(["gamma"])
  })

  it("ignores pasted text without separators when custom parsing is enabled", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderCompact(
      <CompactMultiSelect
        displayMode="chips"
        allowCustom
        options={[]}
        selected={[]}
        onChange={onChange}
        placeholder="Pick"
      />,
    )

    const input = await screen.findByPlaceholderText("Pick")
    await user.click(input)

    fireEvent.paste(input, {
      clipboardData: {
        getData: () => "singlevalue",
      },
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  it("hides the summary clear button when clearing is disabled or the control is disabled", () => {
    const firstRender = renderCompact(
      <CompactMultiSelect
        displayMode="summary"
        clearable={false}
        options={[{ value: "a", label: "Alpha" }]}
        selected={["a"]}
        onChange={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "ui:multiSelect.clearSelected" }),
    ).toBeNull()

    firstRender.unmount()

    renderCompact(
      <CompactMultiSelect
        displayMode="summary"
        disabled
        options={[{ value: "a", label: "Alpha" }]}
        selected={["a"]}
        onChange={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "ui:multiSelect.clearSelected" }),
    ).toBeNull()
  })

  it("renders labeled summary selections with fallback text, overflow, and a working clear action", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderCompact(
      <div>
        <span id="external-summary-label">External summary label</span>
        <CompactMultiSelect
          label="Models"
          displayMode="summary"
          size="lg"
          maxDisplayValues={1}
          aria-labelledby="external-summary-label"
          options={[{ value: "alpha", label: "Alpha" }]}
          selected={["missing-model", "alpha"]}
          onChange={onChange}
        />
      </div>,
    )

    const trigger = screen.getByRole("combobox")
    expect(screen.getByText("Models")).toBeInTheDocument()
    expect(trigger).toHaveAttribute("aria-labelledby", "external-summary-label")
    expect(trigger).toHaveTextContent("missing-model +1")
    expect(screen.getByText("2")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "ui:multiSelect.clearSelected" }),
    )

    expect(onChange).toHaveBeenCalledWith([])
  })

  it("shows a custom summary option and lets a selected option toggle off", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderCompact(
      <CompactMultiSelect
        displayMode="summary"
        allowCustom
        options={[
          { value: "alpha", label: "Alpha" },
          { value: "beta", label: "Beta" },
        ]}
        selected={["alpha"]}
        onChange={onChange}
      />,
    )

    await user.click(await screen.findByRole("combobox"))
    const input = await screen.findByPlaceholderText(
      "ui:searchableSelect.searchPlaceholder",
    )

    await user.type(input, "gamma")
    expect(screen.getByRole("option", { name: "gamma" })).toBeInTheDocument()

    await user.clear(input)
    await user.click(screen.getByRole("option", { name: "Alpha" }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it("renders option counts without adding them to the selected summary", async () => {
    const user = userEvent.setup()

    renderCompact(
      <CompactMultiSelect
        displayMode="summary"
        options={[
          { value: "alpha", label: "Alpha", count: 12 },
          { value: "beta", label: "Beta", count: 0 },
        ]}
        selected={["alpha"]}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("combobox")).toHaveTextContent("Alpha")
    expect(screen.getByRole("combobox")).not.toHaveTextContent("12")

    await user.click(screen.getByRole("combobox"))

    expect(screen.getByRole("option", { name: "Alpha 12" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Beta 0" })).toBeInTheDocument()
  })

  it("keeps duplicate custom batches as a no-op and clears the search term", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderCompact(
      <CompactMultiSelect
        displayMode="summary"
        allowCustom
        options={[]}
        selected={["alpha"]}
        onChange={onChange}
      />,
    )

    await user.click(await screen.findByRole("combobox"))
    const input = await screen.findByPlaceholderText(
      "ui:searchableSelect.searchPlaceholder",
    )

    await user.type(input, "alpha,alpha")
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue("")
  })

  it("renders unknown chips as values, filters them out of search results, and uses vertical bulk actions when space allows", async () => {
    const user = userEvent.setup()
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const slot = this?.getAttribute?.("data-slot")
        let height = 30

        if (slot === "combobox-chips") height = 80
        if (this?.tagName === "BUTTON") height = 30

        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: height,
          width: 0,
          height,
          toJSON: () => "",
        } as DOMRect
      })

    try {
      renderCompact(
        <div>
          <span id="external-chips-label">External chips label</span>
          <CompactMultiSelect
            label="Tags"
            displayMode="chips"
            allowCustom
            aria-label="Tag picker"
            aria-labelledby="external-chips-label"
            options={[{ value: "alpha", label: "Alpha" }]}
            selected={["ghost-tag"]}
            onChange={vi.fn()}
            placeholder="Pick"
          />
        </div>,
      )

      expect(screen.getByText("Tags")).toBeInTheDocument()
      expect(screen.getByText("ghost-tag")).toBeInTheDocument()

      const input = await screen.findByPlaceholderText(
        "ui:searchableSelect.searchPlaceholder",
      )
      expect(input).toHaveAttribute("aria-label", "Tag picker")
      expect(input).toHaveAttribute("aria-labelledby", "external-chips-label")

      await user.click(input)
      await user.type(input, "ghost")

      expect(
        screen.queryByRole("option", { name: "ghost-tag" }),
      ).not.toBeInTheDocument()
      expect(
        await screen.findByTestId("compact-multiselect-bulk-actions"),
      ).toHaveAttribute("data-orientation", "vertical")
    } finally {
      getBoundingClientRectSpy.mockRestore()
    }
  })

  it("defaults the summary trigger to regular button height", async () => {
    renderCompact(
      <CompactMultiSelect
        displayMode="summary"
        options={[{ value: "alpha", label: "Alpha" }]}
        selected={[]}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("combobox")).toHaveClass("h-9")
  })
})
