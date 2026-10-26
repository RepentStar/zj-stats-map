import { init, use } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { LabelLayout } from 'echarts/features'
import { createExploreOption } from './exploreOptions.js'

use([BarChart, LineChart, PieChart, AriaComponent, GridComponent, LegendComponent,
  MarkLineComponent, TitleComponent, TooltipComponent, LabelLayout, SVGRenderer])

export function createExploreChart({ target, snapshot, type, onSelectCity, onSelectYear }) {
  const chart = init(target, null, { renderer: 'svg' })
  let observer
  try {
    chart.setOption(createExploreOption(snapshot, type))
    observer = new ResizeObserver(() => chart.resize())
    observer.observe(target)
    chart.on('click', (event) => {
      if (event.componentType !== 'series') return
      if (type === 'line') {
        const year = Number(event.value?.[0])
        if (snapshot.years.includes(year)) onSelectYear(year)
      } else if (event.data?.adcode) onSelectCity(event.data.adcode)
    })
  } catch (error) {
    observer?.disconnect()
    chart.dispose()
    throw error
  }
  return () => { observer.disconnect(); chart.dispose() }
}
