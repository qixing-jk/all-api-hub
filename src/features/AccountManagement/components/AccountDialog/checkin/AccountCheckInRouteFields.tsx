import { Route } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { FormField, Input } from "~/components/ui"
import { getCheckInMethodPresentation } from "~/features/AccountManagement/components/AccountDialog/checkin/checkInPresentation"
import {
  CHECK_IN_ROUTE_OVERRIDE_SOURCES,
  normalizeCheckInRoutePath,
  readCheckInRouteOverride,
  withCheckInRouteOverride,
} from "~/services/checkin/autoCheckin/configuration/routeOverrides"
import { supportsCheckInRouteOverride } from "~/services/checkin/autoCheckin/providers/registry"
import { AUTO_CHECKIN_USER_CHECKIN_ENDPOINT } from "~/services/checkin/autoCheckin/providers/shared"
import type { CheckInConfig, CheckInMethodId } from "~/types/checkIn"

const ROUTE_PATH_CONTROL_ID = "account-check-in-route-path"

type RouteFieldsProps = {
  checkIn: CheckInConfig
  candidateMethodIds: readonly CheckInMethodId[]
  onCheckInChange: (value: CheckInConfig) => void
}

/** Keep editable text separate from the validated path used by requests. */
function AccountCheckInRouteField({
  checkIn,
  methodId,
  multiple,
  onCheckInChange,
}: Pick<RouteFieldsProps, "checkIn" | "onCheckInChange"> & {
  methodId: CheckInMethodId
  multiple: boolean
}) {
  const { t } = useTranslation("accountDialog")
  const override = readCheckInRouteOverride(checkIn, methodId)
  const savedPath = override?.path ?? ""
  const [value, setValue] = useState(savedPath)
  useEffect(() => setValue(savedPath), [savedPath])
  const error =
    value !== "" && !normalizeCheckInRoutePath(value)
      ? t("form.checkInRoutePathInvalid")
      : undefined
  const controlId = `${ROUTE_PATH_CONTROL_ID}-${methodId}`

  const setRoutePath = (text: string) => {
    setValue(text)
    if (text !== "" && !normalizeCheckInRoutePath(text)) return
    onCheckInChange(
      withCheckInRouteOverride(
        checkIn,
        methodId,
        text === ""
          ? null
          : {
              path: text,
              source: CHECK_IN_ROUTE_OVERRIDE_SOURCES.Manual,
              observedAt: Date.now(),
            },
      ),
    )
  }

  return (
    <FormField
      label={
        multiple
          ? t("form.checkInRoutePathForMethod", {
              method: getCheckInMethodPresentation(t, methodId).label,
            })
          : t("form.checkInRoutePath")
      }
      description={multiple ? undefined : t("form.checkInRoutePathDesc")}
      error={error}
      htmlFor={controlId}
    >
      <Input
        ref={(node) => {
          node?.setCustomValidity(error ?? "")
        }}
        type="text"
        id={controlId}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => setRoutePath(event.target.value)}
        onClear={() => setRoutePath("")}
        placeholder={AUTO_CHECKIN_USER_CHECKIN_ENDPOINT}
        leftIcon={<Route className="h-5 w-5" />}
      />
    </FormField>
  )
}

/** Owns the path controls for methods that support deployment route overrides. */
export function AccountCheckInRouteFields({
  checkIn,
  candidateMethodIds,
  onCheckInChange,
}: RouteFieldsProps) {
  const { t } = useTranslation("accountDialog")
  const methods = candidateMethodIds.filter(supportsCheckInRouteOverride)
  if (methods.length === 0) return null
  const multiple = methods.length > 1
  return (
    <div className="space-y-density-2">
      {methods.map((methodId) => (
        <AccountCheckInRouteField
          key={methodId}
          checkIn={checkIn}
          methodId={methodId}
          multiple={multiple}
          onCheckInChange={onCheckInChange}
        />
      ))}
      {multiple && (
        <p className="text-muted-foreground text-xs">
          {t("form.checkInRoutePathDesc")}
        </p>
      )}
    </div>
  )
}
