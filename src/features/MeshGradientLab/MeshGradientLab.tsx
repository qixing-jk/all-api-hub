import { Palette, Shuffle } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { SegmentedControl } from "~/components/SegmentedControl"
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Switch,
} from "~/components/ui"
import {
  MESH_GRADIENT_LAYOUT_COUNT,
  MESH_GRADIENT_PALETTES,
} from "~/services/sharing/shareSnapshots/meshGradient"
import { drawMeshGradientBackground } from "~/services/sharing/shareSnapshots/meshGradientBackground"
import {
  drawShareSnapshotOverlay,
  type ShareSnapshotOverlayLabels,
} from "~/services/sharing/shareSnapshots/shareSnapshotOverlay"
import type { ShareSnapshotPayload } from "~/services/sharing/shareSnapshots/types"
import { createShareSnapshotSeed } from "~/services/sharing/shareSnapshots/utils"

type ViewMode = "palettes" | "layouts"

const PREVIEW_SIZE = 220
const DEV_OVERLAY_LOCALE = "en-US"
const DEV_OVERLAY_WATERMARK = "All API Hub"

const DEV_OVERLAY_LABELS: ShareSnapshotOverlayLabels = {
  overview: "Overview",
  totalBalance: "Total balance",
  balance: "Balance",
  accounts: "Accounts",
  site: "Site",
  asOf: "As of",
  today: "Today",
  income: "Income",
  outcome: "Outcome",
  net: "Net",
}

const clampIndex = (value: number, size: number): number => {
  if (!Number.isFinite(value) || size <= 0) return 0
  return Math.min(size - 1, Math.max(0, Math.floor(value)))
}

const DEV_SAMPLE_SITE_NAME = "Example Relay"
const DEV_SAMPLE_BALANCE = 12345.67
const DEV_SAMPLE_TODAY_INCOME = 12.34
const DEV_SAMPLE_TODAY_OUTCOME = 5.67

const createDevOverlayPayload = (seed: number): ShareSnapshotPayload => {
  const todayNet = DEV_SAMPLE_TODAY_INCOME - DEV_SAMPLE_TODAY_OUTCOME
  return {
    kind: "account",
    currencyType: "USD",
    siteName: DEV_SAMPLE_SITE_NAME,
    balance: DEV_SAMPLE_BALANCE,
    asOf: Date.now(),
    backgroundSeed: seed,
    todayIncome: DEV_SAMPLE_TODAY_INCOME,
    todayOutcome: DEV_SAMPLE_TODAY_OUTCOME,
    todayNet,
  }
}

