import EChartsLayer from 'ol-echarts'
import { use } from 'echarts/core'
import { PieChart, ScatterChart } from 'echarts/charts'
import { SVGRenderer, CanvasRenderer } from 'echarts/renderers'
import { formatCompact, isCountIndicator, isShareIndicator } from '../data/indicators.js'
import { bubbleSize, maxIndustryTotal, pieRadius, SECTOR_NAMES, SECTORS, symbolScale } from './symbols.js'

use([PieChart, ScatterChart, SVGRenderer, CanvasRenderer])

const FONT = '"Microsoft YaHei", sans-serif'
const SELECTED = '#ea580c'
const OTHER_SECTORS = ['#a9b3bf', '#c9d0d8']

const nameLabel = (extra = {}) => ({
  show: true, position: 'bottom', lineHeight: 15,
  textBorderColor: 'rgba(255, 255, 255, 0.9)', textBorderWidth: 3,
  rich: {
    name: { fontSize: 13, fontWeight: 600, color: '#1f2937', fontFamily: FONT },
    value: { fontSize: 12, color: '#374151', fontFamily: FONT },
  },
  ...extra,
})

/** 总量指标叠加气泡，产业占比叠加饼图，随地图平移缩放 */
export function createBubbleOverlay({ map, store, classifications }) {
  let hovered = null
  const cities = [...store.regions.values()].filter((region) => region.level === 'city')
  const industryMax = maxIndustryTotal(store, cities)
  const layer = new EChartsLayer(null, { hideOnMoving: false, hideOnZooming: false, forcedRerender: true }, map)

  const bubbles = ({ indicator, year, selectedCities }) => {
    const metadata = store.indicators.get(indicator)
    const { max, palette } = classifications.get(indicator)
    return [{
      type: 'scatter', zlevel: 1,
      symbolSize: (_, params) => bubbleSize(params.data.raw, max, symbolScale()),
      itemStyle: { color: palette[3], opacity: 0.82, borderColor: '#fff', borderWidth: 1.5 },
      label: nameLabel({
        distance: 3,
        formatter: ({ data }) => `{name|${data.name}}\n{value|${formatCompact(data.raw, metadata)}}`,
        rich: { name: nameLabel().rich.name, value: { fontSize: 12, color: palette[4], fontFamily: FONT } },
      }),
      data: cities.map((city) => {
        const raw = store.getValue(indicator, year, city.adcode)
        return {
          name: city.short_name, adcode: city.adcode, raw,
          value: [city.center_lng, city.center_lat, raw ?? 0],
          itemStyle: selectedCities.includes(city.adcode) ? { color: SELECTED, opacity: 0.9 } : undefined,
        }
      }),
    }]
  }

  const pies = ({ indicator, year, selectedCities }) => cities.flatMap((city) => {
    const { palette } = classifications.get(indicator)
    const metadata = store.indicators.get(indicator)
    const focus = SECTORS.indexOf(indicator.replace('share_', ''))
    const share = store.getValue(indicator, year, city.adcode)
    const values = SECTORS.map((sector) => store.getValue(`gdp_${sector}`, year, city.adcode))
    if (!values.every(Number.isFinite)) return []
    const total = values.reduce((a, b) => a + b, 0)
    const active = city.adcode === hovered
    const baseRadius = pieRadius(total, industryMax, symbolScale())
    const radius = active ? Math.max(baseRadius * 1.8, 48 * symbolScale()) : baseRadius
    const shares = SECTORS.map((sector) => store.getValue(`share_${sector}`, year, city.adcode))
    const selected = selectedCities.includes(city.adcode)
    return [{
      type: 'pie', zlevel: active ? 2 : 1, coordinates: [city.center_lng, city.center_lat],
      radius, silent: true, animation: false, labelLine: { show: active, length: 6, length2: 6 },
      label: { show: active, fontSize: 11, lineHeight: 14, color: '#1f2937', fontFamily: FONT,
        textBorderColor: '#fff', textBorderWidth: 3,
        formatter: ({ dataIndex }) => `${SECTOR_NAMES[dataIndex]}\n${formatCompact(shares[dataIndex], metadata)}%` },
      itemStyle: { borderColor: selected ? SELECTED : '#fff', borderWidth: selected ? 2 : 1 },
      startAngle: 90,
      data: values.map((value, index) => ({
        name: SECTOR_NAMES[index], value,
        itemStyle: { color: index === focus ? palette[3] : OTHER_SECTORS[index < focus ? index : index - 1] },
      })),
    }, {
      // 透明散点承载饼图下方的城市名与数值
      type: 'scatter', zlevel: active ? 2 : 1, symbolSize: radius * 2, itemStyle: { color: 'transparent' }, silent: true,
      label: nameLabel({ distance: 5, formatter: () => `{name|${city.short_name}}\n{value|${formatCompact(share, metadata)}%}`,
        rich: { name: nameLabel().rich.name, value: { fontSize: 12, color: palette[4], fontFamily: FONT } } }),
      data: [{ name: city.short_name, value: [city.center_lng, city.center_lat] }],
    }]
  })

  const render = () => {
    const state = store.getState()
    const series = isCountIndicator(state.indicator) ? bubbles(state)
      // 悬停城市最后绘制，避免被相邻饼图遮挡
      : isShareIndicator(state.indicator) ? pies(state).sort((a, b) => a.zlevel - b.zlevel) : []
    // forcedRerender 会清空重绘，关闭动画避免播放时反复入场
    layer.setChartOptions({ animation: false, series })
  }
  render()
  const unsubscribe = store.subscribe(render)
  // 指针事件交由地图处理
  layer.on('load', () => { layer.$container.style.pointerEvents = 'none' })
  return {
    setHover(adcode) {
      if (adcode === hovered) return
      hovered = adcode
      if (isShareIndicator(store.getState().indicator)) render()
    },
    destroy() { unsubscribe(); layer.remove() },
  }
}
