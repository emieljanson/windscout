import { ref } from 'vue'

export const FLOATING_INSPECTOR_VIEWPORT_QUERY = '(min-width: 56.0625rem)'

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  if (navigator.userAgentData?.mobile === true) return true
  const userAgent = navigator.userAgent ?? ''
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
}

export function useCompactViewport() {
  return { isCompact: ref(isMobileDevice()) }
}
