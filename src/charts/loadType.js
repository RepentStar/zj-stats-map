const loaders = {
  pie: () => import('./types/pie.js'),
  rank: () => import('./types/bar.js'),
  stack: () => import('./types/bar.js'),
  line: () => import('./types/line.js'),
  radar: () => import('./types/radar.js'),
}

export async function loadChartType(type) {
  const load = loaders[type]
  if (!Object.hasOwn(loaders, type)) throw new Error(`未知图表类型：${type}`)
  const { register } = await load()
  register()
}
