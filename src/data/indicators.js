export const ACTIVE_INDICATORS = Object.freeze([
  'pop_resident', 'pop_density',
  'gdp_primary', 'gdp_secondary', 'gdp_tertiary',
  'share_primary', 'share_secondary', 'share_tertiary',
  'income_urban_pc',
  'gdp', 'gdp_per_capita',
])

export const COUNT_INDICATORS = Object.freeze(['pop_resident', 'gdp', 'gdp_primary', 'gdp_secondary', 'gdp_tertiary'])
export const isCountIndicator = (indicator) => COUNT_INDICATORS.includes(indicator)

export function formatValue(value, metadata = {}) {
  if (value === null || value === undefined) return '无数据'
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: metadata.decimals ?? 1,
    maximumFractionDigits: metadata.decimals ?? 1,
  }).format(value)
}

/** 地图标签最多保留一位小数 */
export const formatCompact = (value, metadata = {}) =>
  formatValue(value, { decimals: Math.min(metadata.decimals ?? 1, 1) })
export const isShareIndicator = (indicator) => indicator.startsWith('share_')
