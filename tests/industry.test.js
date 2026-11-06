import test from 'node:test'
import assert from 'node:assert/strict'
import { createChartSnapshot } from '../src/charts/snapshot.js'
import { createExploreOption } from '../src/charts/exploreOptions.js'
import { createStore } from '../src/data/store.js'
import { actualData } from './helpers/data.js'

const keys = ['primary', 'secondary', 'tertiary']
const codes = ['330100', '330200', '330300']
function fixture({ missingMetadata = false } = {}) {
  return createStore({
    regions: [
      { adcode: '330000', level: 'province', short_name: '浙江' },
      ...codes.map((adcode, index) => ({ adcode, level: 'city', short_name: ['杭州', '宁波', '温州'][index] })),
    ],
    indicators: [
      { indicator: 'pop_density', label: '人口密度', unit: '人/km²', decimals: 1 },
      ...['share', 'gdp'].flatMap((prefix) => keys.map((sector) => ({
        indicator: `${prefix}_${sector}`, label: sector, unit: prefix === 'share' ? '%' : '亿元', decimals: 2,
      }))),
    ].filter(({ indicator }) => !missingMetadata || indicator !== 'share_primary'),
    stats: [2016, 2025].flatMap((year) => codes.flatMap((adcode, cityIndex) =>
      keys.flatMap((sector, index) => [
        { adcode, year, indicator: `share_${sector}`, value: cityIndex === 0 ? [0, 19.99, 80.01][index] : [0, 50, 50][index] },
        { adcode, year, indicator: `gdp_${sector}`, value: (cityIndex === 0 ? [0, 200, 800][index] : [0, 500, 500][index]) + (year === 2016 ? 10 : 0) },
      ]))).filter((row) => !(row.adcode === '330300' && row.indicator.endsWith('tertiary'))),
  })
}

test('radar preserves precomputed shares and uses fixed axes and styles across years and city selections', () => {
  const store = fixture()
  const radar = createExploreOption(createChartSnapshot(store, 'radar'), 'radar')
  assert.equal(store.getState().indicator, 'pop_density')
  assert.deepEqual(radar.series[0].data[0].value, [0, 19.99, 80.01])
  assert.equal(radar.radar.length, radar.series.length)
  assert.deepEqual(radar.series.map(({ radarIndex }) => radarIndex), radar.series.map((_, index) => index))
  for (const { indicator } of radar.radar) {
    assert.deepEqual(indicator.map(({ min, max }) => [min, max]), [[0, 5], [15, 50], [50, 85]])
  }
  assert.match(radar.graphic.at(-1).style.text, /第一产业 0–5%　第二产业 15–50%　第三产业 50–85%/)
  assert.deepEqual(radar.graphic.slice(0, -1).map(({ style }) => style.text), ['杭州', '宁波'])
  store.setState({ year: 2016 })
  assert.deepEqual(createExploreOption(createChartSnapshot(store, 'radar'), 'radar').radar[0].indicator, radar.radar[0].indicator)
  const color = radar.series[1].itemStyle.color
  const symbol = radar.series[1].symbol
  store.setState({ year: 2016, selectedCities: ['330200'] })
  const single = createExploreOption(createChartSnapshot(store, 'radar'), 'radar')
  assert.equal(single.series[0].itemStyle.color, color)
  assert.equal(single.series[0].symbol, symbol)
  assert.match(radar.tooltip.formatter({ data: radar.series[0].data[0] }), /第二产业：19.99 %/)
})

test('stack reads three sector values in city order, retains zeros and exposes city IDs on every segment', () => {
  const option = createExploreOption(createChartSnapshot(fixture(), 'stack'), 'stack')
  assert.deepEqual(option.yAxis.data, ['杭州', '宁波'])
  assert.deepEqual(option.series.map(({ name }) => name), ['第一产业', '第二产业', '第三产业'])
  assert.ok(option.series.every(({ stack }) => stack === 'industry'))
  assert.deepEqual(option.series.map((series) => series.data[0].value), [0, 200, 800])
  assert.ok(option.series.every((series) => series.data.every((row, index) => row.adcode === codes[index])))
  assert.equal(option.xAxis.name, '亿元')
  const tooltip = option.tooltip.formatter({ data: option.series[1].data[0] })
  assert.match(tooltip, /2025 年 杭州/)
  assert.match(tooltip, /第一产业：0.00 亿元/)
  assert.match(tooltip, /第三产业：800.00 亿元/)
})

test('incomplete city triplets are omitted with feedback, and entirely missing data stays empty', () => {
  const store = fixture()
  for (const type of ['radar', 'stack']) {
    const option = createExploreOption(createChartSnapshot(store, type), type)
    assert.match(option.title.text, /1 市缺少完整三项数据/)
    assert.match(option.aria.label.description, /未展示/)
    assert.ok(option.series.every((series) => series.data.every((row) => row.adcode !== '330300')))
  }
  store.setState({ selectedCities: ['330300'] })
  for (const type of ['radar', 'stack']) {
    const option = createExploreOption(createChartSnapshot(store, type), type)
    assert.deepEqual(option.series, [])
    assert.match(option.title.text, /无完整产业数据/)
  }
  const noMetadata = createExploreOption(createChartSnapshot(fixture({ missingMetadata: true }), 'radar'), 'radar')
  assert.deepEqual(noMetadata.series, [])
})

test('industry charts preserve all six source indicators for every city and year', () => {
  const store = createStore(actualData)
  for (const year of store.years) {
    store.setState({ year })
    const radar = createExploreOption(createChartSnapshot(store, 'radar'), 'radar')
    const stack = createExploreOption(createChartSnapshot(store, 'stack'), 'stack')
    assert.equal(radar.series.length, 11)
    assert.equal(stack.series.length, 3)
    assert.equal(stack.yAxis.data.length, 11)
    assert.equal(radar.title, undefined)
    assert.equal(stack.title, undefined)
    for (const series of radar.series) {
      const { adcode, value } = series.data[0]
      assert.deepEqual(value, keys.map((sector) => store.getValue(`share_${sector}`, year, adcode)))
    }
    stack.series.forEach((series, index) => {
      assert.equal(series.data.length, 11)
      for (const { adcode, value } of series.data) {
        assert.equal(value, store.getValue(`gdp_${keys[index]}`, year, adcode))
      }
    })
  }
})
