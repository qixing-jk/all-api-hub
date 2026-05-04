import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import ChannelFiltersEditor from "~/components/ChannelFiltersEditor"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()
  return {
    ...actual,
    Input: ({
      clearButtonLabel,
      onClear,
      value,
      onChange,
      placeholder,
    }: {
      clearButtonLabel?: string
      onClear?: () => void
      value: string
      onChange: (event: { target: { value: string } }) => void
      placeholder?: string
    }) => (
      <div>
        <input value={value} onChange={onChange} placeholder={placeholder} />
        {value && onClear ? (
          <button
            type="button"
            aria-label={clearButtonLabel}
            onClick={onClear}
          />
        ) : null}
      </div>
    ),
    Textarea: ({
      clearButtonLabel,
      onClear,
      value,
      onChange,
      placeholder,
      rows,
    }: {
      clearButtonLabel?: string
      onClear?: () => void
      value: string
      onChange: (event: { target: { value: string } }) => void
      placeholder?: string
      rows?: number
    }) => (
      <div>
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={rows}
        />
        {value && onClear ? (
          <button
            type="button"
            aria-label={clearButtonLabel}
            onClick={onClear}
          />
        ) : null}
      </div>
    ),
    CompactMultiSelect: ({
      selected,
      onChange,
      placeholder,
      disabled,
    }: {
      selected: string[]
      onChange: (values: string[]) => void
      placeholder?: string
      disabled?: boolean
    }) => (
      <button
        type="button"
        aria-label={placeholder}
        disabled={disabled}
        onClick={() => onChange([...selected, "tool-calling"])}
      >
        {selected.join(",")}
      </button>
    ),
  }
})

vi.mock("~/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    type = "button",
    variant,
    size,
    leftIcon,
    className,
    ...props
  }: {
    children: ReactNode
    onClick?: () => void
    type?: "button" | "submit" | "reset"
    variant?: string
    size?: string
    leftIcon?: ReactNode
    className?: string
    [key: string]: unknown
  }) => (
    <button
      type={type}
      onClick={() => onClick?.()}
      data-variant={variant}
      data-size={size}
      className={className}
      {...props}
    >
      {leftIcon}
      {children}
    </button>
  ),
}))

vi.mock("~/components/ui/label", () => ({
  Label: ({
    children,
    className,
  }: {
    children: ReactNode
    className?: string
  }) => <label className={className}>{children}</label>,
}))

vi.mock("~/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: ReactNode
  }) => (
    <select
      aria-label={
        value === "pattern" || value === "probe"
          ? "filter-kind"
          : "filter-action"
      }
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}))

vi.mock("~/components/ui/Switch", () => ({
  Switch: ({
    id,
    checked,
    onChange,
    size,
  }: {
    id: string
    checked: boolean
    onChange: (value: boolean) => void
    size?: string
  }) => (
    <button
      type="button"
      aria-label={id}
      data-size={size}
      data-checked={String(checked)}
      onClick={() => onChange(!checked)}
    >
      {checked ? "on" : "off"}
    </button>
  ),
}))

const buildFilter = (overrides: Record<string, unknown> = {}) => ({
  id: "rule-1",
  name: "Allow GPT",
  description: undefined,
  pattern: "gpt",
  isRegex: false,
  action: "include" as const,
  enabled: true,
  createdAt: 100,
  updatedAt: 200,
  ...overrides,
})

const renderEditor = (overrides: Record<string, unknown> = {}) => {
  const props = {
    filters: [],
    viewMode: "visual" as const,
    jsonText: "",
    isLoading: false,
    onAddFilter: vi.fn(),
    onRemoveFilter: vi.fn(),
    onFieldChange: vi.fn(),
    onClickViewVisual: vi.fn(),
    onClickViewJson: vi.fn(),
    onChangeJsonText: vi.fn(),
    ...overrides,
  }

  return {
    ...render(<ChannelFiltersEditor {...props} />),
    props,
  }
}

