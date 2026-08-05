import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { StrictMode, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { ChannelEditorShell } from "~/components/dialogs/ChannelDialog/components/ChannelEditorShell"
import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { ManagedResourceEditorBody } from "~/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody"
import {
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
} from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import { ManagedSiteChannelDetailView } from "~/features/ManagedSiteChannels/presentation/ManagedSiteChannelDetailView"
import { defineResourceEditorFieldPolicy } from "~/features/ResourceEditor/resourceFieldPolicy"
import enManagedSiteChannels from "~/locales/en/managedSiteChannels.json"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
  ResourceFieldIssue,
  ResourceFieldValue,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { axonHubManagedResourceRegistration } from "~/services/apiAdapters/managedResources/axonHub"
import type { AxonHubChannel } from "~/types/axonHub"

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const adapterMocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  resolveRuntimeConfig: vi.fn(),
  signIn: vi.fn(),
  getChannel: vi.fn(),
  listPage: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  updateStatus: vi.fn(),
  deleteChannel: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: adapterMocks.getPreferences },
}))

vi.mock("~/services/managedSites/runtimeConfig", () => ({
  resolveManagedSiteRuntimeConfigForType: adapterMocks.resolveRuntimeConfig,
}))

vi.mock("~/services/apiService/axonHub", () => ({
  AxonHubRequestError: class AxonHubRequestError extends Error {},
  signIn: adapterMocks.signIn,
  listAxonHubChannelPage: adapterMocks.listPage,
  getAxonHubChannel: adapterMocks.getChannel,
  createAxonHubChannel: adapterMocks.createChannel,
  updateAxonHubChannel: adapterMocks.updateChannel,
  updateAxonHubChannelStatus: adapterMocks.updateStatus,
  deleteAxonHubChannel: adapterMocks.deleteChannel,
}))

const labels: Record<string, string> = {
  "channelDialog:actions.hideKey": "Hide key",
  "channelDialog:actions.showKey": "Show key",
  "channelDialog:fields.baseUrl.label": "Base URL",
  "channelDialog:fields.baseUrl.placeholder": "https://api.example.invalid",
  "channelDialog:fields.key.label": "API key",
  "channelDialog:fields.models.label": "Models",
  "channelDialog:fields.models.placeholder": "Add models",
  "channelDialog:fields.name.label": "Name",
  "channelDialog:fields.name.placeholder": "Channel name",
  "channelDialog:fields.status.label": "Status",
  "channelDialog:fields.type.hint": "Choose a channel type.",
  "channelDialog:fields.type.label": "Type",
  "channelDialog:fields.type.placeholder": "Choose a type",
  "channelDialog:fields.weight.label": "Weight",
  "managedSiteChannels:editor.fields.autoSyncModelPattern.label":
    "Model filter pattern",
  "managedSiteChannels:editor.fields.autoSyncModelPattern.help":
    "Only sync matching models. Prefix with (?i) to ignore case; leave empty to sync all models.",
  "managedSiteChannels:editor.fields.autoSyncModelPattern.invalid":
    "Enter a valid model filter pattern.",
  "managedSiteChannels:editor.fields.autoSyncModelPattern.placeholder":
    "For example, (?i)^model-example",
  "managedSiteChannels:editor.fields.autoSyncSupportedModels.label":
    "Automatically sync supported models",
  "managedSiteChannels:editor.fields.autoSyncSupportedModels.help":
    "AxonHub updates enabled channels from the provider API at the frequency configured in AxonHub system settings.",
  "managedSiteChannels:editor.fields.defaultTestModel.label":
    "Default test model",
  "managedSiteChannels:editor.fields.defaultTestModel.help":
    "Used to test this channel connection. Choose one of the supported models.",
  "managedSiteChannels:editor.fields.defaultTestModel.placeholder":
    "Select a configured model",
  "managedSiteChannels:editor.fields.extraModelPrefix.label":
    "Extra model prefix",
  "managedSiteChannels:editor.fields.manualModels.label": "Manual models",
  "managedSiteChannels:editor.fields.orderingWeight.help":
    "Higher values are preferred when AxonHub selects a channel; equal values have equal ordering priority.",
  "managedSiteChannels:editor.fields.orderingWeight.label": "Ordering weight",
  "managedSiteChannels:editor.fields.supportedModels.help":
    "Type or paste model names. Models added here are kept during automatic model sync.",
  "managedSiteChannels:editor.fields.remark.label": "Remark",
  "managedSiteChannels:editor.fields.tags.label": "Tags",
  "managedSiteChannels:editor.fields.tags.placeholder": "Add tags...",
  "managedSiteChannels:editor.options.channelType.anthropic": "Anthropic",
  "managedSiteChannels:editor.options.channelType.openai": "OpenAI",
  "managedSiteChannels:editor.options.status.disabled": "Disabled",
  "managedSiteChannels:editor.options.status.enabled": "Enabled",
  "managedSiteChannels:editor.sections.advanced": "Advanced",
  "managedSiteChannels:editor.sections.basic": "Basic",
  "managedSiteChannels:editor.sections.connection": "Connection",
  "managedSiteChannels:editor.sections.metadata": "Metadata",
  "managedSiteChannels:editor.sections.models": "Models",
  "managedSiteChannels:editor.sections.routing": "Routing",
  "managedSiteChannels:editor.sections.sync": "Model sync",
  "managedSiteChannels:editor.secret.actions.clear": "Remove saved credential",
  "managedSiteChannels:editor.secret.actions.restore": "Keep saved credential",
  "managedSiteChannels:editor.secret.actions.retry": "Retry",
  "managedSiteChannels:editor.secret.createHint":
    "Enter a credential for the new channel.",
  "managedSiteChannels:editor.secret.keepExistingHint":
    "Leave this field blank to keep the saved credential unchanged.",
  "managedSiteChannels:editor.secret.loadError":
    "The saved credential could not be loaded.",
  "managedSiteChannels:editor.secret.loading":
    "Loading the saved credential...",
  "managedSiteChannels:editor.secret.placeholder": "Enter a credential",
  "managedSiteChannels:editor.secret.state.available":
    "A saved credential is available.",
  "managedSiteChannels:editor.secret.state.masked":
    "A masked credential is saved.",
  "managedSiteChannels:editor.secret.state.permissionHidden":
    "The saved credential is hidden by permissions.",
  "managedSiteChannels:editor.secret.state.unavailable":
    "No credential is available to display.",
  "managedSiteChannels:editor.secret.replacementDisabled":
    "This credential type cannot be replaced here.",
  "managedSiteChannels:editor.secret.replacementBlocked.multipleCredentials":
    "This channel has multiple API keys. Manage its keys in AxonHub.",
  "managedSiteChannels:editor.validation.inconsistentValue":
    "This value conflicts with another field.",
  "managedSiteChannels:editor.validation.invalidValue": "Enter a valid value.",
  "managedSiteChannels:editor.validation.outOfRange":
    "Enter a value in the allowed range.",
  "managedSiteChannels:editor.validation.required": "This field is required.",
  "managedSiteChannels:editor.validation.unsupportedOption":
    "This option is not supported.",
}

