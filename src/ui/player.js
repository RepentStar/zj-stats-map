/** 播放状态独立维护，年份写入共享 Store */
export function createPlayer(store, { intervalMs = 1000, loop = false } = {}) {
  const listeners = new Set()
  let timer = null
  let destroyed = false
  let state = Object.freeze({ status: 'paused', intervalMs, loop })
  const validateInterval = (value) => {
    if (!Number.isFinite(value) || value <= 0) throw new Error('播放间隔必须为正数')
  }
  validateInterval(intervalMs)
  const update = (patch) => {
    state = Object.freeze({ ...state, ...patch })
    listeners.forEach((listener) => listener(state))
  }
  const pause = () => {
    if (timer !== null) clearInterval(timer)
    timer = null
    if (state.status !== 'paused') update({ status: 'paused' })
  }
  const tick = () => {
    const index = store.years.indexOf(store.getState().year)
    if (index < store.years.length - 1) store.setState({ year: store.years[index + 1] })
    else if (state.loop) store.setState({ year: store.years[0] })
    else pause()
  }
  const startTimer = () => {
    if (timer !== null) clearInterval(timer)
    timer = setInterval(tick, state.intervalMs)
  }
  const play = () => {
    if (destroyed || state.status === 'playing' || store.years.length < 2) return
    if (store.getState().year === store.years.at(-1)) store.setState({ year: store.years[0] })
    update({ status: 'playing' })
    startTimer()
  }
  const unsubscribe = store.subscribe(({ year }) => {
    if (state.status === 'playing' && !state.loop && year === store.years.at(-1)) pause()
  })
  return {
    getState: () => state,
    play, pause,
    toggle: () => state.status === 'playing' ? pause() : play(),
    setIntervalMs(value) {
      validateInterval(value)
      if (destroyed || state.intervalMs === value) return
      update({ intervalMs: value })
      if (state.status === 'playing') startTimer()
    },
    setLoop(value) {
      if (destroyed || state.loop === Boolean(value)) return
      update({ loop: Boolean(value) })
      if (!state.loop && store.getState().year === store.years.at(-1)) pause()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    destroy() {
      destroyed = true
      pause()
      unsubscribe()
      listeners.clear()
    },
  }
}
