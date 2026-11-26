import { Building2 } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { AccountSiteTypeIcon } from "~/components/icons/productIcons"
import {
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  ACCOUNT_SITE_TYPES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementSiteTypeOptionTestId,
} from "~/features/AccountManagement/testIds"

import { AccountFormSection } from "./AccountFormSection"
import {
  ACCOUNT_FORM_MOBILE_DEFAULT_OPEN,
  ACCOUNT_FORM_SECTION_ELEMENT_IDS,
  ACCOUNT_FORM_SECTIONS,
} from "./accountFormSections"
import type { AccountFormFieldAttributes } from "./useAccountFormFeedback"

const ACCOUNT_FORM_SITE_TYPE_OPTIONS = ACCOUNT_SITE_TYPES.filter(
  (siteType) => siteType !== SITE_TYPES.UNKNOWN,
)

/** Site metadata and the identity fields assigned to the site section. */
export function AccountSiteSection({
  continuous,
  siteInfoInput,
  siteName,
  siteType,
  onSiteNameChange,
  onSiteTypeChange,
  validation,
  feedback,
  children,
}: {
  continuous?: boolean
  siteInfoInput?: ReactNode
  siteName: string
  siteType: AccountSiteType
  onSiteNameChange: (value: string) => void
  onSiteTypeChange: (value: string) => void
  validation: AccountFormFieldAttributes
  feedback: ReactNode
  children?: ReactNode
}) {
  const { t } = useTranslation(["accountDialog", "common"])
  return (
    <AccountFormSection
      continuous={continuous}
      id={ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.SITE_INFO]}
      contentClassName={
        continuous
          ? "grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4"
          : undefined
      }
      title={t("sections.siteInfo.title")}
      defaultOpen={
        ACCOUNT_FORM_MOBILE_DEFAULT_OPEN[ACCOUNT_FORM_SECTIONS.SITE_INFO]
      }
      testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionSiteInfo}
    >
      {siteInfoInput && (
        <div className="col-span-full space-y-density-2">{siteInfoInput}</div>
      )}
      <FormField label={t("form.siteName")} required>
        <Input
          type="text"
          value={siteName}
          onChange={(e) => onSiteNameChange(e.target.value)}
          placeholder="example.com"
          leftIcon={<Building2 className="h-5 w-5" aria-hidden="true" />}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput}
          {...validation}
          required
        />
        {feedback}
      </FormField>

      <FormField label={t("form.siteType")}>
        <Select
          value={siteType ?? SITE_TYPES.UNKNOWN}
          onValueChange={onSiteTypeChange}
        >
          <SelectTrigger
            className="w-full"
            aria-label={t("form.siteType")}
            title={t("form.siteType")}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger}
            data-site-type={siteType ?? SITE_TYPES.UNKNOWN}
          >
            <div className="flex items-center gap-x-2 gap-y-density-2">
              <AccountSiteTypeIcon
                className="h-5 w-5 text-muted-foreground"
                aria-hidden="true"
              />
              <SelectValue placeholder={t("form.siteType")} />
            </div>
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_FORM_SITE_TYPE_OPTIONS.map((siteType) => (
              <SelectItem
                key={siteType}
                value={siteType}
                data-testid={getAccountManagementSiteTypeOptionTestId(siteType)}
              >
                {siteType}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {children}
    </AccountFormSection>
  )
}
