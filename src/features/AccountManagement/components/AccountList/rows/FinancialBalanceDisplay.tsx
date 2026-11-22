import { ClockAlert, History, RotateCcw } from "lucide-react"
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type PointerEventHandler,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import { CURRENCIES } from "~/constants/money"
import { useBalanceAsOf } from "~/features/AccountManagement/data/useBalanceAsOf"
import {
  accountAllowanceEntryKey,
  type AccountAllowanceSnapshot,
} from "~/services/accounts/allowances"
import { getDisplayBalancePositions } from "~/services/accounts/metrics/balanceProjection"
import {
  balancePositionKey,
  isKnownOrStaleObservation,
  type Amount,
  type BalancePosition,
  type BalanceSnapshot,
} from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_RELATIONS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_AMOUNT_FIELDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import type { CurrencyType } from "~/types"
import {
  getBalanceObservationDescription,
  getBalanceQualifiers,
  getBalanceRoleLabel,
} from "~/utils/core/balancePresentation"
import {
  formatAllowanceLabel,
  formatBudgetAmount,
  getBudgetAmountStatus,
} from "~/utils/core/budgetPresentation"
import {
  convertCurrencyAmount,
  formatAssetAmount,
  formatBalanceAmount,
} from "~/utils/core/money"

import { AccountAllowanceDetails } from "./AccountAllowanceDetails"
import { AllowanceDetailsPopover } from "./AllowanceDetailsPopover"
import { BalancePositionDetails } from "./BalancePositionDetails"

const BALANCE_OBSERVATION_STATES = {
  LastKnown: "last-known",
  Expired: "expired",
  Reset: "reset",
} as const

type BalanceObservation = {
  label: string
  state: (typeof BALANCE_OBSERVATION_STATES)[keyof typeof BALANCE_OBSERVATION_STATES]
}

/** Only amounts with a known asset and a usable observation can be displayed. */
function readableBalanceAmount(position: BalancePosition): Amount | undefined {
  const { amount, asset } = position
  return asset.kind !== ASSET_KINDS.Unknown && isKnownOrStaleObservation(amount)
    ? { value: amount.value, asset }
    : undefined
}

