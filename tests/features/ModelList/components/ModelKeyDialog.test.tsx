import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import ModelKeyDialog from "~/features/ModelList/components/ModelKeyDialog"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { AuthTypeEnum } from "~/types"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const serviceCredentialFetchMock = vi.fn()

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: () => ({
    siteType: SITE_TYPES.SHAREDCHAT,
    account: {
      serviceCredential: {
        fetch: serviceCredentialFetchMock,
      },
    },
  }),
}))

vi.mock("~/features/TokenProvisioning/components/AddTokenDialog", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="add-token-dialog" /> : null,
}))

const ACCOUNT = {
  id: "service-credential-account",
  name: "Service Credential Account",
  username: "tester",
  siteType: SITE_TYPES.SHAREDCHAT,
  baseUrl: "https://example.invalid",
  token: "access-token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
} as any

describe("ModelKeyDialog", () => {
  beforeEach(() => {
    serviceCredentialFetchMock.mockReset()
    serviceCredentialFetchMock.mockResolvedValue({
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "sk-sharedchat-codex",
      isAuthenticated: true,
    })
  })

  it("disables token creation for service-credential-only accounts", async () => {
    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4o"
      />,
    )

    await waitFor(() => {
      expect(serviceCredentialFetchMock).toHaveBeenCalled()
    })

    const createCustomButton = screen.getByTestId(
      MODEL_LIST_TEST_IDS.createCustomKeyButton,
    )
    expect(createCustomButton).toBeDisabled()
    expect(
      screen.getByText("modelList:keyDialog.createDisabledTitle"),
    ).toBeInTheDocument()

    await user.click(createCustomButton)
    expect(screen.queryByTestId("add-token-dialog")).toBeNull()
  })
})
