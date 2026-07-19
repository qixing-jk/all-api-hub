import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { KiloCodeDefaultModelSelect } from "~/components/KiloCodeDefaultModelSelect"
import { KILO_CODE_EXPORT_TEST_IDS } from "~/components/kiloCodeExportTestIds"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen } from "~~/tests/test-utils/render"

const LIMITED_MESSAGE_KEY = "dialog.kiloCode.messages.modelSearchLimited"

function addLimitedMessageResource() {
  testI18n.addResource(
    "en",
    "ui",
    LIMITED_MESSAGE_KEY,
    "Showing the first {{visible}} of {{count}} models.",
  )
}

describe("KiloCodeDefaultModelSelect", () => {
  it("shows the standard empty state when no models or custom values are available", async () => {
    const user = userEvent.setup()

    render(
      <KiloCodeDefaultModelSelect
        value=""
        modelIds={[]}
        onChange={vi.fn()}
        placeholder="Choose a model"
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    await user.click(
      await screen.findByRole("combobox", { name: "Choose a model" }),
    )

    expect(screen.getByText("ui:searchableSelect.noOptions")).toBeVisible()
  })

  it("renders at most 100 rows, keeps the selected row visible, and searches all 5,000 models", async () => {
    const user = userEvent.setup()
    const models = Array.from(
      { length: 5_000 },
      (_, index) => `example-model-${index.toString().padStart(4, "0")}`,
    )

    render(
      <KiloCodeDefaultModelSelect
        aria-label="Default model"
        value="example-model-4999"
        modelIds={models}
        onChange={vi.fn()}
        allowCustomValue
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    await user.click(
      await screen.findByRole("combobox", { name: "Default model" }),
    )

    const initialRows = screen.getAllByTestId(
      KILO_CODE_EXPORT_TEST_IDS.modelOption,
    )
    expect(initialRows).toHaveLength(100)
    expect(
      screen.getByRole("option", { name: "example-model-4999" }),
    ).toBeVisible()

    await user.type(
      screen.getByTestId(KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch),
      "4998",
    )

    expect(
      screen.getByRole("option", { name: "example-model-4998" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("option", { name: "example-model-4999" }),
    ).not.toBeInTheDocument()
  })

  it("does not inject a selected model that does not match an active search", async () => {
    const user = userEvent.setup()
    const models = Array.from(
      { length: 150 },
      (_, index) => `example-model-${index.toString().padStart(3, "0")}`,
    )

    render(
      <KiloCodeDefaultModelSelect
        value="example-model-149"
        modelIds={models}
        onChange={vi.fn()}
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    await user.click(await screen.findByRole("combobox"))
    await user.type(
      screen.getByTestId(KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch),
      "000",
    )

    expect(
      screen.queryByRole("option", { name: "example-model-149" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "example-model-000" }),
    ).toBeVisible()
  })

  it("offers a trimmed custom value without exceeding the 100-row budget", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const models = Array.from(
      { length: 150 },
      (_, index) => `model-${index.toString().padStart(3, "0")}`,
    )

    render(
      <KiloCodeDefaultModelSelect
        value=""
        modelIds={models}
        onChange={onChange}
        allowCustomValue
        placeholder="Choose a model"
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    await user.click(
      await screen.findByRole("combobox", { name: "Choose a model" }),
    )
    const search = screen.getByTestId(
      KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch,
    )
    await user.type(search, " model ")

    expect(
      screen.getAllByTestId(KILO_CODE_EXPORT_TEST_IDS.modelOption),
    ).toHaveLength(100)

    await user.click(
      screen.getByRole("option", {
        name: "ui:searchableSelect.useValue",
      }),
    )
    expect(onChange).toHaveBeenCalledWith("model")
  })

  it("shows a selected custom value when it is outside the catalog", async () => {
    const user = userEvent.setup()

    render(
      <KiloCodeDefaultModelSelect
        value="custom/model"
        modelIds={["catalog-model"]}
        onChange={vi.fn()}
        allowCustomValue
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    const trigger = await screen.findByRole("combobox", {
      name: "custom/model",
    })
    expect(trigger).toHaveTextContent("custom/model")

    await user.click(trigger)
    expect(screen.getByRole("option", { name: "custom/model" })).toBeVisible()
  })

  it("shows translated bounded-result counts", async () => {
    const user = userEvent.setup()
    addLimitedMessageResource()

    render(
      <KiloCodeDefaultModelSelect
        value="model-000"
        modelIds={Array.from(
          { length: 101 },
          (_, index) => `model-${index.toString().padStart(3, "0")}`,
        )}
        onChange={vi.fn()}
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    await user.click(await screen.findByRole("combobox"))

    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing the first 100 of 101 models.",
    )
  })

  it("counts only catalog matches left after an external selection is injected", async () => {
    const user = userEvent.setup()
    addLimitedMessageResource()

    render(
      <KiloCodeDefaultModelSelect
        value="external-selected-model"
        modelIds={Array.from(
          { length: 100 },
          (_, index) => `catalog-model-${index.toString().padStart(3, "0")}`,
        )}
        onChange={vi.fn()}
        allowCustomValue
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    await user.click(await screen.findByRole("combobox"))

    expect(screen.getAllByRole("option")).toHaveLength(100)
    expect(
      screen.getAllByRole("option", { name: /^catalog-model-/ }),
    ).toHaveLength(99)
    expect(
      screen.getByRole("option", { name: "external-selected-model" }),
    ).toBeVisible()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing the first 99 of 100 models.",
    )
  })

  it("reserves rows for distinct selected and custom values", async () => {
    const user = userEvent.setup()
    addLimitedMessageResource()

    render(
      <KiloCodeDefaultModelSelect
        value="model-selected"
        modelIds={Array.from(
          { length: 100 },
          (_, index) => `model-${index.toString().padStart(3, "0")}`,
        )}
        onChange={vi.fn()}
        allowCustomValue
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    await user.click(await screen.findByRole("combobox"))
    await user.type(
      screen.getByTestId(KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch),
      "model",
    )

    expect(screen.getAllByRole("option")).toHaveLength(100)
    expect(screen.getAllByRole("option", { name: /^model-\d+$/ })).toHaveLength(
      98,
    )
    expect(
      screen.getAllByRole("option", { name: "model-selected" }),
    ).toHaveLength(1)
    expect(
      screen.getAllByRole("option", {
        name: "ui:searchableSelect.useValue",
      }),
    ).toHaveLength(1)
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing the first 98 of 100 models.",
    )
  })

  it("uses one row when the custom search equals the external selection", async () => {
    const user = userEvent.setup()

    render(
      <KiloCodeDefaultModelSelect
        value="model"
        modelIds={Array.from(
          { length: 100 },
          (_, index) => `model-${index.toString().padStart(3, "0")}`,
        )}
        onChange={vi.fn()}
        allowCustomValue
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    await user.click(await screen.findByRole("combobox"))
    await user.type(
      screen.getByTestId(KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch),
      "model",
    )

    expect(screen.getAllByRole("option")).toHaveLength(100)
    expect(
      screen.getAllByRole("option", {
        name: "ui:searchableSelect.useValue",
      }),
    ).toHaveLength(1)
  })

  it("keeps search and wrapped status outside the remaining scrollable height", async () => {
    const user = userEvent.setup()
    addLimitedMessageResource()

    render(
      <KiloCodeDefaultModelSelect
        value="model-000"
        modelIds={Array.from(
          { length: 101 },
          (_, index) => `model-${index.toString().padStart(3, "0")}`,
        )}
        onChange={vi.fn()}
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    await user.click(await screen.findByRole("combobox"))

    const popoverContent = document.querySelector(
      '[data-slot="popover-content"]',
    )
    const command = document.querySelector('[data-slot="command"]')
    const status = screen.getByRole("status")
    const list = screen.getByRole("listbox")

    expect(popoverContent).toHaveClass("flex", "flex-col", "overflow-hidden")
    expect(command).toHaveClass(
      "min-h-0",
      "flex-1",
      "[&_[data-slot='command-input-wrapper']]:shrink-0",
    )
    expect(status).toHaveClass("shrink-0")
    expect(list).toHaveClass("min-h-0", "flex-1", "overflow-y-auto")
    expect(list).not.toHaveClass(
      "max-h-[calc(var(--radix-popover-content-available-height)-2.25rem)]",
    )
  })

  it("selects the next model with ArrowDown and Enter", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <KiloCodeDefaultModelSelect
        value=""
        modelIds={["model-a", "model-b"]}
        onChange={onChange}
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    await user.click(await screen.findByRole("combobox"))
    await user.keyboard("{ArrowDown}{Enter}")

    expect(onChange).toHaveBeenCalledWith("model-b")
  })

  it("returns focus when Escape closes the popover", async () => {
    const user = userEvent.setup()

    render(
      <KiloCodeDefaultModelSelect
        aria-label="Default model"
        value=""
        modelIds={["model-a"]}
        onChange={vi.fn()}
        searchPlaceholder="Search models"
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    const trigger = await screen.findByRole("combobox", {
      name: "Default model",
    })
    await user.click(trigger)
    expect(
      screen.getByRole("combobox", { name: "Search models" }),
    ).toHaveFocus()

    await user.keyboard("{Escape}")

    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute("aria-expanded", "false")
  })

  it("does not open when disabled", async () => {
    const user = userEvent.setup()

    render(
      <KiloCodeDefaultModelSelect
        aria-label="Default model"
        value=""
        modelIds={["model-a"]}
        onChange={vi.fn()}
        disabled
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    const trigger = await screen.findByRole("combobox", {
      name: "Default model",
    })
    expect(trigger).toBeDisabled()

    await user.click(trigger)

    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("supports exact slash IDs and returns focus after keyboard selection", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <KiloCodeDefaultModelSelect
        aria-label="Default model"
        value=""
        modelIds={["vendor/model", "vendor/model-plus"]}
        onChange={onChange}
        searchPlaceholder="Search models"
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    const trigger = await screen.findByRole("combobox", {
      name: "Default model",
    })
    expect(trigger).toHaveAttribute("aria-expanded", "false")

    await user.click(trigger)
    const search = screen.getByRole("combobox", { name: "Search models" })
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(search).toHaveFocus()

    await user.type(search, "vendor/model")
    await user.keyboard("{Enter}")

    expect(onChange).toHaveBeenCalledWith("vendor/model")
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(trigger).toHaveFocus()
  })

  it("resets search when the popover closes", async () => {
    const user = userEvent.setup()

    render(
      <KiloCodeDefaultModelSelect
        value="model-a"
        modelIds={["model-a", "model-b"]}
        onChange={vi.fn()}
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    const trigger = await screen.findByRole("combobox")
    await user.click(trigger)
    await user.type(
      screen.getByTestId(KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch),
      "model-b",
    )
    await user.keyboard("{Escape}")
    await user.click(trigger)

    expect(
      screen.getByTestId(KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch),
    ).toHaveValue("")
  })
})
