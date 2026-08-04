import type { TFunction } from "i18next"
import { StrictMode, type ComponentProps } from "react"
import { vi } from "vitest"

import { TokenHeader } from "~/features/KeyManagement/components/TokenListItem/TokenHeader"
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

type TokenHeaderHarnessProps = Partial<ComponentProps<typeof TokenHeader>> & {
  translate?: TFunction
}

export function TokenHeaderHarness({
  account: accountOverride,
  token: tokenOverride,
  actionPolicy: actionPolicyOverride,
  headerProps: headerPropsOverride,
  translate = testI18n.t,
  copyKey = vi.fn(),
  handleEditToken = vi.fn(),
  handleDeleteToken = vi.fn(),
  onOpenCCSwitchDialog = vi.fn(),
  ...restProps
}: TokenHeaderHarnessProps) {
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
  const presentation = buildLegacyKeyResourceCardPresentation(
    buildDisplayAccountTokenRuntimeKey(account, token),
    translate,
  )

  return (
    <TokenHeader
      {...restProps}
      token={token}
      copyKey={copyKey}
      handleEditToken={handleEditToken}
      handleDeleteToken={handleDeleteToken}
      account={account}
      onOpenCCSwitchDialog={onOpenCCSwitchDialog}
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

export function renderTokenHeader(
  props: TokenHeaderHarnessProps = {},
  options: { strictMode?: boolean } = {},
) {
  const renderHarness = (nextProps: TokenHeaderHarnessProps) => {
    const harness = (
      <TokenHeaderHarness
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
    rerenderTokenHeader: (nextProps: TokenHeaderHarnessProps) =>
      rendered.rerender(renderHarness(nextProps)),
  }
}
