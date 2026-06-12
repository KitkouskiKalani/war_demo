/**
 * Lightweight, imperative visual FX that live entirely outside React state so
 * they never trigger re-renders of the board. Everything is drawn into a single
 * fixed, click-through overlay appended to <body>.
 */

let overlay: HTMLDivElement | null = null

function getOverlay(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null
  if (overlay && document.body.contains(overlay)) return overlay
  overlay = document.createElement('div')
  overlay.className = 'fx-overlay'
  document.body.appendChild(overlay)
  return overlay
}

/** Briefly pulse/glow an element (e.g. an ability icon when it's used or buffed). */
export function pulse(target: Element | null | undefined) {
  if (!target) return
  const el = target as HTMLElement
  el.classList.remove('fx-pulse')
  // Force reflow so the animation restarts even on rapid repeats.
  void el.offsetWidth
  el.classList.add('fx-pulse')
  window.setTimeout(() => el.classList.remove('fx-pulse'), 650)
}

/**
 * Fly a glowing spark from one element to another. On arrival the destination
 * gets a pulse so it reads as "this ability just gained a charge".
 */
export function flySpark(fromEl: Element | null | undefined, toEl: Element | null | undefined) {
  const layer = getOverlay()
  if (!layer || !fromEl || !toEl) return

  const from = fromEl.getBoundingClientRect()
  const to = toEl.getBoundingClientRect()
  if (from.width === 0 && from.height === 0) return
  if (to.width === 0 && to.height === 0) return

  const startX = from.left + from.width / 2
  const startY = from.top + from.height / 2
  const endX = to.left + to.width / 2
  const endY = to.top + to.height / 2

  const spark = document.createElement('div')
  spark.className = 'fx-spark'
  layer.appendChild(spark)

  const dx = endX - startX
  const dy = endY - startY
  // A gentle arc: lift the midpoint perpendicular-ish for a livelier path.
  const midX = startX + dx * 0.5
  const midY = startY + dy * 0.5 - Math.min(80, Math.abs(dx) * 0.25 + 40)

  if (typeof spark.animate !== 'function') {
    // No Web Animations API: just flash the destination.
    spark.remove()
    pulse(toEl)
    return
  }

  const anim = spark.animate(
    [
      { transform: `translate(${startX}px, ${startY}px) scale(0.5)`, opacity: 0, offset: 0 },
      { transform: `translate(${startX}px, ${startY}px) scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${midX}px, ${midY}px) scale(1.05)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${endX}px, ${endY}px) scale(0.85)`, opacity: 1, offset: 0.9 },
      { transform: `translate(${endX}px, ${endY}px) scale(0.2)`, opacity: 0, offset: 1 },
    ],
    { duration: 620, easing: 'cubic-bezier(0.33, 0, 0.2, 1)', fill: 'forwards' },
  )

  anim.onfinish = () => {
    spark.remove()
    pulse(toEl)
  }
  anim.oncancel = () => spark.remove()
}
