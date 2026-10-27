import { formatValue } from '../data/indicators.js'
import { SECTOR_COLORS } from './colors.js'

const SECTORS = ['primary', 'secondary', 'tertiary']
const SECTOR_NAMES = ['第一产业', '第二产业', '第三产业']
const SHORT_NAMES = ['一产', '二产', '三产']
const RADAR_COLOR = '#2f74bd'

/**
 * 雷达各轴按全部年份、全部城市的实际占比取整到 5% 作为固定范围。
 * 三项占比量级差异大（第一产业不足 12%），统一 0–100% 会让各市挤成一团；
 * 范围跨年份固定，播放时形状变化仍可比较，轴名标出范围以免误读。
 */
export function shareAxisRanges(snapshot) {
  return SECTORS.map((sector) => {
    const values = [...(snapshot.stats.get(`share_${sector}`)?.values() ?? [])]
      .flatMap((byCity) => [...byCity.values()]).filter(Number.isFinite)
    if (!values.length) return { min: 0, max: 100 }
    const min = Math.max(0, Math.floor(Math.min(...values) / 5) * 5)
    const max = Math.min(100, Math.ceil(Math.max(...values) / 5) * 5)
    return { min, max: max > min ? max : Math.min(100, min + 5) }
  })
}

/** Read complete sector triplets only. Missing sectors must never look like zero. */
export function createIndustryOption(snapshot, type) {
  const { year, selectedCities } = snapshot.getState()
  const isRadar = type === 'radar'
  const indicators = SECTORS.map((sector) => `${isRadar ? 'share' : 'gdp'}_${sector}`)
  const metadata = indicators.map((indicator) => snapshot.indicators.get(indicator))
  const unit = isRadar ? '%' : '亿元'
  const cities = [...snapshot.regions.values()].filter((region) => region.level === 'city')
  const rows = selectedCities.map((adcode) => ({
    adcode,
    name: snapshot.regions.get(adcode).short_name,
    value: indicators.map((indicator) => snapshot.getValue(indicator, year, adcode)),
    colorIndex: cities.findIndex((city) => city.adcode === adcode),
  })).filter((row) => metadata.every(Boolean) && row.value.every((value) =>
    Number.isFinite(value) && value >= 0 && (!isRadar || value <= 100)))
  const missingCount = selectedCities.length - rows.length
  const base = {
    animation: false,
    textStyle: { fontFamily: '"Microsoft YaHei", sans-serif', color: '#526e65' },
    aria: { enabled: true, label: { description: `${year} 年三次产业${isRadar ? '占比' : '增加值'}，单位${unit}。${missingCount ? `${missingCount} 市缺少完整三项数据，未展示。` : ''}` } },
    legend: { type: 'scroll', bottom: 4, left: 12, right: 12, selectedMode: isRadar,
      itemWidth: 12, itemHeight: 9 },
    tooltip: { trigger: 'item', renderMode: 'richText', confine: true,
      formatter({ data }) {
        const row = rows.find((candidate) => candidate.adcode === data.adcode)
        return [`${year} 年 ${row.name}`, ...row.value.map((value, index) =>
          `${SECTOR_NAMES[index]}：${formatValue(value, metadata[index])} ${unit}`)].join('\n')
      } },
  }
  if (!rows.length) return {
    ...base,
    title: { text: '当前范围无完整产业数据', left: 'center', top: 'middle',
      textStyle: { fontSize: 14, color: '#526e65', fontWeight: 'normal' } },
    series: [],
  }
  if (missingCount) base.title = {
    text: `${missingCount} 市缺少完整三项数据，未展示`, left: 'center', top: 0,
    textStyle: { fontSize: 12, color: '#526e65', fontWeight: 'normal' },
  }
  if (isRadar) {
    // 小多图：每市一个小雷达，共用跨年份固定的坐标范围，避免多城市叠在一起
    const ranges = shareAxisRanges(snapshot)
    const top = missingCount ? 10 : 2
    const caption = 9
    const cols = rows.length <= 1 ? 1 : rows.length <= 4 ? 2 : rows.length <= 6 ? 3 : 4
    const lines = Math.ceil(rows.length / cols)
    const cellWidth = 100 / cols
    const cellHeight = (100 - top - caption) / lines
    // 半径以画布较短边（高度）的一半为基准；雷达窗口宽高比约 1.3
    const radius = `${0.66 * Math.min(cellWidth * 1.3, cellHeight)}%`
    const cell = (index) => ({ col: index % cols, line: Math.floor(index / cols) })
    return {
      ...base,
      legend: undefined,
      radar: rows.map((_, index) => {
        const { col, line } = cell(index)
        return {
          center: [`${(col + 0.5) * cellWidth}%`, `${top + (line + 0.55) * cellHeight}%`],
          radius, splitNumber: 3, axisNameGap: 3,
          indicator: SHORT_NAMES.map((name, axis) => ({ name, ...ranges[axis] })),
          axisName: { color: '#8a94a0', fontSize: 10 },
          splitArea: { areaStyle: { color: ['#fff', '#f6f8fa'] } },
          splitLine: { lineStyle: { color: '#e3e8ee' } },
          axisLine: { lineStyle: { color: '#d5dce4' } },
        }
      }),
      graphic: [
        ...rows.map((row, index) => {
          const { col, line } = cell(index)
          return { type: 'text', left: `${col * cellWidth + 2}%`, top: `${top + line * cellHeight}%`,
            style: { text: row.name, fontSize: 12, fontWeight: 600, fill: '#1f2937' } }
        }),
        { type: 'text', left: 'center', bottom: 6,
          style: { text: `坐标范围（跨年份固定）：${SECTOR_NAMES.map((name, axis) =>
            `${name} ${ranges[axis].min}–${ranges[axis].max}%`).join('　')}`, fontSize: 11, fill: '#6b7280' } },
      ],
      series: rows.map((row, index) => ({
        id: row.adcode, name: row.name, type: 'radar', radarIndex: index,
        symbol: 'circle', symbolSize: 4,
        itemStyle: { color: RADAR_COLOR },
        lineStyle: { width: 1.5 }, areaStyle: { opacity: 0.22 },
        emphasis: { lineStyle: { width: 2.5 }, areaStyle: { opacity: 0.35 } },
        data: [{ name: row.name, adcode: row.adcode, value: row.value }],
      })),
    }
  }
  return {
    ...base,
    grid: { left: 48, right: 28, top: missingCount ? 52 : 32, bottom: 66 },
    xAxis: { type: 'value', name: unit, nameLocation: 'middle', nameGap: 30,
      axisLabel: { hideOverlap: true, fontSize: 11 }, splitLine: { lineStyle: { color: '#eaf0ef' } } },
    yAxis: { type: 'category', inverse: true, data: rows.map((row) => row.name),
      axisTick: { show: false }, axisLine: { show: false }, axisLabel: { interval: 0 } },
    series: SECTOR_NAMES.map((name, index) => ({
      id: indicators[index], name, type: 'bar', stack: 'industry', barMaxWidth: 22,
      itemStyle: { color: SECTOR_COLORS[index] }, emphasis: { focus: 'series' },
      data: rows.map((row) => ({ name: row.name, adcode: row.adcode, value: row.value[index] })),
    })),
  }
}
