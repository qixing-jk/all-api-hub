import { describe, expect, it, vi } from "vitest"

import { SearchableSelect } from "~/components/ui"
import { SELECT_FETCH_STATUSES } from "~/components/ui/SelectFetchFeedback"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

describe("SearchableSelect", () => {
  it("keeps a recovery footer visible with known options and no default empty message", async () => {
    render(
      <SearchableSelect
        open
        options={[{ value: "saved", label: "Saved model" }]}
        value="saved"
        onChange={vi.fn()}
        emptyMessage={null}
        footer={<button>Manage models</button>}
        fetchResult={{ status: SELECT_FETCH_STATUSES.Error }}
      />,
    )
    expect(
      await screen.findByRole("option", { name: "Saved model" }),
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Manage models" })).toBeVisible()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "ui:searchableSelect.fetchFailed",
    )
  })

  it("shows a failed request without offering unavailable recovery actions", async () => {
    render(
      <SearchableSelect
        open
        allowCustomValue={false}
        options={[]}
        value=""
        onChange={vi.fn()}
        fetchResult={{ status: SELECT_FETCH_STATUSES.Error }}
      />,
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ui:searchableSelect.fetchFailed",
    )
    expect(
      screen.queryByRole("button", { name: "common:actions.retry" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("ui:searchableSelect.manualInputHint"),
    ).not.toBeInTheDocument()
  })

  it("offers retry without manual input when custom models are unsupported", async () => {
    const retry = vi.fn()
    render(
      <SearchableSelect
        open
        allowCustomValue={false}
        options={[]}
        value=""
        onChange={vi.fn()}
        onRetryFetch={retry}
        fetchResult={{ status: SELECT_FETCH_STATUSES.Error }}
      />,
    )
    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.retry" }),
    )
    expect(retry).toHaveBeenCalledOnce()
    expect(
      screen.queryByText("ui:searchableSelect.manualInputHint"),
    ).not.toBeInTheDocument()
  })

  it("offers one recovery action and accepts manual input directly", async () => {
    const retry = vi.fn()
    const onChange = vi.fn()
    render(
      <SearchableSelect
        aria-label="Model"
        open
        options={[]}
        value="saved"
        onChange={onChange}
        allowCustomValue
        fetchResult={{
          status: SELECT_FETCH_STATUSES.Error,
          message: "Access denied",
        }}
        onRetryFetch={retry}
      />,
    )
    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.retry" }),
    )
    expect(retry).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("button", {
        name: "ui:searchableSelect.enterCustomValue",
      }),
    ).not.toBeInTheDocument()
    fireEvent.change(
      screen.getByPlaceholderText("ui:searchableSelect.searchPlaceholder"),
      { target: { value: "manual-model" } },
    )
    fireEvent.click(
      screen.getByRole("option", { name: "ui:searchableSelect.useValue" }),
    )
    expect(onChange).toHaveBeenCalledWith("manual-model")
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
  })
  it.each([
    { message: "x".repeat(100), details: false },
    { message: "x".repeat(101), details: true },
    { message: "first\nsecond", details: true },
    { message: "   short diagnostic   ", details: false },
  ])(
    "preserves diagnostic presentation at the boundary: $details",
    async ({ message, details }) => {
      render(
        <SearchableSelect
          open
          options={[]}
          value=""
          onChange={vi.fn()}
          fetchResult={{ status: SELECT_FETCH_STATUSES.Error, message }}
        />,
      )
      const alert = await screen.findByRole("alert")
      expect(alert).toHaveTextContent(
        details ? "ui:searchableSelect.fetchFailed" : message.trim(),
      )
      expect(
        Boolean(screen.queryByText("ui:searchableSelect.fetchDetails")),
      ).toBe(details)
    },
  )
  it("keeps a long diagnostic behind expandable details", async () => {
    const message = "Catalog request failed. ".repeat(10)
    render(
      <SearchableSelect
        open
        options={[]}
        value=""
        onChange={vi.fn()}
        fetchResult={{ status: SELECT_FETCH_STATUSES.Error, message }}
      />,
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ui:searchableSelect.fetchFailed",
    )
    const details = screen
      .getByText("ui:searchableSelect.fetchDetails")
      .closest("details")!
    expect(details).not.toHaveAttribute("open")
    fireEvent.click(screen.getByText("ui:searchableSelect.fetchDetails"))
    expect(details).toHaveAttribute("open")
    expect(details).toHaveTextContent(message.trim())
  })
  it("marks a failed fetch while closed without invalidating or replacing the selected model", async () => {
    render(
      <SearchableSelect
        options={[{ value: "saved", label: "Saved model" }]}
        value="saved"
        onChange={vi.fn()}
        fetchResult={{
          status: SELECT_FETCH_STATUSES.Error,
          message: "Access denied",
        }}
      />,
    )
    const trigger = await screen.findByRole("combobox")
    expect(trigger).toHaveTextContent("Saved model")
    expect(
      within(trigger).getByLabelText("ui:searchableSelect.fetchFailed"),
    ).toBeVisible()
    expect(trigger).not.toHaveAttribute("aria-invalid", "true")
  })
  it("reports a successful empty fetch inside the picker instead of treating it as unrequested", async () => {
    render(
      <SearchableSelect
        open
        options={[]}
        value=""
        onChange={vi.fn()}
        fetchResult={{ status: SELECT_FETCH_STATUSES.Success, count: 0 }}
      />,
    )
    expect(await screen.findByRole("status")).toHaveTextContent(
      "ui:searchableSelect.fetchEmpty",
    )
  })
  it("keeps fetch failures visible while searching and entering a custom model", async () => {
    const onChange = vi.fn()
    render(
      <SearchableSelect
        open
        options={[{ value: "saved", label: "Saved" }]}
        value="saved"
        onChange={onChange}
        allowCustomValue
        fetchResult={{
          status: SELECT_FETCH_STATUSES.Error,
          message: "Access denied",
        }}
      />,
    )
    fireEvent.change(
      await screen.findByPlaceholderText(
        "ui:searchableSelect.searchPlaceholder",
      ),
      { target: { value: "manual-model" } },
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Access denied")
    fireEvent.click(
      screen.getByRole("option", { name: "ui:searchableSelect.useValue" }),
    )
    expect(onChange).toHaveBeenCalledWith("manual-model")
  })
  it("keeps search actions separate from option activation", async () => {
    const onChange = vi.fn()
    const refresh = vi.fn()
    render(
      <SearchableSelect
        open
        options={[{ value: "saved", label: "Saved model" }]}
        value="saved"
        onChange={onChange}
        searchActions={<button onClick={refresh}>Refresh models</button>}
      />,
    )
    const action = await screen.findByRole("button", { name: "Refresh models" })
    action.focus()
    fireEvent.keyDown(action, { key: "Enter" })
    fireEvent.click(action)
    expect(refresh).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole("option", { name: "Saved model" })).toBeVisible()
  })

  it("lets a recovery footer replace the default empty message while retaining custom input", async () => {
    const onChange = vi.fn()
    render(
      <SearchableSelect
        options={[]}
        value=""
        onChange={onChange}
        allowCustomValue
        emptyMessage={null}
        footer={<button>Fetch models</button>}
      />,
    )
    fireEvent.click(await screen.findByRole("combobox"))
    expect(
      screen.queryByText("ui:searchableSelect.noOptionsAllowCustom"),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Fetch models" })).toBeVisible()
    fireEvent.change(
      screen.getByPlaceholderText("ui:searchableSelect.searchPlaceholder"),
      { target: { value: "manual-model" } },
    )
    fireEvent.click(
      screen.getByRole("option", { name: "ui:searchableSelect.useValue" }),
    )
    expect(onChange).toHaveBeenCalledWith("manual-model")
  })

  it("keeps footer actions available during search without selecting a value or closing", async () => {
    const onChange = vi.fn()
    const refresh = vi.fn()
    render(
      <SearchableSelect
        options={[{ value: "saved", label: "Saved model" }]}
        value="saved"
        onChange={onChange}
        footer={
          <>
            <button onClick={refresh}>Refresh models</button>
            <button>Manage models</button>
          </>
        }
      />,
    )
    const trigger = await screen.findByRole("combobox")
    expect(
      screen.queryByRole("button", { name: "Refresh models" }),
    ).not.toBeInTheDocument()
    fireEvent.click(trigger)
    fireEvent.change(
      screen.getByPlaceholderText("ui:searchableSelect.searchPlaceholder"),
      { target: { value: "no match" } },
    )
    fireEvent.click(screen.getByRole("button", { name: "Refresh models" }))
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "Manage models" })).toBeVisible()
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(trigger).toHaveTextContent("Saved model")
  })

  it("shows pending feedback instead of an empty result before options arrive", async () => {
    const props = { options: [], value: "", onChange: vi.fn(), open: true }
    const { rerender } = render(<SearchableSelect {...props} loading />)

    expect(
      await screen.findByRole("status", { name: "common:status.loading" }),
    ).toBeVisible()
    expect(
      screen.queryByText("ui:searchableSelect.noOptions"),
    ).not.toBeInTheDocument()

    rerender(<SearchableSelect {...props} loading={false} />)
    expect(screen.getByText("ui:searchableSelect.noOptions")).toBeVisible()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("keeps the selected label and custom entry available while options load", async () => {
    const onChange = vi.fn()
    const props = {
      options: [{ value: "saved", label: "Saved model" }],
      value: "saved",
      onChange,
      allowCustomValue: true,
      placeholder: "Choose a model",
    }
    const { rerender } = render(<SearchableSelect {...props} loading />)
    const trigger = await screen.findByRole("combobox")

    expect(trigger).toHaveAttribute("aria-busy", "true")
    expect(trigger).toHaveTextContent("Saved model")
    expect(trigger).not.toHaveTextContent("common:status.loading")
    expect(trigger).toBeEnabled()
    fireEvent.click(trigger)
    expect(
      screen.queryByText("ui:searchableSelect.empty"),
    ).not.toBeInTheDocument()
    fireEvent.change(
      screen.getByPlaceholderText("ui:searchableSelect.searchPlaceholder"),
      {
        target: { value: "custom-model" },
      },
    )
    fireEvent.click(
      screen.getByRole("option", { name: "ui:searchableSelect.useValue" }),
    )
    expect(onChange).toHaveBeenCalledWith("custom-model")

    rerender(<SearchableSelect {...props} loading={false} />)
    expect(trigger).not.toHaveAttribute("aria-busy", "true")
    expect(trigger).toHaveTextContent("Saved model")
  })

  it("shows a custom-entry hint when options are empty and allowCustomValue is enabled", async () => {
    render(
      <SearchableSelect
        options={[]}
        value=""
        onChange={() => {}}
        allowCustomValue
      />,
    )

    const combo = await screen.findByRole("combobox")
    fireEvent.click(combo)

    expect(
      await screen.findByText("ui:searchableSelect.noOptionsAllowCustom"),
    ).toBeInTheDocument()
  })

  it("shows a no-options message when options are empty and allowCustomValue is disabled", async () => {
    render(<SearchableSelect options={[]} value="" onChange={() => {}} />)

    const combo = await screen.findByRole("combobox")
    fireEvent.click(combo)

    expect(
      await screen.findByText("ui:searchableSelect.noOptions"),
    ).toBeInTheDocument()
  })

  it("supports controlled open state", async () => {
    render(
      <SearchableSelect
        options={[
          {
            value: "account-1",
            label: "Account 1",
          },
        ]}
        value=""
        onChange={() => {}}
        open={true}
        onOpenChange={() => {}}
      />,
    )

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="searchable-select-trigger"]'),
      ).toHaveAttribute("aria-expanded", "true"),
    )
    expect(
      await screen.findByRole("option", { name: "Account 1" }),
    ).toBeVisible()
  })

  it("searches labels with selector-sensitive characters and returns the stable option value", async () => {
    const onChange = vi.fn()
    const selectorSensitiveOption = {
      value: "example-option-id",
      label: 'Example "quoted" \\label + alias (weight: 0.13)',
    }

    render(
      <SearchableSelect
        options={[
          selectorSensitiveOption,
          { value: "other-option-id", label: "Other option" },
        ]}
        value=""
        onChange={onChange}
        open={true}
        onOpenChange={() => {}}
      />,
    )

    const searchInput = await waitFor(() => {
      const input = document.querySelector('[data-slot="command-input"]')
      expect(input).toBeInTheDocument()
      return input as HTMLInputElement
    })
    fireEvent.change(searchInput, {
      target: { value: "quoted + alias" },
    })

    const option = await screen.findByRole("option", {
      name: selectorSensitiveOption.label,
    })
    expect(option).toBeVisible()
    expect(
      screen.queryByRole("option", { name: "Other option" }),
    ).not.toBeInTheDocument()

    fireEvent.click(option)
    expect(onChange).toHaveBeenCalledWith(selectorSensitiveOption.value)
  })

  it("uses default viewport-aware height constraints and supports option suffix content", async () => {
    render(
      <SearchableSelect
        options={[
          {
            value: "site-1",
            label: "Site 1",
            suffix: <span data-testid="site-1-count">3</span>,
          },
        ]}
        value=""
        onChange={() => {}}
        open={true}
        onOpenChange={() => {}}
      />,
    )

    expect(await screen.findByText("Site 1")).toBeInTheDocument()
    const commandItem = document.querySelector(
      '[data-slot="command-item"]',
    ) as HTMLElement
    expect(within(commandItem).getByTestId("site-1-count")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(document.querySelector('[data-slot="popover-content"]')).toHaveClass(
      "max-h-(--radix-popover-content-available-height)",
      "flex",
      "flex-col",
      "overflow-hidden",
    )
    expect(document.querySelector('[data-slot="command"]')).toHaveClass(
      "min-h-0",
      "flex-1",
      "[&>[data-slot=command-input-wrapper]]:shrink-0",
    )
    expect(document.querySelector('[data-slot="command-list"]')).toHaveClass(
      "max-h-none",
      "min-h-0",
      "flex-1",
    )
  })

  it("does not select a disabled option when clicked", async () => {
    const onChange = vi.fn()
    render(
      <SearchableSelect
        options={[
          {
            value: "disabled-option",
            label: "Disabled Option",
            disabled: true,
          },
        ]}
        value=""
        onChange={onChange}
        open={true}
        onOpenChange={() => {}}
      />,
    )

    const option = await screen.findByRole("option", {
      name: "Disabled Option",
    })
    fireEvent.click(option)
    expect(onChange).not.toHaveBeenCalled()
  })
})
