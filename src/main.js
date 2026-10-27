import './style.css'
import 'ol/ol.css'
import { loadData } from './data/loader.js'
import { createStore } from './data/store.js'
import { formatValue } from './data/indicators.js'
import { createClassifications } from './map/breaks.js'
import { createCityMap, toggleCity } from './map/layers.js'
import { createIndicatorPicker } from './ui/indicatorPicker.js'
import { createLegend } from './ui/legend.js'
import { createPlayer } from './ui/player.js'
import { createTimeline } from './ui/timeline.js'
import { createWindowManager } from './ui/windows.js'
import { createBubbleOverlay } from './map/overlay.js'
import { createMapTooltip } from './ui/tooltip.js'
import { createTimelineChartSource } from './charts/snapshot.js'
import { loadChartType } from './charts/loadType.js'

const app = document.querySelector('#app')
app.innerHTML = `
  <main class="map-workspace" aria-label="浙江省统计专题地图工作台">
    <div id="map" tabindex="0" role="region" aria-label="浙江省市级专题地图，方向键平移，加减键缩放。城市也可在控制面板中选择。"></div>
    <nav class="workspace-tools" aria-label="地图工作台工具">
      <h1>浙江统计地图</h1>
      <div class="tool-buttons">
        <button type="button" class="btn" data-variant="ghost" data-size="sm" data-open="controls">控制面板</button>
        <button type="button" class="btn" data-variant="ghost" data-size="sm" data-open="timeline">时间轴</button>
        <button type="button" class="btn" data-variant="ghost" data-size="sm" id="reset-view">返回全省</button>
        <button type="button" class="btn" data-variant="ghost" data-size="sm" id="close-all">关闭全部</button>
        <button type="button" class="btn" data-size="sm" data-open="charts">＋ 新建图表</button>
      </div>
    </nav>
    <aside id="map-key" aria-label="地图图例"></aside>
    <div id="windows" class="window-layer"></div>
    <p id="window-help" class="sr-only">可拖动标题栏移动窗口，也可聚焦标题栏后用方向键移动，按住 Shift 加快移动。窗口右下角可调整大小，Escape 关闭当前窗口。</p>
    <p id="announcer" class="sr-only" role="status" aria-live="polite"></p>
  </main>`

const cleanups = []
const controller = new AbortController()
const windows = createWindowManager({ target: document.querySelector('#windows'), fallbackFocus: document.querySelector('[data-open="controls"]') })
cleanups.push(() => windows.destroy())
const loading = windows.open({ key: 'status', title: '加载地图', width: 340, placement: 'center' })
loading.body.setAttribute('role', 'status')
loading.body.textContent = '正在加载统计数据与市级边界…'
let disposed = false

