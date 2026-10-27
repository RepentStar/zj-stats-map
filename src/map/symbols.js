/** 地图比例符号的尺寸规则，供叠加层与图例共用（不依赖 ol-echarts，便于测试）。 */
export const BUBBLE_MAX_SIZE = 64
export const PIE_MAX_RADIUS = 30
export const SECTORS = ['primary', 'secondary', 'tertiary']
export const SECTOR_NAMES = ['第一产业', '第二产业', '第三产业']

/** 圆面积与数值成正比；最大值取全部年份，播放时符号大小可跨年比较。 */
export const bubbleSize = (value, max, scale = 1) =>
  value > 0 && max > 0 ? Math.max(6, BUBBLE_MAX_SIZE * scale * Math.sqrt(value / max)) : 0
export const pieRadius = (total, max, scale = 1) =>
  total > 0 && max > 0 ? Math.max(8, PIE_MAX_RADIUS * scale * Math.sqrt(total / max)) : 0
/** 窄屏地图缩得更小，符号同比缩小以免互相遮挡。 */
export const symbolScale = () => (globalThis.innerWidth < 761 ? 0.6 : 1)

/** 三次产业增加值合计的跨年最大值，作为饼图大小的固定比例尺。 */
export function maxIndustryTotal(store, cities) {
  let max = 0
  for (const year of store.years) {
    for (const city of cities) {
      const values = SECTORS.map((sector) => store.getValue(`gdp_${sector}`, year, city.adcode))
      if (values.every(Number.isFinite)) max = Math.max(max, values.reduce((a, b) => a + b, 0))
    }
  }
  return max
}
