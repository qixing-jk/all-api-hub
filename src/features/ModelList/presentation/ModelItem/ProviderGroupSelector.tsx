import { ArrowLeftRight } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import { getErrorMessage } from "~/utils/core/error"

/** An explicit server write; local catalog filters never invoke this control. */
export function ProviderGroupSelector({
  group,
  onSave,
}: {
  group: NonNullable<ModelPricing["providerGroup"]>
  onSave: (group: string) => Promise<void>
}) {
  const { t } = useTranslation("modelList")
  const descriptionId = useId()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(group.selected)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const inFlight = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    const current = ++generation.current
    setPending(false)
    setSelected(group.selected)
    setError(undefined)
    return () => {
      generation.current = current + 1
    }
  }, [group])
  const save = async () => {
    if (
      inFlight.current ||
      group.locked ||
      error ||
      selected === group.selected
    )
      return
    inFlight.current = true
    setPending(true)
    const current = generation.current
    try {
      await onSave(selected)
      setOpen(false)
    } catch (failure) {
      if (current === generation.current) setError(getErrorMessage(failure))
    } finally {
      inFlight.current = false
      if (current === generation.current) setPending(false)
    }
  }
  return (
    <div className="mt-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">
          {t("providerGroup.label")}:{" "}
          {group.selected || t("common:labels.notAvailable")}
        </span>
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next && !pending) setSelected(group.selected)
            setOpen(next)
          }}
        >
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || group.locked}
            >
              <ArrowLeftRight className="size-3.5" aria-hidden="true" />
              {t("providerGroup.action")}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-label={t("providerGroup.action")}
            className="w-80 max-w-[calc(100vw-1rem)] space-y-3"
          >
            <p className="text-sm font-medium">{t("providerGroup.action")}</p>
            <p id={descriptionId} className="text-muted-foreground text-xs">
              {t("providerGroup.description")}
            </p>
            <Select
              value={selected}
              onValueChange={setSelected}
              disabled={pending || group.locked || !!error}
            >
              <SelectTrigger
                size="sm"
                aria-label={t("providerGroup.label")}
                aria-describedby={descriptionId}
              >
                <SelectValue placeholder={t("providerGroup.label")} />
              </SelectTrigger>
              <SelectContent>
                {group.options.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    disabled={!item.available}
                  >
                    {item.value}
                    {item.multiplier === undefined
                      ? ""
                      : ` · ×${item.multiplier}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && (
              <p role="alert" className="text-destructive text-xs">
                {t("providerGroup.refreshRequired", { error })}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                {t("common:actions.cancel")}
              </Button>
              <Button
                size="sm"
                loading={pending}
                disabled={
                  pending ||
                  group.locked ||
                  !!error ||
                  selected === group.selected
                }
                onClick={save}
              >
                {t(pending ? "providerGroup.saving" : "providerGroup.apply")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {group.locked && (
        <p className="text-muted-foreground text-xs">
          {t("providerGroup.locked")}
        </p>
      )}
    </div>
  )
}