/** Cached observations and elapsed balance deadlines retain distinct meanings. */
function ObservationIndicator({ label, state }: BalanceObservation) {
  const Icon =
    state === BALANCE_OBSERVATION_STATES.Expired
      ? ClockAlert
      : state === BALANCE_OBSERVATION_STATES.Reset
        ? RotateCcw
        : History
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex ${state === BALANCE_OBSERVATION_STATES.LastKnown ? "text-muted-foreground" : "text-warning-text"}`}
    >
      <Icon className="size-3" strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Amounts share a right edge and a fixed first-line height with their status and details. */
function BalanceValueRow({
  amount,
  exactAmount = amount,
  showNativeTitle = true,
  amountRef,
  onAmountPointerEnter,
  label,
  ariaLabel,
  primary,
  unavailable = false,
  observation,
  children,
}: {
  amount: string
  exactAmount?: string
  showNativeTitle?: boolean
  amountRef?: Ref<HTMLSpanElement>
  onAmountPointerEnter?: PointerEventHandler<HTMLSpanElement>
  label?: string
  ariaLabel: string
  primary: boolean
  unavailable?: boolean
  observation?: BalanceObservation
  children?: ReactNode
}) {
  return (
    <span
      role="group"
      aria-label={ariaLabel}
      aria-description={showNativeTitle ? undefined : exactAmount}
      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_0.75rem] items-start gap-x-1 text-right"
    >
      <span className="flex max-w-full min-w-0 flex-row-reverse flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          ref={amountRef}
          onPointerEnter={onAmountPointerEnter}
          className={`block max-w-full shrink-0 leading-5 tracking-tight break-words whitespace-normal tabular-nums ${primary ? "text-base" : "text-sm"} ${unavailable ? "font-normal text-muted-foreground group-hover/balance:text-foreground" : primary ? "font-semibold" : "font-medium"}`}
          title={showNativeTitle ? exactAmount : undefined}
        >
          {amount}
        </span>
        {label && (
          <span className="max-w-full shrink-0 text-xs leading-4 font-normal break-words text-muted-foreground">
            {label}
          </span>
        )}
      </span>
      <span
        className="flex h-5 w-3 items-center justify-center"
        aria-hidden={!observation}
      >
        {observation && <ObservationIndicator {...observation} />}
      </span>
      {children}
    </span>
  )
}

/** Shared account surface for native assets, incomplete observations and their provenance. */
export function FinancialBalanceDisplay({
  snapshot,
  manual,
  allowances,
  disabled,
  refreshing,
  busy = refreshing,
  onRefresh,
  usageDetails,
  currencyType,
  exchangeRate,
}: {
  snapshot?: BalanceSnapshot
  allowances?: AccountAllowanceSnapshot
  manual?: BalanceSnapshot
  disabled: boolean
  refreshing: boolean
  busy?: boolean
  onRefresh: () => void
  usageDetails?: ReactNode
  currencyType?: CurrencyType
  exchangeRate?: number
}) {
  const { t, i18n } = useTranslation("account")
  const refreshDescriptionId = useId()
  const [firstAmount, setFirstAmount] = useState<HTMLSpanElement | null>(null)
  const [hoveredAmount, setHoveredAmount] = useState<HTMLSpanElement | null>(
    null,
  )
  const handleAmountPointerEnter = useCallback<
    PointerEventHandler<HTMLSpanElement>
  >((event) => setHoveredAmount(event.currentTarget), [])
  // Pass the element itself so an already-open hint follows amount changes.
  const positionAnchor = hoveredAmount ?? firstAmount
  const timeSources = useMemo(
    () => [
      { balanceSnapshot: snapshot, manualBalanceSnapshot: manual, allowances },
    ],
    [snapshot, manual, allowances],
  )
  const asOf = useBalanceAsOf(timeSources)
  useLayoutEffect(() => {
    // Data/time updates can remove a secondary amount without replacing the primary.
    if (hoveredAmount && !hoveredAmount.isConnected) setHoveredAmount(null)
  }, [hoveredAmount, firstAmount, snapshot, manual, allowances, asOf])
  const displayed = getDisplayBalancePositions(manual ?? snapshot)
  const readablePositions = displayed.map((position) => ({
    position,
    value: readableBalanceAmount(position),
    observation: getPositionObservation(position),
  }))
  const hasReadableBalance = readablePositions.some(
    ({ value }) => value !== undefined,
  )
  const inlinePositions = (
    hasReadableBalance
      ? readablePositions.filter(({ value }) => value !== undefined)
      : readablePositions
  ).slice(0, !hasReadableBalance && allowances?.entries.length ? 1 : 2)
  const inlineAllowances = hasReadableBalance
    ? []
    : (allowances?.entries.slice(0, Math.max(0, 2 - inlinePositions.length)) ??
      [])
  const extraCount =
    displayed.length +
    (allowances?.entries.length ?? 0) -
    inlinePositions.length -
    inlineAllowances.length
  const displayAmount = (value: Amount) =>
    formatBalanceAmount(value, i18n.language, currencyType, exchangeRate, {
      maximumIntegerDigits: 4,
    })
  const fullAmount = (value: Amount, converted = false) => {
    if (value.asset.kind === ASSET_KINDS.Quota)
      return formatAssetAmount(
        {
          ...value,
          asset: {
            ...value.asset,
            displayScale: 1,
            displayLabel: value.asset.label,
          },
        },
        i18n.language,
      )
    return formatAssetAmount(
      converted
        ? convertCurrencyAmount(value, currencyType, exchangeRate)
        : value,
      i18n.language,
    )
  }
  /** Expiry takes precedence over reset and the observation's cached status. */
  function getPositionObservation(
    p: BalancePosition,
  ): BalanceObservation | undefined {
    if (
      p.validity.kind === BALANCE_VALIDITY_KINDS.Expires &&
      p.validity.at <= asOf
    )
      return {
        label: t("balanceHistory:native.expired"),
        state: BALANCE_OBSERVATION_STATES.Expired,
      }
    if (p.window?.resetsAt !== undefined && p.window.resetsAt <= asOf)
      return {
        label: `${t("balanceHistory:native.reset")} · ${t("financial.lastKnown")}`,
        state: BALANCE_OBSERVATION_STATES.Reset,
      }
    if (p.amount.status === OBSERVATION_STATUSES.Stale)
      return {
        label: t("financial.lastKnown"),
        state: BALANCE_OBSERVATION_STATES.LastKnown,
      }
    return undefined
  }
  const showFullAmountHint =
    hasReadableBalance ||
    inlineAllowances.some(
      (entry) =>
        entry.constraint.asset.kind !== ASSET_KINDS.Unknown &&
        isKnownOrStaleObservation(entry.constraint.remaining),
    )
  const allowanceObservation = (
    entry: AccountAllowanceSnapshot["entries"][number],
  ): BalanceObservation | undefined => {
    if (
      entry.validity.kind === BALANCE_VALIDITY_KINDS.Expires &&
      entry.validity.at <= asOf
    )
      return {
        label: t("balanceHistory:native.expired"),
        state: BALANCE_OBSERVATION_STATES.Expired,
      }
    if (
      "resetsAt" in entry.constraint.window &&
      entry.constraint.window.resetsAt !== undefined &&
      entry.constraint.window.resetsAt <= asOf
    )
      return {
        label: `${t("balanceHistory:native.reset")} · ${t("financial.lastKnown")}`,
        state: BALANCE_OBSERVATION_STATES.Reset,
      }
    if (
      getBudgetAmountStatus(
        entry.constraint,
        BUDGET_AMOUNT_FIELDS.Remaining,
      ) === OBSERVATION_STATUSES.Stale
    )
      return {
        label: t("financial.lastKnown"),
        state: BALANCE_OBSERVATION_STATES.LastKnown,
      }
    return undefined
  }
  const allowanceInactive = (
    entry: AccountAllowanceSnapshot["entries"][number],
  ) =>
    isKnownOrStaleObservation(entry.constraint.enabled) &&
    !entry.constraint.enabled.value
  const allowanceStatus = (
    entry: AccountAllowanceSnapshot["entries"][number],
  ) =>
    [
      allowanceObservation(entry)?.label,
      allowanceInactive(entry)
        ? [
            entry.constraint.enabled.status === OBSERVATION_STATUSES.Stale
              ? t("financial.lastKnown")
              : undefined,
            t("stats.subscriptionState.inactive"),
          ]
            .filter(Boolean)
            .join(" · ")
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ")
  const hintEntries = showFullAmountHint
    ? [
        ...inlinePositions.map(({ position: p, value, observation }) => ({
          key: balancePositionKey(p),
          label: p.label ?? getBalanceRoleLabel(p, t),
          native: value ? fullAmount(value) : t("financial.unavailable"),
          converted: value
            ? fullAmount(value, true)
            : t("financial.unavailable"),
          status: observation?.label,
          description: getBalanceObservationDescription(p, t),
          observedAt:
            observation &&
            isKnownOrStaleObservation(p.amount) &&
            Number.isFinite(new Date(p.amount.observedAt).getTime())
              ? p.amount.observedAt
              : undefined,
        })),
        ...inlineAllowances.map((entry) => ({
          key: accountAllowanceEntryKey(entry),
          label: formatAllowanceLabel(entry, t),
          native: formatBudgetAmount(
            entry.constraint,
            BUDGET_AMOUNT_FIELDS.Remaining,
            t,
            false,
            { showStatus: false, formatAmount: (value) => fullAmount(value) },
          ),
          converted: formatBudgetAmount(
            entry.constraint,
            BUDGET_AMOUNT_FIELDS.Remaining,
            t,
            false,
            {
              showStatus: false,
              formatAmount: (value) => fullAmount(value, true),
            },
          ),
          status: allowanceStatus(entry),
          description: undefined,
          observedAt: undefined,
        })),
      ]
    : []
  const amountHint = (
    <div className="grid max-w-64 gap-2 text-left whitespace-normal">
      <span className="font-medium">{t("financial.exactAmount")}</span>
      {hintEntries.map((entry) => (
        <div key={entry.key} className="grid gap-0.5">
          {hintEntries.length > 1 && (
            <span className="font-medium">{entry.label}</span>
          )}
          {entry.converted !== entry.native && (
            <span className="break-all tabular-nums">
              {currencyType === CURRENCIES.USD
                ? t("financial.convertedToUsd")
                : t("financial.convertedToCny")}{" "}
              · {entry.converted}
            </span>
          )}
          <span className="break-all tabular-nums">{entry.native}</span>
          {entry.status && <span>{entry.status}</span>}
          {entry.description && <span>{entry.description}</span>}
          {entry.observedAt !== undefined && (
            <time dateTime={new Date(entry.observedAt).toISOString()}>
              {t("financial.observedAt")}:{" "}
              {new Date(entry.observedAt).toLocaleString(i18n.language)}
            </time>
          )}
        </div>
      ))}
      <span className="text-inverse-foreground/70 dark:text-muted-foreground">
        {disabled
          ? t("list.site.disabled")
          : refreshing
            ? t("common:status.refreshing")
            : t("list.balance.refreshBalance")}
      </span>
    </div>
  )
  const withAmountHint = (trigger: ReactElement) => (
    <Tooltip
      content={
        showFullAmountHint
          ? amountHint
          : disabled
            ? t("list.site.disabled")
            : refreshing
              ? t("common:status.refreshing")
              : t("list.balance.refreshBalance")
      }
      wrapperClassName="w-full"
      position="top-end"
      positionAnchor={positionAnchor}
    >
      {trigger}
    </Tooltip>
  )
  return (
    <div className="col-span-full grid w-full min-w-0 grid-cols-[minmax(0,1fr)_1.25rem] items-start gap-x-1 @max-sm/account-row:col-span-1 @max-sm/account-row:col-start-3 @max-sm/account-row:row-start-1 @max-sm/account-row:self-start">
      <div className="min-w-0 text-right">
        {withAmountHint(
          <Button
            variant="ghost"
            size="sm"
            className="group/balance ml-auto h-auto min-h-0 w-full max-w-full flex-col items-end gap-1 bg-transparent px-0 py-0 text-sm leading-tight hover:bg-transparent hover:text-foreground hover:opacity-80 dark:hover:bg-transparent"
            disabled={disabled || refreshing}
            aria-busy={busy || undefined}
            aria-describedby={refreshDescriptionId}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible"))
                setHoveredAmount(null)
            }}
            title={
              showFullAmountHint
                ? undefined
                : disabled
                  ? t("list.site.disabled")
                  : t("list.balance.refreshBalance")
            }
            onClick={onRefresh}
          >
            {displayed.length ? (
              inlinePositions.map(
                ({ position: p, value, observation }, index) => {
                  const displayedValue = value
                    ? displayAmount(value)
                    : t("financial.unavailable")
                  const fullValue =
                    value && showFullAmountHint
                      ? fullAmount(value)
                      : displayedValue
                  const roleLabel = getBalanceRoleLabel(p, t)
                  const statusLabel =
                    observation?.label ??
                    (p.amount.status === OBSERVATION_STATUSES.Known
                      ? t("financial.observed")
                      : t("financial.unavailable"))
                  return (
                    <BalanceValueRow
                      key={balancePositionKey(p)}
                      amount={displayedValue}
                      amountRef={index === 0 ? setFirstAmount : undefined}
                      onAmountPointerEnter={handleAmountPointerEnter}
                      exactAmount={fullValue}
                      showNativeTitle={!showFullAmountHint}
                      ariaLabel={[
                        p.label,
                        roleLabel,
                        displayedValue,
                        statusLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      label={
                        p.label ??
                        (p.relation === BALANCE_RELATIONS.Component
                          ? [
                              roleLabel,
                              ...getBalanceQualifiers(p, t, {
                                includeClassification: false,
                              }),
                            ].join(" · ")
                          : roleLabel === t("financial.available")
                            ? undefined
                            : roleLabel)
                      }
                      primary={index === 0}
                      unavailable={value === undefined}
                      observation={observation}
                    />
                  )
                },
              )
            ) : !allowances?.entries.length ? (
              <BalanceValueRow
                amount={t("financial.unavailable")}
                amountRef={setFirstAmount}
                onAmountPointerEnter={handleAmountPointerEnter}
                ariaLabel={t("financial.unavailable")}
                primary
                unavailable
              />
            ) : null}
            {inlineAllowances.map((entry, index) => {
              const observation = allowanceObservation(entry)
              const value = formatBudgetAmount(
                entry.constraint,
                BUDGET_AMOUNT_FIELDS.Remaining,
                t,
                true,
                { showStatus: false, formatAmount: displayAmount },
              )
              return (
                <BalanceValueRow
                  key={accountAllowanceEntryKey(entry)}
                  amount={value}
                  amountRef={
                    inlinePositions.length === 0 && index === 0
                      ? setFirstAmount
                      : undefined
                  }
                  onAmountPointerEnter={handleAmountPointerEnter}
                  exactAmount={formatBudgetAmount(
                    entry.constraint,
                    BUDGET_AMOUNT_FIELDS.Remaining,
                    t,
                    false,
                    { showStatus: false },
                  )}
                  showNativeTitle={!showFullAmountHint}
                  ariaLabel={[
                    formatAllowanceLabel(entry, t),
                    value,
                    allowanceStatus(entry),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  label={formatAllowanceLabel(entry, t)}
                  primary={inlinePositions.length === 0 && index === 0}
                  unavailable={value === t("common:labels.notAvailable")}
                  observation={observation}
                >
                  {allowanceInactive(entry) && (
                    <span className="col-span-2 text-xs font-normal text-warning-text">
                      {t("stats.subscriptionState.inactive")}
                    </span>
                  )}
                </BalanceValueRow>
              )
            })}
          </Button>,
        )}
        <span id={refreshDescriptionId} className="sr-only">
          {disabled
            ? t("list.site.disabled")
            : t("list.balance.refreshBalance")}
        </span>
        {manual && (
          <p className="text-xs text-muted-foreground">
            {t("financial.manual")}
          </p>
        )}
      </div>
      {!!(
        manual?.positions.length ||
        snapshot?.positions.length ||
        allowances?.entries.length ||
        usageDetails
      ) && (
        <AllowanceDetailsPopover
          label={t("financial.details")}
          trigger={extraCount > 0 ? `+${extraCount}` : undefined}
        >
          <h3 className="border-b border-border/50 pb-2 text-sm font-semibold">
            {t("financial.details")}
          </h3>
          {manual?.positions.length ? (
            <section aria-label={t("financial.manual")} className="mt-3">
              <h4 className="text-sm font-medium">{t("financial.manual")}</h4>
              <dl className="mt-1">
                {manual.positions.map((position) => (
                  <BalancePositionDetails
                    key={balancePositionKey(position)}
                    position={position}
                    asOf={asOf}
                  />
                ))}
              </dl>
            </section>
          ) : null}
          {manual && !!snapshot?.positions.length && (
            <p className="mt-3 border-t border-border/50 pt-2">
              {t("financial.manualSelection")}
            </p>
          )}
          <dl className="mt-1">
            {snapshot?.positions.map((p) => (
              <BalancePositionDetails
                key={balancePositionKey(p)}
                position={p}
                asOf={asOf}
              />
            ))}
          </dl>
          {allowances && <AccountAllowanceDetails snapshot={allowances} />}
          {usageDetails && (
            <section className="mt-4 border-t border-border pt-3">
              <h3 className="mb-2 font-medium">
                {t("financial.usageDetails")}
              </h3>
              {usageDetails}
            </section>
          )}
        </AllowanceDetailsPopover>
      )}
    </div>
  )
}
