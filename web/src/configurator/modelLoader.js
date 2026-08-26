import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { E1002_MODEL } from '../assets/e1002'

export function findMissingModelRoles(scene) {
  return E1002_MODEL.requiredRoles.filter((role) => !scene.getObjectByName(role))
}

export async function loadE1002Model(loader = new GLTFLoader()) {
  const gltf = await loader.loadAsync(E1002_MODEL.url)
  const missingRoles = findMissingModelRoles(gltf.scene)
  if (missingRoles.length) {
    throw new Error(`E1002 model is missing scene roles: ${missingRoles.join(', ')}`)
  }
  return gltf.scene
}

