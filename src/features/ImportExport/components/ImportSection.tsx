import { ArrowDownTrayIcon, DocumentIcon } from "@heroicons/react/24/outline"
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
    <section id="import-section" className="flex h-full">
      <Card padding="none" className="flex flex-1 flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowDownTrayIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="mb-0">{t("import.title")}</CardTitle>
          </div>
          <CardDescription>{t("import.description")}</CardDescription>
        </CardHeader>

        <CardContent padding="md" className="space-y-4">
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
                onChange={handleFileImport}
                className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:text-gray-400 dark:file:bg-blue-900/30 dark:file:text-blue-300 dark:hover:file:bg-blue-900/50"
              />
              <DocumentIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </div>
          </FormField>

          {/* 数据预览 */}
          <FormField
            label={t("import.dataPreview")}
            htmlFor="import-data-preview"
          >
            <Textarea
              id="import-data-preview"
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder={t("import.pasteJsonData")}
              className="h-16 w-full resize-none font-mono"
              onClear={() => setImportData("")}
              clearButtonLabel={t("common:actions.clear")}
            />
          </FormField>

          {visibleImportSections.length > 0 && (
            <div id={IMPORT_EXPORT_TARGET_IDS.importMode}>
              <FormField label={t("import.sections.label")}>
                <CardList className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
                  {visibleImportSections.map(
                    ({ key, title, description, strategies }) => (
                      <CardItem
                        key={key}
                        padding="sm"
                        title={title}
                        description={description}
                        rightContent={
                          <ResponsiveButtonGroup
                            aria-label={title}
                            className="max-w-full"
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
                                      className="min-w-fit flex-1 sm:flex-none"
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
                        }
                      />
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

          {/* 数据验证结果 */}
          {validation && (
            <Alert variant={validation.valid ? "success" : "destructive"}>
              <div>
                {validation.valid ? (
                  <>
                    <p className="mb-1 font-medium">{t("import.dataValid")}</p>
                    <div className="space-y-1 text-sm">
                      {validation.hasAccounts && (
                        <p>• {t("import.containsAccountData")}</p>
                      )}
                      {validation.hasPreferences && (
                        <p>• {t("import.containsUserSettings")}</p>
                      )}
                      {validation.hasChannelConfigs && (
                        <p>• {t("import.containsChannelConfigs")}</p>
                      )}
                      {validation.hasApiCredentialProfiles && (
                        <p
                          data-testid={
                            IMPORT_EXPORT_TEST_IDS.containsApiCredentialProfiles
                          }
                        >
                          • {t("import.containsApiCredentialProfiles")}
                        </p>
                      )}
                      <p>
                        • {t("import.backupTime")}: {validation.timestamp}
                      </p>
                    </div>
                  </>
                ) : (
                  <p>{t("import.dataInvalid")}</p>
                )}
              </div>
            </Alert>
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
