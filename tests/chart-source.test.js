import test from 'node:test'
import assert from 'node:assert/strict'
import { init } from 'echarts/core'
import { loadChartType } from '../src/charts/explore.js'
import { createTimelineChartSource } from '../src/charts/snapshot.js'
import { createExploreOption } from '../src/charts/exploreOptions.js'
import { createStore } from '../src/data/store.js'
import { actualData } from './helpers/data.js'

const types = ['pie', 'rank', 'line', 'radar', 'stack']
const indicators = ['pop_resident', 'gdp', 'gdp_per_capita', 'share_primary', 'gdp_primary']
const sectors = ['primary', 'secondary', 'tertiary']

await Promise.all(types.map(loadChartType))

test('chart sources keep their metrics, read latest controls, follow years and cities, and unsubscribe', () => {
  const store = createStore(actualData)
  const sources = types.map((type, index) => {
    store.setState({ indicator: indicators[index] })
    return createTimelineChartSource(store, type)
  })
  store.setState({ year: 2016, selectedCities: ['330100'] })
  sources.forEach((source, index) => {
    assert.deepEqual(source.getState(), { indicator: indicators[index], year: 2016, selectedCities: ['330100'] })
  })

  const updates = sources.map(() => [])
  const cleanups = sources.map((source, index) => source.subscribe((state) => updates[index].push(state.year)))
  store.setState({ indicator: 'income_urban_pc' })
  assert.ok(updates.every((years) => years.length === 0))
  store.setState({ selectedCities: ['330300'] })
  for (const year of [2016, 2019, 2025]) {
    store.setState({ year })
    sources.forEach((source, index) => {
      const type = types[index]
      assert.deepEqual(source.getState(), { indicator: indicators[index], year, selectedCities: ['330300'] })
      const option = createExploreOption(source, type)
      if (type === 'line') {
        assert.equal(option.series[0].markLine.data[0].xAxis, String(year))
        assert.deepEqual(option.series[0].data, store.getSeries(indicators[index], '330300').map(([year, value]) => [String(year), value]))
      } else if (type === 'radar') {
        assert.deepEqual(option.series[0].data[0].value, sectors.map((sector) => store.getValue(`share_${sector}`, year, '330300')))
      } else if (type === 'stack') {
        assert.deepEqual(option.series.map((series) => series.data[0].value), sectors.map((sector) => store.getValue(`gdp_${sector}`, year, '330300')))
      } else {
        assert.equal(option.series[0].data[0].value, store.getValue(indicators[index], year, '330300'))
      }
    })
  }
  assert.ok(updates.every((years) => years.join() === '2016,2019,2025'))
  cleanups.forEach((cleanup) => cleanup())
  store.setState({ year: 2020, selectedCities: ['330200'] })
  assert.ok(updates.every((years) => years.length === 3))
  const next = createTimelineChartSource(store, 'rank')
  assert.deepEqual(next.getState(), { indicator: 'income_urban_pc', year: 2020, selectedCities: ['330200'] })
})

test('rendered charts remove stale cities and restore all cities when the selection is cleared', () => {
  const store = createStore(actualData)
  const allCodes = actualData.regions.filter((region) => region.level === 'city').map((region) => region.adcode)
  for (const type of types) {
    store.setState({ selectedCities: [] })
    const source = createTimelineChartSource(store, type)
    const chart = init(null, null, { renderer: 'svg', ssr: true, width: 540, height: 330 })
    let renders = 0
    const render = () => {
      chart.setOption(createExploreOption(source, type), { notMerge: true })
      renders++
    }
    const unsubscribe = source.subscribe(render)
    try {
      render()
      for (const selectedCities of [['330100'], ['330100', '330200'], ['330200'], []]) {
        const before = renders
        store.setState({ selectedCities })
        assert.equal(renders, before + 1, `${type} must update on selection`)
        const expected = selectedCities.length ? selectedCities : allCodes
        assert.deepEqual(source.getState().selectedCities, expected)
        const option = chart.getOption()
        const displayed = type === 'line' || type === 'radar'
          ? option.series.map((series) => series.id)
          : option.series[0].data.map((row) => row.adcode)
        assert.deepEqual([...displayed].sort(), [...expected].sort(), `${type} must remove stale cities`)
      }
      const before = renders
      store.setState({ selectedCities: [] })
      assert.equal(renders, before)
    } finally { unsubscribe(); chart.dispose() }
  }
})
