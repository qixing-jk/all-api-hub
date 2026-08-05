import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import {
  NativeResourceEditorBody,
  type NativeResourceEditorBodyProps,
} from "~/features/ResourceEditor/NativeResourceEditorBody"
import { defineResourceEditorFieldPolicy } from "~/features/ResourceEditor/resourceFieldPolicy"

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const t = ((key: string) =>
  ({
    "example:creator": "Creator",
    "example:basic": "Basic",
    "common:status.loading": "Loading...",
    "common:status.error": "Error",
    "common:actions.retry": "Retry",
    "ui:multiSelect.noOptions": "No options available",
  })[key] ?? key) as TFunction

describe("NativeResourceEditorBody", () => {
  it("renders controller-owned dynamic option state inline and disables unavailable selectors", () => {
    render(
      <NativeResourceEditorBody
        t={t}
        descriptors={[
          { fieldId: "workspace", type: "select", options: [] },
          {
            fieldId: "creator",
            type: "select",
            options: [],
            optionLoader: { dependsOn: ["workspace"] },
          },
        ]}
        policy={defineResourceEditorFieldPolicy({
          fields: [
            {
              fieldId: "workspace",
              section: "basic",
              order: 1,
              renderer: "select",
              resolveLabel: () => "Workspace",
            },
            {
              fieldId: "creator",
              section: "basic",
              order: 2,
              renderer: "select",
              resolveLabel: () => "Creator",
            },
          ],
          hiddenFields: [],
        })}
        sectionOrder={{ basic: 0 }}
        sectionLabelResolvers={{ basic: () => "Basic" }}
        values={{ workspace: "workspace-example", creator: null }}
        onValueChange={() => undefined}
        controlledOptionStates={{
          creator: {
            status: "error",
            options: [],
            errorMessage: "Permission denied",
          },
        }}
        onRetryControlledOptions={() => undefined}
      />,
    )

    expect(screen.getByRole("combobox", { name: "Creator" })).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent("Permission denied")
  })

  it("renders and selects ready controller-owned options without copying them into descriptors", async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(
      <NativeResourceEditorBody
        t={t}
        descriptors={[
          {
            fieldId: "creator",
            type: "select",
            options: [],
            optionLoader: { dependsOn: [] },
          },
        ]}
        policy={defineResourceEditorFieldPolicy({
          fields: [
            {
              fieldId: "creator",
              section: "basic",
              order: 1,
              renderer: "select",
              resolveLabel: () => "Creator",
            },
          ],
          hiddenFields: [],
        })}
        sectionOrder={{ basic: 0 }}
        sectionLabelResolvers={{ basic: () => "Basic" }}
        values={{ creator: "" }}
        onValueChange={onValueChange}
        controlledOptionStates={{
          creator: {
            status: "ready",
            options: [
              {
                value: "member-example",
                displayLabel: "Example member",
                secondaryLabel: "member@example.invalid",
              },
            ],
          },
        }}
      />,
    )

    await user.click(screen.getByRole("combobox", { name: "Creator" }))
    expect(screen.getByText("Example member")).toBeVisible()
    expect(screen.getByText("member@example.invalid")).toBeVisible()
    await user.click(screen.getByRole("option", { name: /Example member/ }))
    expect(onValueChange).toHaveBeenCalledWith("creator", "member-example")
  })

  it("exports its props as the public editor boundary", () => {
    const props: NativeResourceEditorBodyProps<"basic"> = {
      t,
      descriptors: [],
      policy: { fields: [], hiddenFields: [] },
      sectionOrder: { basic: 0 },
      sectionLabelResolvers: { basic: () => "Basic" },
      values: {},
      onValueChange: () => undefined,
    }

    expect(props).toBeDefined()
  })

  it("lets consumers wrap a section without changing its field rendering", () => {
    render(
      <NativeResourceEditorBody
        t={t}
        descriptors={[{ fieldId: "enabled", type: "boolean" }]}
        policy={{
          fields: [
            {
              fieldId: "enabled",
              section: "basic",
              order: 10,
              renderer: "boolean",
              resolveLabel: () => "Enabled",
            },
          ],
          hiddenFields: [],
        }}
        sectionOrder={{ basic: 0 }}
        sectionLabelResolvers={{ basic: () => "Basic" }}
        values={{ enabled: true }}
        onValueChange={() => undefined}
        renderSectionOverride={(section, label, children) =>
          section === "basic" ? (
            <details open role="group" aria-label={label}>
              <summary>{label}</summary>
              {children}
            </details>
          ) : undefined
        }
      />,
    )

    expect(screen.getByRole("group", { name: "Basic" })).toHaveAttribute("open")
    expect(screen.getByRole("switch", { name: "Enabled" })).toBeChecked()
  })

  it("renders a nullable numeric limit and the creator display label", () => {
    render(
      <NativeResourceEditorBody
        t={t}
        descriptors={[
          { fieldId: "limit", type: "number", nullable: true },
          {
            fieldId: "creator",
            type: "select",
            options: [{ value: "member-1", displayLabel: "Example member" }],
          },
        ]}
        policy={{
          fields: [
            {
              fieldId: "limit",
              section: "basic",
              order: 10,
              renderer: "number",
              resolveLabel: () => "Limit",
            },
            {
              fieldId: "creator",
              section: "basic",
              order: 20,
              renderer: "select",
              resolveLabel: (translate) => translate("example:creator"),
            },
          ],
          hiddenFields: [],
        }}
        sectionOrder={{ basic: 0 }}
        sectionLabelResolvers={{
          basic: (translate) => translate("example:basic"),
        }}
        values={{ limit: null, creator: "member-1" }}
        onValueChange={() => undefined}
      />,
    )

    expect(screen.getByRole("spinbutton", { name: "Limit" })).toHaveValue(null)
    expect(screen.getByRole("combobox", { name: "Creator" })).toHaveTextContent(
      "Example member",
    )
  })

  it("aborts stale dependent option loads and renders the latest display label", async () => {
    let resolveFirst!: (
      value: readonly { value: string; displayLabel: string }[],
    ) => void
    let resolveSecond!: (
      value: readonly { value: string; displayLabel: string }[],
    ) => void
    const signals: AbortSignal[] = []
    const onLoadOptions = vi
      .fn()
      .mockImplementationOnce((_fieldId, _values, options) => {
        signals.push(options.signal)
        return new Promise((resolve) => {
          resolveFirst = resolve
        })
      })
      .mockImplementationOnce((_fieldId, _values, options) => {
        signals.push(options.signal)
        return new Promise((resolve) => {
          resolveSecond = resolve
        })
      })
    const props = {
      t,
      descriptors: [
        { fieldId: "team", type: "text" as const },
        {
          fieldId: "creator",
          type: "select" as const,
          options: [],
          optionLoader: { dependsOn: ["team"] },
        },
      ],
      policy: {
        fields: [
          {
            fieldId: "team",
            section: "basic",
            order: 10,
            renderer: "text" as const,
            resolveLabel: () => "Team",
          },
          {
            fieldId: "creator",
            section: "basic",
            order: 20,
            renderer: "select" as const,
            resolveLabel: (translate: TFunction) =>
              translate("example:creator"),
          },
        ],
        hiddenFields: [],
      },
      sectionOrder: { basic: 0 },
      sectionLabelResolvers: {
        basic: (translate: TFunction) => translate("example:basic"),
      },
      fieldIssues: [],
      onValueChange: () => undefined,
      onLoadOptions,
    }
    const view = render(
      <NativeResourceEditorBody
        {...props}
        values={{ team: "first", creator: "" }}
      />,
    )

    expect(await screen.findByText("Loading...")).toBeVisible()
    view.rerender(
      <NativeResourceEditorBody
        {...props}
        values={{ team: "second", creator: "" }}
      />,
    )
    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledTimes(2))
    expect(signals[0]?.aborted).toBe(true)

    await act(async () =>
      resolveFirst([{ value: "stale", displayLabel: "Stale member" }]),
    )
    expect(screen.queryByText("Stale member")).toBeNull()
    await act(async () =>
      resolveSecond([{ value: "member-2", displayLabel: "Example member 2" }]),
    )
    await userEvent
      .setup()
      .click(screen.getByRole("combobox", { name: "Creator" }))
    expect(await screen.findByText("Example member 2")).toBeVisible()
  })

  it("keeps retry and dependency reloads local to the affected option field", async () => {
    const calls: Array<{ fieldId: string; signal: AbortSignal }> = []
    const onLoadOptions = vi.fn((fieldId, _values, options) => {
      calls.push({ fieldId, signal: options.signal })
      return fieldId === "creator"
        ? Promise.reject(new Error("unavailable"))
        : new Promise<readonly { value: string }[]>(() => undefined)
    })
    const props = {
      t,
      descriptors: [
        { fieldId: "team", type: "text" as const },
        { fieldId: "region", type: "text" as const },
        {
          fieldId: "creator",
          type: "select" as const,
          options: [],
          optionLoader: { dependsOn: ["team"] },
        },
        {
          fieldId: "project",
          type: "select" as const,
          options: [],
          optionLoader: { dependsOn: ["region"] },
        },
      ],
      policy: {
        fields: [
          {
            fieldId: "team",
            section: "basic",
            order: 10,
            renderer: "text" as const,
            resolveLabel: () => "Team",
          },
          {
            fieldId: "region",
            section: "basic",
            order: 20,
            renderer: "text" as const,
            resolveLabel: () => "Region",
          },
          {
            fieldId: "creator",
            section: "basic",
            order: 30,
            renderer: "select" as const,
            resolveLabel: () => "Creator",
          },
          {
            fieldId: "project",
            section: "basic",
            order: 40,
            renderer: "select" as const,
            resolveLabel: () => "Project",
          },
        ],
        hiddenFields: [],
      },
      sectionOrder: { basic: 0 },
      sectionLabelResolvers: { basic: () => "Basic" },
      onValueChange: () => undefined,
      onLoadOptions,
    }
    const view = render(
      <NativeResourceEditorBody
        {...props}
        values={{ team: "first", region: "west", creator: "", project: "" }}
      />,
    )

    expect(await screen.findByRole("alert")).toHaveTextContent("Error")
    const projectCall = calls.find((call) => call.fieldId === "project")!
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Retry Creator" }))
    await waitFor(() =>
      expect(calls.filter((call) => call.fieldId === "creator")).toHaveLength(
        2,
      ),
    )
    expect(calls.filter((call) => call.fieldId === "project")).toHaveLength(1)
    expect(projectCall.signal.aborted).toBe(false)

    view.rerender(
      <NativeResourceEditorBody
        {...props}
        values={{ team: "second", region: "west", creator: "", project: "" }}
      />,
    )
    await waitFor(() =>
      expect(calls.filter((call) => call.fieldId === "creator")).toHaveLength(
        3,
      ),
    )
    expect(calls.filter((call) => call.fieldId === "project")).toHaveLength(1)
    expect(projectCall.signal.aborted).toBe(false)
  })

  it("does not load a policy-hidden dynamic field", () => {
    const onLoadOptions = vi.fn()
    render(
      <NativeResourceEditorBody
        t={t}
        descriptors={[
          { fieldId: "name", type: "text" },
          {
            fieldId: "hiddenCreator",
            type: "select",
            options: [],
            optionLoader: { dependsOn: [] },
          },
        ]}
        policy={{
          fields: [
            {
              fieldId: "name",
              section: "basic",
              order: 10,
              renderer: "text",
              resolveLabel: () => "Name",
            },
          ],
          hiddenFields: [{ fieldId: "hiddenCreator", reason: "unsupported" }],
        }}
        sectionOrder={{ basic: 0 }}
        sectionLabelResolvers={{ basic: () => "Basic" }}
        values={{ name: "Example" }}
        onValueChange={() => undefined}
        onLoadOptions={onLoadOptions}
      />,
    )

    expect(onLoadOptions).not.toHaveBeenCalled()
  })

  it("aborts a dynamic request when its visible policy field is hidden", async () => {
    const pending = createDeferred<readonly { value: string }[]>()
    let signal: AbortSignal | undefined
    const onLoadOptions = vi.fn((_fieldId, _values, options) => {
      signal = options.signal
      return pending.promise
    })
    const props = {
      t,
      descriptors: [
        { fieldId: "showCreator", type: "boolean" as const },
        {
          fieldId: "creator",
          type: "select" as const,
          options: [],
          optionLoader: { dependsOn: [] },
        },
      ],
      policy: {
        fields: [
          {
            fieldId: "showCreator",
            section: "basic",
            order: 10,
            renderer: "boolean" as const,
            resolveLabel: () => "Show creator",
          },
          {
            fieldId: "creator",
            section: "basic",
            order: 20,
            renderer: "select" as const,
            resolveLabel: () => "Creator",
            visibleWhen: (values: Record<string, unknown>) =>
              values.showCreator === true,
          },
        ],
        hiddenFields: [],
      },
      sectionOrder: { basic: 0 },
      sectionLabelResolvers: { basic: () => "Basic" },
      onValueChange: () => undefined,
      onLoadOptions,
    }
    const view = render(
      <NativeResourceEditorBody
        {...props}
        values={{ showCreator: true, creator: "" }}
      />,
    )
    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledOnce())

    view.rerender(
      <NativeResourceEditorBody
        {...props}
        values={{ showCreator: false, creator: "" }}
      />,
    )

    expect(signal?.aborted).toBe(true)
    expect(screen.queryByRole("combobox", { name: "Creator" })).toBeNull()
  })

  it("aborts and discards a pending load when its loader disappears", async () => {
    const pending =
      createDeferred<readonly { value: string; displayLabel: string }[]>()
    let signal: AbortSignal | undefined
    const onLoadOptions = vi.fn((_fieldId, _values, options) => {
      signal = options.signal
      return pending.promise
    })
    const policy = {
      fields: [
        {
          fieldId: "creator",
          section: "basic",
          order: 10,
          renderer: "select" as const,
          resolveLabel: () => "Creator",
        },
      ],
      hiddenFields: [],
    }
    const view = render(
      <NativeResourceEditorBody
        t={t}
        descriptors={[
          {
            fieldId: "creator",
            type: "select",
            options: [],
            optionLoader: { dependsOn: [] },
          },
        ]}
        policy={policy}
        sectionOrder={{ basic: 0 }}
        sectionLabelResolvers={{ basic: () => "Basic" }}
        values={{ creator: "" }}
        onValueChange={() => undefined}
        onLoadOptions={onLoadOptions}
      />,
    )
    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledOnce())

    view.rerender(
      <NativeResourceEditorBody
        t={t}
        descriptors={[
          {
            fieldId: "creator",
            type: "select",
            options: [{ value: "static", displayLabel: "Static member" }],
          },
        ]}
        policy={policy}
        sectionOrder={{ basic: 0 }}
        sectionLabelResolvers={{ basic: () => "Basic" }}
        values={{ creator: "" }}
        onValueChange={() => undefined}
      />,
    )
    expect(signal?.aborted).toBe(true)
    await act(async () =>
      pending.resolve([{ value: "late", displayLabel: "Late member" }]),
    )
    await userEvent
      .setup()
      .click(screen.getByRole("combobox", { name: "Creator" }))
    expect(screen.getByText("Static member")).toBeVisible()
    expect(screen.queryByText("Late member")).toBeNull()
  })

  it("reloads when a declared dependency changes from missing to null", async () => {
    const signals: AbortSignal[] = []
    const onLoadOptions = vi.fn((_fieldId, _values, options) => {
      signals.push(options.signal)
      return new Promise<readonly { value: string }[]>(() => undefined)
    })
    const props = {
      t,
      descriptors: [
        {
          fieldId: "creator",
          type: "select" as const,
          options: [],
          optionLoader: { dependsOn: ["team"] },
        },
      ],
      policy: {
        fields: [
          {
            fieldId: "creator",
            section: "basic",
            order: 10,
            renderer: "select" as const,
            resolveLabel: () => "Creator",
          },
        ],
        hiddenFields: [],
      },
      sectionOrder: { basic: 0 },
      sectionLabelResolvers: { basic: () => "Basic" },
      onValueChange: () => undefined,
      onLoadOptions,
    }
    const view = render(
      <NativeResourceEditorBody {...props} values={{ creator: "" }} />,
    )
    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledOnce())

    view.rerender(
      <NativeResourceEditorBody
        {...props}
        values={{ team: null, creator: "" }}
      />,
    )
    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledTimes(2))
    expect(signals[0]?.aborted).toBe(true)
  })

  it("aborts and ignores a late load when its callback is removed", async () => {
    const pending =
      createDeferred<readonly { value: string; displayLabel: string }[]>()
    let signal: AbortSignal | undefined
    const onLoadOptions = vi.fn((_fieldId, _values, options) => {
      signal = options.signal
      return pending.promise
    })
    const props = {
      t,
      descriptors: [
        {
          fieldId: "creator",
          type: "select" as const,
          options: [{ value: "static", displayLabel: "Static member" }],
          optionLoader: { dependsOn: [] },
        },
      ],
      policy: {
        fields: [
          {
            fieldId: "creator",
            section: "basic",
            order: 10,
            renderer: "select" as const,
            resolveLabel: () => "Creator",
          },
        ],
        hiddenFields: [],
      },
      sectionOrder: { basic: 0 },
      sectionLabelResolvers: { basic: () => "Basic" },
      values: { creator: "" },
      onValueChange: () => undefined,
    }
    const view = render(
      <NativeResourceEditorBody {...props} onLoadOptions={onLoadOptions} />,
    )
    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledOnce())

    view.rerender(<NativeResourceEditorBody {...props} />)
    expect(signal?.aborted).toBe(true)
    await act(async () =>
      pending.resolve([{ value: "late", displayLabel: "Late member" }]),
    )
    await userEvent
      .setup()
      .click(screen.getByRole("combobox", { name: "Creator" }))
    expect(screen.getByText("Static member")).toBeVisible()
    expect(screen.queryByText("Late member")).toBeNull()
  })

  it("aborts active option loading when the editor unmounts", async () => {
    let signal: AbortSignal | undefined
    const onLoadOptions = vi.fn((_fieldId, _values, options) => {
      signal = options.signal
      return new Promise<readonly { value: string }[]>(() => undefined)
    })
    const view = render(
      <NativeResourceEditorBody
        t={t}
        descriptors={[
          {
            fieldId: "creator",
            type: "select",
            options: [],
            optionLoader: { dependsOn: [] },
          },
        ]}
        policy={{
          fields: [
            {
              fieldId: "creator",
              section: "basic",
              order: 10,
              renderer: "select",
              resolveLabel: () => "Creator",
            },
          ],
          hiddenFields: [],
        }}
        sectionOrder={{ basic: 0 }}
        sectionLabelResolvers={{ basic: () => "Basic" }}
        values={{ creator: "" }}
        onValueChange={() => undefined}
        onLoadOptions={onLoadOptions}
      />,
    )
    await waitFor(() => expect(onLoadOptions).toHaveBeenCalledOnce())

    view.unmount()
    expect(signal?.aborted).toBe(true)
  })

  it("uses generic error copy instead of rendering an internal field issue code", () => {
    render(
      <NativeResourceEditorBody
        t={t}
        descriptors={[{ fieldId: "creator", type: "text" }]}
        policy={{
          fields: [
            {
              fieldId: "creator",
              section: "basic",
              order: 10,
              renderer: "text",
              resolveLabel: () => "Creator",
            },
          ],
          hiddenFields: [],
        }}
        sectionOrder={{ basic: 0 }}
        sectionLabelResolvers={{ basic: () => "Basic" }}
        values={{ creator: "" }}
        fieldIssues={[{ fieldId: "creator", code: "unsupported_option" }]}
        onValueChange={() => undefined}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent("Error")
    expect(screen.queryByText("unsupported_option")).toBeNull()
  })

  it("gives each failed option field a distinct retry name", async () => {
    const onLoadOptions = vi.fn(() => Promise.reject(new Error("unavailable")))
    render(
      <NativeResourceEditorBody
        t={t}
        descriptors={[
          {
            fieldId: "creator",
            type: "select",
            options: [],
            optionLoader: { dependsOn: [] },
          },
          {
            fieldId: "project",
            type: "select",
            options: [],
            optionLoader: { dependsOn: [] },
          },
        ]}
        policy={{
          fields: [
            {
              fieldId: "creator",
              section: "basic",
              order: 10,
              renderer: "select",
              resolveLabel: () => "Creator",
            },
            {
              fieldId: "project",
              section: "basic",
              order: 20,
              renderer: "select",
              resolveLabel: () => "Project",
            },
          ],
          hiddenFields: [],
        }}
        sectionOrder={{ basic: 0 }}
        sectionLabelResolvers={{ basic: () => "Basic" }}
        values={{ creator: "", project: "" }}
        onValueChange={() => undefined}
        onLoadOptions={onLoadOptions}
      />,
    )

    expect(
      await screen.findByRole("button", { name: "Retry Creator" }),
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Retry Project" })).toBeVisible()
  })
})
