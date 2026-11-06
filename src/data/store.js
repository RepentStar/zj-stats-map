export function createStore(data) {
  const regions = new Map(data.regions.map((region) => [region.adcode, region]))
  const indicators = new Map(data.indicators.map((indicator) => [indicator.indicator, indicator]))
  const stats = new Map()
  const yearSet = new Set()
  for (const { adcode, year, indicator, value } of data.stats) {
    if (!stats.has(indicator)) stats.set(indicator, new Map())
    const byYear = stats.get(indicator)
    if (!byYear.has(year)) byYear.set(year, new Map())
    byYear.get(year).set(adcode, value)
    yearSet.add(year)
  }
  const years = Object.freeze([...yearSet].sort((a, b) => a - b))
  if (!years.length || !indicators.size) throw new Error('统计数据或指标字典为空')
  let state = Object.freeze({
    indicator: indicators.keys().next().value, year: years.at(-1), selectedCities: Object.freeze([]),
  })
  const listeners = new Set()
  const getValue = (indicator, year, adcode) => stats.get(indicator)?.get(year)?.get(adcode) ?? null
  return {
    regions, indicators, stats, years, geojson: data.geojson, recordCount: data.stats.length,
    getValue,
    getSeries: (indicator, adcode) => years.map((year) => [year, getValue(indicator, year, adcode)]),
    getState: () => state,
    setState(patch) {
      if (Object.keys(patch).some((key) => !['indicator', 'year', 'selectedCities'].includes(key))) {
        throw new Error('未知的共享状态字段')
      }
      const next = { ...state, ...patch }
      if (!indicators.has(next.indicator)) throw new Error('不能选择未登记指标')
      if (!years.includes(next.year)) throw new Error('不能选择统计范围以外的年份')
      if (!Array.isArray(next.selectedCities) || next.selectedCities.some((adcode) => regions.get(adcode)?.level !== 'city')) {
        throw new Error('只能选择已登记的地级市')
      }
      next.selectedCities = Object.freeze([...new Set(next.selectedCities)])
      if (next.indicator === state.indicator && next.year === state.year &&
          next.selectedCities.join() === state.selectedCities.join()) return
      state = Object.freeze(next)
      listeners.forEach((listener) => listener(state))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
