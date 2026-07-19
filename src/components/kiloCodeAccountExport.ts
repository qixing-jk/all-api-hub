import type {
  KiloCodeDefaultModelSelection,
  KiloCodeLegacySelection,
  KiloCodeRuntimeKeyExportInput,
  KiloCodeV7ProviderSelection,
} from "~/services/integrations/kiloCodeExport"
import { KILO_CODE_EXPORT_TARGETS } from "~/services/integrations/kiloCodeExport"
import {
  buildKiloCodeExportOutput,
  type KiloCodeExportOutput,
} from "~/services/integrations/kiloCodeExportPolicy"
import type { ApiToken, DisplaySiteData } from "~/types"

export interface KiloCodeAccountExportSelection {
  selectionId: string
  site: DisplaySiteData
  token: ApiToken
  providerName: string
  runtimeKey: KiloCodeRuntimeKeyExportInput
}

export interface KiloCodeAccountLegacySelection
  extends KiloCodeLegacySelection {
  selectionId: string
}

export interface KiloCodeAccountSecretSource {
  site: DisplaySiteData
  token: ApiToken
}

interface ResolveKiloCodeAccountExportOutputBaseOptions {
  secretSourcesBySelectionId: ReadonlyMap<string, KiloCodeAccountSecretSource>
  resolveToken: (site: DisplaySiteData, token: ApiToken) => Promise<ApiToken>
}

interface ResolveKiloCodeAccountV7ExportOutputOptions
  extends ResolveKiloCodeAccountExportOutputBaseOptions {
  target: typeof KILO_CODE_EXPORT_TARGETS.KiloV7
  selections: KiloCodeV7ProviderSelection[]
  defaultModel: KiloCodeDefaultModelSelection
}

interface ResolveKiloCodeAccountLegacyExportOutputOptions
  extends ResolveKiloCodeAccountExportOutputBaseOptions {
  target: typeof KILO_CODE_EXPORT_TARGETS.Legacy
  selections: KiloCodeAccountLegacySelection[]
  currentLegacyProfileName: string
}

type ResolveKiloCodeAccountExportOutputOptions =
  | ResolveKiloCodeAccountV7ExportOutputOptions
  | ResolveKiloCodeAccountLegacyExportOutputOptions

/** Replace only the transient token secret in already-canonical selections. */
async function resolveCanonicalSelectionSecrets<
  TSelection extends { selectionId: string; tokenKey: string },
>(
  selections: TSelection[],
  secretSourcesBySelectionId: ReadonlyMap<string, KiloCodeAccountSecretSource>,
  resolveToken: (site: DisplaySiteData, token: ApiToken) => Promise<ApiToken>,
): Promise<TSelection[]> {
  return Promise.all(
    selections.map(async (selection) => {
      const source = secretSourcesBySelectionId.get(selection.selectionId)
      if (!source) {
        throw new Error("Kilo Code export selection source is unavailable")
      }
      const resolvedToken = await resolveToken(source.site, source.token)
      return { ...selection, tokenKey: resolvedToken.key }
    }),
  )
}

/** Resolve secrets only for an export action, then build a canonical policy output. */
export async function resolveKiloCodeAccountExportOutput(
  options: ResolveKiloCodeAccountExportOutputOptions,
): Promise<KiloCodeExportOutput> {
  if (options.target === KILO_CODE_EXPORT_TARGETS.KiloV7) {
    const selections = await resolveCanonicalSelectionSecrets(
      options.selections,
      options.secretSourcesBySelectionId,
      options.resolveToken,
    )

    return buildKiloCodeExportOutput({
      target: KILO_CODE_EXPORT_TARGETS.KiloV7,
      selections,
      defaultModel: options.defaultModel,
    })
  }

  const selections = await resolveCanonicalSelectionSecrets(
    options.selections,
    options.secretSourcesBySelectionId,
    options.resolveToken,
  )

  return buildKiloCodeExportOutput({
    target: KILO_CODE_EXPORT_TARGETS.Legacy,
    selections,
    currentLegacyProfileName: options.currentLegacyProfileName,
  })
}
