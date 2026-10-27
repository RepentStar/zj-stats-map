import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { init } from 'echarts/core'
import { loadChartType } from '../src/charts/explore.js'
import { createChartSnapshot, createTimelineChartSource } from '../src/charts/snapshot.js'
import { createExploreOption } from '../src/charts/exploreOptions.js'
import { createStore } from '../src/data/store.js'
import { parseData } from '../src/data/loader.js'

await Promise.all(['pie', 'rank', 'line', 'radar', 'stack'].map(loadChartType))

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

test('industry charts freeze their year and cities without using or changing the map indicator', () => {
  const store = fixture()
  const radar = createChartSnapshot(store, 'radar')
  const stack = createChartSnapshot(store, 'stack')
  assert.equal(radar.getState().indicator, 'share_primary')
  assert.equal(stack.getState().indicator, 'gdp_primary')
  assert.deepEqual(radar.getState().selectedCities, codes)
  assert.equal(store.getState().indicator, 'pop_density')
  store.setState({ year: 2016, selectedCities: ['330200'] })
  assert.equal(radar.getState().year, 2025)
  assert.deepEqual(stack.getState().selectedCities, codes)
  const next = createExploreOption(createChartSnapshot(store, 'stack'), 'stack')
  assert.deepEqual(next.yAxis.data, ['宁波'])
  assert.deepEqual(next.series.map((series) => series.data[0].value), [10, 510, 510])
})

test('radar reads precomputed shares unchanged, fits axes across all years and keeps city colors stable', () => {
  const store = fixture()
  const radar = createExploreOption(createChartSnapshot(store, 'radar'), 'radar')
  assert.deepEqual(radar.series[0].data[0].value, [0, 19.99, 80.01])
  // 小多图：每市一个雷达，共用同一组跨年份固定坐标
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

test('stack reads three increases in city order, retains zeros and exposes city IDs on every segment', () => {
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

const dataUrl = new URL('../public/data/', import.meta.url)
const [regionsText, indicatorsText, statsText, geoText] = await Promise.all(
  ['regions.csv', 'indicators.csv', 'stats.csv', 'geo/zhejiang_city.json'].map((path) => readFile(new URL(path, dataUrl), 'utf8')),
)
const actualData = parseData({ regionsText, indicatorsText, statsText, geojson: JSON.parse(geoText) })

test('all ten actual years expose all 11 cities and six source indicators alongside the two registered task 2 indicators', () => {
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
  assert.equal(store.indicators.has('gdp'), true)
  assert.equal(store.indicators.has('gdp_per_capita'), true)
  assert.equal(store.recordCount, 1210)
})

test('all five chart sources follow the timeline and city selection while keeping their original indicator', () => {
  const store = createStore(actualData)
  store.setState({ selectedCities: ['330100', '330200'] })
  const types = ['pie', 'rank', 'line', 'radar', 'stack']
  const sources = types.map((type) => createTimelineChartSource(store, type))
  const updates = sources.map(() => [])
  const cleanups = sources.map((source, index) => source.subscribe((state) => updates[index].push(state.year)))
  store.setState({ indicator: 'income_urban_pc' })
  assert.ok(updates.every((years) => years.length === 0))
  store.setState({ selectedCities: ['330300'] })
  for (const year of [2016, 2019, 2025]) {
    store.setState({ year })
    sources.forEach((source, index) => {
      const state = source.getState()
      assert.equal(state.year, year)
      assert.deepEqual(state.selectedCities, ['330300'])
      const option = createExploreOption(source, types[index])
      if (types[index] === 'line') {
        assert.equal(option.series[0].markLine.data[0].xAxis, String(year))
        assert.equal(option.series[0].data.length, 10)
      } else if (types[index] === 'radar') {
        assert.deepEqual(option.series[0].data[0].value, keys.map((sector) => store.getValue(`share_${sector}`, year, '330300')))
      } else if (types[index] === 'stack') {
        assert.deepEqual(option.series.map((series) => series.data[0].value), keys.map((sector) => store.getValue(`gdp_${sector}`, year, '330300')))
      } else {
        assert.equal(state.indicator, 'pop_resident')
        assert.equal(option.series[0].data.find((row) => row.adcode === '330300').value, store.getValue('pop_resident', year, '330300'))
      }
    })
  }
  assert.ok(updates.every((years) => years.join() === '2025,2016,2019,2025'))
  cleanups.forEach((cleanup) => cleanup())
  store.setState({ year: 2020, selectedCities: ['330100'] })
  assert.ok(updates.every((years) => years.length === 4))
  const next = createTimelineChartSource(store, 'rank')
  assert.equal(next.getState().indicator, 'income_urban_pc')
  assert.deepEqual(next.getState().selectedCities, ['330100'])
})

test('open charts replace city data immediately and restore all cities when selection is cleared', () => {
  const store = createStore(actualData)
  const allCodes = actualData.regions.filter((region) => region.level === 'city').map((region) => region.adcode)
  for (const type of ['pie', 'rank', 'line', 'radar', 'stack']) {
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
        const svg = chart.renderToSVGString()
        assert.match(svg, /<svg/)
        assert.doesNotMatch(svg, /NaN|undefined/)
      }
      const before = renders
      store.setState({ selectedCities: [] })
      assert.equal(renders, before)
    } finally { unsubscribe(); chart.dispose() }
  }
})

test('a source created before chart loading uses the latest year and cities and follows playback', () => {
  const store = createStore(actualData)
  const source = createTimelineChartSource(store, 'rank')
  store.setState({ year: 2016, selectedCities: ['330200'] })
  assert.equal(source.getState().year, 2016)
  assert.deepEqual(source.getState().selectedCities, ['330200'])
  const updates = []
  const unsubscribe = source.subscribe((state) => updates.push(state.year))
  store.setState({ year: 2016 })
  store.setState({ year: 2017 })
  store.setState({ year: 2018 })
  assert.deepEqual(updates, [2017, 2018])
  unsubscribe()
})

test('registered modules render industry charts with actual data at desktop and mobile sizes', () => {
  const store = createStore(actualData)
  for (const type of ['radar', 'stack']) {
    for (const [width, height] of [[516, 330], [300, 260]]) {
      const chart = init(null, null, { renderer: 'svg', ssr: true, width, height })
      try {
        chart.setOption(createExploreOption(createChartSnapshot(store, type), type))
        const svg = chart.renderToSVGString()
        for (const label of ['<svg', '杭州', '宁波', '第一产业', '第二产业', '第三产业']) assert.ok(svg.includes(label), label)
        assert.doesNotMatch(svg, /NaN|undefined/)
      } finally { chart.dispose() }
    }
  }
})
