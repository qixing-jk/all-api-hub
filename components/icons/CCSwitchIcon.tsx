import ccSwitchLogo from "~/assets/cc-switch-logo.png"

type CCSwitchIconSize = "sm" | "md" | "lg"

const SIZE_MAP: Record<CCSwitchIconSize, number> = {
  sm: 20,
  md: 28,
  lg: 36,
}

interface CCSwitchIconProps {
  size?: CCSwitchIconSize
}

/**
 * CCSwitchIcon renders the CC Switch brand mark at a chosen size.
 */
export function CCSwitchIcon({ size = "sm" }: CCSwitchIconProps) {
  const dimension = SIZE_MAP[size]

  return (
    <img
      src={ccSwitchLogo}
      alt="CC Switch logo"
      width={dimension}
      height={dimension}
      loading="lazy"
      decoding="async"
    />
  )
}