const t = ((key: string) => labels[key] ?? key) as TFunction

const initialValues: EditableResourceProjection = {
  [AXON_HUB_CHANNEL_FIELD_IDS.NAME]: "Example channel",
  [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [AXON_HUB_CHANNEL_FIELD_IDS.STATUS]: AXON_HUB_CHANNEL_STATUS.ENABLED,
  [AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL]: "https://gateway.example.invalid",
  [AXON_HUB_CHANNEL_FIELD_IDS.KEY]: { kind: "unchanged" },
  [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]: ["model-a"],
  [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: [],
  [AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL]: "model-a",
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS]: true,
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN]: "model-*",
  [AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT]: 7,
  [AXON_HUB_CHANNEL_FIELD_IDS.TAGS]: ["primary"],
  [AXON_HUB_CHANNEL_FIELD_IDS.REMARK]: "Example remark",
  [AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX]: "vendor/",
}

const createDescriptors = (
  secret: Partial<Extract<ResourceFieldDescriptor, { type: "secret" }>> = {},
): readonly ResourceFieldDescriptor[] =>
  [
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
      type: "text",
      required: true,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
      type: "select",
      required: true,
      options: [
        { value: AXON_HUB_CHANNEL_TYPE.OPENAI },
        { value: AXON_HUB_CHANNEL_TYPE.ANTHROPIC },
      ],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
      type: "select",
      required: true,
      options: [
        { value: AXON_HUB_CHANNEL_STATUS.ENABLED },
        { value: AXON_HUB_CHANNEL_STATUS.DISABLED },
      ],
    },
    { fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL, type: "text" },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
      type: "secret",
      required: false,
      secretState: "masked",
      canReplace: true,
      allowClear: false,
      ...secret,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
      type: "multi-select",
      required: true,
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
      type: "multi-select",
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
      type: "select",
      required: true,
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
      type: "boolean",
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
      type: "text",
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
      type: "number",
      min: 0,
      max: 100,
      step: 1,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
      type: "multi-select",
      options: [],
    },
    { fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK, type: "textarea" },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
      type: "text",
    },
  ].reverse() as readonly ResourceFieldDescriptor[]

const editPolicy =
  getManagedResourceFieldPolicy(
    SITE_TYPES.AXON_HUB,
    MANAGED_RESOURCE_KINDS.Channel,
    MANAGED_RESOURCE_EDITOR_MODES.Edit,
  ) ??
  (() => {
    throw new Error("expected AxonHub edit field policy")
  })()

const createPolicy =
  getManagedResourceFieldPolicy(
    SITE_TYPES.AXON_HUB,
    MANAGED_RESOURCE_KINDS.Channel,
    MANAGED_RESOURCE_EDITOR_MODES.Create,
  ) ??
  (() => {
    throw new Error("expected AxonHub create field policy")
  })()

function NativeEditorHarness({
  descriptors = createDescriptors(),
  values = initialValues,
  fieldIssues = [],
  disabled = false,
  onValueChange = vi.fn(),
  onSubmit = vi.fn(),
  editorPolicy = editPolicy,
  mode = "edit",
  translate = t,
  onLoadSecret,
}: {
  descriptors?: readonly ResourceFieldDescriptor[]
  values?: EditableResourceProjection
  fieldIssues?: readonly ResourceFieldIssue[]
  disabled?: boolean
  onValueChange?: (fieldId: string, value: ResourceFieldValue) => void
  onSubmit?: () => void
  editorPolicy?: typeof editPolicy
  mode?: "create" | "edit"
  translate?: TFunction
  onLoadSecret?: (fieldId: string) => Promise<string>
}) {
  const [currentValues, setCurrentValues] = useState(values)

  return (
    <ChannelEditorShell
      isOpen
      title="Edit native channel"
      closeLabel="Cancel"
      submitLabel="Save"
      submitTestId={CHANNEL_DIALOG_TEST_IDS.submitButton}
      onClose={vi.fn()}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <ManagedResourceEditorBody
        t={translate}
        mode={mode}
        descriptors={descriptors}
        policy={editorPolicy}
        values={currentValues}
        fieldIssues={fieldIssues}
        disabled={disabled}
        onLoadSecret={onLoadSecret}
        onValueChange={(fieldId, value) => {
          onValueChange(fieldId, value)
          setCurrentValues((current) => ({ ...current, [fieldId]: value }))
        }}
      />
    </ChannelEditorShell>
  )
}

