import { formatValue } from '../data/indicators.js'
import { createLineOption } from './lineOptions.js'
import { theme, chartLegend, chartTooltip } from '../theme.js'

export function createExploreOption(snapshot, type) {
  if (type === 'line') return createLineOption(snapshot)
  const { indicator, year, selectedCities } = snapshot.getState()
  const metadata = snapshot.indicators.get(indicator)
  const cities = [...snapshot.regions.values()].filter((region) => region.level === 'city')
  const rows = selectedCities.map((adcode) => ({
    adcode, name: snapshot.regions.get(adcode).short_name,
    value: snapshot.getValue(indicator, year, adcode),
    itemStyle: { color: theme.cityColors[cities.findIndex((city) => city.adcode === adcode) % theme.cityColors.length] },
  })).filter((row) => row.value !== null && Number.isFinite(row.value))
  const base = {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: '"Microsoft YaHei", sans-serif', color: theme.muted },
    aria: { enabled: true, label: { description: `${year} 年${metadata.label}，${metadata.unit}。${year === 2025 ? '初步数据。' : ''}缺失值不计入图表。` } },
    tooltip: { ...chartTooltip, trigger: 'item', renderMode: 'richText', confine: true,
      formatter: ({ data, percent }) => `${data.name}\n${formatValue(data.value, metadata)} ${metadata.unit}${type === 'pie' ? `\n当前范围占比 ${percent}%` : ''}` },
  }
  if (!rows.length || (type === 'pie' && !rows.some((row) => row.value > 0))) {
    return { ...base, title: { text: '当前范围无可展示数据', left: 'center', top: 'middle', textStyle: { fontSize: 14, color: theme.muted, fontWeight: 'normal' } }, series: [] }
  }
  if (type === 'pie') return {
    ...base,
    legend: { ...chartLegend, type: 'scroll', bottom: 4, left: 12, right: 12, selectedMode: false, icon: 'circle', itemWidth: 9, itemHeight: 9 },
    series: [{ type: 'pie', top: 0, bottom: 44, radius: ['40%', '65%'], center: ['50%', '50%'],
      minAngle: 0, avoidLabelOverlap: true, stillShowZeroSum: false,
      labelLayout: { hideOverlap: true },
      label: { formatter: '{b}\n{d}%', fontSize: 11, lineHeight: 16, color: theme.ink },
      labelLine: { length: 10, length2: 8, lineStyle: { color: theme.muted } }, itemStyle: { borderColor: theme.surface, borderWidth: 2 },
      emphasis: { scaleSize: 5 }, data: rows }],
  }
  rows.sort((a, b) => b.value - a.value)
  return {
    ...base,
    grid: { left: 48, right: 74, top: 30, bottom: 34 },
    xAxis: { type: 'value', axisLabel: { hideOverlap: true, fontSize: 11, color: theme.muted }, splitLine: { lineStyle: { color: theme.line, type: 'dashed' } } },
    yAxis: { type: 'category', inverse: true, data: rows.map((row) => row.name), axisLabel: { color: theme.muted }, axisTick: { show: false }, axisLine: { show: false } },
    series: [{ type: 'bar', barMaxWidth: 18, data: rows,
      label: { show: true, position: 'right', formatter: ({ value }) => formatValue(value, metadata), fontSize: 11, color: theme.ink },
      itemStyle: { borderRadius: [0, 3, 3, 0] }, emphasis: { focus: 'self' } }],
  }
}
