import type { TFunction } from "i18next"
import { StrictMode, type ComponentProps } from "react"
import { vi } from "vitest"

import { RuntimeKeyHeader } from "~/features/KeyManagement/components/RuntimeKeyActions/RuntimeKeyHeader"
import type { KeyResourceActionPolicy } from "~/features/KeyManagement/presentation/keyResourceCard"
import { buildLegacyKeyResourceCardPresentation } from "~/features/KeyManagement/presentation/legacyKeyResourceCard"
import { buildDisplayAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

export const RECOVERABLE_ACTION_POLICY: KeyResourceActionPolicy = {
  copySecret: true,
  revealSecret: true,
  verifySecret: true,
  exportSecret: true,
  edit: true,
  delete: true,
  batchSelect: true,
}

type RuntimeKeyHeaderHarnessProps = Partial<
  ComponentProps<typeof RuntimeKeyHeader>
> & {
  token?: ReturnType<typeof createToken>
  handleEditToken?: () => void
  handleDeleteToken?: () => void
  translate?: TFunction
  withCCSwitchExport?: boolean
}

export function RuntimeKeyHeaderHarness({
  account: accountOverride,
  runtimeKey: runtimeKeyOverride,
  handleEditKey,
  handleDeleteKey,
  token: tokenOverride,
  actionPolicy: actionPolicyOverride,
  headerProps: headerPropsOverride,
  translate = testI18n.t,
  copyKey = vi.fn(),
  handleEditToken = vi.fn(),
  handleDeleteToken = vi.fn(),
  onOpenCCSwitchDialog = vi.fn(),
  withCCSwitchExport = true,
  ...restProps
}: RuntimeKeyHeaderHarnessProps) {
  const account =
    accountOverride ??
    createAccount({
      id: "acc-1",
      name: "Account 1",
      token: "account-access-token",
      baseUrl: "https://account.example/v1",
    })
  const token =
    tokenOverride ??
    createToken({
      id: 1,
      name: "Token 1",
      key: "sk-sensitive-original",
      accountId: "acc-1",
      accountName: "Account 1",
    })
  const runtimeKey =
    runtimeKeyOverride ?? buildDisplayAccountTokenRuntimeKey(account, token)
  const presentation = buildLegacyKeyResourceCardPresentation(
    runtimeKey,
    translate,
  )

  return (
    <RuntimeKeyHeader
      {...restProps}
      runtimeKey={runtimeKey}
      copyKey={copyKey}
      handleEditKey={handleEditKey ?? handleEditToken}
      handleDeleteKey={handleDeleteKey ?? handleDeleteToken}
      account={account}
      onOpenCCSwitchDialog={
        withCCSwitchExport ? onOpenCCSwitchDialog : undefined
      }
      headerProps={
        headerPropsOverride ?? {
          presentation,
          detailsTrigger: null,
        }
      }
      actionPolicy={actionPolicyOverride ?? presentation.actions}
    />
  )
}

export function renderRuntimeKeyHeader(
  props: RuntimeKeyHeaderHarnessProps = {},
  options: { strictMode?: boolean } = {},
) {
  const renderHarness = (nextProps: RuntimeKeyHeaderHarnessProps) => {
    const harness = (
      <RuntimeKeyHeaderHarness
        translate={((key: string) => key) as TFunction}
        {...nextProps}
      />
    )
    return options.strictMode ? <StrictMode>{harness}</StrictMode> : harness
  }
  const rendered = render(renderHarness(props), {
    withReleaseUpdateStatusProvider: false,
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })

  return {
    ...rendered,
    rerenderRuntimeKeyHeader: (nextProps: RuntimeKeyHeaderHarnessProps) =>
      rendered.rerender(renderHarness(nextProps)),
  }
}
