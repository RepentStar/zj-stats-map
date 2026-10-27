import test from 'node:test'
import assert from 'node:assert/strict'
import { init } from 'echarts/core'
import { loadChartType } from '../src/charts/explore.js'
import { createChartSnapshot } from '../src/charts/snapshot.js'
import { createExploreOption } from '../src/charts/exploreOptions.js'
import { createStore } from '../src/data/store.js'
import { PALETTE } from '../src/map/breaks.js'

await Promise.all(['pie', 'rank', 'line'].map(loadChartType))

function fixture() {
  return createStore({
    regions: [
      { adcode: '330000', level: 'province', short_name: '浙江' },
      { adcode: '330100', level: 'city', short_name: '杭州' },
      { adcode: '330200', level: 'city', short_name: '宁波' },
      { adcode: '330300', level: 'city', short_name: '温州' },
    ],
    indicators: [
      { indicator: 'pop_resident', label: '常住人口', unit: '万人', decimals: 1 },
      { indicator: 'pop_density', label: '人口密度', unit: '人/km²', decimals: 1 },
    ],
    stats: [2016, 2025].flatMap((year) => [
      { adcode: '330100', year, indicator: 'pop_resident', value: 20 },
      { adcode: '330200', year, indicator: 'pop_resident', value: 30 },
      { adcode: '330100', year, indicator: 'pop_density', value: 200 },
      { adcode: '330200', year, indicator: 'pop_density', value: 0 },
    ]),
  })
}

test('chart requests capture independent filters, use all cities as fallback, and exclude province', () => {
  const store = fixture()
  const first = createChartSnapshot(store, 'rank')
  assert.deepEqual(first.getState().selectedCities, ['330100', '330200', '330300'])
  store.setState({ year: 2016, indicator: 'pop_density', selectedCities: ['330200'] })
  const second = createChartSnapshot(store, 'rank')
  assert.equal(first.getState().year, 2025)
  assert.equal(first.getState().indicator, 'pop_resident')
  assert.deepEqual(second.getState(), { year: 2016, indicator: 'pop_density', selectedCities: ['330200'] })
  store.setState({ selectedCities: [] })
  assert.deepEqual(second.getState().selectedCities, ['330200'])
})

test('population pie uses additive population even when map shows density, omitting missing observations', () => {
  const store = fixture()
  store.setState({ indicator: 'pop_density' })
  const option = createExploreOption(createChartSnapshot(store, 'pie'), 'pie')
  assert.deepEqual(option.series[0].data.map(({ name, value }) => [name, value]), [['杭州', 20], ['宁波', 30]])
  assert.equal(store.getState().indicator, 'pop_density')
  assert.match(option.tooltip.formatter({ data: option.series[0].data[0], percent: 40 }), /万人\n当前范围占比 40%/)
  store.setState({ selectedCities: ['330200'] })
  assert.equal(createExploreOption(createChartSnapshot(store, 'pie'), 'pie').series[0].data.length, 1)
})

test('rank sorts actual values, retains zero, omits missing values and colors bars like the map', () => {
  const store = fixture()
  const population = createExploreOption(createChartSnapshot(store, 'rank'), 'rank')
  assert.deepEqual(population.yAxis.data, ['宁波', '杭州'])
  assert.ok(population.series[0].data.every((row) => row.itemStyle.color === PALETTE[3]))
  store.setState({ indicator: 'pop_density' })
  const density = createExploreOption(createChartSnapshot(store, 'rank'), 'rank')
  assert.deepEqual(density.series[0].data.map((row) => row.value), [200, 0])
  const [high, low] = density.series[0].data.map((row) => row.itemStyle.color)
  assert.ok(PALETTE.includes(high) && PALETTE.includes(low))
  assert.notEqual(high, low)
})

test('empty selections of available observations show an explicit empty state instead of false zeros', () => {
  const store = fixture()
  store.setState({ selectedCities: ['330300'] })
  for (const type of ['pie', 'rank']) {
    const option = createExploreOption(createChartSnapshot(store, type), type)
    assert.deepEqual(option.series, [])
    assert.match(option.title.text, /无可展示数据/)
  }
})

test('all requested chart types render SVG using the registered runtime modules', () => {
  const store = fixture()
  for (const type of ['pie', 'rank', 'line']) {
    const chart = init(null, null, { renderer: 'svg', ssr: true, width: 540, height: 330 })
    try {
      chart.setOption(createExploreOption(createChartSnapshot(store, type), type))
      const svg = chart.renderToSVGString()
      assert.match(svg, /<svg/)
      assert.match(svg, /杭州/)
      assert.match(svg, /宁波/)
    } finally { chart.dispose() }
  }
})
