import type { FormEvent } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CHANNEL_DIALOG_MUTATION_RESULTS } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import {
  useChannelForm,
  type ChannelResourceEditContext,
} from "~/components/dialogs/ChannelDialog/hooks/useChannelForm"
import { DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS } from "~/constants/claudeCodeHub"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import type {
  ChannelFormData,
  CreateChannelPayload,
  ManagedSiteChannel,
} from "~/types/managedSite"
import type { ManagedUpstreamResourceDetail } from "~/types/managedUpstreamResource"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}))

const buildManagedSiteChannel = (
  overrides: Partial<ManagedSiteChannel> = {},
): ManagedSiteChannel =>
  ({
    id: 1,
    type: ChannelType.OpenAI,
    key: "channel-key",
    name: "Alpha",
    base_url: "https://source.example.com",
    models: "gpt-4o",
    status: 1,
    weight: 0,
    priority: 0,
    openai_organization: null,
    test_model: null,
    created_time: 0,
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: "default",
    used_quota: 0,
    model_mapping: "",
    status_code_mapping: "",
    auto_ban: 0,
    other_info: "",
    tag: null,
    param_override: null,
    header_override: null,
    remark: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    setting: "",
    settings: "",
    ...overrides,
  }) satisfies ManagedSiteChannel

describe("useChannelForm", () => {
  const mockCheckValidConfig = vi.fn()
  const mockGetConfig = vi.fn()
  const mockBuildChannelPayload = vi.fn()
  const mockCreateChannel = vi.fn()
  const mockUpdateChannel = vi.fn()
  const mockFetchSiteUserGroups = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.NEW_API,
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(false),
      getConfig: mockGetConfig,
      fetchSiteUserGroups: mockFetchSiteUserGroups.mockResolvedValue([
        "default",
      ]),
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)
  })

  it("requires at least one model before an add form becomes submittable", async () => {
    const onClose = vi.fn()
    const preventDefault = vi.fn()

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("")
    })

    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", "sk-test")
    })

    expect(result.current.isFormValid).toBe(false)

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(mockBuildChannelPayload).not.toHaveBeenCalled()
    expect(mockCreateChannel).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "channelDialog:validation.modelsRequired",
    )

    await act(async () => {
      result.current.updateField("models", ["gpt-4o"])
    })

    expect(result.current.isFormValid).toBe(true)
  })

  it("falls back to cloned default groups when an existing channel group is empty", async () => {
    const channel = buildManagedSiteChannel({
      group: "",
    })
    const onClose = vi.fn()

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.VIEW,
        channel,
        isOpen: true,
        onClose,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("Alpha")
    })

    expect(result.current.formData.groups).toEqual(
      DEFAULT_CHANNEL_FIELDS.groups,
    )
    expect(result.current.formData.groups).not.toBe(
      DEFAULT_CHANNEL_FIELDS.groups,
    )
  })

  it("loads groups with access-token managed-site auth", async () => {
    mockCheckValidConfig.mockResolvedValue(true)
    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "42",
    })
    mockFetchSiteUserGroups.mockResolvedValue(["vip"])

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.availableGroups).toEqual([
        { label: "vip", value: "vip" },
        { label: "default", value: "default" },
      ])
    })

    expect(mockFetchSiteUserGroups).toHaveBeenCalledWith({
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "42",
    })
  })

  it("loads groups through Octopus service config", async () => {
    const octopusConfig = {
      baseUrl: "https://octopus.example.com",
      username: "admin",
      password: "password",
    }
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.OCTOPUS,
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(true),
      getConfig: mockGetConfig.mockResolvedValue(octopusConfig),
      fetchSiteUserGroups: mockFetchSiteUserGroups.mockResolvedValue([
        "shared",
      ]),
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.availableGroups).toEqual([
        { label: "shared", value: "shared" },
        { label: "default", value: "default" },
      ])
    })

    expect(mockFetchSiteUserGroups).toHaveBeenCalledWith(octopusConfig)
  })

  it("treats handleSubmit as a no-op in view mode", async () => {
    const channel = buildManagedSiteChannel()
    const onClose = vi.fn()
    const preventDefault = vi.fn()

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.VIEW,
        channel,
        isOpen: true,
        onClose,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("Alpha")
    })

    vi.mocked(getManagedSiteService).mockClear()
    mockGetConfig.mockClear()
    mockBuildChannelPayload.mockClear()
    mockCreateChannel.mockClear()
    mockUpdateChannel.mockClear()

    await result.current.handleSubmit({
      preventDefault,
    } as unknown as FormEvent)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(getManagedSiteService).not.toHaveBeenCalled()
    expect(mockGetConfig).not.toHaveBeenCalled()
    expect(mockBuildChannelPayload).not.toHaveBeenCalled()
    expect(mockCreateChannel).not.toHaveBeenCalled()
    expect(mockUpdateChannel).not.toHaveBeenCalled()
  })

  it("preserves AxonHub string channel types and skips New API group loading", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.AXON_HUB,
      messagesKey: "axonhub",
      checkValidConfig: mockCheckValidConfig,
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    const channel = buildManagedSiteChannel({
      type: "anthropic_aws",
      group: "",
    })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.type).toBe("anthropic_aws")
    })

    expect(result.current.isBaseUrlRequired).toBe(true)
    expect(result.current.availableGroups).toEqual([])
    expect(mockCheckValidConfig).not.toHaveBeenCalled()
    expect(mockGetConfig).not.toHaveBeenCalled()

    await act(async () => {
      result.current.handleTypeChange("custom-provider")
    })

    expect(result.current.formData.type).toBe("custom-provider")
  })

  it("does not require base_url for incidental string types outside AxonHub", async () => {
    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("")
    })

    await act(async () => {
      result.current.handleTypeChange("custom-provider")
    })

    expect(result.current.formData.type).toBe("custom-provider")
    expect(result.current.isBaseUrlRequired).toBe(false)
  })

  it("adds a fallback success message when channel creation succeeds with an empty message", async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const preventDefault = vi.fn()

    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      token: "admin-token",
      userId: "1",
    })
    mockBuildChannelPayload.mockReturnValue({
      mode: "single",
      channel: {
        name: "Alpha",
        type: ChannelType.OpenAI,
        key: "sk-test",
        base_url: "https://source.example.com",
        models: "gpt-4o",
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
    } satisfies CreateChannelPayload)
    mockCreateChannel.mockResolvedValue({ success: true, message: "" })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("")
    })

    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", "sk-test")
      result.current.updateField("models", ["gpt-4o"])
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(mockBuildChannelPayload).toHaveBeenCalled()
    expect(mockCreateChannel).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "managedSiteChannels:toasts.channelSaved",
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("reports an opt-in channel creation outcome after the create request succeeds", async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const onMutationOutcome = vi.fn()
    const preventDefault = vi.fn()

    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      token: "admin-token",
      userId: "1",
    })
    mockBuildChannelPayload.mockReturnValue({
      mode: "single",
      channel: {
        name: "Alpha",
        type: ChannelType.OpenAI,
        key: "sk-test",
        base_url: "https://source.example.com",
        models: "gpt-4o",
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
    } satisfies CreateChannelPayload)
    mockCreateChannel.mockResolvedValue({ success: true, message: "" })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose,
        onSuccess,
        onMutationOutcome,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("")
    })

    await act(async () => {
      result.current.updateField("name", "Alpha")
      result.current.updateField("key", "sk-test")
      result.current.updateField("models", ["gpt-4o"])
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(onMutationOutcome).toHaveBeenCalledWith({
      mode: DIALOG_MODES.ADD,
      result: CHANNEL_DIALOG_MUTATION_RESULTS.Success,
      siteType: SITE_TYPES.NEW_API,
    })
  })

  it("reports an opt-in channel update failure when the update request is rejected", async () => {
    const onMutationOutcome = vi.fn()
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel()

    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      token: "admin-token",
      userId: "1",
    })
    mockUpdateChannel.mockResolvedValue({
      success: false,
      message: "Update failed",
    })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        onMutationOutcome,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.name).toBe("Alpha")
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(onMutationOutcome).toHaveBeenCalledWith({
      mode: DIALOG_MODES.EDIT,
      result: CHANNEL_DIALOG_MUTATION_RESULTS.Failure,
      siteType: SITE_TYPES.NEW_API,
    })
  })

  it("waits for resource detail before allowing a resource-backed update", async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel({
      id: 32,
      name: "List Name",
      key: "sk-********",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.com",
          resourceId: "32",
        },
        displayName: "Detail Name",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: buildManagedSiteChannel({
        id: 32,
        name: "Detail Name",
        key: "sk-********",
        model_mapping: '{"gpt-4o":"mapped-gpt-4o"}',
      }),
    } as const
    let resolveDetail: (value: typeof detail) => void = () => {}
    const getDetail = vi.fn(
      () =>
        new Promise<typeof detail>((resolve) => {
          resolveDetail = resolve
        }),
    )
    const update = vi.fn().mockResolvedValue({
      success: true,
      message: "",
      data: null,
    })
    const prepareEditDraft = vi.fn(
      (): ChannelFormData => ({
        name: "Detail Name",
        type: ChannelType.OpenAI,
        key: "sk-********",
        base_url: "https://source.example.com",
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      }),
    )
    const describeFields = vi.fn(() => [
      { name: "name", label: "Name", type: "text" as const, required: true },
    ])
    const config = {
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "1",
    }
    const resourceEdit = {
      config,
      ref: detail.summary.ref,
      capabilities: {
        items: {
          getDetail,
          update,
        },
        drafts: {
          prepareEditDraft,
          describeFields,
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose,
        onSuccess,
        resourceEdit,
      }),
    )

    await waitFor(() => {
      expect(getDetail).toHaveBeenCalledWith(config, detail.summary.ref)
    })
    expect(result.current.isFormValid).toBe(false)

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(update).not.toHaveBeenCalled()
    expect(mockUpdateChannel).not.toHaveBeenCalled()

    await act(async () => {
      resolveDetail(detail)
    })

    await waitFor(() => {
      expect(result.current.formData.name).toBe("Detail Name")
      expect(result.current.isFormValid).toBe(true)
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(update).toHaveBeenCalledWith(
      config,
      detail,
      expect.objectContaining({
        name: "Detail Name",
        key: "sk-********",
      }),
    )
    expect(mockUpdateChannel).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "managedSiteChannels:toasts.channelUpdated",
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("invalidates loaded resource detail when the resource edit ref changes", async () => {
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel({
      id: 32,
      name: "List Name",
      key: "sk-********",
    })
    const firstDetail: ManagedUpstreamResourceDetail<ManagedSiteChannel> = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.com",
          resourceId: "32",
        },
        displayName: "First Detail",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: buildManagedSiteChannel({
        id: 32,
        name: "First Detail",
        key: "sk-********",
      }),
    }
    const secondRef = {
      managedSiteType: SITE_TYPES.NEW_API,
      scopeKey: "https://managed.example.com",
      resourceId: "33",
    } as const
    let resolveSecondDetail: (value: typeof firstDetail) => void = () => {}
    const getDetail = vi
      .fn()
      .mockResolvedValueOnce(firstDetail)
      .mockImplementationOnce(
        () =>
          new Promise<typeof firstDetail>((resolve) => {
            resolveSecondDetail = resolve
          }),
      )
    const update = vi.fn().mockResolvedValue({
      success: true,
      message: "",
      data: null,
    })
    const resourceEdit: ChannelResourceEditContext = {
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
      },
      ref: firstDetail.summary.ref,
      capabilities: {
        items: {
          getDetail,
          update,
        },
        drafts: {
          prepareEditDraft: vi.fn(
            (): ChannelFormData => ({
              name: "Detail",
              type: ChannelType.OpenAI,
              key: "sk-********",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            }),
          ),
          describeFields: vi.fn(() => [
            { name: "name", label: "Name", type: "text" as const },
          ]),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }

    const { result, rerender } = renderHook(
      ({ edit }) =>
        useChannelForm({
          mode: DIALOG_MODES.EDIT,
          channel,
          isOpen: true,
          onClose: vi.fn(),
          resourceEdit: edit,
        }),
      {
        initialProps: { edit: resourceEdit },
      },
    )

    await waitFor(() => {
      expect(result.current.isResourceEditReady).toBe(true)
    })

    rerender({
      edit: {
        ...resourceEdit,
        ref: secondRef,
      },
    })

    expect(result.current.isResourceEditReady).toBe(false)

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(update).not.toHaveBeenCalled()

    await act(async () => {
      resolveSecondDetail({
        ...firstDetail,
        summary: {
          ...firstDetail.summary,
          ref: secondRef,
          displayName: "Second Detail",
        },
      })
    })

    await waitFor(() => {
      expect(result.current.isResourceEditReady).toBe(true)
    })
  })

  it("lets resource-backed Claude Code Hub edits submit empty visible models when resource validation allows it", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      messagesKey: "claudecodehub",
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(true),
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel({
      id: 34,
      type: "claude",
      key: "sk-********",
      name: "Prefix Provider",
      base_url: "https://source.example.com",
      models: "",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://managed.example.com",
          resourceId: "34",
        },
        displayName: "Prefix Provider",
        nativeKind: "provider",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: {
        id: 34,
        name: "Prefix Provider",
        allowedModels: [{ matchType: "prefix", pattern: "claude-" }],
      },
    } as const
    const update = vi.fn().mockResolvedValue({
      success: true,
      message: "",
      data: null,
    })
    const validateDraft = vi.fn(() => ({ valid: true, errors: [] }))
    const resourceEdit = {
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
      },
      ref: detail.summary.ref,
      capabilities: {
        items: {
          getDetail: vi.fn().mockResolvedValue(detail),
          update,
        },
        drafts: {
          prepareEditDraft: vi.fn(
            (): ChannelFormData & {
              _claudeCodeHubNativeAllowedModels: Array<{
                matchType: "prefix"
                pattern: string
              }>
            } => ({
              name: "Prefix Provider",
              type: "claude",
              key: "sk-********",
              base_url: "https://source.example.com",
              models: [],
              groups: ["default"],
              priority: 0,
              weight: 1,
              status: 1,
              _claudeCodeHubNativeAllowedModels: [
                { matchType: "prefix", pattern: "claude-" },
              ],
            }),
          ),
          describeFields: vi.fn(() => [
            { name: "models", label: "Models", type: "multi_select" as const },
          ]),
          validateDraft,
        },
      },
    }

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose,
        onSuccess,
        resourceEdit,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.models).toEqual([])
      expect(result.current.isFormValid).toBe(true)
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(validateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Prefix Provider",
        models: [],
      }),
    )
    expect(update).toHaveBeenCalledWith(
      resourceEdit.config,
      detail,
      expect.objectContaining({
        name: "Prefix Provider",
        models: [],
      }),
    )
    expect(mockUpdateChannel).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).not.toHaveBeenCalledWith(
      "channelDialog:validation.modelsRequired",
    )
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "managedSiteChannels:toasts.channelUpdated",
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("marks resource-backed edits invalid when adapter draft validation fails", async () => {
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel({
      id: 35,
      name: "Invalid Resource Channel",
      key: "sk-********",
      models: "",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.com",
          resourceId: "35",
        },
        displayName: "Invalid Resource Channel",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: channel,
    } as const
    const update = vi.fn()
    const validateDraft = vi.fn(() => ({
      valid: false,
      errors: [{ field: "models", message: "At least one model is required" }],
    }))
    const resourceEdit = {
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
      },
      ref: detail.summary.ref,
      capabilities: {
        items: {
          getDetail: vi.fn().mockResolvedValue(detail),
          update,
        },
        drafts: {
          prepareEditDraft: vi.fn(
            (): ChannelFormData => ({
              name: "Invalid Resource Channel",
              type: ChannelType.OpenAI,
              key: "sk-********",
              base_url: "https://source.example.com",
              models: [],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            }),
          ),
          describeFields: vi.fn(() => [
            { name: "models", label: "Models", type: "multi_select" as const },
          ]),
          validateDraft,
        },
      },
    }

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        resourceEdit,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.models).toEqual([])
      expect(result.current.isFormValid).toBe(false)
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(validateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        models: [],
      }),
    )
    expect(update).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "At least one model is required",
    )
  })

  it("exposes resource detail load errors and retries the detail request", async () => {
    const channel = buildManagedSiteChannel({
      id: 33,
      name: "List Name",
      key: "sk-********",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.com",
          resourceId: "33",
        },
        displayName: "Retried Detail",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: buildManagedSiteChannel({
        id: 33,
        name: "Retried Detail",
        key: "sk-********",
      }),
    } as const
    const getDetail = vi
      .fn()
      .mockRejectedValueOnce(new Error("detail unavailable"))
      .mockResolvedValueOnce(detail)
    const prepareEditDraft = vi.fn(
      (): ChannelFormData => ({
        name: "Retried Detail",
        type: ChannelType.OpenAI,
        key: "sk-********",
        base_url: "https://source.example.com",
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      }),
    )
    const describeFields = vi.fn(() => [
      { name: "name", label: "Name", type: "text" as const, required: true },
    ])
    const config = {
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "1",
    }
    const resourceEdit = {
      config,
      ref: detail.summary.ref,
      capabilities: {
        items: {
          getDetail,
          update: vi.fn(),
        },
        drafts: {
          prepareEditDraft,
          describeFields,
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    }

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose: vi.fn(),
        resourceEdit,
      }),
    )

    await waitFor(() => {
      expect(result.current.resourceEditLoadError?.message).toBe(
        "detail unavailable",
      )
    })
    expect(result.current.isResourceEditReady).toBe(false)
    expect(getDetail).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.retryResourceEditLoad()
    })

    await waitFor(() => {
      expect(result.current.formData.name).toBe("Retried Detail")
      expect(result.current.resourceEditLoadError).toBeNull()
      expect(result.current.isResourceEditReady).toBe(true)
    })
    expect(getDetail).toHaveBeenCalledTimes(2)
  })

  it("does not require a real provider key when editing a Claude Code Hub channel", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      messagesKey: "claudecodehub",
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(true),
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    mockGetConfig.mockResolvedValue({
      baseUrl: "https://managed.example.com",
      token: "admin-token",
      userId: "1",
    })
    mockUpdateChannel.mockResolvedValue({ success: true, message: "success" })

    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const preventDefault = vi.fn()
    const channel = buildManagedSiteChannel({
      type: "openai-compatible",
      key: "sk-***",
      group: "default",
    })

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.EDIT,
        channel,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.key).toBe("sk-***")
    })

    expect(result.current.isFormValid).toBe(true)

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
    expect(mockBuildChannelPayload).not.toHaveBeenCalled()
    expect(mockUpdateChannel).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "success",
      }),
    )
  })

  it("prefers the Claude Code Hub specific key toast in add mode", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      messagesKey: "claudecodehub",
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(true),
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    const preventDefault = vi.fn()

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.type).toBe(
        DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS.type,
      )
    })

    await act(async () => {
      result.current.updateField("name", "Claude Provider")
      result.current.updateField("models", ["claude-sonnet"])
      result.current.updateField("key", "   ")
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault,
      } as unknown as FormEvent)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "messages:claudecodehub.realProviderKeyRequired",
    )
    expect(vi.mocked(toast.error)).not.toHaveBeenCalledWith(
      "channelDialog:validation.keyRequired",
    )
    expect(mockCreateChannel).not.toHaveBeenCalled()
  })

  it("applies Claude Code Hub add defaults from the open effect", async () => {
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      messagesKey: "claudecodehub",
      checkValidConfig: mockCheckValidConfig.mockResolvedValue(true),
      getConfig: mockGetConfig,
      buildChannelPayload: mockBuildChannelPayload,
      createChannel: mockCreateChannel,
      updateChannel: mockUpdateChannel,
    } as any)

    const { result } = renderHook(() =>
      useChannelForm({
        mode: DIALOG_MODES.ADD,
        channel: null,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.formData.type).toBe(
        DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS.type,
      )
    })

    expect(result.current.formData.weight).toBe(
      DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS.weight,
    )
  })
})
