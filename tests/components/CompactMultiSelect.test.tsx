import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { CompactMultiSelect } from "~/components/ui/CompactMultiSelect"
import { render } from "~/tests/test-utils/render"

vi.mock("react-i18next", async () => {
  const actual =
    await vi.importActual<typeof import("react-i18next")>("react-i18next")

  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  }
})

describe("CompactMultiSelect", () => {
  it("uses a dedicated clear button instead of a clear option item", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
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

    render(
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

  it("shows a clear button for the search input", async () => {
    const user = userEvent.setup()

    render(
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
      "searchableSelect.searchPlaceholder",
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

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
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
      },
    )

    /**
     *
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

    render(<Harness />)

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
  })

  it("splits pasted custom values on newlines when allowCustom is enabled", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
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
})
