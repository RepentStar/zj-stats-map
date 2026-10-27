export function createTimeline({ target, store, player }) {
  target.innerHTML = `
    <div class="timeline-heading"><label class="label" for="year-slider">统计年份</label>
      <output id="current-year" for="year-slider"></output></div>
    <input id="year-slider" class="input" type="range" min="0" step="1">
    <div class="year-ticks" aria-hidden="true"></div>
    <div class="playback-controls">
      <div class="playback-buttons">
        <button id="previous-year" class="btn" data-variant="outline" data-size="sm" type="button" aria-label="上一年">上一年</button>
        <button id="play-toggle" class="btn" data-size="sm" type="button" aria-pressed="false">播放</button>
        <button id="next-year" class="btn" data-variant="outline" data-size="sm" type="button" aria-label="下一年">下一年</button>
      </div>
      <div class="playback-options">
        <label for="play-speed">播放间隔</label>
        <select id="play-speed" class="select"><option value="500">0.5 秒</option>
          <option value="1000">1 秒</option><option value="2000">2 秒</option></select>
        <label class="loop-label"><input id="play-loop" class="input" type="checkbox" role="switch">循环播放</label>
      </div>
    </div>`
  const slider = target.querySelector('#year-slider')
  slider.max = String(store.years.length - 1)
  slider.disabled = store.years.length < 2
  target.querySelector('.year-ticks').replaceChildren(...store.years.map((year) => {
    const tick = document.createElement('span')
    tick.textContent = year
    return tick
  }))
  const cleanups = []
  const on = (selector, event, listener) => {
    const element = target.querySelector(selector)
    element.addEventListener(event, listener)
    cleanups.push(() => element.removeEventListener(event, listener))
  }
  const selectIndex = (index) => {
    player.pause()
    const year = store.years[index]
    if (year !== undefined) store.setState({ year })
  }
  on('#year-slider', 'pointerdown', player.pause)
  on('#year-slider', 'input', () => selectIndex(Number(slider.value)))
  on('#previous-year', 'click', () => selectIndex(store.years.indexOf(store.getState().year) - 1))
  on('#next-year', 'click', () => selectIndex(store.years.indexOf(store.getState().year) + 1))
  on('#play-toggle', 'click', player.toggle)
  on('#play-speed', 'change', (event) => player.setIntervalMs(Number(event.target.value)))
  on('#play-loop', 'change', (event) => player.setLoop(event.target.checked))
  const render = () => {
    const { year } = store.getState()
    const { status, intervalMs, loop } = player.getState()
    const index = store.years.indexOf(year)
    slider.value = String(index)
    slider.style.setProperty('--slider-value', `${store.years.length > 1 ? index / (store.years.length - 1) * 100 : 0}%`)
    slider.setAttribute('aria-valuetext', `${year} 年`)
    target.querySelector('#current-year').textContent = `${year} 年`
    target.querySelector('#previous-year').disabled = index === 0
    target.querySelector('#next-year').disabled = index === store.years.length - 1
    const playButton = target.querySelector('#play-toggle')
    playButton.disabled = store.years.length < 2
    playButton.textContent = status === 'playing' ? '暂停' : year === store.years.at(-1) ? '从头播放' : '播放'
    playButton.setAttribute('aria-pressed', String(status === 'playing'))
    target.querySelector('#play-speed').value = String(intervalMs)
    target.querySelector('#play-loop').checked = loop
  }
  render()
  cleanups.push(store.subscribe(render), player.subscribe(render))
  return () => {
    cleanups.reverse().forEach((cleanup) => cleanup())
    target.replaceChildren()
  }
}
