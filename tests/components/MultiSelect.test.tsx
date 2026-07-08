import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { MultiSelect } from "~/components/ui/MultiSelect"
import { render } from "~~/tests/test-utils/render"

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: toastMocks,
}))

const TEST_IDS = {
  selectedValues: "selected-values",
} as const

function Harness(props: {
  initialSelected?: string[]
  allowCustom?: boolean
  parseCommaStrings?: boolean
  clearable?: boolean
  disabled?: boolean
  options?: Array<{ value: string; label: string }>
}) {
  const {
    initialSelected = [],
    allowCustom = false,
    parseCommaStrings = true,
    clearable = true,
    disabled = false,
    options = [],
  } = props
  const [selected, setSelected] = useState<string[]>(initialSelected)

  return (
    <>
      <MultiSelect
        allowCustom={allowCustom}
        clearable={clearable}
        disabled={disabled}
        onChange={setSelected}
        options={options}
        parseCommaStrings={parseCommaStrings}
        placeholder="Pick values"
        selected={selected}
      />
      <div data-testid={TEST_IDS.selectedValues}>{selected.join(",")}</div>
    </>
  )
}

describe("MultiSelect", () => {
  it("shows the correct empty-state copy for standard and custom modes", async () => {
    const user = userEvent.setup()

    const { rerender } = render(
      <MultiSelect onChange={vi.fn()} options={[]} selected={[]} />,
    )

    const defaultInput = await screen.findByPlaceholderText(
      "ui:multiSelect.placeholder",
    )
    await user.click(defaultInput)
    expect(
      await screen.findByText("ui:multiSelect.noOptions"),
    ).toBeInTheDocument()

    rerender(
      <MultiSelect allowCustom onChange={vi.fn()} options={[]} selected={[]} />,
    )

    const customInput = await screen.findByPlaceholderText(
      "ui:multiSelect.placeholder",
    )
    await user.click(customInput)
    expect(
      await screen.findByText("ui:multiSelect.noOptionsAllowCustom"),
    ).toBeInTheDocument()

    await user.type(customInput, "custom-model")
    expect(
      await screen.findByText("ui:multiSelect.emptyWithQueryAllowCustom"),
    ).toBeInTheDocument()
  })

  it("renders options through the local multi-select listbox", async () => {
    const user = userEvent.setup()

    render(
      <Harness
        options={[
          { value: "alpha", label: "Alpha" },
          { value: "beta", label: "Beta" },
        ]}
      />,
    )

    await user.click(await screen.findByPlaceholderText("Pick values"))

    expect(await screen.findByRole("listbox")).toHaveAttribute(
      "data-slot",
      "multiselect-listbox",
    )
  })

  it("associates the visible label with the combobox input", async () => {
    const user = userEvent.setup()

    render(
      <MultiSelect
        label="Available models"
        onChange={vi.fn()}
        options={[]}
        selected={[]}
      />,
    )

    const input = await screen.findByLabelText("Available models")
    await user.click(await screen.findByText("Available models"))

    expect(input).toHaveFocus()
  })

  it("closes the listbox when focus or pointer moves outside", async () => {
    const user = userEvent.setup()

    render(
      <>
        <Harness options={[{ value: "alpha", label: "Alpha" }]} />
        <button type="button">Outside target</button>
      </>,
    )

    await user.click(await screen.findByPlaceholderText("Pick values"))
    expect(await screen.findByRole("listbox")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Outside target" }))

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("supports keyboard navigation and selection for listed options", async () => {
    const user = userEvent.setup()

    render(
      <Harness
        options={[
          { value: "alpha", label: "Alpha" },
          { value: "beta", label: "Beta" },
        ]}
      />,
    )

    const input = await screen.findByPlaceholderText("Pick values")
    await user.click(input)
    await user.keyboard("{ArrowDown}")

    const activeOptionId = input.getAttribute("aria-activedescendant")
    expect(activeOptionId).toBeTruthy()
    expect(document.getElementById(activeOptionId!)).toHaveTextContent("Alpha")

    await user.keyboard("{Enter}")
    expect(screen.getByTestId(TEST_IDS.selectedValues)).toHaveTextContent(
      "alpha",
    )

    await user.keyboard("{ArrowDown}{Enter}")
    expect(screen.getByTestId(TEST_IDS.selectedValues)).toHaveTextContent("")
  })

  it("supports ArrowUp navigation and Escape dismissal", async () => {
    const user = userEvent.setup()

    render(
      <Harness
        options={[
          { value: "alpha", label: "Alpha" },
          { value: "beta", label: "Beta" },
        ]}
      />,
    )

    const input = await screen.findByPlaceholderText("Pick values")
    await user.click(input)
    await user.keyboard("{ArrowUp}")

    const activeOptionId = input.getAttribute("aria-activedescendant")
    expect(activeOptionId).toBeTruthy()
    expect(document.getElementById(activeOptionId!)).toHaveTextContent("Beta")

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("keeps the active option index within the filtered option range", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    const { rerender } = render(
      <MultiSelect
        onChange={onChange}
        options={[
          { value: "alpha", label: "Alpha" },
          { value: "beta", label: "Beta" },
        ]}
        placeholder="Pick values"
        selected={[]}
      />,
    )

    const input = await screen.findByPlaceholderText("Pick values")
    await user.click(input)
    await user.keyboard("{ArrowUp}")

    rerender(
      <MultiSelect
        onChange={onChange}
        options={[{ value: "alpha", label: "Alpha" }]}
        placeholder="Pick values"
        selected={[]}
      />,
    )

    await waitFor(() => {
      const activeOptionId = input.getAttribute("aria-activedescendant")
      expect(activeOptionId).toBeTruthy()
      expect(document.getElementById(activeOptionId!)).toHaveTextContent(
        "Alpha",
      )
    })
  })

  it("toggles the listbox from the disclosure button", async () => {
    const user = userEvent.setup()

    render(<Harness options={[{ value: "alpha", label: "Alpha" }]} />)

    const toggleButton = await screen.findByRole("button", {
      name: "ui:multiSelect.placeholder",
    })

    await user.click(toggleButton)
    expect(await screen.findByRole("listbox")).toBeInTheDocument()

    await user.click(toggleButton)
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("adds comma-separated custom values and deduplicates existing selections", async () => {
    const user = userEvent.setup()

    render(
      <Harness
        allowCustom
        initialSelected={["beta"]}
        options={[{ value: "alpha", label: "Alpha" }]}
      />,
    )

    const input = await screen.findByPlaceholderText("Pick values")
    await user.click(input)
    await user.type(input, "alpha, beta, gamma")
    await user.keyboard("{Enter}")

    expect(screen.getByTestId(TEST_IDS.selectedValues)).toHaveTextContent(
      "beta,alpha,gamma",
    )
  })

  it("adds a single custom value when comma parsing is disabled", async () => {
    const user = userEvent.setup()

    render(<Harness allowCustom parseCommaStrings={false} />)

    const input = await screen.findByPlaceholderText("Pick values")
    await user.click(input)
    await user.type(input, "delta")
    await user.keyboard("{Enter}")

    expect(screen.getByTestId(TEST_IDS.selectedValues)).toHaveTextContent(
      "delta",
    )
  })

  it("filters options by label and keeps better matches first", async () => {
    const user = userEvent.setup()

    render(
      <Harness
        options={[
          { value: "alphabet", label: "Alphabet" },
          { value: "alpha", label: "Alpha" },
          { value: "beta", label: "Beta" },
        ]}
      />,
    )

    const input = await screen.findByPlaceholderText("Pick values")
    await user.click(input)
    await user.type(input, "alp")

    const options = await screen.findAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual([
      "Alpha",
      "Alphabet",
    ])

    await user.click(options[0])
    expect(screen.getByTestId(TEST_IDS.selectedValues)).toHaveTextContent(
      "alpha",
    )
  })

  it("supports collapsing selected previews, removing values, clearing all, and copy success", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    render(
      <Harness
        initialSelected={["a", "b", "c", "d", "e", "f"]}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
          { value: "c", label: "Gamma" },
          { value: "d", label: "Delta" },
          { value: "e", label: "Epsilon" },
          { value: "f", label: "Zeta" },
        ]}
      />,
    )

    expect(await screen.findByText("+3")).toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", { name: /ui:multiSelect.selected/ }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:multiSelect.copySelectedValues",
      }),
    )
    expect(writeText).toHaveBeenCalledWith("a,b,c,d,e,f")
    expect(toastMocks.success).toHaveBeenCalledWith(
      "ui:multiSelect.copySuccess",
    )

    const removeButtons = await screen.findAllByRole("button", {
      name: "ui:multiSelect.removeValue",
    })
    await user.click(removeButtons[0])
    expect(screen.getByTestId(TEST_IDS.selectedValues)).toHaveTextContent(
      "b,c,d,e,f",
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:multiSelect.clearSelected",
      }),
    )
    expect(screen.getByTestId(TEST_IDS.selectedValues)).toHaveTextContent("")
  })

  it("shows an error toast when copying selected values fails", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard blocked"))

    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    render(
      <Harness
        initialSelected={["a"]}
        options={[{ value: "a", label: "Alpha" }]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:multiSelect.copySelectedValues",
      }),
    )

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("ui:multiSelect.copyError")
    })
  })

  it("shows a clear-query button when the user types into the combobox", async () => {
    const user = userEvent.setup()
    render(<Harness options={[{ value: "a", label: "Alpha" }]} />)

    const input = await screen.findByPlaceholderText("Pick values")
    expect(
      screen.queryByRole("button", { name: "ui:multiSelect.clearInput" }),
    ).not.toBeInTheDocument()

    await user.type(input, "alp")
    const clearButton = await screen.findByRole("button", {
      name: "ui:multiSelect.clearInput",
    })

    await user.click(clearButton)
    await waitFor(() => {
      expect(input).toHaveValue("")
    })
  })

  it("hides clear and remove controls when disabled", async () => {
    render(
      <Harness
        disabled
        initialSelected={["a"]}
        options={[{ value: "a", label: "Alpha" }]}
      />,
    )

    await screen.findByPlaceholderText("Pick values")
    expect(
      screen.queryByRole("button", { name: "ui:multiSelect.clearSelected" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "ui:multiSelect.removeValue" }),
    ).not.toBeInTheDocument()
  })
})
