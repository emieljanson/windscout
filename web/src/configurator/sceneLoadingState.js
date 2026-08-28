export const SCENE_LOADING_LABEL_DELAY_MS = 600

export function scheduleSceneLoadingLabel(
  reveal,
  delay = SCENE_LOADING_LABEL_DELAY_MS,
) {
  const timer = setTimeout(reveal, delay)
  return () => clearTimeout(timer)
}
