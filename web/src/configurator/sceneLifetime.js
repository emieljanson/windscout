export function createResourceLifetime() {
  let active = true

  return {
    get active() {
      return active
    },
    adopt(resource, dispose) {
      if (active) return true
      dispose(resource)
      return false
    },
    cancel() {
      active = false
    },
  }
}
