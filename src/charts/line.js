import { init, use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { createLineOption } from './lineOptions.js'

use([LineChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, AriaComponent, SVGRenderer])

export function createLineChart({ target, store, onSelectYear }) {
  const chart = init(target, null, { renderer: 'svg' })
  const render = () => {
    const { selectedCities } = store.getState()
    chart.setOption(createLineOption(store), { notMerge: true })
    target.hidden = !selectedCities.length
    if (selectedCities.length) chart.resize()
  }
  render()
  const unsubscribe = store.subscribe(render)
  const observer = new ResizeObserver(() => chart.resize())
  observer.observe(target)
  chart.on('click', (event) => {
    if (event.componentType === 'series' && event.seriesType === 'line') {
      const year = Number(event.value?.[0])
      if (store.years.includes(year)) onSelectYear(year)
    }
  })
  return () => {
    unsubscribe()
    observer.disconnect()
    chart.dispose()
  }
}
