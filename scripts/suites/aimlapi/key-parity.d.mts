import type { AuthOptions } from "./auth.mjs"

export function runAimlapiKeyParity(
  options: AuthOptions & { evidenceDir?: string },
): Promise<unknown>
