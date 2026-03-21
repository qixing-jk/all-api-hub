import { beforeEach, describe, expect, it, vi } from "vitest"

import { useChannelForm } from "~/components/dialogs/ChannelDialog/hooks/useChannelForm"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { NEW_API } from "~/constants/siteType"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { renderHook, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: NEW_API,
      checkValidConfig: vi.fn().mockResolvedValue(false),
    } as any)
  })

  it("clones default groups when an existing channel has no group", async () => {
    const channel = buildManagedSiteChannel({
      group: undefined as unknown as string,
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
})
