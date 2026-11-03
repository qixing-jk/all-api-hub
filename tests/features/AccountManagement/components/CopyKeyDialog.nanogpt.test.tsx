import "./copyKeyDialogMocks"

import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { render, screen } from "~~/tests/test-utils/render"

import {
  fetchServiceCredentialMock,
  openAccountKeyResourcesMock,
} from "./copyKeyDialogMocks"
import {
  ACCOUNT,
  setupCopyKeyDialogTestDefaults,
} from "./copyKeyDialogTestSupport"

beforeEach(setupCopyKeyDialogTestDefaults)

it("keeps the saved NanoGPT inference key usable without a management token", async () => {
  openAccountKeyResourcesMock.mockRejectedValue(
    new AccountKeyResourceError({ code: "configuration_required" }),
  )
  fetchServiceCredentialMock.mockResolvedValue({
    kind: "singleton_service_key",
    service: "nanogpt-inference",
    label: "NanoGPT saved key",
    key: "sk-nano-saved-fixture",
    isAuthenticated: true,
    baseUrl: "https://api.nano-gpt.com/api/v1",
  })
  const user = userEvent.setup()
  render(
    <CopyKeyDialog
      isOpen
      onClose={() => {}}
      account={{ ...ACCOUNT, siteType: SITE_TYPES.NANOGPT }}
    />,
  )
  expect(await screen.findByText("NanoGPT saved key")).toBeVisible()
  expect(
    screen.getByText("ui:dialog.copyKey.managementConfigurationRequired"),
  ).toBeVisible()
  expect(
    screen.queryByText("keyManagement:keyDetails.createResponseOnlySecret"),
  ).not.toBeInTheDocument()
  await user.click(screen.getByText("NanoGPT saved key"))
  await user.click(
    screen.getByRole("button", { name: "ui:dialog.copyKey.copy" }),
  )
  expect(
    await screen.findByRole("button", { name: "ui:dialog.copyKey.copied" }),
  ).toBeVisible()
  expect(await navigator.clipboard.readText()).toBe("sk-nano-saved-fixture")
  expect(
    screen.getByRole("button", { name: "common:actions.export" }),
  ).toBeEnabled()
})

it("does not claim an empty site inventory when management configuration is missing", async () => {
  openAccountKeyResourcesMock.mockRejectedValue(
    new AccountKeyResourceError({ code: "configuration_required" }),
  )
  fetchServiceCredentialMock.mockResolvedValue({ key: "" })
  render(
    <CopyKeyDialog
      isOpen
      onClose={() => {}}
      account={{ ...ACCOUNT, siteType: SITE_TYPES.NANOGPT }}
    />,
  )
  expect(
    await screen.findByText(
      "ui:dialog.copyKey.managementConfigurationRequired",
    ),
  ).toBeVisible()
  expect(screen.queryByText("ui:dialog.copyKey.noKeys")).not.toBeInTheDocument()
})