const MeshGradientCanvas = ({
  seed,
  paletteIndex,
  layoutIndex,
  showOverlay,
}: {
  seed: number
  paletteIndex: number
  layoutIndex: number
  showOverlay: boolean
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = PREVIEW_SIZE * dpr
    canvas.height = PREVIEW_SIZE * dpr
    canvas.style.width = `${PREVIEW_SIZE}px`
    canvas.style.height = `${PREVIEW_SIZE}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.globalCompositeOperation = "source-over"
    ctx.globalAlpha = 1
    ctx.filter = "none"
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)

    drawMeshGradientBackground(ctx, {
      seed,
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      paletteIndex,
      layoutIndex,
    })

    if (!showOverlay) return

    drawShareSnapshotOverlay(ctx, {
      payload: createDevOverlayPayload(seed),
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      locale: DEV_OVERLAY_LOCALE,
      watermarkText: DEV_OVERLAY_WATERMARK,
      labels: DEV_OVERLAY_LABELS,
    })
  }, [layoutIndex, paletteIndex, seed, showOverlay])

  return (
    <div className="border-border aspect-square w-full overflow-hidden rounded-lg border">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        width={PREVIEW_SIZE}
        height={PREVIEW_SIZE}
      />
    </div>
  )
}

const PaletteSwatches = ({ colors }: { colors: readonly string[] }) => {
  return (
    <div className="space-y-density-2">
      <div className="flex gap-x-1">
        {colors.map((color, index) => (
          <div
            key={`${color}-${index}`}
            className="h-3 flex-1 rounded-sm"
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
      <div className="text-muted-foreground gap-y-density-1 grid grid-cols-2 gap-x-2 text-xs">
        {colors.map((color, index) => (
          <span key={`${color}-${index}`} className="font-mono">
            {color.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Developer tool for previewing and testing mesh gradient palettes and layouts.
 */
export default function MeshGradientLab() {
  const { t } = useTranslation("meshGradientLab")
  const paletteCount = MESH_GRADIENT_PALETTES.length
  const layoutCount = MESH_GRADIENT_LAYOUT_COUNT
  const maxPaletteIndex = Math.max(0, paletteCount - 1)
  const maxLayoutIndex = Math.max(0, layoutCount - 1)

  const [viewMode, setViewMode] = useState<ViewMode>("palettes")
  const [seed, setSeed] = useState<number>(42)
  const [layoutIndex, setLayoutIndex] = useState<number>(0)
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState<number>(0)
  const [showOverlay, setShowOverlay] = useState(true)

  const safeLayoutIndex = useMemo(
    () => clampIndex(layoutIndex, layoutCount),
    [layoutCount, layoutIndex],
  )
  const safePaletteIndex = useMemo(
    () => clampIndex(selectedPaletteIndex, paletteCount),
    [paletteCount, selectedPaletteIndex],
  )

  const layoutIndexes = useMemo(
    () => Array.from({ length: layoutCount }, (_, index) => index),
    [layoutCount],
  )

  const handleShuffleSeed = () => {
    setSeed(createShareSnapshotSeed())
  }

  return (
    <div className="py-density-6 px-6">
      <PageHeader
        icon={Palette}
        title={t("meshGradientLab:title")}
        actions={
          <Button
            size="sm"
            onClick={handleShuffleSeed}
            variant="secondary"
            leftIcon={<Shuffle className="h-4 w-4" />}
          >
            {t("meshGradientLab:actions.shuffleSeed")}
          </Button>
        }
      />

      <div className="space-y-density-6">
        <Card>
          <CardContent>
            <div className="gap-y-density-3 flex flex-col gap-x-3 md:flex-row md:items-center md:justify-between">
              <div className="gap-y-density-3 flex flex-col gap-x-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex items-center gap-x-2">
                  <Label size="sm">{t("meshGradientLab:labels.view")}</Label>
                  <SegmentedControl
                    layout="fit"
                    size="sm"
                    aria-label={t("meshGradientLab:labels.view")}
                    value={viewMode}
                    onValueChange={setViewMode}
                    options={[
                      {
                        value: "palettes",
                        label: t("meshGradientLab:view.palettes"),
                      },
                      {
                        value: "layouts",
                        label: t("meshGradientLab:view.layouts"),
                      },
                    ]}
                  />
                </div>

                <div className="flex items-center gap-x-2">
                  <Label size="sm">{t("meshGradientLab:labels.seed")}</Label>
                  <Input
                    type="number"
                    size="sm"
                    value={seed}
                    containerClassName="w-[160px]"
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setSeed(Number.isFinite(next) ? next : 0)
                    }}
                  />
                </div>

                {viewMode === "palettes" ? (
                  <div className="flex items-center gap-x-2">
                    <Label size="sm">
                      {t("meshGradientLab:labels.layout")}
                    </Label>
                    <Input
                      type="number"
                      size="sm"
                      value={safeLayoutIndex}
                      min={0}
                      max={maxLayoutIndex}
                      containerClassName="w-[160px]"
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setLayoutIndex(Number.isFinite(next) ? next : 0)
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-x-2">
                    <Label size="sm">
                      {t("meshGradientLab:labels.palette")}
                    </Label>
                    <Input
                      type="number"
                      size="sm"
                      value={safePaletteIndex}
                      min={0}
                      max={maxPaletteIndex}
                      containerClassName="w-[160px]"
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setSelectedPaletteIndex(
                          Number.isFinite(next) ? next : 0,
                        )
                      }}
                    />
                  </div>
                )}

                <div className="flex items-center gap-x-2">
                  <Label size="sm">{t("meshGradientLab:labels.overlay")}</Label>
                  <Switch
                    checked={showOverlay}
                    onChange={setShowOverlay}
                    size="sm"
                  />
                </div>
              </div>

              <div className="text-muted-foreground text-sm">
                {t("meshGradientLab:summaryPalette", { count: paletteCount })}
                {" · "}
                {t("meshGradientLab:summaryLayout", { count: layoutCount })}
              </div>
            </div>
          </CardContent>
        </Card>

        {viewMode === "palettes" ? (
          <div className="gap-y-density-4 grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {MESH_GRADIENT_PALETTES.map((palette, index) => (
              <Card key={index} className="overflow-hidden">
                <CardContent>
                  <MeshGradientCanvas
                    seed={seed}
                    paletteIndex={index}
                    layoutIndex={safeLayoutIndex}
                    showOverlay={showOverlay}
                  />
                  <div className="text-foreground text-sm font-medium">
                    {t("meshGradientLab:captions.paletteIndex", { index })}
                  </div>
                  <PaletteSwatches colors={palette.colors} />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="gap-y-density-4 grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {layoutIndexes.map((index) => (
              <Card key={index} className="overflow-hidden">
                <CardContent>
                  <MeshGradientCanvas
                    seed={seed}
                    paletteIndex={safePaletteIndex}
                    layoutIndex={index}
                    showOverlay={showOverlay}
                  />
                  <div className="text-foreground text-sm font-medium">
                    {t("meshGradientLab:captions.layoutIndex", { index })}
                  </div>
                  <PaletteSwatches
                    colors={
                      MESH_GRADIENT_PALETTES[safePaletteIndex]?.colors ?? []
                    }
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
