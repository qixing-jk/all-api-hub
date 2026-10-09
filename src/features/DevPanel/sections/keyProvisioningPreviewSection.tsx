import { KeyRound } from "lucide-react"
import { useMemo, useState } from "react"

import {
  Alert,
  Button,
  FormField,
  Modal,
  SearchableSelect,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { ACCOUNT_SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { getAccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { AihubmixDefaultKeyPromptDialog } from "~/features/AccountManagement/components/AccountDialog/postSave/AihubmixDefaultKeyPromptDialog"
import { AccountKeyProvisioningDialog } from "~/features/TokenProvisioning/creation/AccountKeyProvisioningDialog"
import type { DisplaySiteData } from "~/types"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"

import { useRegisterDevPanelSection } from "../DevPanelSectionsContext"
import {
  createKeyProvisioningPreviewAccount,
  DEFAULT_PREVIEW_SITE_TYPE,
  getKeyProvisioningPreviewProfile,
  KEY_PROVISIONING_PREVIEW_SCENARIOS,
  prepareKeyProvisioningPreview,
  type KeyProvisioningPreviewScenario,
} from "../keyProvisioningPreview"
import type { DevPanelSection } from "../types"

const scenarioLabels: Record<KeyProvisioningPreviewScenario, string> = {
  normal: "Normal creation (multiple groups / channels)",
  "single-target": "Single available group / channel",
  covered: "Existing valid keys cover all targets",
  uncertain: "Last write has an uncertain result",
  "option-failure": "Editor option loading failure",
  "inventory-failure": "Inventory read failure",
}

type PreviewRun = {
  account: DisplaySiteData
  mode: AccountKeyAutoProvisionMode
  scenario: KeyProvisioningPreviewScenario
  serial: number
  confirmed: boolean
}

/** Dev-only operation owner; mocks remote writes and keeps simulated saves in component memory. */
export function KeyProvisioningPreviewSection() {
  const [open, setOpen] = useState(false)
  const [siteType, setSiteType] = useState<AccountSiteType>(
    DEFAULT_PREVIEW_SITE_TYPE,
  )
  const [mode, setMode] = useState<AccountKeyAutoProvisionMode>("default")
  const [scenario, setScenario] =
    useState<KeyProvisioningPreviewScenario>("normal")
  const [run, setRun] = useState<PreviewRun | null>(null)
  const [serial, setSerial] = useState(0)
  const [created, setCreated] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [hasRun, setHasRun] = useState(false)
  const profile = getKeyProvisioningPreviewProfile(siteType, mode)
  const section = useMemo<DevPanelSection>(
    () => ({
      id: "key-provisioning-preview",
      title: "Key provisioning preview",
      description:
        "Preview key creation, required inputs, and one-time secrets across site types.",
      icon: KeyRound,
      surfaces: ["options"],
      prominentPages: [MENU_ITEM_IDS.ACCOUNT, MENU_ITEM_IDS.KEYS],
      actions: [
        {
          id: "open-key-provisioning-preview",
          label: "Dev: Preview key provisioning",
          run: () => setOpen(true),
        },
      ],
    }),
    [],
  )
  useRegisterDevPanelSection(section)

  const start = () => {
    const nextSerial = serial + 1
    const account = createKeyProvisioningPreviewAccount(siteType)
    const requiresConfirmation =
      mode === "default" &&
      scenario !== "covered" &&
      getAccountDialogSitePolicy(siteType).deferSuccessForOneTimeKeyPostSaveFlow
    setSerial(nextSerial)
    setCreated([])
    setSaved([])
    setHasRun(true)
    setRun({
      account,
      mode,
      scenario,
      serial: nextSerial,
      confirmed: !requiresConfirmation,
    })
  }
  return (
    <>
      <Modal
        isOpen={open}
        onClose={() => {
          if (!run) setOpen(false)
        }}
        title="Key provisioning preview"
        header={
          <h2 className="text-foreground text-lg font-semibold">
            Key provisioning preview
          </h2>
        }
        closeOnBackdropClick={false}
        size="lg"
      >
        <div className="space-y-4">
          <Alert
            variant="info"
            description="Uses simulated inventory and keys with the actual creation UI. Saves stay in this preview; the copy button copies an example key."
          />
          <FormField label="Site type" htmlFor="key-preview-site">
            <SearchableSelect
              id="key-preview-site"
              aria-label="Site type"
              options={ACCOUNT_SITE_TYPES.map((value) => ({
                value,
                label: value,
              }))}
              value={siteType}
              onChange={(value) => {
                setSiteType(value as AccountSiteType)
                setHasRun(false)
              }}
              disabled={Boolean(run)}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Scope" htmlFor="key-preview-mode">
              <SearchableSelect
                id="key-preview-mode"
                aria-label="Scope"
                value={mode}
                onChange={(value) => {
                  setMode(value as AccountKeyAutoProvisionMode)
                  setHasRun(false)
                }}
                disabled={Boolean(run)}
                options={[
                  {
                    value: "default",
                    label: "Default key",
                  },
                  {
                    value: "all-groups",
                    label: "All groups",
                  },
                ]}
              />
            </FormField>
            <FormField label="Scenario" htmlFor="key-preview-scenario">
              <SearchableSelect
                id="key-preview-scenario"
                aria-label="Scenario"
                value={scenario}
                onChange={(value) => {
                  setScenario(value as KeyProvisioningPreviewScenario)
                  setHasRun(false)
                }}
                disabled={Boolean(run)}
                options={KEY_PROVISIONING_PREVIEW_SCENARIOS.map((value) => ({
                  value,
                  label: scenarioLabels[value],
                  disabled:
                    value === "option-failure" && !profile.supportsInput,
                }))}
              />
            </FormField>
          </div>
          <p className="text-muted-foreground text-sm">{profile.description}</p>
          <Button
            onClick={start}
            disabled={
              Boolean(run) ||
              !profile.supported ||
              (scenario === "option-failure" && !profile.supportsInput)
            }
          >
            Start preview
          </Button>
          {hasRun ? (
            <div
              role="status"
              aria-label="Preview results"
              className="bg-muted rounded-lg p-3 text-sm"
            >
              <p>{run ? "Preview running" : "Preview finished"}</p>
              <p>Created in preview: {created.length}</p>
              <p>Saved in preview: {saved.length}</p>
              {created.length ? (
                <ul className="mt-2 list-inside list-disc">
                  {created.map((label, index) => (
                    <li key={index}>{label}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
      <AihubmixDefaultKeyPromptDialog
        isOpen={Boolean(run && !run.confirmed)}
        accountName={run?.account.name ?? ""}
        isCreating={false}
        onCancel={() => setRun(null)}
        onConfirm={() =>
          setRun((current) =>
            current ? { ...current, confirmed: true } : null,
          )
        }
      />
      {run?.confirmed ? (
        <AccountKeyProvisioningDialog
          key={run.serial}
          account={run.account}
          mode={run.mode}
          autoCopySecret={false}
          onClose={() => setRun(null)}
          preparePlan={(account, scope, options) =>
            prepareKeyProvisioningPreview(account, scope, {
              signal: options?.signal,
              scenario: run.scenario,
              delayMs: 1100,
              onCreated: (label) =>
                setCreated((current) => [...current, label]),
            })
          }
          getSecretSaveAction={(secret) => ({
            label: "Simulate save",
            onSave: async () => {
              setSaved((current) =>
                current.includes(secret.secret)
                  ? current
                  : [...current, secret.secret],
              )
            },
          })}
        />
      ) : null}
    </>
  )
}
