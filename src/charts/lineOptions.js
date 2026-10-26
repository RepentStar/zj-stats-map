import { formatValue } from '../data/indicators.js'
import { theme, chartLegend, chartTooltip } from '../theme.js'

export function createLineOption(store) {
  const { indicator, year, selectedCities } = store.getState()
  const metadata = store.indicators.get(indicator)
  const cities = [...store.regions.values()].filter((region) => region.level === 'city')
  const hasSelection = selectedCities.length > 0
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: '"Microsoft YaHei", sans-serif', color: theme.muted },
    aria: { enabled: true, label: { description: `${metadata.label}历年变化，当前年份 ${year} 年。` } },
    legend: { ...chartLegend, type: 'scroll', top: 4, left: 12, right: 12, selectedMode: false },
    grid: { left: 76, right: 28, top: 90, bottom: 42 },
    tooltip: {
      ...chartTooltip,
      trigger: 'axis', renderMode: 'richText', confine: true,
      formatter(params) {
        if (!params.length) return ''
        const hoveredYear = Number(params[0].axisValue)
        const lines = selectedCities.map((adcode) => {
          const value = store.getValue(indicator, hoveredYear, adcode)
          return `${store.regions.get(adcode).short_name}：${formatValue(value, metadata)}${value === null ? '' : ` ${metadata.unit}`}`
        })
        return [`${hoveredYear} 年`, ...lines].join('\n')
      },
    },
    xAxis: {
      type: 'category', data: store.years.map(String), boundaryGap: false, show: hasSelection,
      axisLine: { lineStyle: { color: theme.line } }, axisTick: { show: false },
      axisLabel: { hideOverlap: true, showMinLabel: true, showMaxLabel: true, color: theme.muted },
    },
    yAxis: {
      type: 'value', name: metadata.unit, show: hasSelection,
      nameTextStyle: { align: 'left', color: theme.muted },
      axisLabel: { formatter: (value) => formatValue(value, metadata), color: theme.muted },
      splitLine: { lineStyle: { color: theme.line, type: 'dashed' } },
    },
    series: selectedCities.map((adcode, index) => ({
      id: adcode, name: store.regions.get(adcode).short_name, type: 'line',
      data: store.getSeries(indicator, adcode).map(([pointYear, value]) => [String(pointYear), value]),
      connectNulls: false, smooth: false, symbolSize: 7,
      itemStyle: { color: theme.cityColors[cities.findIndex((city) => city.adcode === adcode) % theme.cityColors.length] },
      lineStyle: { width: 2 }, emphasis: { focus: 'series' },
      // Draw annotations once so multi-city comparisons have one current-year marker.
      ...(index === 0 ? {
        markLine: {
          silent: true, symbol: ['none', 'none'],
          data: [{ xAxis: String(year), name: '当前年份',
            lineStyle: { color: theme.accent, width: 2, type: 'dashed' },
            label: { formatter: `当前 ${year}`, position: 'insideEndTop', color: theme.accent, backgroundColor: theme.surface, padding: [3, 5] } }],
        },
      } : {}),
    })),
  }
}
