import { readFile } from 'node:fs/promises'
import { parseData } from '../../src/data/loader.js'

const [regionsText, indicatorsText, statsText, geoText] = await Promise.all(
  ['regions.csv', 'indicators.csv', 'stats.csv', 'geo/zhejiang_city.json']
    .map((path) => readFile(new URL(`../../public/data/${path}`, import.meta.url), 'utf8')),
)

export const actualData = parseData({ regionsText, indicatorsText, statsText, geojson: JSON.parse(geoText) })
