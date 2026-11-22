import { ChevronDown, Info } from "lucide-react"
import { useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { FinancialMetricLabel } from "~/components/FinancialMetricLabel"
import Tooltip from "~/components/Tooltip"
import { Caption } from "~/components/ui"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { CURRENCIES, CURRENCY_DISPLAY_MODES } from "~/constants/money"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useBalanceAsOf } from "~/features/AccountManagement/data/useBalanceAsOf"
import { cn } from "~/lib/utils"
import {
  BALANCE_EXCLUSION_REASONS,
  BALANCE_PURPOSES,
  getDisplayBalancePortfolio,
  getPortfolioAsset,
} from "~/services/accounts/metrics/balanceProjection"
import { assetIdentity, type Asset } from "~/services/amounts/assets"
import {
  ASSET_KINDS,
  FINANCIAL_ACCOUNT_EXCLUSION_REASONS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import {
  getDisplayCurrency,
  getNextCurrencyDisplay,
} from "~/services/preferences/currencyDisplay"
import type { DisplaySiteData } from "~/types"
import {
  formatAssetAmount,
  formatBalanceAmount,
  getAssetLabel,
} from "~/utils/core/money"

import { AllowanceDetailsPopover } from "./AccountList/rows/AllowanceDetailsPopover"
import { getBalancePortfolioPresentation } from "./balancePortfolioPresentation"
import { FinancialAccountExclusions } from "./FinancialAccountExclusions"

/** Shared native-asset totals for the popup and filtered account groups. */
export function BalancePortfolioSummary({
  sites,
  compact = false,
  inline = false,
  overviewAction,
  showAccountBreakdown = false,
  allowCurrencyToggle = false,
}: {
  sites: DisplaySiteData[]
  compact?: boolean
  /** A small always-visible total beside the daily cashflow metrics. */
  inline?: boolean
  overviewAction?: ReactNode
  showAccountBreakdown?: boolean
  allowCurrencyToggle?: boolean
}) {
  const { t, i18n } = useTranslation([
    "account",
    "shareSnapshots",
    "common",
    "settings",
  ])
  const {
    currencyType,
    currencyDisplay = currencyType,
    updateCurrencyDisplay,
  } = useUserPreferencesContext()
  const displayCurrency = getDisplayCurrency(currencyDisplay, currencyType)
  const referenceCurrency = displayCurrency ?? CURRENCIES.USD
  const asOf = useBalanceAsOf(sites)
  const portfolio = useMemo(
    () => getDisplayBalancePortfolio(sites, BALANCE_PURPOSES.Available, asOf),
    [sites, asOf],
  )
  const quotaSiteNames = useMemo(() => {
    const namesByAsset = new Map<string, Set<string>>()
    for (const { site, positions } of portfolio.contributions) {
      for (const { asset, scope } of positions) {
        if (asset.kind !== ASSET_KINDS.Quota) continue
        const key = assetIdentity(getPortfolioAsset(asset, scope.authority))
        const names = namesByAsset.get(key) ?? new Set<string>()
        names.add(site.name)
        namesByAsset.set(key, names)
      }
    }
    return namesByAsset
  }, [portfolio])
  const {
    amounts,
    primary,
    primaryAmount,
    useConvertedPrimary,
    hasAdditionalAssetGroups,
    canToggleCurrency,
  } = getBalancePortfolioPresentation(
    portfolio,
    displayCurrency,
    allowCurrencyToggle,
  )
  const referenceText = portfolio.referenceUsd
    ? formatBalanceAmount(
        {
          asset: { kind: ASSET_KINDS.Currency, code: referenceCurrency },
          value: portfolio.referenceUsd[referenceCurrency],
        },
        i18n.language,
      )
    : undefined
  const primaryText = primaryAmount
    ? formatBalanceAmount(primaryAmount, i18n.language)
    : undefined
  const nextCurrencyDisplay = getNextCurrencyDisplay(currencyDisplay)
  const currencyToggleLabel = `${t("settings:display.currencyUnit")} · ${nextCurrencyDisplay === CURRENCY_DISPLAY_MODES.Original ? t("settings:display.original") : nextCurrencyDisplay}`
  const BalanceValue = canToggleCurrency ? "button" : "div"
  const assetLabel = (asset: Asset) => {
    if (asset.kind !== ASSET_KINDS.Quota) return getAssetLabel(asset)
    const names = quotaSiteNames.get(assetIdentity(asset))
    return names?.size ? [...names].join(" · ") : asset.label
  }
  const primaryLabel = useConvertedPrimary
    ? displayCurrency === CURRENCIES.USD
      ? t("account:financial.convertedToUsd")
      : t("account:financial.convertedToCny")
    : primary
      ? assetLabel(primary.asset)
      : ""
  const showCoverageHint = !compact && (inline || Boolean(overviewAction))
  const coverageLabel = `${t("account:financial.coverage", {
    included: portfolio.includedCount,
    eligible: portfolio.eligibleCount,
  })} · ${t("shareSnapshots:financial.partial")}`
  const coverageHint = showCoverageHint &&
    portfolio.coverage !== FINANCIAL_COVERAGE.Complete && (
      <Tooltip
        content={coverageLabel}
        anchorAsChild
        includeAccessibleDescription={false}
        openOnClick
      >
        <span
          tabIndex={0}
          aria-label={coverageLabel}
          className="inline-flex shrink-0 cursor-help rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info aria-hidden="true" className="size-3.5" />
        </span>
      </Tooltip>
    )
  const balanceLabel = t("account:financial.availableTotal")
  const renderAssets = () => (
    <dl className="divide-y divide-border/50">
      {amounts.map((amount) => (
        <div
          key={assetIdentity(amount.asset)}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2"
        >
          <dt className="min-w-0 break-words text-muted-foreground">
            {assetLabel(amount.asset)}
          </dt>
          <dd className="max-w-full font-medium break-words text-foreground tabular-nums">
            {formatAssetAmount(amount, i18n.language)}
          </dd>
        </div>
      ))}
    </dl>
  )
  return (
    <Collapsible
      role={showAccountBreakdown ? "group" : undefined}
      aria-label={showAccountBreakdown ? balanceLabel : undefined}
      className={cn(
        "min-w-0",
        inline
          ? "space-y-1 [@container(max-width:55.999rem)]:supports-[grid-template-rows:subgrid]:row-span-2 [@container(max-width:55.999rem)]:supports-[grid-template-rows:subgrid]:grid [@container(max-width:55.999rem)]:supports-[grid-template-rows:subgrid]:grid-rows-subgrid [@container(max-width:55.999rem)]:supports-[grid-template-rows:subgrid]:space-y-0 [@container(min-width:56rem)]:flex [@container(min-width:56rem)]:flex-wrap [@container(min-width:56rem)]:items-baseline [@container(min-width:56rem)]:gap-2 [@container(min-width:56rem)]:space-y-0"
          : compact
            ? showAccountBreakdown
              ? "space-y-1"
              : "flex flex-col gap-2"
            : "space-y-1.5",
      )}
    >
      {showAccountBreakdown && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h4 className="font-semibold">
            <FinancialMetricLabel kind={FINANCIAL_METRIC_KINDS.Balance}>
              {balanceLabel}
            </FinancialMetricLabel>
          </h4>
          {primary && (
            <CollapsibleTrigger className="group ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              {t("account:financial.assetCount", { total: amounts.length })}
              <ChevronDown
                aria-hidden="true"
                className="size-3.5 shrink-0 group-data-[state=open]:rotate-180"
              />
            </CollapsibleTrigger>
          )}
        </div>
      )}
      {(!compact || inline) && (
        <div className="flex items-center justify-between gap-2">
          <Caption
            className={cn(
              "font-medium",
              inline && "block min-h-8 [@container(min-width:30rem)]:min-h-4",
            )}
          >
            <FinancialMetricLabel
              kind={FINANCIAL_METRIC_KINDS.Balance}
              className={
                inline ? "pl-0 [@container(min-width:56rem)]:pl-5" : undefined
              }
              iconClassName={
                inline
                  ? "hidden [@container(min-width:56rem)]:block"
                  : undefined
              }
            >
              {balanceLabel}
            </FinancialMetricLabel>
          </Caption>
          {overviewAction}
        </div>
      )}
      <div
        aria-live="polite"
        className={cn(
          "min-w-0",
          showAccountBreakdown && "pl-5",
          compact ? "flex-1 space-y-1.5" : inline ? "space-y-1" : "space-y-0.5",
        )}
      >
        {primary ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 gap-y-1">
            <div className="flex max-w-full min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <BalanceValue
                {...(canToggleCurrency
                  ? {
                      type: "button",
                      "aria-label": `${primaryText}. ${currencyToggleLabel}`,
                      onClick: () =>
                        void updateCurrencyDisplay(nextCurrencyDisplay),
                    }
                  : {})}
                className={cn(
                  "tracking-tight text-foreground tabular-nums",
                  canToggleCurrency &&
                    "cursor-pointer rounded-sm hover:underline focus-visible:outline focus-visible:outline-ring",
                  inline
                    ? "text-sm font-medium"
                    : compact
                      ? "text-lg font-semibold"
                      : "text-2xl font-semibold",
                  "leading-tight",
                )}
                title={
                  primaryAmount &&
                  formatAssetAmount(primaryAmount, i18n.language)
                }
              >
                {compact && !inline && !showAccountBreakdown ? (
                  <FinancialMetricLabel kind={FINANCIAL_METRIC_KINDS.Balance}>
                    {primaryText}
                  </FinancialMetricLabel>
                ) : (
                  primaryText
                )}
              </BalanceValue>
              {(useConvertedPrimary || (!inline && amounts.length > 1)) && (
                <Caption
                  className="block min-w-0 truncate"
                  title={primaryLabel}
                >
                  {primaryLabel}
                </Caption>
              )}
              {portfolio.lastKnownCount > 0 && (
                <Caption>{t("account:financial.lastKnown")}</Caption>
              )}
            </div>
            {coverageHint}
            {!showAccountBreakdown &&
              (!inline || hasAdditionalAssetGroups) &&
              (!overviewAction || compact || hasAdditionalAssetGroups) && (
                <AllowanceDetailsPopover
                  label={t("account:financial.details")}
                  trigger={
                    amounts.length > 1
                      ? t("account:financial.assetCount", {
                          total: amounts.length,
                        })
                      : undefined
                  }
                  triggerClassName={
                    amounts.length > 1
                      ? cn(
                          "h-7 w-auto px-2",
                          inline && "h-5 px-0",
                          compact &&
                            "shrink-0 rounded-md border border-border/70 bg-card",
                        )
                      : undefined
                  }
                >
                  <h3 className="mb-2 text-sm font-semibold">
                    {t("account:financial.details")}
                  </h3>
                  {renderAssets()}
                </AllowanceDetailsPopover>
              )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            {!referenceText && t("account:financial.unavailable")}
            {coverageHint}
          </div>
        )}
        {referenceText !== undefined && (
          <Caption>
            {t("account:financial.lastKnown")} · {referenceText}
          </Caption>
        )}
        {showAccountBreakdown && primary && (
          <CollapsibleContent
            role="group"
            aria-label={t("account:financial.details")}
          >
            {renderAssets()}
          </CollapsibleContent>
        )}
        {compact && (
          <div className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 [&>span+span]:before:mr-2 [&>span+span]:before:content-['·']">
            <Caption>
              {t("account:financial.coverage", {
                included: portfolio.includedCount,
                eligible: portfolio.eligibleCount,
              })}{" "}
              ·{" "}
              {portfolio.coverage === FINANCIAL_COVERAGE.Complete
                ? t("shareSnapshots:financial.complete")
                : t("shareSnapshots:financial.partial")}
            </Caption>
            {portfolio.duplicateCount > 0 && (
              <Caption>
                {t("account:financial.duplicates", {
                  count: portfolio.duplicateCount,
                })}
              </Caption>
            )}
            {portfolio.potentialDuplicateCount > 0 && (
              <Caption>
                {t("account:financial.potentialDuplicates", {
                  count: portfolio.potentialDuplicateCount,
                })}
              </Caption>
            )}
            {portfolio.manualCount > 0 && (
              <Caption>{t("account:financial.manualContribution")}</Caption>
            )}
            {portfolio.conflictCount > 0 && (
              <Caption>
                {t("account:financial.conflicts", {
                  count: portfolio.conflictCount,
                })}
              </Caption>
            )}
          </div>
        )}
        {showAccountBreakdown && portfolio.excludedAccounts.length > 0 && (
          <FinancialAccountExclusions
            sites={sites}
            entries={portfolio.excludedAccounts}
            labels={{
              [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Disabled]: t(
                "common:status.disabled",
              ),
              [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Settings]: t(
                "account:financial.exclusions.settings",
              ),
              [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.NoBalance]: t(
                "account:financial.exclusions.noBalance",
              ),
              [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Duplicate]: t(
                "account:netInflow.reasons.duplicate",
              ),
              [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Conflict]: t(
                "account:netInflow.reasons.conflict",
              ),
              [BALANCE_EXCLUSION_REASONS.Legacy]: t("account:financial.legacy"),
              [BALANCE_EXCLUSION_REASONS.Restricted]: t(
                "account:financial.restricted",
              ),
              [BALANCE_EXCLUSION_REASONS.ScopeUnknown]: t(
                "account:financial.scopeUnknown",
              ),
              [BALANCE_EXCLUSION_REASONS.Validity]: t(
                "account:financial.exclusions.balanceValidity",
              ),
              [BALANCE_EXCLUSION_REASONS.Observation]: t(
                "account:financial.exclusions.noBalance",
              ),
              [BALANCE_EXCLUSION_REASONS.Asset]: t(
                "account:financial.exclusions.noBalance",
              ),
              [BALANCE_EXCLUSION_REASONS.Role]: t(
                "account:financial.exclusions.noBalance",
              ),
              [BALANCE_EXCLUSION_REASONS.Nature]: t(
                "account:financial.exclusions.noBalance",
              ),
              [BALANCE_EXCLUSION_REASONS.Overlap]: t(
                "account:financial.exclusions.noBalance",
              ),
            }}
          />
        )}
      </div>
    </Collapsible>
  )
}
