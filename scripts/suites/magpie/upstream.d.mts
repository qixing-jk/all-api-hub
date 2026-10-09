import type { RealSiteUpstream } from "../../utils/real-site-upstream.mjs"

export declare const MAGPIE_TEST_MODELS: string[]
export function resolveMagpieUpstream(
  baseUrl: string,
  env?: Record<string, string | undefined>,
): Promise<{ config: RealSiteUpstream | null; close(): Promise<void> }>
