import { useTranslation } from "react-i18next"

import type { AccountNativeBalance } from "~/types"

import { AllowanceDetailsPopover } from "./AllowanceDetailsPopover"

/** Read-only scoped USD allowance details, independent of account refresh state. */
export function AccountAllowanceDetails({
  nativeBalance,
}: {
  nativeBalance: Extract<AccountNativeBalance, { unit: "credits" | "USD" }>
}) {
  const { t } = useTranslation("account")
  return (
    <AllowanceDetailsPopover label={t("stats.allowances")}>
      <p className="text-foreground font-medium">{t("stats.allowances")}</p>
      <p className="my-2">{t("stats.scopedAllowances")}</p>
      {nativeBalance.timedDetailsUnavailable && (
        <p role="status" className="my-2">
          {t("stats.timedDetailsUnavailable")}
        </p>
      )}
      <dl className="space-y-2 text-left">
        {(nativeBalance.components ?? []).map((component, index) => (
          <div key={index}>
            <dt className="font-medium">
              {component.name ??
                t(
                  component.kind === "permanent"
                    ? "stats.permanentAllowance"
                    : component.kind === "timed"
                      ? "stats.timedAllowance"
                      : component.kind === "group"
                        ? "stats.groupAllowance"
                        : "stats.subscriptionTitle",
                )}
            </dt>
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
                  time: new Date(component.expiresAt).toLocaleString(),
                })}
              </dd>
            )}
            {component.resetAt && (
              <dd>
                {t("stats.allowanceReset", {
                  time: new Date(component.resetAt).toLocaleString(),
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
                              time: new Date(grant.expiresAt).toLocaleString(),
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
