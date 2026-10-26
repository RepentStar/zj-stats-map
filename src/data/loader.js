import Papa from 'papaparse'
import { ACTIVE_INDICATORS } from './indicators.js'

const COLUMNS = {
  regions: ['adcode', 'name', 'short_name', 'level', 'parent', 'area_land', 'center_lng', 'center_lat'],
  indicators: ['indicator', 'label', 'unit', 'decimals', 'category', 'type', 'formula', 'source', 'direction', 'note'],
  stats: ['adcode', 'year', 'indicator', 'value'],
}

export function parseCsv(text, kind) {
  const result = Papa.parse(text.replace(/^\uFEFF/, ''), {
    header: true, dynamicTyping: false, skipEmptyLines: 'greedy',
  })
  if (result.errors.length) throw new Error(`${kind}.csv：${result.errors[0].message}`)
  if (JSON.stringify(result.meta.fields) !== JSON.stringify(COLUMNS[kind])) {
    throw new Error(`${kind}.csv 列名或顺序不符合数据规范`)
  }
  if (!result.data.length) throw new Error(`${kind}.csv 没有数据`)
  return result.data
}

function numeric(value, label) {
  if (value.trim() === '' || !Number.isFinite(Number(value))) throw new Error(`${label} 必须为有效数值`)
  return Number(value)
}

function code(value) {
  if (!/^\d{6}$/.test(value)) throw new Error(`无效行政区编码：${value}`)
  return value
}

/** Pure parsing entry point, shared by the browser loader and data tests. */
export function parseData({ regionsText, indicatorsText, statsText, geojson }) {
  const regions = parseCsv(regionsText, 'regions').map((row) => ({
    ...row,
    adcode: code(row.adcode),
    area_land: row.area_land === '' ? null : numeric(row.area_land, 'area_land'),
    center_lng: numeric(row.center_lng, 'center_lng'),
    center_lat: numeric(row.center_lat, 'center_lat'),
  }))
  const regionCodes = new Set(regions.map((region) => region.adcode))
  if (regionCodes.size !== regions.length) throw new Error('regions.csv 存在重复编码')
  const cities = regions.filter((region) => region.level === 'city')
  if (cities.length !== 11 || regions.length !== 12 ||
      regions.filter((region) => region.level === 'province').length !== 1) {
    throw new Error('行政区划必须包含 1 个省和 11 个地级市')
  }
  const cityCodes = new Set(cities.map((city) => city.adcode))
  for (const city of cities) {
    if (!(city.area_land > 0) || !regionCodes.has(city.parent)) {
      throw new Error(`${city.adcode} 的面积或上级行政区无效`)
    }
  }
  const indicators = parseCsv(indicatorsText, 'indicators').map((row) => {
    const decimals = numeric(row.decimals, 'decimals')
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) {
      throw new Error(`指标 ${row.indicator} 的小数位数无效`)
    }
    return { ...row, decimals }
  })
  const indicatorCodes = new Set(indicators.map((item) => item.indicator))
  if (indicatorCodes.size !== indicators.length || indicators.length !== ACTIVE_INDICATORS.length ||
      ACTIVE_INDICATORS.some((indicator) => !indicatorCodes.has(indicator))) {
    throw new Error('指标字典必须登记人口、产业结构和收入的九个指标')
  }
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('市级边界必须是 GeoJSON FeatureCollection')
  }
  const geoCodes = new Set()
  const features = geojson.features.map((feature) => {
    const adcode = code(String(feature.properties?.adcode ?? ''))
    if (!cityCodes.has(adcode) || geoCodes.has(adcode) || feature.type !== 'Feature' ||
        feature.properties.level !== 'city' ||
        !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type) ||
        !feature.geometry.coordinates?.length) {
      throw new Error(`市级边界要素无效或重复：${adcode}`)
    }
    geoCodes.add(adcode)
    return { ...feature, properties: { ...feature.properties, adcode } }
  })
  if (geoCodes.size !== cityCodes.size) throw new Error('GeoJSON 与 11 市编码不完全匹配')
  const keys = new Set()
  const stats = parseCsv(statsText, 'stats').map((row) => {
    const adcode = code(row.adcode)
    const year = numeric(row.year, 'year')
    const value = numeric(row.value, 'value')
    if (!cityCodes.has(adcode) || !geoCodes.has(adcode)) throw new Error(`统计地区未登记：${adcode}`)
    if (!indicatorCodes.has(row.indicator)) throw new Error(`指标未登记：${row.indicator}`)
    if (!/^\d{4}$/.test(row.year) || !Number.isInteger(year)) throw new Error(`年份无效：${row.year}`)
    const key = `${adcode}/${year}/${row.indicator}`
    if (keys.has(key)) throw new Error(`统计主键重复：${key}`)
    keys.add(key)
    return { adcode, year, indicator: row.indicator, value }
  })
  return { regions, indicators, stats, geojson: { ...geojson, features } }
}

export async function loadData({ baseUrl = `${import.meta.env.BASE_URL}data/`, signal } = {}) {
  async function read(filename) {
    const response = await fetch(`${baseUrl}${filename}`, { signal })
    if (!response.ok) throw new Error(`${filename} 请求失败（HTTP ${response.status}）`)
    return response.text()
  }
  const [regionsText, indicatorsText, statsText, geoText] = await Promise.all([
    read('regions.csv'), read('indicators.csv'), read('stats.csv'), read('geo/zhejiang_city.json'),
  ])
  let geojson
  try { geojson = JSON.parse(geoText) } catch { throw new Error('市级边界不是有效 JSON') }
  return parseData({ regionsText, indicatorsText, statsText, geojson })
}
