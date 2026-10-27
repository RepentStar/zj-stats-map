export function createIndicatorPicker({ target, store }) {
  const label = document.createElement('label')
  label.htmlFor = 'indicator-select'
  label.className = 'label'
  label.textContent = '统计指标'
  const select = document.createElement('select')
  select.id = 'indicator-select'
  select.className = 'select'
  // 按主题分组，便于在人口、产业结构、收入之间切换
  const groups = new Map()
  for (const metadata of store.indicators.values()) {
    const category = metadata.category || '其他'
    if (!groups.has(category)) {
      const group = document.createElement('optgroup')
      group.label = category
      groups.set(category, group)
      select.append(group)
    }
    const option = document.createElement('option')
    option.value = metadata.indicator
    option.textContent = `${metadata.label}（${metadata.unit}）`
    groups.get(category).append(option)
  }
  const change = () => store.setState({ indicator: select.value })
  select.addEventListener('change', change)
  const render = ({ indicator }) => { select.value = indicator }
  render(store.getState())
  const unsubscribe = store.subscribe(render)
  target.replaceChildren(label, select)
  return () => {
    unsubscribe()
    select.removeEventListener('change', change)
    target.replaceChildren()
  }
}
