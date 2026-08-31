import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SCENE_LOADING_LABEL_DELAY_MS,
  scheduleSceneLoadingLabel,
} from '../src/configurator/sceneLoadingState'

describe('scene loading state', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('only reveals the loading label after the quiet loading window', () => {
    vi.useFakeTimers()
    const reveal = vi.fn()

    scheduleSceneLoadingLabel(reveal)
    vi.advanceTimersByTime(SCENE_LOADING_LABEL_DELAY_MS - 1)
    expect(reveal).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(reveal).toHaveBeenCalledOnce()
  })

  it('does not reveal the label after loading has already finished', () => {
    vi.useFakeTimers()
    const reveal = vi.fn()

    const cancel = scheduleSceneLoadingLabel(reveal)
    cancel()
    vi.advanceTimersByTime(SCENE_LOADING_LABEL_DELAY_MS)

    expect(reveal).not.toHaveBeenCalled()
  })
})
