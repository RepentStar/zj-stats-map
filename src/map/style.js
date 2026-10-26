import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import Text from 'ol/style/Text.js'
import { theme } from '../theme.js'

export const NO_DATA_COLOR = theme.noData

export function createCityStyle(store, classifications) {
  const cache = new Map()
  return (feature) => {
    const adcode = feature.get('adcode')
    const { indicator, year, selectedCities } = store.getState()
    const classification = classifications.get(indicator)
    const index = classification.classify(store.getValue(indicator, year, adcode))
    const selected = selectedCities.includes(adcode)
    const key = `${adcode}/${indicator}/${index}/${selected}`
    if (!cache.has(key)) {
      const geometry = feature.getGeometry()
      const polygon = geometry.getType() === 'MultiPolygon'
        ? geometry.getPolygons().sort((a, b) => b.getArea() - a.getArea())[0]
        : geometry
      cache.set(key, [
        new Style({
          fill: new Fill({ color: index < 0 ? NO_DATA_COLOR : classification.colors[index] }),
          stroke: new Stroke({ color: selected ? theme.selection : theme.mapBoundary, width: selected ? 3 : 1.2 }),
          zIndex: selected ? 2 : 0,
        }),
        new Style({
          geometry: polygon.getInteriorPoint(),
          text: new Text({
            text: store.regions.get(adcode).short_name,
            font: `${selected ? '700' : '500'} 13px "Microsoft YaHei", sans-serif`,
            fill: new Fill({ color: selected ? theme.selection : theme.ink }),
            stroke: new Stroke({ color: theme.mapLabelOutline, width: 3 }),
          }),
          zIndex: selected ? 4 : 3,
        }),
      ])
    }
    return cache.get(key)
  }
}
