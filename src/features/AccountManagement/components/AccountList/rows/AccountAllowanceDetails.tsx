import { useTranslation } from "react-i18next"

import type { AccountSiteType } from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import type { AccountBalanceComponent, AccountNativeBalance } from "~/types"

import { AllowanceDetailsPopover } from "./AllowanceDetailsPopover"

/** Calendar dates retain their day; instants are shown in the user's timezone. */
function formatAllowanceTime(value: string) {
  const date = new Date(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? date.toLocaleDateString(undefined, { timeZone: "UTC" })
    : date.toLocaleString()
}

/** Read-only scoped USD allowance details, independent of account refresh state. */
export function AccountAllowanceDetails({
  nativeBalance,
  siteType,
}: {
  nativeBalance: Extract<AccountNativeBalance, { unit: "credits" | "USD" }>
  siteType?: AccountSiteType
}) {
  const { t } = useTranslation("account")
  const isNovita = siteType
    ? getAccountSiteDefinition(siteType)?.balanceDetailsCopy === "novita"
    : false
  const label = isNovita
    ? t("stats.novitaBalance.title")
    : t("stats.allowances")
  const componentLabel = (component: AccountBalanceComponent) => {
    // Match the adapter's existing stored components, including accounts saved
    // before these provider-specific labels were introduced.
    if (isNovita && component.kind === "permanent") {
      if (component.name === "Credit limit")
        return t("stats.novitaBalance.creditLimit")
      if (!component.name) return t("stats.novitaBalance.cash")
    }
    return (
      component.name ??
      t(
        component.kind === "permanent"
          ? "stats.permanentAllowance"
          : component.kind === "timed"
            ? "stats.timedAllowance"
            : component.kind === "group"
              ? "stats.groupAllowance"
              : "stats.subscriptionTitle",
      )
    )
  }
  return (
    <AllowanceDetailsPopover label={label}>
      <p className="text-foreground font-medium">{label}</p>
      <p className="my-2">
        {isNovita
          ? t("stats.novitaBalance.description")
          : t("stats.scopedAllowances")}
      </p>
      {nativeBalance.timedDetailsUnavailable && (
        <p role="status" className="my-2">
          {t("stats.timedDetailsUnavailable")}
        </p>
      )}
      <dl className="space-y-2 text-left">
        {isNovita && (
          <div>
            <dt className="font-medium">
              {t("stats.novitaBalance.available")}
            </dt>
            <dd>
              $
              {nativeBalance.total.toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}
            </dd>
          </div>
        )}
        {(nativeBalance.components ?? []).map((component, index) => (
          <div key={index}>
            <dt className="font-medium">{componentLabel(component)}</dt>
            <dd>
              {component.unlimited
                ? t("common:quota.unlimited")
                : `$${component.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}`}
            </dd>
            {component.scope && (
              <dd>{t("stats.allowanceScope", { scope: component.scope })}</dd>
            )}
            {!!component.unlockedModels?.length && (
              <dd>
                {t("stats.unlockedModels", {
                  models: component.unlockedModels.join(", "),
                })}
              </dd>
            )}
            {component.expiresAt && (
              <dd>
                {t("stats.allowanceExpiry", {
                  time: formatAllowanceTime(component.expiresAt),
                })}
              </dd>
            )}
            {component.resetAt && (
              <dd>
                {t("stats.allowanceReset", {
                  time: formatAllowanceTime(component.resetAt),
                })}
              </dd>
            )}
            {component.kind === "timed" &&
              !!nativeBalance?.timedDetails?.length && (
                <dd>
                  <dl className="border-border mt-2 space-y-2 border-l pl-3">
                    {nativeBalance.timedDetails.map((grant, index) => (
                      <div key={index}>
                        <dt>{grant.name ?? t("stats.timedAllowance")}</dt>
                        <dd>
                          ${grant.amount}
                          {grant.scope ? ` · ${grant.scope}` : ""}
                        </dd>
                        {grant.expiresAt && (
                          <dd>
                            {t("stats.allowanceExpiry", {
                              time: formatAllowanceTime(grant.expiresAt),
                            })}
                          </dd>
                        )}
                      </div>
                    ))}
                  </dl>
                </dd>
              )}
          </div>
        ))}
      </dl>
    </AllowanceDetailsPopover>
  )
}
