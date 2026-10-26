import test from 'node:test'
import assert from 'node:assert/strict'
import { init } from 'echarts/core'
import '../src/charts/line.js'
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
      { adcode: '330200', year, indicator: 'pop_resident', value: year * 2 },
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
  assert.equal(option.tooltip.formatter([{ axisValue: '2020' }]), '2020 年\n杭州：2,020.0 万人\n宁波：4,040.0 万人')
  assert.equal(option.tooltip.formatter([{ axisValue: '2025' }]), '2025 年\n杭州：2,025.0 万人\n宁波：4,050.0 万人')
  assert.match(option.tooltip.formatter([{ axisValue: '2016' }]), /万人/)
})

test('registered ECharts modules render the full trend as SVG', () => {
  const store = createFixture()
  store.setState({ selectedCities: ['330100', '330200'] })
  const chart = init(null, null, { renderer: 'svg', ssr: true, width: 950, height: 380 })
  try {
    chart.setOption(createLineOption(store))
    const svg = chart.renderToSVGString()
    assert.match(svg, /<svg/)
    for (const label of ['杭州', '宁波', '2016', '2025', '当前 2025', '万人']) {
      assert.ok(svg.includes(label), `missing chart label: ${label}`)
    }
  } finally {
    chart.dispose()
  }
})
