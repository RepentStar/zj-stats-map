import { formatCompact, isCountIndicator, isShareIndicator } from '../data/indicators.js'
import { NO_DATA_COLOR } from '../map/style.js'
import { BUBBLE_MAX_SIZE, bubbleSize, maxIndustryTotal, PIE_MAX_RADIUS, pieRadius, SECTOR_NAMES, SECTORS } from '../map/symbols.js'

const SVG = 'http://www.w3.org/2000/svg'

/** 取 1/2/5×10ⁿ 的整齐数值，作为气泡图例的参考刻度。 */
function niceValue(value) {
  if (!(value > 0)) return 0
  const power = 10 ** Math.floor(Math.log10(value))
  return [5, 2, 1].map((step) => step * power).find((candidate) => candidate <= value)
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function swatchRow(color, label, count) {
  const row = element('li', 'legend-row')
  const swatch = element('span', 'legend-swatch')
  swatch.style.backgroundColor = color
  row.append(swatch, element('span', 'legend-range', label))
  if (count !== undefined) row.append(element('span', 'legend-count', count ? `${count} 市` : '—'))
  row.classList.toggle('is-empty', count === 0)
  return row
}

/**
 * 分级图例：从高到低逐档列出数值范围，并标注当年落在该档的城市数。
 * 分级跨年份固定，当年没有城市的档位变淡，避免“图例 5 档、地图只见 2 色”的困惑。
 */
function createClasses(store, classification, metadata, year) {
  const cities = [...store.regions.values()].filter((region) => region.level === 'city')
  const counts = new Array(classification.colors.length).fill(0)
  let missing = 0
  for (const city of cities) {
    const index = classification.classify(store.getValue(metadata.indicator, year, city.adcode))
    if (index < 0) missing += 1
    else counts[index] += 1
  }
  const { breaks, colors, min, max } = classification
  const list = element('ul', 'legend-rows')
  for (let index = colors.length - 1; index >= 0; index -= 1) {
    const lower = index === 0 ? min : breaks[index - 1]
    const upper = index === breaks.length ? max : breaks[index]
    list.append(swatchRow(colors[index], `${formatCompact(lower, metadata)} – ${formatCompact(upper, metadata)}`, counts[index]))
  }
  if (missing) list.append(swatchRow(NO_DATA_COLOR, '无数据', missing))
  return list
}

/**
 * 符号大小参照按地图上的真实像素绘制：画布尺寸固定为最大符号大小，
 * 圆心与底边对齐的位置不随指标变化，切换指标时只有圆的大小改变。
 */
function createSizeKey({ max, size, diameter, fill, stroke }) {
  const values = [...new Set([niceValue(max), niceValue(max / 4)])].filter((value) => value > 0)
  const width = size + 84
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'legend-bubbles')
  svg.setAttribute('width', width)
  svg.setAttribute('height', size + 2)
  svg.setAttribute('viewBox', `0 0 ${width} ${size + 2}`)
  svg.setAttribute('aria-hidden', 'true')
  for (const value of values) {
    const radius = diameter(value) / 2
    const cy = size + 1 - radius
    const circle = document.createElementNS(SVG, 'circle')
    Object.entries({ cx: size / 2 + 1, cy, r: radius, fill, 'fill-opacity': 0.2, stroke })
      .forEach(([key, attr]) => circle.setAttribute(key, attr))
    const line = document.createElementNS(SVG, 'line')
    Object.entries({ x1: size / 2 + 1, x2: size + 10, y1: cy - radius, y2: cy - radius, stroke: '#9ca3af', 'stroke-dasharray': '2 2' })
      .forEach(([key, attr]) => line.setAttribute(key, attr))
    const text = document.createElementNS(SVG, 'text')
    Object.entries({ x: size + 14, y: cy - radius + 4 }).forEach(([key, attr]) => text.setAttribute(key, attr))
    text.textContent = formatCompact(value, { decimals: 0 })
    svg.append(circle, line, text)
  }
  return svg
}

function createBubbleKey(store, indicator, classification, metadata, year) {
  const { max, palette } = classification
  const total = [...store.regions.values()].filter((region) => region.level === 'city')
    .map((city) => store.getValue(indicator, year, city.adcode)).filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0)
  return [
    createSizeKey({ max, size: BUBBLE_MAX_SIZE, diameter: (value) => bubbleSize(value, max), fill: palette[3], stroke: palette[3] }),
    element('p', 'legend-note', `11 市合计 ${formatCompact(total, metadata)} ${metadata.unit}`),
  ]
}

function createPieKey(indicator, palette, industryMax) {
  const focus = SECTORS.indexOf(indicator.replace('share_', ''))
  const list = element('ul', 'legend-rows')
  list.append(swatchRow(palette[3], SECTOR_NAMES[focus]),
    swatchRow('#b9c2cc', '其余产业'))
  const size = createSizeKey({ max: industryMax, size: PIE_MAX_RADIUS * 2,
    diameter: (value) => pieRadius(value, industryMax) * 2, fill: '#a9b3bf', stroke: '#8a95a3' })
  const caption = element('p', 'legend-note', '圆大小：三次产业增加值合计（亿元）')
  // 扇区配色与大小参照并排，卡片高度与分级图例一致
  const split = element('div', 'legend-split')
  split.append(list, size)
  return [split, caption]
}

/**
 * 停靠在地图左下角的图例卡片：大号年份 + 指标名称 + 图例。
 * 总量指标显示气泡大小参照，比率指标逐档列出范围与城市数，产业占比说明饼图扇区。
 */
export function createLegend({ target, store, classifications }) {
  const year = element('p', 'map-key-year')
  year.setAttribute('aria-live', 'polite')
  const title = element('h2', 'map-key-title')
  const body = element('div', 'map-key-body')
  target.classList.add('map-key')
  target.replaceChildren(year, title, body)
  const industryMax = maxIndustryTotal(store, [...store.regions.values()].filter((region) => region.level === 'city'))
  const render = (state) => {
    const metadata = store.indicators.get(state.indicator)
    const classification = classifications.get(state.indicator)
    year.textContent = state.year
    title.replaceChildren(document.createTextNode(metadata.label), element('span', '', metadata.unit))
    if (isCountIndicator(state.indicator)) {
      body.replaceChildren(...createBubbleKey(store, state.indicator, classification, metadata, state.year))
    } else if (isShareIndicator(state.indicator)) {
      body.replaceChildren(...createPieKey(state.indicator, classification.palette, industryMax))
    } else {
      body.replaceChildren(createClasses(store, classification, metadata, state.year))
    }
  }
  render(store.getState())
  const unsubscribe = store.subscribe(render)
  return () => { unsubscribe(); target.replaceChildren(); target.classList.remove('map-key') }
}
