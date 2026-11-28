import { Globe, ScanSearch } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { FieldHelpPopover } from "~/components/FieldHelpPopover"
import {
  Button,
  BUTTON_LOADING_BEHAVIORS,
  FormField,
  InlineMessage,
  Input,
} from "~/components/ui"
import type { AccountSiteType } from "~/constants/siteType"
import { getDeploymentCheckInPagePath } from "~/services/accountSiteDefinitions"
import { normalizeCheckInPagePath } from "~/services/checkin/autoCheckin/configuration/nativePagePath"
import type { CheckInConfig } from "~/types/checkIn"
import { createTab } from "~/utils/browser/tabs"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import { NativeCheckInPageCandidates } from "./NativeCheckInPageCandidates"
import {
  NATIVE_PAGE_DISCOVERY_STATUSES,
  useNativeCheckInPageDiscovery,
  type NativePageDiscoveryIdentity,
} from "./useNativeCheckInPageDiscovery"

const CHECK_IN_PAGE_FIELD_IDS = {
  Path: "account-check-in-page-path",
  Find: "account-find-check-in-page",
} as const

/** A page destination is independent of API routes and external welfare bookmarks. */
export function AccountCheckInPageField({
  checkIn,
  onCheckInChange,
  siteUrl = "",
  siteType,
  discoveryEnabled = false,
  discoveryIdentity,
}: {
  checkIn: CheckInConfig
  onCheckInChange: (value: CheckInConfig) => void
  siteUrl?: string
  siteType?: AccountSiteType
  discoveryEnabled?: boolean
  discoveryIdentity?: NativePageDiscoveryIdentity
}) {
  const { t } = useTranslation("accountDialog")
  const candidateId = useId()
  const savedPath = checkIn.nativePagePath ?? ""
  const [value, setValue] = useState(savedPath)
  useEffect(() => setValue(savedPath), [savedPath])
  const discovery = useNativeCheckInPageDiscovery({
    siteUrl,
    siteType,
    nativePagePath: checkIn.nativePagePath,
    identity: discoveryIdentity,
  })
  const [openFailed, setOpenFailed] = useState(false)
  const openAttempt = useRef(0)
  useEffect(() => {
    openAttempt.current += 1
    setOpenFailed(false)
    return () => {
      openAttempt.current += 1
    }
  }, [siteUrl, savedPath, discovery.result])
  const clearOpenFailure = () => {
    openAttempt.current += 1
    setOpenFailed(false)
  }
  const openCandidate = (path: string) => {
    clearOpenFailure()
    const attempt = openAttempt.current
    const origin = tryParseHttpUrl(siteUrl)?.origin
    if (origin)
      void createTab(new URL(path, origin).href).catch(() => {
        if (openAttempt.current === attempt) setOpenFailed(true)
      })
  }
  const error =
    value !== "" && !normalizeCheckInPagePath(value)
      ? t("form.checkInPagePathInvalid")
      : undefined
  const defaultPath =
    value === "" ? getDeploymentCheckInPagePath(siteType, siteUrl) : undefined
  const setPath = (text: string) => {
    clearOpenFailure()
    discovery.cancel(false)
    setValue(text)
    if (text !== "" && !normalizeCheckInPagePath(text)) return
    onCheckInChange({ ...checkIn, nativePagePath: text || undefined })
  }
  const candidates =
    discovery.result?.candidates.filter((candidate) =>
      normalizeCheckInPagePath(candidate.path),
    ) ?? []

  return (
    <FormField
      wrapLabelAction
      label={t("form.checkInPagePath")}
      description={
        defaultPath
          ? t("form.checkInPagePathDeploymentDefault", { path: defaultPath })
          : undefined
      }
      labelAccessory={
        <FieldHelpPopover
          label={t("form.checkInPagePathHelp")}
          content={t("form.checkInPagePathDesc")}
        />
      }
      labelAction={
        discoveryEnabled && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0 text-link"
            id={CHECK_IN_PAGE_FIELD_IDS.Find}
            leftIcon={<ScanSearch className="size-3.5" />}
            loading={discovery.running}
            loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
            disabled={Boolean(error) || !siteType || !tryParseHttpUrl(siteUrl)}
            onClick={() => {
              clearOpenFailure()
              if (discovery.running) discovery.cancel()
              else void discovery.find()
            }}
          >
            {t(
              discovery.running
                ? "form.findCheckInPageCancel"
                : "form.findCheckInPage",
            )}
          </Button>
        )
      }
      error={error}
      htmlFor={CHECK_IN_PAGE_FIELD_IDS.Path}
    >
      {(control) => (
        <>
          <Input
            {...control}
            ref={(node) => {
              node?.setCustomValidity(error ?? "")
            }}
            id={CHECK_IN_PAGE_FIELD_IDS.Path}
            type="text"
            value={value}
            aria-invalid={Boolean(error)}
            onChange={(event) => setPath(event.target.value)}
            onClear={() => setPath("")}
            placeholder={t("form.checkInPagePathPlaceholder")}
            leftIcon={<Globe className="h-5 w-5" />}
            containerClassName="w-full"
          />
          {discovery.running && (
            <InlineMessage size="sm">
              {t("form.findCheckInPageRunning")}
            </InlineMessage>
          )}
          {!discovery.running &&
            discovery.status !== NATIVE_PAGE_DISCOVERY_STATUSES.Idle && (
              <InlineMessage
                size="sm"
                tone={
                  discovery.status === NATIVE_PAGE_DISCOVERY_STATUSES.Failed
                    ? "warning"
                    : "neutral"
                }
                role={
                  discovery.status === NATIVE_PAGE_DISCOVERY_STATUSES.Failed
                    ? "alert"
                    : "status"
                }
              >
                {discovery.status === NATIVE_PAGE_DISCOVERY_STATUSES.Failed
                  ? t("form.findCheckInPageFailed")
                  : t("form.findCheckInPageCancelled")}
              </InlineMessage>
            )}
          {discovery.result && (
            <div className="space-y-density-2 pt-density-1">
              <InlineMessage size="sm" icon={null}>
                {candidates.length
                  ? t("form.findCheckInPageReview")
                  : t("form.findCheckInPageEmpty")}
                {!discovery.result.complete && (
                  <span className="mt-density-1 block">
                    {t("form.findCheckInPagePartial")}
                  </span>
                )}
              </InlineMessage>
              {candidates.length > 0 && (
                <NativeCheckInPageCandidates
                  candidates={candidates}
                  candidateId={candidateId}
                  onOpen={openCandidate}
                  onUse={setPath}
                />
              )}
            </div>
          )}
          {openFailed && (
            <InlineMessage size="sm" tone="warning" role="alert">
              {t("form.checkInPageOpenFailed")}
            </InlineMessage>
          )}
        </>
      )}
    </FormField>
  )
}