const realAxonHubDetail: AxonHubChannel = {
  id: "opaque-channel-1",
  name: "Example channel",
  type: AXON_HUB_CHANNEL_TYPE.OPENAI,
  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
  baseURL: "https://gateway.example.invalid",
  credentials: { apiKeys: ["sk-placeholder-value"] },
  supportedModels: ["model-a"],
  manualModels: [],
  defaultTestModel: "model-a",
  autoSyncSupportedModels: false,
  orderingWeight: 0,
  settings: {},
}

const openRealAxonHubEditors = async () => {
  adapterMocks.getPreferences.mockResolvedValue({})
  adapterMocks.resolveRuntimeConfig.mockReturnValue({
    siteType: SITE_TYPES.AXON_HUB,
    config: {
      baseUrl: "https://api.example.invalid/",
      email: "admin@example.invalid",
      password: "saved-password",
    },
  })
  adapterMocks.signIn.mockResolvedValue("session-token")
  adapterMocks.getChannel.mockResolvedValue(realAxonHubDetail)

  const workspace = await axonHubManagedResourceRegistration.open()
  return {
    createEditor: await workspace.openCreateEditor(),
    editEditor: await workspace.openEditEditor({
      siteType: SITE_TYPES.AXON_HUB,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: "https://api.example.invalid",
      resourceId: realAxonHubDetail.id,
    }),
  }
}

