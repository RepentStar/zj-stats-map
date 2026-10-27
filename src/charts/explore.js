import { init, use } from 'echarts/core'
import { AriaComponent, GraphicComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { LabelLayout } from 'echarts/features'
import { createExploreOption } from './exploreOptions.js'

use([AriaComponent, GraphicComponent, LegendComponent, TitleComponent, TooltipComponent, LabelLayout, SVGRenderer])

export { loadChartType } from './loadType.js'

export function createExploreChart({ target, snapshot, type, onSelectCity, onSelectYear }) {
  const chart = init(target, null, { renderer: 'svg' })
  let observer
  let unsubscribe
  const render = () => {
    const option = createExploreOption(snapshot, type)
    const legend = chart.getOption()?.legend?.[0]
    if (legend && option.legend) {
      option.legend = { ...option.legend, selected: legend.selected, scrollDataIndex: legend.scrollDataIndex }
    }
    // Replace options so a new year cannot retain missing cities or an old empty title.
    chart.setOption(option, { notMerge: true })
  }
  try {
    render()
    observer = new ResizeObserver(() => chart.resize())
    observer.observe(target)
    chart.on('click', (event) => {
      if (event.componentType !== 'series') return
      if (type === 'line') {
        const year = Number(event.value?.[0])
        if (snapshot.years.includes(year)) onSelectYear(year)
      } else if (event.data?.adcode) onSelectCity(event.data.adcode)
    })
    unsubscribe = snapshot.subscribe(render)
  } catch (error) {
    unsubscribe?.()
    observer?.disconnect()
    chart.dispose()
    throw error
  }
  return () => { unsubscribe(); observer.disconnect(); chart.dispose() }
}
