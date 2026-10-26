import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseData, parseCsv, loadData } from '../src/data/loader.js'
import { createStore } from '../src/data/store.js'
import { formatValue } from '../src/data/indicators.js'
import { createChartSnapshot } from '../src/charts/snapshot.js'
import { createExploreOption } from '../src/charts/exploreOptions.js'

const dataUrl = new URL('../public/data/', import.meta.url)
const [regionsText, indicatorsText, statsText, geoText] = await Promise.all(
  ['regions.csv', 'indicators.csv', 'stats.csv', 'geo/zhejiang_city.json'].map((path) => readFile(new URL(path, dataUrl), 'utf8')),
)
const fixture = { regionsText, indicatorsText, statsText, geojson: JSON.parse(geoText) }
const parse = (overrides = {}) => parseData({ ...structuredClone(fixture), ...overrides })

test('actual data preserves string codes and explicitly parses numerical fields', () => {
  const data = parse()
  assert.equal(data.regions.length, 12)
  assert.equal(data.geojson.features.length, 11)
  assert.equal(data.stats.length, 990)
  assert.equal(data.indicators.length, 9)
  assert.equal(data.regions[0].area_land, null)
  assert.equal(data.regions[1].adcode, '330100')
  assert.equal(data.regions[1].area_land, 16873.5)
  assert.equal(data.stats[0].year, 2016)
  assert.equal(data.stats.find((row) => row.adcode === '330100' && row.year === 2016 && row.indicator === 'pop_resident').value, 918.8)
  assert.equal(data.indicators[0].decimals, 1)
  assert.ok(data.geojson.features.every((feature) => typeof feature.properties.adcode === 'string'))
})

test('numeric source GeoJSON codes are normalized without mutating the source', () => {
  const geojson = structuredClone(fixture.geojson)
  geojson.features[0].properties.adcode = 330100
  const parsed = parse({ geojson })
  assert.equal(parsed.geojson.features[0].properties.adcode, '330100')
  assert.equal(geojson.features[0].properties.adcode, 330100)
})

test('new industry and income indicators feed rankings and trends with registered units', () => {
  const store = createStore(parse())
  for (const indicator of ['gdp_primary', 'gdp_secondary', 'gdp_tertiary', 'share_primary', 'share_secondary', 'share_tertiary', 'income_urban_pc']) {
    store.setState({ indicator, year: 2025 })
    const rank = createExploreOption(createChartSnapshot(store, 'rank'), 'rank')
    assert.equal(rank.series[0].data.length, 11)
    assert.ok(rank.series[0].data.every((row, index, rows) => index === 0 || rows[index - 1].value >= row.value))
    const trend = createExploreOption(createChartSnapshot(store, 'line'), 'line')
    assert.equal(trend.series.length, 11)
    assert.equal(trend.yAxis.name, store.indicators.get(indicator).unit)
    assert.ok(trend.series.every((series) => series.data.length === 10 && series.data.every(([, value]) => Number.isFinite(value))))
  }
  assert.equal(store.getValue('income_urban_pc', 2016, '330100'), 52185)
  assert.equal(store.getValue('income_urban_pc', 2025, '330600'), 87605)
  assert.equal(store.getValue('share_tertiary', 2016, '330100'), 61.25)
})

test('CSV parsing accepts BOM and quoted metadata but rejects a wrong schema', () => {
  const rows = parseCsv('\uFEFFadcode,year,indicator,value\n330100,2016,pop_resident,918.8\n', 'stats')
  assert.equal(rows[0].adcode, '330100')
  assert.equal(parse({ indicatorsText: indicatorsText.replace('统计年鉴', '"统计年鉴,官方"') }).indicators[0].source, '统计年鉴,官方')
  assert.throws(() => parseCsv('adcode,year,value\n330100,2016,1', 'stats'), /列名/)
})

