import { KeyRound } from "lucide-react"
import type { ReactNode } from "react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, FormField, Input } from "~/components/ui"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  encodeNanoGptCredentials,
  parseNanoGptCredentials,
} from "~/services/apiService/nanogpt/credentials"
import { createTab } from "~/utils/browser/tabs"

/** The same atomic credential draft supports either class independently. */
export function NanoGptCredentialGuide({
  credential,
  onCredentialChange,
  children,
}: {
  credential: string
  onCredentialChange: (value: string) => void
  children: ReactNode
}) {
  const { t } = useTranslation("accountDialog")
  const id = useId()
  const [openFailed, setOpenFailed] = useState(false)
  const openManagement = async () => {
    setOpenFailed(false)
    try {
      await createTab(
        "https://nano-gpt.com/settings#management-api-tokens",
        true,
      )
    } catch {
      setOpenFailed(true)
    }
  }
  const pair = parseNanoGptCredentials(credential)
  return (
    <div className="space-y-density-3 col-span-full">
      <FormField
        label={t("nanoGptCredentials.managementToken")}
        htmlFor={id}
        required={!pair.apiKey}
      >
        <Input
          id={id}
          type="password"
          revealable
          value={pair.managementToken}
          required={!pair.apiKey}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.nanoGptManagementTokenInput}
          revealLabels={{
            show: t("form.showAccessToken"),
            hide: t("form.hideAccessToken"),
          }}
          onChange={(event) =>
            onCredentialChange(
              encodeNanoGptCredentials({
                ...pair,
                managementToken: event.target.value,
              }),
            )
          }
          leftIcon={<KeyRound className="size-5" />}
        />
        <p className="text-muted-foreground text-xs">
          {t("nanoGptCredentials.managementHelp")}
        </p>
      </FormField>
      {children}
      <p className="text-muted-foreground text-xs">
        {t("nanoGptCredentials.inferenceHelp")}
      </p>
      <p className="text-muted-foreground text-xs">
        {t("nanoGptCredentials.identityWarning")}
      </p>
      <Button
        type="button"
        size="sm"
        variant="link"
        onClick={() => void openManagement()}
      >
        {t("nanoGptCredentials.openManagement")}
      </Button>
      {openFailed && (
        <p role="alert">{t("nanoGptCredentials.openManagementFailed")}</p>
      )}
    </div>
  )
}
