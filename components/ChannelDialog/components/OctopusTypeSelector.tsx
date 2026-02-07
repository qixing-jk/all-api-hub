import { useTranslation } from "react-i18next"

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { OctopusOutboundTypeOptions } from "~/constants/octopus"
import { OctopusOutboundType } from "~/types/octopus"

export interface OctopusTypeSelectorProps {
  value: OctopusOutboundType | undefined | null
  onChange: (value: OctopusOutboundType) => void
  disabled?: boolean
  required?: boolean
}

/**
 * Type selector specifically for Octopus channels.
 * Displays only the 6 Octopus outbound types instead of 55+ New API types.
 * @param props Component props
 * @param props.value Current selected type value
 * @param props.onChange Callback when type is changed
 * @param props.disabled Whether the selector is disabled
 * @param props.required Whether the field is required
 */
export function OctopusTypeSelector({
  value,
  onChange,
  disabled = false,
  required = false,
}: OctopusTypeSelectorProps) {
  const { t } = useTranslation(["channelDialog"])

  return (
    <div>
      <Label htmlFor="channel-type" required={required}>
        {t("channelDialog:fields.type.label")}
      </Label>
      <Select
        value={value === undefined || value === null ? "" : String(value)}
        onValueChange={(val) => onChange(Number(val) as OctopusOutboundType)}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger id="channel-type">
          <SelectValue
            placeholder={t("channelDialog:fields.type.placeholder")}
          />
        </SelectTrigger>
        <SelectContent>
          {OctopusOutboundTypeOptions.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
        {t("channelDialog:fields.type.hint")}
      </p>
    </div>
  )
}

export default OctopusTypeSelector