test('duplicate primary keys, unknown regions, unknown indicators, and invalid values are rejected', () => {
  const firstRow = statsText.split(/\r?\n/)[1]
  const duplicateRows = [...statsText.trim().split(/\r?\n/), firstRow, ''].join('\n')
  assert.throws(() => parse({ statsText: duplicateRows }), /主键重复/)
  assert.throws(() => parse({ statsText: statsText.replace('330100,2016', '330999,2016') }), /未登记/)
  assert.throws(() => parse({ statsText: statsText.replace('pop_resident,918.8', 'gdp,918.8') }), /指标未登记/)
  for (const value of ['', 'NaN', 'Infinity', '-']) {
    assert.throws(() => parse({ statsText: statsText.replace('pop_resident,918.8', `pop_resident,${value}`) }), /有效数值/)
  }
})

test('missing or duplicate boundary features cannot silently pass', () => {
  const geojson = structuredClone(fixture.geojson)
  geojson.features.pop()
  assert.throws(() => parse({ geojson }), /不完全匹配/)
  geojson.features.push(geojson.features[0])
  assert.throws(() => parse({ geojson }), /重复/)
})

test('indexed lookup, chronological series, and missing values follow the contract', () => {
  const data = parse()
  data.stats = data.stats.filter((row) => !(row.adcode === '330100' && row.year === 2017 && row.indicator === 'pop_resident'))
  const store = createStore(data)
  assert.deepEqual(store.years, [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
  assert.equal(store.stats.get('pop_resident').get(2016).get('330100'), 918.8)
  assert.equal(store.getValue('pop_resident', 2016, '330100'), 918.8)
  assert.equal(store.getValue('pop_resident', 2016, '330000'), null)
  assert.deepEqual(store.getSeries('pop_resident', '330100').slice(0, 3), [[2016, 918.8], [2017, null], [2018, 980.6]])
})

test('state supports multiple cities and notifies once per change, then unsubscribes', () => {
  const store = createStore(parse())
  assert.deepEqual(store.getState(), { indicator: 'pop_resident', year: 2025, selectedCities: [] })
  const events = []
  const unsubscribe = store.subscribe((state) => events.push(state))
  const selectedCities = ['330100', '330200', '330100']
  store.setState({ year: 2020, selectedCities })
  selectedCities.push('330300')
  assert.deepEqual(store.getState().selectedCities, ['330100', '330200'])
  assert.ok(Object.isFrozen(store.getState().selectedCities))
  store.setState({ year: 2020 })
  assert.equal(events.length, 1)
  unsubscribe()
  store.setState({ indicator: 'pop_density' })
  assert.equal(events.length, 1)
})

test('invalid selections do not change the state', () => {
  const store = createStore(parse())
  const initial = store.getState()
  for (const patch of [{ year: 2000 }, { indicator: 'gdp' }, { selectedCities: ['330000'] }, { selectedCities: [330100] }, { unknown: true }]) {
    assert.throws(() => store.setState(patch))
    assert.equal(store.getState(), initial)
  }
})

test('formatting distinguishes zero from missing values', () => {
  assert.equal(formatValue(null), '无数据')
  assert.equal(formatValue(0), '0.0')
  assert.equal(formatValue(1234.56, { decimals: 1 }), '1,234.6')
})

test('HTTP loader uses the supplied base path and loads each asset once', async (context) => {
  const responses = new Map([
    ['regions.csv', regionsText], ['indicators.csv', indicatorsText],
    ['stats.csv', statsText], ['geo/zhejiang_city.json', geoText],
  ])
  const requests = []
  const controller = new AbortController()
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url)
    assert.equal(options.signal, controller.signal)
    return new Response(responses.get(url.replace('/nested/data/', '')))
  })
  assert.equal((await loadData({ baseUrl: '/nested/data/', signal: controller.signal })).stats.length, 990)
  assert.equal(new Set(requests).size, 4)
  assert.ok(requests.every((url) => url.startsWith('/nested/data/')))
})

test('HTTP errors and malformed boundary JSON produce actionable errors', async (context) => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }))
  await assert.rejects(loadData({ baseUrl: '/data/' }), /HTTP 404/)
  fetchMock.mock.mockImplementation(async (url) => new Response(url.endsWith('.json') ? '<html>fallback</html>' : ''))
  await assert.rejects(loadData({ baseUrl: '/data/' }), /有效 JSON/)
})
