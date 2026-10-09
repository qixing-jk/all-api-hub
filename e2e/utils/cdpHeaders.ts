/** Reads headers case-insensitively without rejecting CDP's HTTP/2 pseudo-headers. */
export function getCdpHeader(headers: Record<string, string>, name: string) {
  const normalizedName = name.toLowerCase()
  return Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === normalizedName,
  )?.[1]
}