describe("ChannelFiltersEditor", () => {
  it("renders a loading state instead of editor controls", () => {
    renderEditor({ isLoading: true })

    expect(screen.getByText("filters.loading")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "filters.addPatternRule" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("filters.viewMode.visual"),
    ).not.toBeInTheDocument()
  })

  it("renders the empty visual state and adds a first rule", async () => {
    const user = userEvent.setup()
    const { props } = renderEditor()

    expect(screen.getByText("filters.empty.title")).toBeInTheDocument()
    expect(screen.getByText("filters.empty.description")).toBeInTheDocument()
    expect(screen.getByText("filters.viewMode.label")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "filters.viewMode.visual" }),
    ).toHaveAttribute("data-variant", "secondary")
    expect(
      screen.getByRole("button", { name: "filters.viewMode.json" }),
    ).toHaveAttribute("data-variant", "ghost")

    await user.click(
      screen.getByRole("button", { name: "filters.addPatternRule" }),
    )

    expect(props.onAddFilter).toHaveBeenCalledWith("pattern")
  })

  it("shows unsupported probe messaging in the empty state and disables probe creation", () => {
    renderEditor({
      probeRulesSupported: false,
      probeRulesUnsupportedMessage: "Probe rules are unsupported here.",
    })

    expect(
      screen.getByText("Probe rules are unsupported here."),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "filters.addProbeRule" }),
    ).toBeDisabled()
  })

  it("edits and removes a populated visual rule with substring matching", async () => {
    const user = userEvent.setup()
    const { props } = renderEditor({
      filters: [buildFilter()],
    })

    expect(screen.getByText("common:status.enabled")).toBeInTheDocument()
    expect(screen.getByText("filters.hints.substring")).toBeInTheDocument()
    expect(screen.getByDisplayValue("")).toBeInTheDocument()

    await user.click(screen.getByLabelText("filter-enabled-rule-1"))
    expect(props.onFieldChange).toHaveBeenCalledWith("rule-1", "enabled", false)

    fireEvent.change(screen.getByPlaceholderText("filters.placeholders.name"), {
      target: { value: "Block Anthropic" },
    })
    expect(props.onFieldChange).toHaveBeenCalledWith(
      "rule-1",
      "name",
      "Block Anthropic",
    )

    fireEvent.change(
      screen.getByPlaceholderText("filters.placeholders.pattern"),
      {
        target: { value: "anthropic" },
      },
    )
    expect(props.onFieldChange).toHaveBeenCalledWith(
      "rule-1",
      "pattern",
      "anthropic",
    )

    await user.click(screen.getByLabelText("filter-regex-rule-1"))
    expect(props.onFieldChange).toHaveBeenCalledWith("rule-1", "isRegex", true)

    fireEvent.change(screen.getByLabelText("filter-action"), {
      target: { value: "exclude" },
    })
    expect(props.onFieldChange).toHaveBeenCalledWith(
      "rule-1",
      "action",
      "exclude",
    )

    fireEvent.change(
      screen.getByPlaceholderText("filters.placeholders.description"),
      {
        target: { value: "Block provider-specific models" },
      },
    )
    expect(props.onFieldChange).toHaveBeenCalledWith(
      "rule-1",
      "description",
      "Block provider-specific models",
    )

    const clearButtons = screen.getAllByRole("button", {
      name: "common:actions.clear",
    })
    expect(clearButtons).toHaveLength(2)

    for (const clearButton of clearButtons) {
      await user.click(clearButton)
    }

    expect(props.onFieldChange).toHaveBeenCalledWith("rule-1", "name", "")
    expect(props.onFieldChange).toHaveBeenCalledWith("rule-1", "pattern", "")

    await user.click(
      screen.getByRole("button", { name: "filters.labels.delete" }),
    )
    expect(props.onRemoveFilter).toHaveBeenCalledWith("rule-1")
  })

  it("renders disabled regex rules and keeps add-rule actions available", async () => {
    const user = userEvent.setup()
    const { props } = renderEditor({
      filters: [
        buildFilter({
          id: "rule-2",
          enabled: false,
          isRegex: true,
          description: "Use a stricter regex exclusion",
        }),
      ],
    })

    expect(screen.getByText("common:status.disabled")).toBeInTheDocument()
    expect(screen.getByText("filters.hints.regex")).toBeInTheDocument()
    expect(
      screen.getByDisplayValue("Use a stricter regex exclusion"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "filters.addPatternRule" }),
    )

    expect(props.onAddFilter).toHaveBeenCalledWith("pattern")
  })

  it("edits probe rule selections without showing credential fields", async () => {
    const user = userEvent.setup()
    const { props } = renderEditor({
      filters: [
        buildFilter({
          kind: "probe",
          probeIds: ["text-generation"],
          match: "all",
        }),
      ],
    })

    expect(screen.getByText("filters.hints.probesAllPass")).toBeInTheDocument()
    expect(
      screen.queryByText("apiKey", { exact: false }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByLabelText("filters.placeholders.probes"))

    expect(props.onFieldChange).toHaveBeenCalledWith("rule-1", "probeIds", [
      "text-generation",
      "tool-calling",
    ])
  })

  it("shows unsupported probe messaging for saved probe rules and disables the probe picker", () => {
    renderEditor({
      probeRulesSupported: false,
      probeRulesUnsupportedMessage: "Probe rules are unsupported here.",
      filters: [
        buildFilter({
          kind: "probe",
          probeIds: ["text-generation"],
          match: "all",
        }),
      ],
    })

    expect(
      screen.getAllByText("Probe rules are unsupported here.").length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByRole("button", { name: "filters.placeholders.probes" }),
    ).toBeDisabled()
  })

  it("clears a populated visual rule description", async () => {
    const user = userEvent.setup()
    const { props } = renderEditor({
      filters: [
        buildFilter({
          description: "Clear this description",
        }),
      ],
    })

    const clearButtons = screen.getAllByRole("button", {
      name: "common:actions.clear",
    })
    await user.click(clearButtons[2])

    expect(props.onFieldChange).toHaveBeenCalledWith(
      "rule-1",
      "description",
      "",
    )
  })

  it("renders the json editor and propagates mode switches and text changes", async () => {
    const user = userEvent.setup()
    const { props } = renderEditor({
      viewMode: "json",
      jsonText: '[{"name":"Allow GPT"}]',
    })

    expect(
      screen.getByRole("button", { name: "filters.viewMode.visual" }),
    ).toHaveAttribute("data-variant", "ghost")
    expect(
      screen.getByRole("button", { name: "filters.viewMode.json" }),
    ).toHaveAttribute("data-variant", "secondary")
    expect(screen.getByText("filters.jsonEditor.label")).toBeInTheDocument()
    expect(screen.getByText("filters.jsonEditor.hint")).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('[{"name":"Allow GPT"}]'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "filters.viewMode.visual" }),
    )
    expect(props.onClickViewVisual).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByRole("button", { name: "filters.viewMode.json" }),
    )
    expect(props.onClickViewJson).toHaveBeenCalledTimes(1)

    fireEvent.change(
      screen.getByPlaceholderText("filters.jsonEditor.placeholder"),
      {
        target: { value: "[]" },
      },
    )
    expect(props.onChangeJsonText).toHaveBeenCalledWith("[]")

    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )
    expect(props.onChangeJsonText).toHaveBeenCalledWith("")
  })
})
