import cliProxyLogo from "~/assets/cli-proxy-api-logo.png"

type CliProxyIconSize = "sm" | "md" | "lg"

const SIZE_MAP: Record<CliProxyIconSize, number> = {
  sm: 16,
  md: 24,
  lg: 32,
}

interface CliProxyIconProps {
  size?: CliProxyIconSize
}

export function CliProxyIcon({ size = "sm" }: CliProxyIconProps) {
  const dimension = SIZE_MAP[size]

  return (
    <img
      src={cliProxyLogo}
      alt="CLIProxyAPI logo"
      width={dimension}
      height={dimension}
      loading="lazy"
      decoding="async"
    />
  )
}
