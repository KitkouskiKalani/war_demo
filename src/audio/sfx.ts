export type SfxName =
  | 'abilityUse'
  | 'endLaneResolve'
  | 'playersTurnToPlay'
  | 'playCard'
  | 'startLaneResolve'
  | 'warFlip'

const SOUND_PATHS: Record<SfxName, string> = {
  abilityUse: '/assets/sounds/ability-use.mp3',
  endLaneResolve: '/assets/sounds/end-lane-resolve.mp3',
  playersTurnToPlay: '/assets/sounds/players-turn-to-play.mp3',
  playCard: '/assets/sounds/play-card.mp3',
  startLaneResolve: '/assets/sounds/start-lane-resolve.mp3',
  warFlip: '/assets/sounds/war-flip.mp3',
}

const DEFAULT_VOLUME = 0.65

/**
 * Audio strategy
 * --------------
 * Playback uses the Web Audio API for near-zero latency (decoded buffers fired
 * via AudioBufferSourceNode), which is what makes effects feel instant.
 *
 * The catch on iOS: Web Audio output is normally silenced by the hardware
 * Ring/Silent switch. To get around that we keep a tiny *silent* looping
 * <audio> media element playing. While a media element is playing, iOS puts the
 * page into the "playback" audio session, which ignores the silent switch — and
 * Web Audio output then rides through it. (This is the well-known "unmute iOS
 * audio" technique.) The silent element is only used on iOS; everywhere else
 * Web Audio alone is fine.
 */

type WindowWithWebAudio = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

type ActiveLoop = { source: AudioBufferSourceNode; gain: GainNode }

let audioContext: AudioContext | null = null
const bufferCache = new Map<SfxName, AudioBuffer>()
const bufferPromises = new Map<SfxName, Promise<AudioBuffer | null>>()
const activeLoops = new Map<SfxName, ActiveLoop>()
let silentKeepAlive: HTMLAudioElement | null = null
let unlocked = false

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (audioContext) return audioContext

  const Ctor = window.AudioContext ?? (window as WindowWithWebAudio).webkitAudioContext
  if (!Ctor) return null

  audioContext = new Ctor()
  return audioContext
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false
  const ua = navigator.userAgent
  // iPhone/iPod/iPad, plus iPadOS which now reports as "Macintosh" but is touch.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document)
}

// Decode helper that supports both the modern promise form and the legacy
// callback form of decodeAudioData (older Safari).
function decodeAudio(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const maybePromise = ctx.decodeAudioData(data, resolve, reject) as unknown as Promise<AudioBuffer> | undefined
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.then(resolve, reject)
    }
  })
}

function loadBuffer(name: SfxName): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(name)
  if (cached) return Promise.resolve(cached)

  const pending = bufferPromises.get(name)
  if (pending) return pending

  const ctx = getContext()
  if (!ctx) return Promise.resolve(null)

  const promise = fetch(SOUND_PATHS[name])
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => decodeAudio(ctx, arrayBuffer))
    .then(buffer => {
      bufferCache.set(name, buffer)
      return buffer
    })
    .catch(() => null)

  bufferPromises.set(name, promise)
  return promise
}

function preloadAll() {
  for (const name of Object.keys(SOUND_PATHS) as SfxName[]) {
    void loadBuffer(name)
  }
}

// Build a short silent WAV at runtime (no asset/base64 needed) for the iOS
// keep-alive media element.
function createSilentLoop(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined' || typeof URL === 'undefined') return null

  const sampleRate = 8000
  const numSamples = sampleRate / 2 // 0.5s
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, numSamples * 2, true)
  // Sample data is left as zeros => silence.

  const blob = new Blob([buffer], { type: 'audio/wav' })
  const audio = new Audio(URL.createObjectURL(blob))
  audio.loop = true
  audio.preload = 'auto'
  audio.volume = 0
  audio.setAttribute('playsinline', '')
  return audio
}

// Keep the silent media element alive so iOS routes Web Audio through the
// silent switch. Safe to call repeatedly (e.g. on visibility changes).
function ensureSilentLoop() {
  if (!isIOS()) return
  if (!silentKeepAlive) silentKeepAlive = createSilentLoop()
  if (!silentKeepAlive) return
  silentKeepAlive.volume = 0
  if (silentKeepAlive.paused) {
    void silentKeepAlive.play().catch(() => undefined)
  }
}

function playOneShot(ctx: AudioContext, buffer: AudioBuffer, volume: number) {
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = buffer
  gain.gain.value = volume
  source.connect(gain)
  gain.connect(ctx.destination)
  source.start(0)
}

function playLoop(ctx: AudioContext, name: SfxName, buffer: AudioBuffer, volume: number) {
  stopSfx(name)

  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = buffer
  source.loop = true
  gain.gain.value = volume
  source.connect(gain)
  gain.connect(ctx.destination)
  source.start(0)

  activeLoops.set(name, { source, gain })
}

export function playSfx(name: SfxName, options: { loop?: boolean; volume?: number } = {}) {
  const ctx = getContext()
  if (!ctx) return

  const volume = options.volume ?? DEFAULT_VOLUME

  // Best-effort resume in case iOS suspended the context (e.g. after backgrounding).
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined)
  }

  const cached = bufferCache.get(name)
  if (cached) {
    if (options.loop) playLoop(ctx, name, cached, volume)
    else playOneShot(ctx, cached, volume)
    return
  }

  // First time only (before preload completes): decode then play.
  void loadBuffer(name).then(buffer => {
    if (!buffer) return
    if (options.loop) playLoop(ctx, name, buffer, volume)
    else playOneShot(ctx, buffer, volume)
  })
}

export function stopSfx(name: SfxName) {
  const loop = activeLoops.get(name)
  if (!loop) return

  try {
    loop.source.stop()
  } catch {
    // Source may have already stopped.
  }
  try {
    loop.source.disconnect()
    loop.gain.disconnect()
  } catch {
    // ignore
  }
  activeLoops.delete(name)
}

export function unlockSfx() {
  const ctx = getContext()
  if (!ctx) return

  // Must run inside a user gesture (this is wired to pointer/touch/click).
  void ctx.resume().catch(() => undefined)
  ensureSilentLoop()

  if (unlocked) return

  // Fire a silent Web Audio buffer in-gesture to fully unlock the context.
  try {
    const silent = ctx.createBuffer(1, 1, ctx.sampleRate)
    const source = ctx.createBufferSource()
    source.buffer = silent
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    // ignore
  }

  const finalize = () => {
    if (ctx.state === 'running') {
      unlocked = true
      preloadAll()
    }
  }

  if (ctx.state === 'running') {
    finalize()
  } else {
    void ctx.resume().then(finalize).catch(() => undefined)
  }
}
