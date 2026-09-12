import { CheckCircle2, Download } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardItem,
  CardList,
  CardTitle,
  CollapsibleSection,
  FormField,
  ResponsiveButtonGroup,
  Textarea,
  ToggleButton,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  IMPORT_SECTION_KEYS,
  IMPORT_SECTION_STRATEGIES,
} from "~/services/importExport/importExportService"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

import type { ManualImportPlan } from "../hooks/useImportExport"
import { IMPORT_EXPORT_TARGET_IDS } from "../searchTargets"
import { IMPORT_EXPORT_TEST_IDS } from "../testIds"

interface ImportSectionProps {
  importData: string
  setImportData: (data: string) => void
  importPlan: ManualImportPlan
  setImportPlan: React.Dispatch<React.SetStateAction<ManualImportPlan>>
  handleFileImport: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleImport: () => void
  isImporting: boolean
  validation: {
    valid: boolean
    hasAccounts?: boolean
    hasPreferences?: boolean
    hasChannelConfigs?: boolean
    hasApiCredentialProfiles?: boolean
    timestamp?: string
  } | null
}

/**
 * Import section showing file selector, JSON preview, validation notice, and import action.
 */
const ImportSection = ({
  importData,
  setImportData,
  importPlan,
  setImportPlan,
  handleFileImport,
  handleImport,
  isImporting,
  validation,
}: ImportSectionProps) => {
  const { t } = useTranslation("importExport")
  const [showJson, setShowJson] = useState(true)
  type ImportStrategy = ManualImportPlan[keyof ManualImportPlan]
  const importSections: Array<{
    key: keyof ManualImportPlan
    visible: boolean
    title: string
    description: string
    strategies: Array<{
      strategy: ImportStrategy
      label: string
      help: string
      testId: (typeof IMPORT_EXPORT_TEST_IDS)[keyof typeof IMPORT_EXPORT_TEST_IDS]
    }>
  }> = [
    {
      key: IMPORT_SECTION_KEYS.Accounts,
      visible: Boolean(validation?.hasAccounts),
      title: t("import.sections.accounts.title"),
      description: t("import.sections.accounts.description"),
      strategies: [
        {
          strategy: IMPORT_SECTION_STRATEGIES.Merge,
          label: t("import.sectionStrategy.accounts.merge"),
          help: t("import.sectionStrategyHelp.accounts.merge"),
          testId: IMPORT_EXPORT_TEST_IDS.importAccountsMergeOption,
        },
        {
          strategy: IMPORT_SECTION_STRATEGIES.Replace,
          label: t("import.sectionStrategy.accounts.replace"),
          help: t("import.sectionStrategyHelp.accounts.replace"),
          testId: IMPORT_EXPORT_TEST_IDS.importAccountsReplaceOption,
        },
      ],
    },
    {
      key: IMPORT_SECTION_KEYS.ApiCredentialProfiles,
      visible: Boolean(validation?.hasApiCredentialProfiles),
      title: t("import.sections.apiCredentialProfiles.title"),
      description: t("import.sections.apiCredentialProfiles.description"),
      strategies: [
        {
          strategy: IMPORT_SECTION_STRATEGIES.Merge,
          label: t("import.sectionStrategy.apiCredentialProfiles.merge"),
          help: t("import.sectionStrategyHelp.apiCredentialProfiles.merge"),
          testId: IMPORT_EXPORT_TEST_IDS.importApiCredentialProfilesMergeOption,
        },
        {
          strategy: IMPORT_SECTION_STRATEGIES.Replace,
          label: t("import.sectionStrategy.apiCredentialProfiles.replace"),
          help: t("import.sectionStrategyHelp.apiCredentialProfiles.replace"),
          testId:
            IMPORT_EXPORT_TEST_IDS.importApiCredentialProfilesReplaceOption,
        },
      ],
    },
    {
      key: IMPORT_SECTION_KEYS.Preferences,
      visible: Boolean(validation?.hasPreferences),
      title: t("import.sections.preferences.title"),
      description: t("import.sections.preferences.description"),
      strategies: [
        {
          strategy: IMPORT_SECTION_STRATEGIES.Skip,
          label: t("import.sectionStrategy.preferences.skip"),
          help: t("import.sectionStrategyHelp.preferences.skip"),
          testId: IMPORT_EXPORT_TEST_IDS.importPreferencesSkipOption,
        },
        {
          strategy: IMPORT_SECTION_STRATEGIES.Replace,
          label: t("import.sectionStrategy.preferences.replace"),
          help: t("import.sectionStrategyHelp.preferences.replace"),
          testId: IMPORT_EXPORT_TEST_IDS.importPreferencesReplaceOption,
        },
      ],
    },
    {
      key: IMPORT_SECTION_KEYS.ChannelConfigs,
      visible: Boolean(validation?.hasChannelConfigs),
      title: t("import.sections.channelConfigs.title"),
      description: t("import.sections.channelConfigs.description"),
      strategies: [
        {
          strategy: IMPORT_SECTION_STRATEGIES.Skip,
          label: t("import.sectionStrategy.channelConfigs.skip"),
          help: t("import.sectionStrategyHelp.channelConfigs.skip"),
          testId: IMPORT_EXPORT_TEST_IDS.importChannelConfigsSkipOption,
        },
        {
          strategy: IMPORT_SECTION_STRATEGIES.Merge,
          label: t("import.sectionStrategy.channelConfigs.merge"),
          help: t("import.sectionStrategyHelp.channelConfigs.merge"),
          testId: IMPORT_EXPORT_TEST_IDS.importChannelConfigsMergeOption,
        },
        {
          strategy: IMPORT_SECTION_STRATEGIES.Replace,
          label: t("import.sectionStrategy.channelConfigs.replace"),
          help: t("import.sectionStrategyHelp.channelConfigs.replace"),
          testId: IMPORT_EXPORT_TEST_IDS.importChannelConfigsReplaceOption,
        },
      ],
    },
  ]
  const visibleImportSections = importSections.filter(
    (section) => section.visible,
  )
  const hasSelectedImportSection = visibleImportSections.some(
    ({ key }) => importPlan[key] !== IMPORT_SECTION_STRATEGIES.Skip,
  )
  const hasReplaceStrategy = visibleImportSections.some(
    ({ key }) => importPlan[key] === IMPORT_SECTION_STRATEGIES.Replace,
  )

  const updateImportPlan = (
    key: keyof ManualImportPlan,
    strategy: ManualImportPlan[keyof ManualImportPlan],
  ) => {
    setImportPlan((plan) => ({
      ...plan,
      [key]: strategy,
    }))
  }

  return (
    <section id="import-section" className="flex min-w-0 flex-col">
      <Card padding="none" className="flex flex-1 flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="mb-0 text-base">
              {t("import.title")}
            </CardTitle>
          </div>
          <CardDescription>{t("import.description")}</CardDescription>
        </CardHeader>

        <CardContent
          padding="md"
          spacing="none"
          className="flex flex-1 flex-col gap-5"
        >
          {/* 文件选择 */}
          <FormField
            label={t("import.selectBackupFile")}
            htmlFor="import-backup-file"
          >
            <div className="flex items-center space-x-3">
              <input
                id="import-backup-file"
                type="file"
                accept=".json"
                onChange={(event) => {
                  if (!event.target.files?.length) return
                  handleFileImport(event)
                  setShowJson(false)
                }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:text-gray-400 dark:file:bg-blue-900/30 dark:file:text-blue-300 dark:hover:file:bg-blue-900/50"
              />
            </div>
          </FormField>

          <CollapsibleSection
            title={t("import.dataPreview")}
            open={showJson || validation?.valid === false}
            onOpenChange={setShowJson}
            buttonClassName="px-0 text-sm"
            panelClassName="border-0 p-0"
          >
            <Textarea
              id="import-data-preview"
              aria-label={t("import.dataPreview")}
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder={t("import.pasteJsonData")}
              className="h-40 w-full resize-y font-mono text-xs leading-5"
              spellCheck={false}
              onClear={() => setImportData("")}
              clearButtonLabel={t("common:actions.clear")}
            />
          </CollapsibleSection>

          {validation &&
            (validation.valid ? (
              <div
                role="status"
                className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
              >
                <span className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle2
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                  {t("import.dataValid")}
                </span>
                {validation.timestamp && (
                  <span className="text-muted-foreground text-xs">
                    {t("import.backupTime")}: {validation.timestamp}
                  </span>
                )}
              </div>
            ) : (
              <Alert variant="destructive">{t("import.dataInvalid")}</Alert>
            ))}

          {visibleImportSections.length > 0 && (
            <div id={IMPORT_EXPORT_TARGET_IDS.importMode}>
              <FormField label={t("import.sections.label")}>
                <CardList className="overflow-hidden">
                  {visibleImportSections.map(
                    ({ key, title, description, strategies }) => (
                      <CardItem key={key} padding="none" className="py-3">
                        <div className="flex w-full flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1 basis-56">
                            <p className="text-sm font-medium">{title}</p>
                            <p className="text-muted-foreground mt-1 text-sm">
                              {description}
                            </p>
                          </div>
                          <ResponsiveButtonGroup
                            aria-label={title}
                            className="w-fit max-w-full shrink-0"
                          >
                            {strategies.map(
                              ({ strategy, label, help, testId }) => {
                                const selected = importPlan[key] === strategy
                                const helpId = `import-plan-${key}-${strategy}-help`

                                return (
                                  <span key={strategy} className="contents">
                                    <ToggleButton
                                      type="button"
                                      size="sm"
                                      isActive={selected}
                                      title={help}
                                      aria-label={label}
                                      aria-describedby={helpId}
                                      onClick={() =>
                                        updateImportPlan(key, strategy)
                                      }
                                      data-testid={testId}
                                      className="min-w-fit flex-1"
                                    >
                                      {label}
                                    </ToggleButton>
                                    <span id={helpId} className="sr-only">
                                      {help}
                                    </span>
                                  </span>
                                )
                              },
                            )}
                          </ResponsiveButtonGroup>
                        </div>
                      </CardItem>
                    ),
                  )}
                </CardList>
                {hasReplaceStrategy && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    {t("import.replaceWarning")}
                  </p>
                )}
              </FormField>
            </div>
          )}

          <ProductAnalyticsScope
            entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport}
            surfaceId={
              PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportImportSection
            }
          >
            {/* 导入按钮 */}
            <Button
              id="import-backup-action"
              className="mt-auto"
              onClick={handleImport}
              disabled={!validation?.valid || !hasSelectedImportSection}
              loading={isImporting}
              variant="default"
              bleed
              data-testid={IMPORT_EXPORT_TEST_IDS.importBackupButton}
            >
              {isImporting
                ? t("common:status.importing")
                : t("common:actions.import")}
            </Button>
          </ProductAnalyticsScope>
        </CardContent>
      </Card>
    </section>
  )
}

export default ImportSection
