import { formatValue, isShareIndicator } from '../data/indicators.js'

/** 当前年份的数值、全省排名，以及与上一年相比的变化（占比用百分点，其余用百分比）。 */
export function describeCity(store, adcode, { indicator, year } = store.getState()) {
  const metadata = store.indicators.get(indicator)
  const value = store.getValue(indicator, year, adcode)
  const values = [...store.regions.values()].filter((region) => region.level === 'city')
    .map((city) => store.getValue(indicator, year, city.adcode)).filter(Number.isFinite)
  const rank = Number.isFinite(value) ? values.filter((other) => other > value).length + 1 : null
  const previous = store.getValue(indicator, year - 1, adcode)
  let change = null
  if (Number.isFinite(value) && Number.isFinite(previous)) {
    change = isShareIndicator(indicator)
      ? { amount: value - previous, text: `${value - previous >= 0 ? '+' : ''}${(value - previous).toFixed(2)} 个百分点` }
      : previous > 0 ? { amount: value - previous, text: `${value >= previous ? '+' : ''}${((value / previous - 1) * 100).toFixed(1)}%` } : null
  }
  return { name: store.regions.get(adcode).short_name, metadata, value, rank, total: values.length, change }
}

export function createMapTooltip({ target, store }) {
  const tooltip = document.createElement('div')
  tooltip.className = 'map-tooltip'
  tooltip.hidden = true
  tooltip.setAttribute('aria-hidden', 'true')
  target.append(tooltip)
  let current = null
  const render = () => {
    if (!current) { tooltip.hidden = true; return }
    const { name, metadata, value, rank, total, change } = describeCity(store, current.adcode)
    const { year } = store.getState()
    tooltip.innerHTML = `
      <p class="map-tooltip-name"></p>
      <p class="map-tooltip-value"><strong></strong> <span></span></p>
      <p class="map-tooltip-meta"></p>`
    tooltip.querySelector('.map-tooltip-name').textContent = `${name} · ${year} 年`
    tooltip.querySelector('strong').textContent = formatValue(value, metadata)
    tooltip.querySelector('.map-tooltip-value span').textContent = value === null ? '' : metadata.unit
    const meta = tooltip.querySelector('.map-tooltip-meta')
    if (rank) meta.append(`全省第 ${rank} / ${total}`)
    if (change) {
      const delta = document.createElement('span')
      delta.className = change.amount >= 0 ? 'is-up' : 'is-down'
      delta.textContent = `较上年 ${change.text}`
      meta.append(delta)
    }
    tooltip.hidden = false
    const [x, y] = current.pixel
    const { width, height } = tooltip.getBoundingClientRect()
    // 产业占比悬停时饼图会放大，提示框离远一些以免遮住扇区标签
    const gap = isShareIndicator(store.getState().indicator) ? 72 : 16
    const flipX = x + gap + width > window.innerWidth - 8
    const flipY = y + gap + height > window.innerHeight - 8
    tooltip.style.left = `${flipX ? x - gap - width : x + gap}px`
    tooltip.style.top = `${flipY ? y - gap - height : y + gap}px`
  }
  const unsubscribe = store.subscribe(render)
  return {
    show(hover) { current = hover; render() },
    destroy() { unsubscribe(); tooltip.remove() },
  }
}
