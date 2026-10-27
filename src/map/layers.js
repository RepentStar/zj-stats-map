import Map from 'ol/Map.js'
import View from 'ol/View.js'
import GeoJSON from 'ol/format/GeoJSON.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import Feature from 'ol/Feature.js'
import Polygon from 'ol/geom/Polygon.js'
import Fill from 'ol/style/Fill.js'
import Style from 'ol/style/Style.js'
import { createCityStyle } from './style.js'
import { createBaseLayer } from './tianditu.js'

/** 省外遮罩：大矩形挖去各市外环，弱化省外底图，突出浙江轮廓。 */
function createMaskLayer(features) {
  const holes = features.flatMap((feature) => {
    const geometry = feature.getGeometry()
    const polygons = geometry.getType() === 'MultiPolygon' ? geometry.getPolygons() : [geometry]
    return polygons.map((polygon) => polygon.getLinearRing(0).getCoordinates())
  })
  const world = [[-2e7, -2e7], [2e7, -2e7], [2e7, 2e7], [-2e7, 2e7], [-2e7, -2e7]]
  return new VectorLayer({
    source: new VectorSource({ features: [new Feature(new Polygon([world, ...holes]))] }),
    style: new Style({ fill: new Fill({ color: 'rgba(244, 245, 247, 0.82)' }) }),
    updateWhileInteracting: true,
  })
}

export function toggleCity(store, adcode) {
  const { selectedCities } = store.getState()
  store.setState({
    selectedCities: selectedCities.includes(adcode)
      ? selectedCities.filter((code) => code !== adcode)
      : [...selectedCities, adcode],
  })
}

export function createCityMap({ target, store, classifications, onHover = () => {} }) {
  const source = new VectorSource({
    features: new GeoJSON().readFeatures(store.geojson, {
      dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857',
    }),
  })
  const layer = new VectorLayer({ source, opacity: 0.9, style: createCityStyle(store, classifications) })
  const map = new Map({
    target, layers: [createBaseLayer(), createMaskLayer(source.getFeatures()), layer],
    view: new View({ center: [0, 0], zoom: 7, minZoom: 6, maxZoom: 13 }),
  })
  const resetView = () => map.getView().fit(source.getExtent(), {
    padding: [36, 36, 36, 36], size: map.getSize(), maxZoom: 9,
  })
  resetView()
  const findCity = (pixel) => map.forEachFeatureAtPixel(pixel, (feature) => feature, {
    layerFilter: (candidate) => candidate === layer, hitTolerance: 3,
  })
  map.on('singleclick', (event) => {
    const feature = findCity(event.pixel)
    if (feature) toggleCity(store, feature.get('adcode'))
  })
  map.on('pointermove', (event) => {
    if (event.dragging) return onHover(null)
    const feature = findCity(event.pixel)
    target.style.cursor = feature ? 'pointer' : ''
    onHover(feature ? { adcode: feature.get('adcode'), pixel: event.pixel } : null)
  })
  const leave = () => onHover(null)
  map.getViewport().addEventListener('pointerleave', leave)
  const unsubscribe = store.subscribe(() => layer.changed())
  const observer = new ResizeObserver(() => map.updateSize())
  observer.observe(target)
  return {
    map, resetView,
    destroy() {
      unsubscribe()
      observer.disconnect()
      map.getViewport().removeEventListener('pointerleave', leave)
      map.setTarget(undefined)
      map.dispose()
    },
  }
}
