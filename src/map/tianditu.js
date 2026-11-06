import TileLayer from 'ol/layer/Tile.js'
import XYZ from 'ol/source/XYZ.js'

export const TIANDITU_KEY = '7bdef0a7bf4f6f180b64621f3c55cf69'

function tiandituLayer(layer) {
  return new TileLayer({
    // 独立画布使底图滤镜不影响专题图层
    className: 'basemap-layer',
    source: new XYZ({
      urls: Array.from({ length: 8 }, (_, index) =>
        `https://t${index}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
        `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
        `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_KEY}`),
      maxZoom: 18,
      attributions: '© <a href="https://www.tianditu.gov.cn/" target="_blank" rel="noreferrer">天地图</a>',
    }),
  })
}

export const createBaseLayer = () => tiandituLayer('vec')
