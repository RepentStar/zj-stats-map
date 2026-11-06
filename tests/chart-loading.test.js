import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadChartType } from '../src/charts/explore.js'

const run = promisify(execFile)

// 独立进程隔离 ECharts 注册表，防止其他图表掩盖缺失依赖
for (const type of ['pie', 'rank', 'line', 'radar', 'stack']) {
  test(`${type} loads independently and supports concurrent window requests`, async () => {
    const script = `
      import assert from 'node:assert/strict'
      import { init } from 'echarts/core'
      import { loadChartType } from './src/charts/explore.js'
      import { createExploreOption } from './src/charts/exploreOptions.js'
      import { createTimelineChartSource } from './src/charts/snapshot.js'
      import { createStore } from './src/data/store.js'
      import { actualData } from './tests/helpers/data.js'
      const type = process.argv[1]
      const store = createStore(actualData)
      await Promise.all([loadChartType(type), loadChartType(type)])
      for (const [width, height] of [[540, 330], [300, 260]]) {
        const chart = init(null, null, { renderer: 'svg', ssr: true, width, height })
        try {
          chart.setOption(createExploreOption(createTimelineChartSource(store, type), type))
          const svg = chart.renderToSVGString()
          for (const label of ['<svg', '杭州', '宁波']) assert.ok(svg.includes(label), label)
          if (type === 'radar' || type === 'stack') {
            for (const label of ['第一产业', '第二产业', '第三产业']) assert.ok(svg.includes(label), label)
          }
          assert.doesNotMatch(svg, /NaN|undefined/)
        } finally { chart.dispose() }
      }
    `
    const { stderr } = await run(process.execPath, ['--input-type=module', '-e', script, type], {
      cwd: new URL('../', import.meta.url),
    })
    assert.equal(stderr, '')
  })
}

test('unknown chart types fail explicitly', async () => {
  await assert.rejects(loadChartType('unknown'), /未知图表类型/)
})
