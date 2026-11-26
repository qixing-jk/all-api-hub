import { Hash } from "lucide-react"
import { type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { AccountUserIcon } from "~/components/icons/productIcons"
import { FormField, Input } from "~/components/ui"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

import type { AccountFormFieldAttributes } from "./useAccountFormFeedback"
import { VercelTeamSelector } from "./VercelTeamSelector"

/** Account identity fields, including Vercel team selection. */
export function AccountIdentityFields({
  siteType,
  username,
  userId,
  accessToken,
  requireUsername,
  requireUserId,
  onUsernameChange,
  onUserIdChange,
  usernameValidation,
  usernameFeedback,
  userIdValidation,
  userIdFeedback,
}: {
  siteType: AccountSiteType
  username: string
  userId: string
  accessToken: string
  requireUsername: boolean
  requireUserId: boolean
  onUsernameChange: (value: string) => void
  onUserIdChange: (value: string) => void
  usernameValidation: AccountFormFieldAttributes
  usernameFeedback: ReactNode
  userIdValidation: AccountFormFieldAttributes
  userIdFeedback: ReactNode
}) {
  const { t } = useTranslation(["accountDialog", "common"])
  return (
    <>
      <FormField label={t("form.username")} required={requireUsername}>
        <Input
          type="text"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder={t("form.username")}
          leftIcon={<AccountUserIcon className="h-5 w-5" />}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.usernameInput}
          {...usernameValidation}
          required={requireUsername}
        />
        {usernameFeedback}
      </FormField>

      {siteType === SITE_TYPES.VERCEL_AI_GATEWAY ? (
        <VercelTeamSelector
          accessToken={accessToken}
          value={userId}
          onChange={onUserIdChange}
          validationProps={userIdValidation}
          feedback={userIdFeedback}
        />
      ) : (
        <FormField label={t("form.userId")} required={requireUserId}>
          <Input
            // Compatible account sites may expose alphanumeric user IDs. Reference: https://github.com/qixing-jk/all-api-hub/issues/964
            type="text"
            autoComplete="off"
            value={userId}
            onChange={(e) => onUserIdChange(e.target.value)}
            placeholder={t("form.userId")}
            leftIcon={<Hash className="h-5 w-5" aria-hidden="true" />}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput}
            {...userIdValidation}
            required={requireUserId}
          />
          {userIdFeedback}
        </FormField>
      )}
    </>
  )
}
