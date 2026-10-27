/** Non-modal independent windows; the map remains interactive between panels. */
export function createWindowManager({ target, fallbackFocus }) {
  const panels = new Map()
  let serial = 0
  let depth = 0
  let chartCount = 0
  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))
  const contain = (element, x, y) => {
    const left = clamp(x, 8, window.innerWidth - element.offsetWidth - 8)
    const toolbar = document.querySelector('.workspace-tools')?.getBoundingClientRect()
    const top = toolbar && left < toolbar.right && left + element.offsetWidth > toolbar.left ? toolbar.bottom + 8 : 8
    const boundedY = clamp(y, top, window.innerHeight - element.offsetHeight - 8)
    element.style.left = `${left}px`
    element.style.top = `${boundedY}px`
    element.style.maxWidth = `${window.innerWidth - left - 8}px`
    element.style.maxHeight = `${Math.max(120, window.innerHeight - boundedY - 8)}px`
    element.style.right = 'auto'
    element.style.bottom = 'auto'
  }
  function open({ key, title, width = 340, placement = 'chart', trigger }) {
    if (key && panels.has(key)) {
      const existing = panels.get(key)
      existing.element.style.zIndex = String(++depth)
      existing.heading.focus({ preventScroll: true })
      existing.isNew = false
      return existing
    }
    const id = `floating-window-${++serial}`
    const registryKey = key ?? id
    const element = document.createElement('section')
    element.className = `floating-window placement-${placement}`
    element.style.setProperty('--window-width', `${width}px`)
    element.style.zIndex = String(++depth)
    element.setAttribute('role', 'dialog')
    element.setAttribute('aria-modal', 'false')
    element.setAttribute('aria-labelledby', `${id}-title`)
    if (placement === 'chart') element.style.setProperty('--cascade', `${chartCount++ % 5 * 24}px`)
    const header = document.createElement('div')
    header.className = 'window-heading'
    const heading = document.createElement('h2')
    heading.id = `${id}-title`
    heading.textContent = title
    heading.tabIndex = 0
    heading.setAttribute('aria-describedby', 'window-help')
    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'btn'
    closeButton.dataset.variant = 'ghost'
    closeButton.dataset.size = 'icon-sm'
    closeButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
    closeButton.setAttribute('aria-label', `关闭${title}`)
    const body = document.createElement('div')
    body.className = 'window-body'
    header.append(heading, closeButton)
    element.append(header, body)
    const cleanups = []
    const panel = {
      element, heading, body, isNew: true, closed: false,
      onClose(callback) { cleanups.push(callback) },
      close({ restoreFocus = true } = {}) {
        if (panel.closed) return
        panel.closed = true
        const hadFocus = element.contains(document.activeElement)
        cleanups.reverse().forEach((cleanup) => cleanup())
        element.remove()
        panels.delete(registryKey)
        if (restoreFocus && hadFocus) (trigger?.isConnected ? trigger : fallbackFocus)?.focus({ preventScroll: true })
      },
    }
    panels.set(registryKey, panel)
    closeButton.addEventListener('click', () => panel.close())
    element.addEventListener('pointerdown', () => { element.style.zIndex = String(++depth) })
    element.addEventListener('focusin', () => { element.style.zIndex = String(++depth) })
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); panel.close() }
    })
    let drag = null
    const stopDrag = () => { drag = null; element.classList.remove('dragging') }
    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return
      const rect = element.getBoundingClientRect()
      drag = { pointerId: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top }
      header.setPointerCapture(event.pointerId)
      element.classList.add('dragging')
      heading.focus({ preventScroll: true })
      event.preventDefault()
    })
    header.addEventListener('pointermove', (event) => {
      if (drag && drag.pointerId === event.pointerId) contain(element, event.clientX - drag.x, event.clientY - drag.y)
    })
    header.addEventListener('pointerup', stopDrag)
    header.addEventListener('pointercancel', stopDrag)
    header.addEventListener('lostpointercapture', stopDrag)
    heading.addEventListener('keydown', (event) => {
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (!directions[event.key]) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const [x, y] = directions[event.key]
      contain(element, rect.left + x * (event.shiftKey ? 64 : 16), rect.top + y * (event.shiftKey ? 64 : 16))
    })
    target.append(element)
    // Callers fill the body synchronously after open(). Measure that content before
    // converting bottom/right placement to coordinates for native window resizing.
    queueMicrotask(() => {
      if (panel.closed) return
      const rect = element.getBoundingClientRect()
      contain(element, rect.left, rect.top)
    })
    if (trigger) heading.focus({ preventScroll: true })
    return panel
  }
  const onResize = () => {
    for (const { element } of panels.values()) {
      const rect = element.getBoundingClientRect()
      contain(element, rect.left, rect.top)
    }
  }
  window.addEventListener('resize', onResize)
  const closeAll = () => [...panels.values()].forEach((panel) => panel.close({ restoreFocus: false }))
  return {
    open,
    closeAll() { closeAll(); fallbackFocus?.focus({ preventScroll: true }) },
    destroy() { window.removeEventListener('resize', onResize); closeAll() },
  }
}
