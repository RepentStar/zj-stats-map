import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import Text from 'ol/style/Text.js'
import { formatCompact, isCountIndicator, isShareIndicator } from '../data/indicators.js'

export const NO_DATA_COLOR = '#d9dfe2'

/**
 * 比率类指标：分级设色 + “城市名/数值”两行标注。
 * 总量类指标与产业占比：面填色阶最浅档作底，数值改由 overlay.js 的气泡或饼图表达，此处不标注。
 */
export function createCityStyle(store, classifications) {
  const cache = new Map()
  return (feature) => {
    const adcode = feature.get('adcode')
    const { indicator, year, selectedCities } = store.getState()
    const classification = classifications.get(indicator)
    const value = store.getValue(indicator, year, adcode)
    const index = classification.classify(value)
    const selected = selectedCities.includes(adcode)
    const symbolized = isCountIndicator(indicator) || isShareIndicator(indicator)
    const key = `${adcode}/${indicator}/${symbolized ? '' : year}/${index}/${selected}`
    if (!cache.has(key)) {
      const geometry = feature.getGeometry()
      const polygon = geometry.getType() === 'MultiPolygon'
        ? geometry.getPolygons().sort((a, b) => b.getArea() - a.getArea())[0]
        : geometry
      const fill = symbolized
        ? classification.palette[0]
        : index < 0 ? NO_DATA_COLOR : classification.colors[index]
      const name = store.regions.get(adcode).short_name
      const styles = [new Style({
        fill: new Fill({ color: fill }),
        stroke: new Stroke({ color: selected ? '#ea580c' : '#ffffff', width: selected ? 3 : 1.5 }),
        zIndex: selected ? 2 : 0,
      })]
      if (!symbolized) {
        // 深色分级上用白字，浅色分级上用深字，保证对比度
        const dark = index >= Math.ceil(classification.colors.length / 2)
        styles.push(new Style({
          geometry: polygon.getInteriorPoint(),
          text: new Text({
            text: [name, `${selected ? '700' : '600'} 13px "Microsoft YaHei", sans-serif`,
              '\n', '', formatCompact(value, store.indicators.get(indicator)), '500 12px "Microsoft YaHei", sans-serif'],
            fill: new Fill({ color: dark ? '#ffffff' : '#1f2937' }),
            stroke: new Stroke({ color: dark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.9)', width: 3 }),
          }),
          zIndex: selected ? 4 : 3,
        }))
      }
      cache.set(key, styles)
    }
    return cache.get(key)
  }
}
