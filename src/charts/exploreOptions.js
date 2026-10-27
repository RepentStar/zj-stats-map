import { formatValue, isCountIndicator } from '../data/indicators.js'
import { createClassification } from '../map/breaks.js'
import { createLineOption } from './lineOptions.js'
import { CITY_COLORS } from './colors.js'
import { createIndustryOption } from './industryOptions.js'

const classificationCache = new WeakMap()

/** 与地图使用同一套跨年份分级，使排行条形颜色和地图面色一致。 */
function classificationFor(snapshot, indicator) {
  if (!classificationCache.has(snapshot.stats)) classificationCache.set(snapshot.stats, new Map())
  const cache = classificationCache.get(snapshot.stats)
  if (!cache.has(indicator)) {
    const values = [...(snapshot.stats.get(indicator)?.values() ?? [])].flatMap((byCity) => [...byCity.values()])
    cache.set(indicator, createClassification(values))
  }
  return cache.get(indicator)
}

/** 排行条形颜色：总量指标用主题色，比率指标用该值在地图上的分级色。 */
function barColor(snapshot, indicator, value) {
  const classification = classificationFor(snapshot, indicator)
  if (isCountIndicator(indicator)) return classification.palette[3]
  return classification.colors[classification.classify(value)] ?? classification.palette[3]
}

export function createExploreOption(snapshot, type) {
  if (type === 'line') return createLineOption(snapshot)
  if (type === 'radar' || type === 'stack') return createIndustryOption(snapshot, type)
  const { indicator, year, selectedCities } = snapshot.getState()
  const metadata = snapshot.indicators.get(indicator)
  const cities = [...snapshot.regions.values()].filter((region) => region.level === 'city')
  const rows = selectedCities.map((adcode) => {
    const value = snapshot.getValue(indicator, year, adcode)
    return {
      adcode, name: snapshot.regions.get(adcode).short_name, value,
      itemStyle: { color: type === 'pie'
        ? CITY_COLORS[cities.findIndex((city) => city.adcode === adcode) % CITY_COLORS.length]
        : barColor(snapshot, indicator, value) },
    }
  }).filter((row) => row.value !== null && Number.isFinite(row.value))
  const base = {
    animation: false,
    textStyle: { fontFamily: '"Microsoft YaHei", sans-serif', color: '#526e65' },
    aria: { enabled: true, label: { description: `${year} 年${metadata.label}，${metadata.unit}。` } },
    tooltip: { trigger: 'item', renderMode: 'richText', confine: true,
      formatter: ({ data, percent }) => `${data.name}\n${formatValue(data.value, metadata)} ${metadata.unit}${type === 'pie' ? `\n当前范围占比 ${percent}%` : ''}` },
  }
  if (!rows.length || (type === 'pie' && !rows.some((row) => row.value > 0))) {
    return { ...base, title: { text: '当前范围无可展示数据', left: 'center', top: 'middle', textStyle: { fontSize: 14, color: '#526e65', fontWeight: 'normal' } }, series: [] }
  }
  if (type === 'pie') return {
    ...base,
    legend: { type: 'scroll', bottom: 4, left: 12, right: 12, selectedMode: false, icon: 'circle', itemWidth: 9, itemHeight: 9 },
    series: [{ type: 'pie', top: 0, bottom: 44, radius: ['40%', '65%'], center: ['50%', '50%'],
      minAngle: 0, avoidLabelOverlap: true, stillShowZeroSum: false,
      labelLayout: { hideOverlap: true },
      label: { formatter: '{b}\n{d}%', fontSize: 11, lineHeight: 16 },
      labelLine: { length: 10, length2: 8 }, itemStyle: { borderColor: '#fff', borderWidth: 2 },
      emphasis: { scaleSize: 5 }, data: rows }],
  }
  rows.sort((a, b) => b.value - a.value)
  // Reserve space for full formatted values, including large per-capita GDP.
  const valueLabelWidth = Math.max(...rows.map((row) => formatValue(row.value, metadata).length)) * 7
  return {
    ...base,
    grid: { left: 48, right: Math.max(74, valueLabelWidth + 16), top: 30, bottom: 34 },
    xAxis: { type: 'value', axisLabel: { hideOverlap: true, fontSize: 11 }, splitLine: { lineStyle: { color: '#eaf0ef' } } },
    yAxis: { type: 'category', inverse: true, data: rows.map((row) => row.name), axisTick: { show: false }, axisLine: { show: false } },
    series: [{ type: 'bar', barMaxWidth: 18, data: rows,
      label: { show: true, position: 'right', formatter: ({ value }) => formatValue(value, metadata), fontSize: 11 },
      itemStyle: { borderRadius: [0, 3, 3, 0] }, emphasis: { focus: 'self' } }],
  }
}
