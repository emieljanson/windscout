import { LoadingManager } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { E1002_MODEL } from '../assets/e1002'

export const MODEL_LOAD_TIMEOUT_MS = 15_000

export function findMissingModelRoles(scene) {
  return E1002_MODEL.requiredRoles.filter((role) => !scene.getObjectByName(role))
}

export function hideE1002Stand(scene) {
  const stand = scene.getObjectByName('STAND')
  if (!stand) return false
  // Keep the hidden object attached so the normal scene disposal path still
  // releases its imported geometry and materials.
  stand.visible = false
  return true
}

export async function loadE1002Model({
  loaderFactory = (manager) => new GLTFLoader(manager),
  timeoutMs = MODEL_LOAD_TIMEOUT_MS,
} = {}) {
  const manager = new LoadingManager()
  const loader = loaderFactory(manager)
  let timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      manager.abort()
      reject(new Error('The 3D model took too long to load.'))
    }, timeoutMs)
  })

  let gltf
  try {
    gltf = await Promise.race([loader.loadAsync(E1002_MODEL.url), timeoutPromise])
  } finally {
    clearTimeout(timeout)
  }
  const missingRoles = findMissingModelRoles(gltf.scene)
  if (missingRoles.length) {
    throw new Error(`E1002 model is missing scene roles: ${missingRoles.join(', ')}`)
  }
  return gltf.scene
}