async function bootstrap() {
  try {
    const store = createStore(await loadData({ signal: controller.signal }))
    if (disposed) return
    const player = createPlayer(store)
    cleanups.push(() => player.destroy())
    const classifications = createClassifications(store)
    const tooltip = createMapTooltip({ target: document.querySelector('.map-workspace'), store })
    cleanups.push(() => tooltip.destroy())
    let overlay
    const onHover = (hover) => { tooltip.show(hover); overlay?.setHover(hover?.adcode ?? null) }
    const cityMap = createCityMap({ target: document.querySelector('#map'), store, classifications, onHover })
    cleanups.push(() => cityMap.destroy())
    overlay = createBubbleOverlay({ map: cityMap.map, store, classifications })
    cleanups.push(() => overlay.destroy())
    cleanups.push(createLegend({ target: document.querySelector('#map-key'), store, classifications }))
    const cities = [...store.regions.values()].filter((region) => region.level === 'city')
    const announce = (message) => { document.querySelector('#announcer').textContent = message }
    const chartNames = { pie: '人口占比', rank: '城市排行', line: '历年趋势', radar: '产业占比', stack: '产业增加值' }

    function openChart(type, trigger) {
      const snapshot = createTimelineChartSource(store, type)
      const { indicator } = snapshot.getState()
      const metadata = snapshot.indicators.get(indicator)
      const panel = windows.open({ title: chartNames[type], width: type === 'line' || type === 'radar' ? 640 : 540, placement: 'chart', trigger })
      panel.body.classList.add('chart-body')
      const context = document.createElement('p')
      context.className = 'chart-context'
      const metric = type === 'radar' ? '三次产业占比（%）'
        : type === 'stack' ? '三次产业增加值（亿元）' : `${metadata.label}（${metadata.unit}）`
      const message = document.createElement('p')
      message.className = 'chart-message'
      message.setAttribute('role', 'status')
      const target = document.createElement('div')
      target.className = type === 'radar' ? 'chart-canvas chart-canvas-tall' : 'chart-canvas'
      target.setAttribute('role', 'img')
      const renderContext = ({ year, selectedCities }) => {
        const scope = store.getState().selectedCities.length ? `所选 ${selectedCities.length} 市` : `全省 ${cities.length} 市`
        const period = type === 'line' ? `${store.years[0]} - ${store.years.at(-1)} 年（当前 ${year} 年）` : `${year} 年`
        context.textContent = `${period} · ${metric}，${scope}`
        target.setAttribute('aria-label', `${context.textContent}，${chartNames[type]}`)
      }
      renderContext(snapshot.getState())
      panel.onClose(snapshot.subscribe(renderContext))
      panel.body.append(context, message, target)
      const loadChart = async () => {
        message.replaceChildren(document.createTextNode('正在生成图表…'))
        message.hidden = false
        target.hidden = true
        let moduleLoaded = false
        try {
          const [{ createExploreChart }] = await Promise.all([
            import('./charts/explore.js'), loadChartType(type),
          ])
          moduleLoaded = true
          if (disposed || panel.closed) return
          target.hidden = false
          const cleanup = createExploreChart({ target, snapshot, type, onSelectCity: (adcode) => toggleCity(store, adcode), onSelectYear: (selectedYear) => {
            player.pause()
            store.setState({ year: selectedYear })
          } })
          panel.onClose(cleanup)
          message.hidden = true
        } catch (error) {
          if (disposed || panel.closed) return
          target.hidden = true
          message.textContent = `图表生成失败：${error.message}`
          const retry = document.createElement('button')
          retry.type = 'button'
          retry.className = 'btn'
          retry.dataset.variant = 'outline'
          retry.textContent = moduleLoaded ? '重试' : '重新加载页面'
          retry.addEventListener('click', moduleLoaded ? loadChart : () => window.location.reload(), { once: true })
          message.append(retry)
        }
      }
      void loadChart()
      announce(`已新建${chartNames[type]}窗口，${context.textContent}`)
    }

    const panels = {
      controls(trigger) {
        const panel = windows.open({ key: 'controls', title: '地图控制', width: 310, placement: 'controls', trigger })
        if (!panel.isNew) return
        panel.body.innerHTML = `
          <div class="indicator-picker"></div>
          <p class="map-context"></p>
          <div class="selection-heading"><h3>选择城市 <span class="selection-count"></span></h3><button type="button" class="clear-selection btn" data-variant="ghost" data-size="xs">清空</button></div>
          <div class="city-picker" aria-label="选择城市，可多选"></div>
          <p class="selection-summary" aria-live="polite"></p>
          <button type="button" class="btn compare-selection">生成历年趋势</button>`
        panel.onClose(createIndicatorPicker({ target: panel.body.querySelector('.indicator-picker'), store }))
        const buttons = cities.map((city) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'btn'
          button.dataset.variant = 'outline'
          button.dataset.size = 'sm'
          button.textContent = city.short_name
          button.addEventListener('click', () => toggleCity(store, city.adcode))
          panel.body.querySelector('.city-picker').append(button)
          return [city, button]
        })
        const render = ({ year, indicator, selectedCities }) => {
          const metadata = store.indicators.get(indicator)
          panel.body.querySelector('.map-context').textContent = `${year} 年`
          panel.body.querySelector('.selection-count').textContent = selectedCities.length ? `(${selectedCities.length})` : ''
          panel.body.querySelector('.clear-selection').disabled = !selectedCities.length
          for (const [city, button] of buttons) {
            const value = formatValue(store.getValue(indicator, year, city.adcode), metadata)
            button.setAttribute('aria-pressed', String(selectedCities.includes(city.adcode)))
            button.setAttribute('aria-label', `${city.short_name}，${value}${value === '无数据' ? '' : metadata.unit}`)
            button.title = `${city.short_name}：${value} ${metadata.unit}`
          }
          const summary = panel.body.querySelector('.selection-summary')
          summary.hidden = !selectedCities.length
          summary.textContent = selectedCities.length
            ? `已选 ${selectedCities.map((code) => store.regions.get(code).short_name).join('、')}`
            : ''
        }
        render(store.getState())
        panel.onClose(store.subscribe(render))
        panel.body.querySelector('.clear-selection').addEventListener('click', () => store.setState({ selectedCities: [] }))
        panel.body.querySelector('.compare-selection').addEventListener('click', (event) => openChart('line', event.currentTarget))
      },
      timeline(trigger) {
        const panel = windows.open({ key: 'timeline', title: '时间轴', width: 570, placement: 'timeline', trigger })
        if (!panel.isNew) return
        panel.body.classList.add('timeline')
        panel.onClose(createTimeline({ target: panel.body, store, player }))
        panel.onClose(() => player.pause())
      },
      charts(trigger) {
        const panel = windows.open({ key: 'charts', title: '新建图表', width: 320, placement: 'chooser', trigger })
        if (!panel.isNew) return
        panel.body.innerHTML = `
          <div class="chart-choices">
            <button type="button" class="btn" data-variant="outline" data-chart="pie"><strong>人口占比</strong><span>环形图 · 各市常住人口构成</span></button>
            <button type="button" class="btn" data-variant="outline" data-chart="rank"><strong>城市排行</strong><span>条形图 · 当前指标大小对比</span></button>
            <button type="button" class="btn" data-variant="outline" data-chart="line"><strong>历年趋势</strong><span>折线图 · 多城市年度变化</span></button>
            <button type="button" class="btn" data-variant="outline" data-chart="radar"><strong>产业占比</strong><span>雷达图 · 三次产业结构对比</span></button>
            <button type="button" class="btn" data-variant="outline" data-chart="stack"><strong>产业增加值</strong><span>堆叠图 · 三次产业规模对比</span></button>
          </div>`
        panel.body.querySelectorAll('[data-chart]').forEach((button) => button.addEventListener('click', () => openChart(button.dataset.chart, button)))
      },
    }
    const toolbar = document.querySelector('.workspace-tools')
    const handleToolbar = (event) => {
      const button = event.target.closest('button')
      if (!button) return
      if (button.dataset.open) panels[button.dataset.open](button)
      if (button.id === 'reset-view') cityMap.resetView()
      if (button.id === 'close-all') { windows.closeAll(); announce('已关闭全部悬浮窗口') }
    }
    toolbar.addEventListener('click', handleToolbar)
    cleanups.push(() => toolbar.removeEventListener('click', handleToolbar))
    toolbar.querySelectorAll('button').forEach((button) => { button.disabled = false })
    loading.close({ restoreFocus: false })
    if (window.matchMedia('(min-width: 761px)').matches) panels.controls()
    panels.timeline()
    announce('统计数据与 11 市地图已就绪，可从新建图表生成可视化窗口。')
  } catch (error) {
    if (disposed) return
    console.error('数据初始化失败', error)
    windows.closeAll()
    cleanups.splice(1).reverse().forEach((cleanup) => cleanup())
    loading.close({ restoreFocus: false })
    const failure = windows.open({ key: 'error', title: '地图加载失败', width: 360, placement: 'center' })
    failure.body.setAttribute('role', 'alert')
    failure.body.textContent = error.message
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.className = 'btn'
    retry.textContent = '重新加载'
    retry.addEventListener('click', () => window.location.reload())
    failure.body.append(retry)
  }
}

document.querySelectorAll('.workspace-tools button').forEach((button) => { button.disabled = true })
void bootstrap()
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposed = true
    controller.abort()
    cleanups.splice(0).reverse().forEach((cleanup) => cleanup())
  })
}