describe("ManagedResourceEditorBody", () => {
  it("keeps nullable shared select values separate from its UI clear option", async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    const nullablePolicy = defineResourceEditorFieldPolicy({
      fields: [
        {
          fieldId: "creator",
          section: "basic",
          order: 10,
          renderer: "select",
          resolveLabel: () => "Creator",
          resolveNullableOptionLabel: () => "No creator",
        },
      ],
      hiddenFields: [],
    })
    const props = {
      t,
      mode: "create" as const,
      descriptors: [
        {
          fieldId: "creator",
          type: "select" as const,
          nullable: true,
          options: [
            {
              value: "__resource_editor_null__",
              displayLabel: "Shared sentinel member",
            },
          ],
        },
      ],
      policy: nullablePolicy as typeof createPolicy,
      onValueChange,
    }
    const view = render(
      <ManagedResourceEditorBody {...props} values={{ creator: null }} />,
    )

    await user.click(screen.getByRole("combobox", { name: "Creator" }))
    await user.click(
      screen.getByRole("option", { name: "Shared sentinel member" }),
    )
    expect(onValueChange).toHaveBeenCalledWith(
      "creator",
      "__resource_editor_null__",
    )

    view.rerender(
      <ManagedResourceEditorBody {...props} values={{ creator: null }} />,
    )
    expect(screen.getByRole("combobox", { name: "Creator" })).toHaveTextContent(
      "No creator",
    )
  })

  it("keeps the first duplicate metadata when the managed editor renders a shared select", async () => {
    const onValueChange = vi.fn()
    const duplicatePolicy = defineResourceEditorFieldPolicy({
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
    })
    render(
      <ManagedResourceEditorBody
        t={t}
        mode="create"
        descriptors={[
          {
            fieldId: "creator",
            type: "select",
            options: [
              { value: "member-example", displayLabel: "First member" },
              { value: "member-example", displayLabel: "Later member" },
            ],
          },
        ]}
        policy={duplicatePolicy as typeof createPolicy}
        values={{ creator: "" }}
        onValueChange={onValueChange}
      />,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Creator" }))
    expect(screen.getByRole("option", { name: "First member" })).toBeVisible()
    expect(screen.queryByText("Later member")).toBeNull()
    await user.click(screen.getByRole("option", { name: "First member" }))
    expect(onValueChange).toHaveBeenCalledWith("creator", "member-example")
  })

  it("shows an absent current select value instead of an unknown fallback", async () => {
    const user = userEvent.setup()
    const policy = defineResourceEditorFieldPolicy({
      fields: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
          section: "basic",
          order: 10,
          renderer: "select",
          resolveLabel: () => "Provider",
          resolveOptionFallback: () => "Unknown provider",
        },
      ],
      hiddenFields: [],
    })

    render(
      <ManagedResourceEditorBody
        t={t}
        mode="edit"
        descriptors={[
          {
            fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
            type: "select",
            options: [{ value: "supported", displayLabel: "Supported" }],
          },
        ]}
        policy={policy as typeof createPolicy}
        values={{ [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: "legacy-provider" }}
        onValueChange={vi.fn()}
      />,
    )

    const select = screen.getByRole("combobox", { name: "Type" })
    expect(select).toHaveTextContent("legacy-provider")
    await user.click(select)
    expect(
      screen.getByRole("option", { name: "legacy-provider" }),
    ).toBeVisible()
    expect(screen.queryByText("Unknown provider")).toBeNull()
  })

  it("shows credential create and edit guidance for each editor mode", async () => {
    const { createEditor, editEditor } = await openRealAxonHubEditors()
    const englishT = ((key: string) => {
      if (key === "managedSiteChannels:editor.secret.placeholder") {
        return enManagedSiteChannels.editor.secret.placeholder
      }
      if (key === "managedSiteChannels:editor.secret.state.unavailable") {
        return enManagedSiteChannels.editor.secret.state.unavailable
      }
      if (key === "managedSiteChannels:editor.secret.createHint") {
        return "Enter a credential for the new channel."
      }
      return labels[key] ?? key
    }) as TFunction

    const createRender = render(
      <NativeEditorHarness
        descriptors={createEditor.fields}
        values={createEditor.initialValues}
        editorPolicy={createPolicy}
        mode="create"
        translate={englishT}
      />,
    )

    const createKey = screen.getByLabelText(/^API key/)
    const createModels = screen.getByRole("combobox", { name: "Models" })
    expect(createKey).toBeRequired()
    expect(createKey).toHaveAttribute("placeholder", "Enter a credential")
    expect(createKey).toHaveAccessibleDescription(
      "Enter a credential for the new channel.",
    )
    expect(createModels).toHaveAttribute("aria-required", "true")
    expect(createModels).toHaveAccessibleDescription(
      "Type or paste model names. Models added here are kept during automatic model sync.",
    )
    expect(screen.getByRole("combobox", { name: /^Type/ })).toHaveAttribute(
      "aria-required",
      "true",
    )
    expect(screen.getByRole("combobox", { name: /^Status/ })).toHaveAttribute(
      "aria-required",
      "true",
    )
    expect(screen.getByText("Models", { selector: "label" })).toHaveTextContent(
      "*",
    )

    createRender.unmount()

    render(
      <NativeEditorHarness
        descriptors={editEditor.fields}
        values={editEditor.initialValues}
        editorPolicy={editPolicy}
      />,
    )

    expect(screen.getByLabelText(/^API key/)).not.toBeRequired()
    expect(screen.getByLabelText(/^API key/)).toHaveAccessibleDescription(
      "A saved credential is available. Leave this field blank to keep the saved credential unchanged.",
    )
    expect(screen.getByRole("combobox", { name: "Models" })).toHaveAttribute(
      "aria-required",
      "true",
    )
  })

  it("renders the native body inside the shared channel editor shell", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <NativeEditorHarness
        descriptors={createDescriptors()}
        onSubmit={onSubmit}
      />,
    )

    const dialog = screen.getByRole("dialog", { name: "Edit native channel" })
    expect(dialog).toBeVisible()
    expect(within(dialog).getByRole("textbox", { name: /^Name/ })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("keeps AxonHub channel controls in the managed wrapper", () => {
    render(<NativeEditorHarness />)

    expect(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)).toBeVisible()
    expect(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)).toBeVisible()
  })

  it("keeps native View facts in the shared read-only detail body", () => {
    render(
      <ManagedSiteChannelDetailView
        name="Example channel"
        fields={[
          {
            label: "Type",
            value: { kind: "text", value: "OpenAI", sortValue: "OpenAI" },
          },
          { label: "API key", value: "••••••••" },
          {
            label: "Status",
            value: {
              kind: "status",
              value: "Enabled",
              sortValue: "enabled",
              tone: "success",
            },
          },
        ]}
      />,
    )

    expect(screen.getByLabelText("Example channel")).toBeVisible()
    expect(screen.getByText("OpenAI")).toBeVisible()
    expect(screen.getByText("••••••••")).toBeVisible()
    expect(screen.getByText("Enabled")).toBeVisible()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("sorts policy sections and reuses common controls and focus order", async () => {
    const user = userEvent.setup()
    render(
      <NativeEditorHarness
        values={{
          ...initialValues,
          [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]: [],
        }}
      />,
    )

    for (const section of [
      "Basic",
      "Connection",
      "Models",
      "Model sync",
      "Routing",
      "Metadata",
      "Advanced",
    ]) {
      expect(
        screen.getAllByRole("group", { name: section }).at(0),
      ).toBeVisible()
    }

    const dialog = screen.getByRole("dialog", { name: "Edit native channel" })
    const closeButton = screen.getByRole("button", {
      name: "common:actions.close",
    })
    const nameInput = screen.getByRole("textbox", { name: /^Name/ })
    const typeSelect = screen.getByRole("combobox", { name: /^Type/ })
    const statusSelect = screen.getByRole("combobox", { name: /^Status/ })
    const baseUrlInput = screen.getByRole("textbox", { name: "Base URL" })
    const keyInput = screen.getByLabelText(/^API key/)
    const revealButton = screen.getByRole("button", { name: "Show key" })
    const modelsInput = screen.getByRole("combobox", { name: "Models" })

    expect(dialog).toContainElement(closeButton)
    expect(closeButton).toHaveFocus()
    await user.tab()
    expect(nameInput).toHaveFocus()
    await user.tab()
    expect(typeSelect).toHaveFocus()
    await user.tab()
    expect(statusSelect).toHaveFocus()
    await user.tab()
    expect(baseUrlInput).toHaveFocus()
    await user.tab()
    expect(keyInput).toHaveFocus()
    await user.tab()
    expect(revealButton).toHaveFocus()
    await user.tab()
    expect(modelsInput).toHaveFocus()
  })

  it("renders primitive values options constraints and controlled validation", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <NativeEditorHarness
        onValueChange={onValueChange}
        fieldIssues={[
          { fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME, code: "required" },
          {
            fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
            code: "out_of_range",
          },
        ]}
      />,
    )

    const nameInput = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
    expect(nameInput).toHaveValue("Example channel")
    expect(nameInput).toHaveAttribute("aria-invalid", "true")
    expect(nameInput).toHaveAccessibleDescription("This field is required.")

    const typeSelect = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.typeSelect)
    await user.click(typeSelect)
    await user.click(await screen.findByRole("option", { name: "Anthropic" }))
    expect(onValueChange).toHaveBeenCalledWith(
      AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
      AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
    )

    const weight = screen.getByRole("spinbutton", {
      name: "Ordering weight",
    })
    expect(weight).toHaveValue(7)
    expect(weight).toHaveAttribute("min", "0")
    expect(weight).toHaveAttribute("max", "100")
    expect(weight).toHaveAttribute("step", "1")
    expect(weight).toHaveAccessibleDescription(
      "Higher values are preferred when AxonHub selects a channel; equal values have equal ordering priority. Enter a value in the allowed range.",
    )
    await user.clear(weight)
    expect(onValueChange).toHaveBeenLastCalledWith(
      AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
      "",
    )
    expect(
      screen.getByRole("switch", {
        name: "Automatically sync supported models",
      }),
    ).toBeChecked()
    expect(screen.getByRole("textbox", { name: "Remark" })).toHaveAttribute(
      "rows",
      "3",
    )
  })

  it("keeps empty-option multi-selects free-form", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<NativeEditorHarness onValueChange={onValueChange} />)

    const modelsInput = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput)
    await user.click(modelsInput)
    await user.type(modelsInput, "custom-model")
    await user.keyboard("{Enter}")

    expect(onValueChange).toHaveBeenLastCalledWith(
      AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
      ["model-a", "custom-model"],
    )
  })

  it("uses field-policy placeholders for free-form multi-selects", () => {
    render(
      <NativeEditorHarness
        values={{
          ...initialValues,
          [AXON_HUB_CHANNEL_FIELD_IDS.TAGS]: [],
        }}
      />,
    )

    expect(screen.getByRole("combobox", { name: "Tags" })).toHaveAttribute(
      "placeholder",
      "Add tags...",
    )
  })

  it("uses supported models as the single editor and default-model source", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <NativeEditorHarness
        values={{
          ...initialValues,
          supportedModels: [" model-example-b ", "model-example-b"],
          manualModels: ["model-example-a", " model-example-b "],
          defaultTestModel: "model-example-b",
        }}
        onValueChange={onValueChange}
      />,
    )

    expect(
      screen.queryByRole("combobox", { name: "Manual models" }),
    ).not.toBeInTheDocument()

    const models = screen.getByRole("combobox", { name: "Models" })
    await user.click(models)
    await user.type(models, "model-example-c")
    await user.keyboard("{Enter}")
    expect(onValueChange).toHaveBeenCalledWith("manualModels", [
      "model-example-b",
      "model-example-c",
    ])

    const select = screen.getByRole("combobox", {
      name: /^Default test model/,
    })
    expect(select).toHaveAccessibleDescription(
      "Used to test this channel connection. Choose one of the supported models.",
    )

    await user.click(select)
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["model-example-b", "model-example-c"])
  })

  it("auto-selects an empty default test model and falls back when the current candidate is removed", async () => {
    const onEmptyValueChange = vi.fn()
    const emptyView = render(
      <NativeEditorHarness
        values={{
          ...initialValues,
          supportedModels: ["model-example-a", "model-example-b"],
          manualModels: [],
          defaultTestModel: "",
        }}
        onValueChange={onEmptyValueChange}
      />,
    )

    await waitFor(() =>
      expect(onEmptyValueChange).toHaveBeenCalledWith(
        AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
        "model-example-a",
      ),
    )
    emptyView.unmount()

    const onProjectionValueChange = vi.fn()
    const descriptors = createDescriptors()
    const selectedCandidateValues: EditableResourceProjection = {
      ...initialValues,
      supportedModels: ["model-example-a", "model-example-b"],
      manualModels: [],
      defaultTestModel: "model-example-b",
    }
    const projectionView = render(
      <ManagedResourceEditorBody
        t={t}
        mode="edit"
        descriptors={descriptors}
        policy={editPolicy}
        values={selectedCandidateValues}
        onValueChange={onProjectionValueChange}
      />,
    )
    expect(onProjectionValueChange).not.toHaveBeenCalled()

    projectionView.rerender(
      <ManagedResourceEditorBody
        t={t}
        mode="edit"
        descriptors={descriptors}
        policy={editPolicy}
        values={{
          ...selectedCandidateValues,
          supportedModels: ["model-example-a"],
        }}
        onValueChange={onProjectionValueChange}
      />,
    )

    await waitFor(() =>
      expect(onProjectionValueChange).toHaveBeenCalledWith(
        AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
        "model-example-a",
      ),
    )
  })

  it("preserves a legacy manual-only default until the model list changes", async () => {
    const onValueChange = vi.fn()
    const descriptors = createDescriptors()
    const view = render(
      <ManagedResourceEditorBody
        t={t}
        mode="edit"
        descriptors={descriptors}
        policy={editPolicy}
        values={{
          ...initialValues,
          supportedModels: ["supported-model"],
          manualModels: ["manual-only"],
          defaultTestModel: "manual-only",
        }}
        onValueChange={onValueChange}
      />,
    )

    expect(onValueChange).not.toHaveBeenCalled()
    expect(
      screen.getByRole("combobox", { name: /^Default test model/ }),
    ).toHaveTextContent("manual-only")
    view.rerender(
      <ManagedResourceEditorBody
        t={t}
        mode="edit"
        descriptors={descriptors}
        policy={editPolicy}
        values={{
          ...initialValues,
          name: "Unrelated edit",
          supportedModels: ["supported-model"],
          manualModels: ["manual-only"],
          defaultTestModel: "manual-only",
        }}
        onValueChange={onValueChange}
      />,
    )
    expect(onValueChange).not.toHaveBeenCalled()

    view.rerender(
      <ManagedResourceEditorBody
        t={t}
        mode="edit"
        descriptors={descriptors}
        policy={editPolicy}
        values={{
          ...initialValues,
          supportedModels: ["supported-model", "new-model"],
          manualModels: ["manual-only"],
          defaultTestModel: "manual-only",
        }}
        onValueChange={onValueChange}
      />,
    )
    await waitFor(() =>
      expect(onValueChange).toHaveBeenCalledWith(
        AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
        "supported-model",
      ),
    )
  })

  it("emits one initial default test model selection under StrictMode", async () => {
    const onValueChange = vi.fn()

    render(
      <StrictMode>
        <ManagedResourceEditorBody
          t={t}
          mode="edit"
          descriptors={createDescriptors()}
          policy={editPolicy}
          values={{
            ...initialValues,
            supportedModels: ["model-example-a", "model-example-b"],
            manualModels: [],
            defaultTestModel: "",
          }}
          onValueChange={onValueChange}
        />
      </StrictMode>,
    )

    await waitFor(() =>
      expect(onValueChange).toHaveBeenCalledWith(
        AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
        "model-example-a",
      ),
    )
    expect(onValueChange).toHaveBeenCalledTimes(1)
  })

  it("disables an empty default test model select without clearing stale edit data", () => {
    const onValueChange = vi.fn()
    render(
      <NativeEditorHarness
        values={{
          ...initialValues,
          supportedModels: [],
          manualModels: [],
          defaultTestModel: "model-example-a",
        }}
        onValueChange={onValueChange}
      />,
    )

    const select = screen.getByRole("combobox", {
      name: /^Default test model/,
    })
    expect(select).toBeDisabled()
    expect(select).toHaveTextContent("model-example-a")
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it("preserves the model filter while automatic model sync is hidden", async () => {
    const user = userEvent.setup()
    render(
      <NativeEditorHarness
        values={{
          ...initialValues,
          autoSyncSupportedModels: false,
          autoSyncModelPattern: "",
        }}
      />,
    )

    expect(
      screen.queryByRole("textbox", { name: "Model filter pattern" }),
    ).toBeNull()

    const autoSync = screen.getByRole("switch", {
      name: "Automatically sync supported models",
    })
    expect(autoSync).toHaveAccessibleDescription(
      "AxonHub updates enabled channels from the provider API at the frequency configured in AxonHub system settings.",
    )
    await user.click(autoSync)

    const pattern = screen.getByRole("textbox", {
      name: "Model filter pattern",
    })
    expect(pattern).toHaveAttribute(
      "placeholder",
      "For example, (?i)^model-example",
    )
    expect(pattern).toHaveAccessibleDescription(
      "Only sync matching models. Prefix with (?i) to ignore case; leave empty to sync all models.",
    )
    await user.type(pattern, "(?i)^model-example")
    expect(pattern).toHaveValue("(?i)^model-example")

    await user.click(autoSync)
    expect(
      screen.queryByRole("textbox", { name: "Model filter pattern" }),
    ).toBeNull()
    await user.click(autoSync)
    expect(
      screen.getByRole("textbox", { name: "Model filter pattern" }),
    ).toHaveValue("(?i)^model-example")
  })

  it.each([
    AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT,
    AXON_HUB_CHANNEL_TYPE.CLAUDECODE,
  ])("hides automatic model sync for provider-managed type %s", (type) => {
    render(
      <NativeEditorHarness
        values={{
          ...initialValues,
          type,
          autoSyncSupportedModels: true,
          autoSyncModelPattern: "legacy-*",
        }}
      />,
    )

    expect(
      screen.queryByRole("switch", {
        name: "Automatically sync supported models",
      }),
    ).toBeNull()
    expect(
      screen.queryByRole("textbox", { name: "Model filter pattern" }),
    ).toBeNull()
  })

  it("uses the model filter field-specific validation label", () => {
    render(
      <NativeEditorHarness
        values={{ ...initialValues, autoSyncSupportedModels: true }}
        fieldIssues={[
          {
            fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
            code: "invalid_value",
          },
        ]}
      />,
    )

    expect(
      screen.getByRole("textbox", { name: "Model filter pattern" }),
    ).toHaveAccessibleDescription(
      "Only sync matching models. Prefix with (?i) to ignore case; leave empty to sync all models. Enter a valid model filter pattern.",
    )
  })

  it("associates controlled validation with the free-form models field", () => {
    render(
      <NativeEditorHarness
        fieldIssues={[
          {
            fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
            code: "required",
          },
        ]}
      />,
    )

    expect(
      screen.getByRole("combobox", { name: "Models" }),
    ).toHaveAccessibleDescription(
      "Type or paste model names. Models added here are kept during automatic model sync. This field is required.",
    )
  })

  it.each(["masked", "unavailable", "permission-hidden"] as const)(
    "turns explicit input into replace intent without exposing a %s secret",
    async (secretState) => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      render(
        <NativeEditorHarness
          descriptors={createDescriptors({ secretState, canReplace: true })}
          onValueChange={onValueChange}
        />,
      )

      const input = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)
      expect(input).toHaveValue("")
      expect(
        screen.queryByDisplayValue(/masked|unavailable|permission/i),
      ).toBeNull()

      await user.type(input, "replacement-secret")
      expect(onValueChange).toHaveBeenLastCalledWith(
        AXON_HUB_CHANNEL_FIELD_IDS.KEY,
        { kind: "replace", value: "replacement-secret" },
      )

      await user.clear(input)
      expect(onValueChange).toHaveBeenLastCalledWith(
        AXON_HUB_CHANNEL_FIELD_IDS.KEY,
        { kind: "unchanged" },
      )
    },
  )

  it("explains keep-existing credential intent after clearing input", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <NativeEditorHarness
        descriptors={createDescriptors({
          secretState: "masked",
          canReplace: true,
        })}
        onValueChange={onValueChange}
      />,
    )

    const input = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)
    expect(input).toHaveAccessibleDescription(
      "A masked credential is saved. Leave this field blank to keep the saved credential unchanged.",
    )

    await user.type(input, "replacement-secret")
    await user.clear(input)

    expect(onValueChange).toHaveBeenLastCalledWith(
      AXON_HUB_CHANNEL_FIELD_IDS.KEY,
      { kind: "unchanged" },
    )
  })

  it("explains and does not load a multi-key credential that cannot be replaced", () => {
    const onLoadSecret = vi.fn().mockResolvedValue("must-not-load")
    render(
      <NativeEditorHarness
        descriptors={createDescriptors({
          secretState: "available",
          canReplace: false,
          replacementBlockReason: "multiple_credentials",
        })}
        onLoadSecret={onLoadSecret}
      />,
    )

    const input = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)
    expect(input).toBeDisabled()
    expect(input).toHaveAccessibleDescription(
      "This channel has multiple API keys. Manage its keys in AxonHub.",
    )
    expect(onLoadSecret).not.toHaveBeenCalled()
  })

  it("automatically prefills an available saved credential locally without changing its public intent", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const onLoadSecret = vi.fn().mockResolvedValue("saved-secret-value")
    render(
      <NativeEditorHarness
        descriptors={createDescriptors({
          secretState: "available",
          canReplace: true,
        })}
        onValueChange={onValueChange}
        onLoadSecret={onLoadSecret}
      />,
    )

    const input = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)
    expect(input).toHaveAttribute("type", "password")
    expect(input).toHaveAttribute("autocomplete", "new-password")
    expect(input).toHaveValue("")

    expect(await screen.findByDisplayValue("saved-secret-value")).toBe(input)
    expect(screen.queryByText("Loading the saved credential...")).toBeNull()
    expect(onLoadSecret).toHaveBeenCalledWith(AXON_HUB_CHANNEL_FIELD_IDS.KEY, {
      signal: expect.any(AbortSignal),
    })
    expect(input).toHaveAttribute("type", "password")
    expect(onValueChange).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("button", { name: /load saved credential/i }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: /cancel credential loading/i }),
    ).toBeNull()

    await user.click(screen.getByRole("button", { name: "Show key" }))
    expect(input).toHaveAttribute("type", "text")

    await user.type(input, "-edited")
    expect(onValueChange).toHaveBeenLastCalledWith(
      AXON_HUB_CHANNEL_FIELD_IDS.KEY,
      { kind: "replace", value: "saved-secret-value-edited" },
    )
  })

  it("shows loading credential guidance until the pending load resolves", async () => {
    const pendingLoad = createDeferred<string>()
    const onLoadSecret = vi.fn(() => pendingLoad.promise)
    render(
      <NativeEditorHarness
        descriptors={createDescriptors({
          secretState: "available",
          canReplace: true,
        })}
        onLoadSecret={onLoadSecret}
      />,
    )

    const loading = await screen.findByText("Loading the saved credential...")
    expect(loading).toHaveAttribute("aria-live", "polite")
    expect(
      screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput),
    ).toHaveAccessibleDescription("Loading the saved credential...")

    await act(async () => pendingLoad.resolve("saved-secret-value"))

    expect(screen.queryByText("Loading the saved credential...")).toBeNull()
    expect(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)).toHaveValue(
      "saved-secret-value",
    )
  })

  it("cancels an in-flight saved credential load when replacement input begins", async () => {
    const user = userEvent.setup()
    let loadSignal: AbortSignal | undefined
    const onLoadSecret = vi.fn(
      (_fieldId: string, options?: { signal?: AbortSignal }) => {
        loadSignal = options?.signal
        return new Promise<string>(() => undefined)
      },
    )
    render(
      <NativeEditorHarness
        descriptors={createDescriptors({
          secretState: "available",
          canReplace: true,
        })}
        onLoadSecret={onLoadSecret}
      />,
    )

    await waitFor(() => expect(onLoadSecret).toHaveBeenCalledOnce())
    await user.type(
      screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput),
      "replacement-secret",
    )

    expect(loadSignal?.aborted).toBe(true)
    expect(screen.queryByText("Loading the saved credential...")).toBeNull()
  })

  it("ignores a late saved credential result after replacement input begins", async () => {
    const user = userEvent.setup()
    let loadSignal: AbortSignal | undefined
    const pendingLoad = createDeferred<string>()
    const onLoadSecret = vi.fn(
      (_fieldId: string, options?: { signal?: AbortSignal }) => {
        loadSignal = options?.signal
        return pendingLoad.promise
      },
    )
    render(
      <NativeEditorHarness
        descriptors={createDescriptors({
          secretState: "available",
          canReplace: true,
        })}
        onLoadSecret={onLoadSecret}
      />,
    )
    const nameInput = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
    await user.clear(nameInput)
    await user.type(nameInput, "Unsaved rename")
    await waitFor(() => expect(onLoadSecret).toHaveBeenCalledOnce())
    await user.type(
      screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput),
      "replacement-secret",
    )

    expect(loadSignal?.aborted).toBe(true)
    expect(screen.getByRole("dialog")).toBeVisible()
    expect(nameInput).toHaveValue("Unsaved rename")

    await act(async () => pendingLoad.resolve("late-saved-secret"))
    expect(screen.queryByDisplayValue("late-saved-secret")).toBeNull()
    expect(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)).toHaveValue(
      "replacement-secret",
    )
    expect(nameInput).toHaveValue("Unsaved rename")
  })

  it("aborts an in-flight saved credential load when the editor unmounts", async () => {
    let loadSignal: AbortSignal | undefined
    const onLoadSecret = vi.fn(
      (_fieldId: string, options?: { signal?: AbortSignal }) => {
        loadSignal = options?.signal
        return new Promise<string>(() => undefined)
      },
    )
    const view = render(
      <NativeEditorHarness
        descriptors={createDescriptors({
          secretState: "available",
          canReplace: true,
        })}
        onLoadSecret={onLoadSecret}
      />,
    )
    await waitFor(() => expect(onLoadSecret).toHaveBeenCalledOnce())

    view.unmount()

    expect(loadSignal?.aborted).toBe(true)
  })

  it("shows a controlled automatic load failure and retries without changing the secret intent", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const onLoadSecret = vi
      .fn()
      .mockRejectedValueOnce(new Error("private backend failure"))
      .mockResolvedValueOnce("saved-secret-value")
    render(
      <NativeEditorHarness
        descriptors={createDescriptors({
          secretState: "available",
          canReplace: true,
        })}
        onValueChange={onValueChange}
        onLoadSecret={onLoadSecret}
      />,
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The saved credential could not be loaded.",
    )
    expect(screen.queryByText("Loading the saved credential...")).toBeNull()
    expect(
      screen.queryByRole("button", { name: /load saved credential/i }),
    ).toBeNull()

    await user.click(screen.getByRole("button", { name: "Retry" }))
    expect(
      await screen.findByDisplayValue("saved-secret-value"),
    ).toHaveAttribute("type", "password")
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it.each(["masked", "unavailable", "permission-hidden"] as const)(
    "does not offer saved credential loading for a %s secret",
    (secretState) => {
      render(
        <NativeEditorHarness
          descriptors={createDescriptors({ secretState, canReplace: true })}
          onLoadSecret={vi.fn()}
        />,
      )

      expect(
        screen.queryByRole("button", { name: "Load saved credential" }),
      ).toBeNull()
    },
  )

  it.each(["masked", "unavailable", "permission-hidden"] as const)(
    "blocks replacement for a %s secret when canReplace is false and supports explicit clear only",
    async (secretState) => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      const { rerender } = render(
        <NativeEditorHarness
          descriptors={createDescriptors({
            secretState,
            canReplace: false,
          })}
          values={{
            ...initialValues,
            [AXON_HUB_CHANNEL_FIELD_IDS.KEY]: {
              kind: "replace",
              value: "must-not-render",
            },
          }}
          onValueChange={onValueChange}
        />,
      )

      const blockedInput = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)
      expect(blockedInput).toBeDisabled()
      expect(blockedInput).toHaveValue("")
      expect(screen.queryByDisplayValue("must-not-render")).toBeNull()

      await user.click(blockedInput)
      await user.type(blockedInput, "blocked-secret")
      expect(onValueChange).not.toHaveBeenCalled()

      rerender(
        <NativeEditorHarness
          key={`${secretState}-enabled`}
          descriptors={createDescriptors({
            secretState,
            canReplace: true,
            allowClear: false,
          })}
          values={initialValues}
          onValueChange={onValueChange}
        />,
      )

      const enabledInput = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)
      expect(enabledInput).toBeEnabled()
      expect(enabledInput).toHaveValue("")
      expect(
        screen.queryByRole("button", { name: "Remove saved credential" }),
      ).toBeNull()

      await user.type(enabledInput, "replacement-secret")
      expect(onValueChange).toHaveBeenLastCalledWith(
        AXON_HUB_CHANNEL_FIELD_IDS.KEY,
        { kind: "replace", value: "replacement-secret" },
      )

      rerender(
        <NativeEditorHarness
          key={`${secretState}-enabled`}
          descriptors={createDescriptors({
            secretState,
            canReplace: true,
            allowClear: true,
          })}
          values={initialValues}
          onValueChange={onValueChange}
        />,
      )
      await user.click(
        screen.getByRole("button", { name: "Remove saved credential" }),
      )
      expect(onValueChange).toHaveBeenLastCalledWith(
        AXON_HUB_CHANNEL_FIELD_IDS.KEY,
        { kind: "clear" },
      )
    },
  )
})
