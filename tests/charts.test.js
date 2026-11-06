import test from 'node:test'
import assert from 'node:assert/strict'
import { init } from 'echarts/core'
import { loadChartType } from '../src/charts/loadType.js'
import { createTimelineChartSource } from '../src/charts/snapshot.js'
import { createExploreOption } from '../src/charts/exploreOptions.js'
import { formatValue } from '../src/data/indicators.js'
import { actualData } from './helpers/data.js'
import { createLineOption } from '../src/charts/lineOptions.js'
import { createStore } from '../src/data/store.js'

function createFixture() {
  return createStore({
    regions: [
      { adcode: '330100', level: 'city', short_name: '杭州' },
      { adcode: '330200', level: 'city', short_name: '宁波' },
    ],
    indicators: [
      { indicator: 'pop_resident', label: '常住人口', unit: '万人', decimals: 1 },
      { indicator: 'pop_density', label: '人口密度', unit: '人/km²', decimals: 1 },
    ],
    stats: [2016, 2019, 2020, 2025].flatMap((year) => [
      { adcode: '330100', year, indicator: 'pop_resident', value: year },
      { adcode: '330200', year, indicator: 'pop_resident', value: year === 2020 ? 0 : year * 2 },
      { adcode: '330100', year, indicator: 'pop_density', value: year * 3 },
    ]).filter((row) => !(row.adcode === '330100' && row.year === 2019 && row.indicator === 'pop_resident')),
  })
}

test('line series retain null gaps, stable city colors, and only selected cities', () => {
  const store = createFixture()
  store.setState({ selectedCities: ['330100', '330200'] })
  const option = createLineOption(store)
  assert.deepEqual(option.series.map((series) => series.id), ['330100', '330200'])
  assert.deepEqual(option.series[0].data, [['2016', 2016], ['2019', null], ['2020', 2020], ['2025', 2025]])
  assert.equal(option.series[0].connectNulls, false)
  assert.equal(option.series[1].data[2][1], 0)
  const ningboColor = option.series[1].itemStyle.color
  store.setState({ selectedCities: ['330200'] })
  assert.equal(createLineOption(store).series[0].itemStyle.color, ningboColor)
  store.setState({ selectedCities: [] })
  assert.deepEqual(createLineOption(store).series, [])
})

test('year and indicator changes update the current-year marker and precomputed values', () => {
  const store = createFixture()
  store.setState({ selectedCities: ['330100', '330200'], year: 2020, indicator: 'pop_density' })
  const option = createLineOption(store)
  assert.equal(option.series[0].markLine.data[0].xAxis, '2020')
  assert.equal(option.series[1].markLine, undefined)
  assert.equal(option.series[0].data[0][1], 6048)
  assert.ok(option.series[1].data.every(([, value]) => value === null))
  assert.equal(option.yAxis.name, '人/km²')
})

test('tooltips show years, city values, missing values, and units', () => {
  const store = createFixture()
  store.setState({ selectedCities: ['330100', '330200'] })
  const option = createLineOption(store)
  assert.match(option.tooltip.formatter([{ axisValue: '2019' }]), /杭州：无数据/)
  assert.equal(option.tooltip.formatter([{ axisValue: '2020' }]), '2020 年\n杭州：2,020.0 万人\n宁波：0.0 万人')
  assert.equal(option.tooltip.formatter([{ axisValue: '2025' }]), '2025 年\n杭州：2,025.0 万人\n宁波：4,050.0 万人')
  assert.match(option.tooltip.formatter([{ axisValue: '2016' }]), /万人/)
})

test('rankings and trends preserve source values and metadata for every indicator', () => {
  const store = createStore(actualData)
  for (const [indicator, metadata] of store.indicators) {
    store.setState({ indicator })
    const rank = createTimelineChartSource(store, 'rank')
    const trend = createTimelineChartSource(store, 'line')
    for (const year of [store.years[0], store.years.at(-1)]) {
      store.setState({ year })
      const bars = createExploreOption(rank, 'rank')
      const lines = createExploreOption(trend, 'line')
      assert.equal(bars.series[0].data.length, 11)
      assert.equal(lines.series.length, 11)
      assert.equal(lines.yAxis.name, metadata.unit)
      assert.equal(lines.series[0].markLine.data[0].xAxis, String(year))
      assert.ok(bars.series[0].data.every((row, index, rows) => index === 0 || rows[index - 1].value >= row.value))
      for (const bar of bars.series[0].data) {
        assert.equal(bar.value, store.getValue(indicator, year, bar.adcode))
        assert.ok(bars.tooltip.formatter({ data: bar }).includes(`${formatValue(bar.value, metadata)} ${metadata.unit}`))
      }
      for (const series of lines.series) {
        assert.deepEqual(series.data, store.getSeries(indicator, series.id).map(([pointYear, value]) => [String(pointYear), value]))
      }
    }
  }
})

test('large economy labels fit desktop and narrow chart windows', async () => {
  await Promise.all(['rank', 'line'].map(loadChartType))
  await import('../src/charts/explore.js')
  const store = createStore(actualData)
  for (const indicator of ['gdp', 'gdp_per_capita']) {
    store.setState({ indicator })
    for (const type of ['rank', 'line']) {
      for (const width of [300, 540]) {
        const chart = init(null, null, { renderer: 'svg', ssr: true, width, height: 330 })
        try {
          chart.setOption(createExploreOption(createTimelineChartSource(store, type), type))
          assert.match(chart.renderToSVGString(), /杭州/)
          let labels = 0
          for (const element of chart.getZr().storage.getDisplayList()) {
            if (element.type !== 'tspan' || !/\d/.test(element.style.text)) continue
            labels++
            const rect = element.getBoundingRect().clone()
            if (element.transform) rect.applyTransform(element.transform)
            assert.ok(rect.x >= -1 && rect.x + rect.width <= width + 1,
              `${indicator} ${type} ${width}px clipped label: ${element.style.text}`)
          }
          assert.ok(labels > 0, 'chart must contain numeric labels')
        } finally { chart.dispose() }
      }
    }
  }
})
