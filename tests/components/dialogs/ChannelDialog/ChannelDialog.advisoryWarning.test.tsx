import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelDialog } from "~/components/dialogs/ChannelDialog"
import { NEW_API } from "~/constants/siteType"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  capturedVerificationRequests,
  fetchChannelSecretKeyMock,
  handleSubmitMock,
  requestDuplicateChannelWarningMock,
  updateFieldMock,
} = vi.hoisted(() => ({
  capturedVerificationRequests: [] as any[],
  fetchChannelSecretKeyMock: vi.fn(async () => "sk-test"),
  handleSubmitMock: vi.fn((event?: { preventDefault?: () => void }) =>
    event?.preventDefault?.(),
  ),
  requestDuplicateChannelWarningMock: vi.fn(),
  updateFieldMock: vi.fn(),
}))

vi.mock(
  "~/components/dialogs/ChannelDialog/context/ChannelDialogContext",
  async () => {
    const actual = await vi.importActual<
      typeof import("~/components/dialogs/ChannelDialog/context/ChannelDialogContext")
    >("~/components/dialogs/ChannelDialog/context/ChannelDialogContext")

    return {
      ...actual,
      useChannelDialogContext: () => ({
        requestDuplicateChannelWarning: requestDuplicateChannelWarningMock,
      }),
    }
  },
)

vi.mock("~/components/dialogs/ChannelDialog/hooks/useChannelForm", () => ({
  useChannelForm: () => ({
    formData: {
      name: "Auto channel",
      type: 1,
      key: "sk-test",
      base_url: "https://upstream.example.com",
      models: ["gpt-4"],
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: 1,
    },
    updateField: updateFieldMock,
    handleTypeChange: vi.fn(),
    handleSubmit: handleSubmitMock,
    isFormValid: true,
    isSaving: false,
    isLoadingGroups: false,
    isLoadingModels: false,
    availableGroups: [],
    availableModels: [],
    isKeyFieldRequired: true,
    isBaseUrlRequired: false,
  }),
}))

vi.mock("~/contexts/UserPreferencesContext", async () => {
  const actual = await vi.importActual<
    typeof import("~/contexts/UserPreferencesContext")
  >("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    useUserPreferencesContext: () => ({
      managedSiteType: NEW_API,
      newApiBaseUrl: "https://managed.example.com",
      newApiUserId: "1",
      newApiUsername: "admin",
      newApiPassword: "password",
      newApiTotpSecret: "",
    }),
  }
})

vi.mock(
  "~/features/ManagedSiteVerification/useNewApiManagedVerification",
  async (importOriginal) => {
    const actual =
      (await importOriginal()) as typeof import("~/features/ManagedSiteVerification/useNewApiManagedVerification")

    return {
      ...actual,
      useNewApiManagedVerification: () => ({
        dialogState: {
          isOpen: false,
          step: actual.NEW_API_MANAGED_VERIFICATION_STEPS.LOGGING_IN,
          request: null,
          code: "",
          errorMessage: undefined,
          isBusy: false,
          busyMessage: undefined,
        },
        setCode: vi.fn(),
        closeDialog: vi.fn(),
        openBaseUrl: vi.fn(),
        submitCode: vi.fn(),
        retryVerification: vi.fn(),
        openNewApiManagedVerification: vi.fn((request: any) => {
          capturedVerificationRequests.push(request)
        }),
      }),
    }
  },
)

vi.mock(
  "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog",
  () => ({
    NewApiManagedVerificationDialog: () => null,
  }),
)

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: vi.fn(async () => ({
    siteType: NEW_API,
    messagesKey: "newapi",
    getConfig: vi.fn(async () => ({
      baseUrl: "https://managed.example.com",
      token: "admin-token",
      userId: "1",
    })),
    searchChannel: vi.fn(async () => ({
      items: [
        {
          id: 7,
          type: 1,
          key: "",
          name: "Existing channel",
          base_url: "https://upstream.example.com",
          models: "gpt-4",
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
        },
      ],
      total: 1,
      type_counts: {},
    })),
    fetchChannelSecretKey: fetchChannelSecretKeyMock,
    findMatchingChannel: vi.fn(),
  })),
}))

describe("ChannelDialog advisory verification action", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedVerificationRequests.length = 0
    fetchChannelSecretKeyMock.mockResolvedValue("sk-test")
    requestDuplicateChannelWarningMock.mockResolvedValue(false)
  })

  it("re-runs duplicate confirmation after New API verification", async () => {
    render(
      <ChannelDialog
        isOpen={true}
        onClose={vi.fn()}
        advisoryWarning={{
          kind: "verificationRequired",
          title: "channelDialog:warnings.verificationRequired.title",
          description:
            "channelDialog:warnings.verificationRequired.description",
        }}
      />,
    )

    await userEvent.click(
      await screen.findByRole("button", {
        name: "channelDialog:warnings.verificationRequired.actions.verifyNow",
      }),
    )

    expect(capturedVerificationRequests).toHaveLength(1)

    await act(async () => {
      await capturedVerificationRequests[0].onVerified()
    })

    await waitFor(() => {
      expect(requestDuplicateChannelWarningMock).toHaveBeenCalledWith({
        existingChannelName: "Existing channel",
      })
    })

    expect(fetchChannelSecretKeyMock).toHaveBeenCalledWith(
      "https://managed.example.com",
      "admin-token",
      "1",
      7,
    )

    expect(
      screen.getByText("channelDialog:warnings.exactDuplicate.title"),
    ).toBeInTheDocument()
  })
})
