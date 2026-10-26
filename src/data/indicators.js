export const ACTIVE_INDICATORS = Object.freeze([
  'pop_resident', 'pop_density',
  'gdp_primary', 'gdp_secondary', 'gdp_tertiary',
  'share_primary', 'share_secondary', 'share_tertiary',
  'income_urban_pc',
])

export function formatValue(value, metadata = {}) {
  if (value === null || value === undefined) return '无数据'
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: metadata.decimals ?? 1,
    maximumFractionDigits: metadata.decimals ?? 1,
  }).format(value)
}
