/** 固定图表条件，不订阅共享状态 */
export function createChartSnapshot(store, type) {
  const current = store.getState()
  const selectedCities = current.selectedCities.length
    ? [...current.selectedCities]
    : [...store.regions.values()].filter((region) => region.level === 'city').map((region) => region.adcode)
  const state = Object.freeze({
    ...current,
    // 人口占比和产业图表使用固定指标
    indicator: ({ pie: 'pop_resident', radar: 'share_primary', stack: 'gdp_primary' })[type] ?? current.indicator,
    selectedCities: Object.freeze(selectedCities),
  })
  return { ...store, getState: () => state }
}

/** 保留图表指标，跟随共享年份与城市选择 */
export function createTimelineChartSource(store, type) {
  const snapshot = createChartSnapshot(store, type)
  const allCities = Object.freeze([...store.regions.values()]
    .filter((region) => region.level === 'city').map((region) => region.adcode))
  const getState = () => {
    const { year, selectedCities } = store.getState()
    return Object.freeze({
      ...snapshot.getState(), year,
      selectedCities: selectedCities.length ? selectedCities : allCities,
    })
  }
  return {
    ...snapshot,
    getState,
    subscribe(listener) {
      let previous = store.getState()
      return store.subscribe((state) => {
        const changed = state.year !== previous.year ||
          state.selectedCities.join() !== previous.selectedCities.join()
        previous = state
        if (!changed) return
        listener(getState())
      })
    },
  }
}
