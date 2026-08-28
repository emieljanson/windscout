import { onBeforeUnmount, onMounted, ref } from 'vue'

export const COMPACT_VIEWPORT_QUERY = '(max-width: 56rem)'

export function useCompactViewport() {
  const initialMediaQuery = typeof window === 'undefined'
    ? null
    : window.matchMedia?.(COMPACT_VIEWPORT_QUERY) ?? null
  const isCompact = ref(initialMediaQuery?.matches ?? (
    typeof window !== 'undefined' && window.innerWidth <= 896
  ))
  let mediaQuery = initialMediaQuery

  function update(event) {
    isCompact.value = event?.matches
      ?? mediaQuery?.matches
      ?? window.innerWidth <= 896
  }

  onMounted(() => {
    mediaQuery = window.matchMedia?.(COMPACT_VIEWPORT_QUERY) ?? null
    update()
    mediaQuery?.addEventListener?.('change', update)
    if (!mediaQuery?.addEventListener) mediaQuery?.addListener?.(update)
  })

  onBeforeUnmount(() => {
    mediaQuery?.removeEventListener?.('change', update)
    if (!mediaQuery?.removeEventListener) mediaQuery?.removeListener?.(update)
  })

  return { isCompact }
}
