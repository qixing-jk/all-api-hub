import type { EChartsOption, EChartsType, SetOptionOpts } from "echarts"
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts"
import {
  DatasetComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components"
import * as echarts from "echarts/core"
import { LabelLayout, UniversalTransition } from "echarts/features"
import { CanvasRenderer } from "echarts/renderers"

/**
 * ECharts module registration using the tree-shaking API (`echarts/core`).
 *
 * Keep this list minimal and add modules only when they are required by charts/options.
 */
echarts.use([
  CanvasRenderer,
  // Charts
  LineChart,
  BarChart,
  PieChart,
  HeatmapChart,
  // Components
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  DataZoomComponent,
  VisualMapComponent,
  ToolboxComponent,
  // Features
  LabelLayout,
  UniversalTransition,
])

export { echarts }
export type { EChartsOption, EChartsType, SetOptionOpts }
