import "./copyKeyDialogMocks"

import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { DialogFooter } from "~/features/AccountManagement/components/CopyKeyDialog/DialogFooter"
import { KeyInventoryList } from "~/features/AccountManagement/components/CopyKeyDialog/KeyInventoryList"
import { QuickKeyResourceCard } from "~/features/AccountManagement/components/CopyKeyDialog/QuickKeyResourceCard"
import { RuntimeKeyActionControls } from "~/features/AccountManagement/components/CopyKeyDialog/RuntimeKeyActionControls"
import type { KeyResourceCardPresentation } from "~/features/KeyManagement/presentation/keyResourceCard"
import {
  buildDisplayAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

import {
  cursorPlusExportDialogMock,
  kelivoExportDialogMock,
  resolveApiTokenKeyMock,
  toastErrorMock,
} from "./copyKeyDialogMocks"
import {
  ACCOUNT,
  selectExportAction,
  setupCopyKeyDialogTestDefaults,
  SHAREDCHAT_ACCOUNT,
  SHAREDCHAT_SERVICE_CREDENTIAL,
  TOKEN,
} from "./copyKeyDialogTestSupport"

describe("CopyKeyDialog subcomponents", () => {
  beforeEach(() => {
    setupCopyKeyDialogTestDefaults()
  })

  it("omits optional empty-state and footer actions when callbacks are unavailable", () => {
    render(
      <>
        <KeyInventoryList
          runtimeKeys={[]}
          expandedRuntimeKeys={new Set()}
          copiedRuntimeKeyId={null}
          onToggleRuntimeKey={() => {}}
          onCopyKey={() => {}}
          account={ACCOUNT}
          supportsApiTokenCreation
        />
        <DialogFooter keyCount={0} onClose={() => {}} />
      </>,
    )

    expect(screen.getByText("ui:dialog.copyKey.noKeys")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.createKey" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "ui:dialog.copyKey.createCustomKey",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "account:actions.keyManagement" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:actions.close" }),
    ).toBeEnabled()
  })

  it("renders unknown quick-key status without duplicating its header fact", () => {
    const contextFact = {
      id: "workspace",
      label: "Workspace",
      value: "Example workspace",
    }
    const quickPresentation: KeyResourceCardPresentation = {
      id: "quick-key-example",
      title: "Example quick key",
      accountLabel: "Example account",
      status: "unknown",
      statusLabel: "Unknown",
      secretAvailability: "unavailable",
      contextFact,
      summaryFacts: [contextFact],
      detailFacts: [],
      actions: {
        copySecret: false,
        revealSecret: false,
        verifySecret: false,
        exportSecret: false,
        edit: false,
        delete: false,
        batchSelect: false,
      },
    }

    render(
      <QuickKeyResourceCard
        presentation={quickPresentation}
        isExpanded
        onExpandedChange={() => {}}
      />,
    )

    expect(screen.getByText("Unknown")).toBeVisible()
    expect(screen.getAllByText("Example workspace")).toHaveLength(1)
    expect(
      screen.getByRole("region", {
        name: "keyManagement:actions.detailsFor",
      }),
    ).toBeVisible()
  })

  it("keeps copy and export action policies independent", async () => {
    const user = userEvent.setup()
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(ACCOUNT, TOKEN)
    const { rerender } = render(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: true, exportSecret: false }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={ACCOUNT}
      />,
    )

    expect(
      screen.getByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "common:actions.export" }),
    ).not.toBeInTheDocument()

    rerender(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={ACCOUNT}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:actions.export" }),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )
    expect(
      screen.getByRole("menuitem", {
        name: "keyManagement:actions.copyKelivoImportCode",
      }),
    ).toBeVisible()
  })

  it("opens Cursor++ export for an exportable runtime key", async () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(ACCOUNT, TOKEN)
    const user = userEvent.setup()

    render(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={ACCOUNT}
      />,
    )

    await selectExportAction(user, "keyManagement:actions.exportToCursorPlus")

    expect(cursorPlusExportDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        account: ACCOUNT,
        runtimeKey,
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "close Cursor++ export" }),
    )
    expect(
      screen.queryByRole("button", { name: "close Cursor++ export" }),
    ).not.toBeInTheDocument()
  })

  it("redacts credential values from runtime-key Kelivo export errors", async () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(ACCOUNT, TOKEN)
    resolveApiTokenKeyMock.mockRejectedValueOnce(
      new Error("Provider rejected sk-test because the account is suspended"),
    )
    const user = userEvent.setup()

    render(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={ACCOUNT}
      />,
    )

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.operation.failed",
      )
    })
    expect(JSON.stringify(toastErrorMock.mock.calls)).not.toContain("sk-test")
  })

  it("falls back to the local unknown error for a blank runtime-key Kelivo failure", async () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(ACCOUNT, TOKEN)
    resolveApiTokenKeyMock.mockRejectedValueOnce(new Error(""))
    const user = userEvent.setup()

    render(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={ACCOUNT}
      />,
    )

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.operation.failed",
      )
    })
  })

  it("uses service-credential analytics for its Kelivo export dialog", async () => {
    const runtimeKey = buildServiceCredentialRuntimeKey(
      SHAREDCHAT_ACCOUNT,
      SHAREDCHAT_SERVICE_CREDENTIAL,
    )
    const user = userEvent.setup()

    render(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={SHAREDCHAT_ACCOUNT}
      />,
    )

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    expect(kelivoExportDialogMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        analyticsContext: expect.objectContaining({
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.CopyServiceCredentialKelivoImportCode,
        }),
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "close Kelivo export" }),
    )
    expect(
      screen.queryByRole("button", { name: "close Kelivo export" }),
    ).not.toBeInTheDocument()
  })
})
