import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  FormField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { VERCEL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import {
  fetchVercelTeams,
  type VercelTeam,
} from "~/services/apiService/vercelAiGateway/identity"
import { AuthTypeEnum } from "~/types"

/** Team selection stays bound to the token that proved membership. */
export function VercelTeamSelector({
  accessToken,
  value,
  onChange,
}: {
  accessToken: string
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation("accountDialog")
  const callbacks = useRef({ value, onChange })
  callbacks.current = { value, onChange }
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState<{
    token: string
    teams: VercelTeam[]
    error: boolean
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    if (!accessToken.trim()) return
    void fetchVercelTeams({
      baseUrl: VERCEL_WEB_ORIGIN,
      abortSignal: controller.signal,
      auth: { authType: AuthTypeEnum.AccessToken, accessToken },
    })
      .then((teams) => {
        if (controller.signal.aborted) return
        setState({ token: accessToken, teams, error: false })
        const current = callbacks.current
        if (!teams.some((team) => team.id === current.value))
          current.onChange(teams.length === 1 ? teams[0]!.id : "")
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ token: accessToken, teams: [], error: true })
      })
    return () => controller.abort()
  }, [accessToken, retry])
  const loaded = state?.token === accessToken ? state : null
  return (
    <FormField label={t("form.vercelTeam")} required>
      <Select
        value={value}
        onValueChange={(selected) => {
          // Async options can make Radix's hidden form control emit an empty
          // value. Only a team offered by this token is a user selection.
          if (loaded?.teams.some((team) => team.id === selected))
            onChange(selected)
        }}
        disabled={!loaded || loaded.error}
      >
        <SelectTrigger
          aria-label={t("form.vercelTeam")}
          data-testid="account-management-vercel-team-select"
        >
          <SelectValue placeholder={t("form.vercelTeamPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {loaded?.teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name} ({team.slug})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-xs">
        {t("form.vercelTeamHelp")}
      </p>
      {loaded?.error && (
        <div role="alert">
          <p>{t("form.vercelTeamLoadFailed")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t("common:actions.retry")}
          </Button>
        </div>
      )}
    </FormField>
  )
}
