import { getDomain } from "tldts"

/**
 * Resolve a hostname's registrable domain, including private hosting suffixes
 * so independent tenants such as one.github.io and two.github.io stay distinct.
 * Accepts hostnames, not URLs; IP addresses and suffix-only/single-label hosts
 * return null. This is a grouping/display hint, not an origin or auth boundary.
 */
export function getRegistrableDomain(hostname: string): string | null {
  return getDomain(hostname, {
    allowPrivateDomains: true,
    extractHostname: false,
  })
}
