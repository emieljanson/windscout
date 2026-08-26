<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useConfiguratorStore } from '../stores/configurator'
import { loadE1002Model } from '../configurator/modelLoader'
import { applyHeroPose, configureOrbitControls, isWebGLAvailable } from '../configurator/sceneController'
import { createResourceLifetime } from '../configurator/sceneLifetime'
import { createScreenTexture } from '../configurator/screenTexture'

const emit = defineEmits(['ready', 'error'])
const host = ref(null)
const status = ref('loading')
const store = useConfiguratorStore()
const { treatment, threshold } = storeToRefs(store)

let renderer
let scene
let camera
let controls
let animationFrame
let resizeObserver
let screenSource
let model
const lifetime = createResourceLifetime()

function disposeObject(object) {
  object?.traverse((child) => {
    child.geometry?.dispose?.()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.filter(Boolean).forEach((material) => material.dispose?.())
  })
}

function resize() {
  if (!renderer || !camera || !host.value) return
  const width = Math.max(host.value.clientWidth, 1)
  const height = Math.max(host.value.clientHeight, 1)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  requestRender()
}

function renderFrame() {
  animationFrame = undefined
  const changed = controls?.update() ?? false
  renderer?.render(scene, camera)
  if (changed) requestRender()
}

function requestRender() {
  if (!lifetime.active || animationFrame !== undefined) return
  animationFrame = requestAnimationFrame(renderFrame)
}

function resetView() {
  if (camera && controls) {
    const aspect = host.value ? host.value.clientWidth / Math.max(host.value.clientHeight, 1) : 1.5
    applyHeroPose(camera, controls, aspect)
    requestRender()
  }
}

function showFront() {
  if (!camera || !controls) return
  const narrow = host.value && host.value.clientWidth / Math.max(host.value.clientHeight, 1) < 0.9
  camera.position.set(0, 0, narrow ? 0.66 : 0.39)
  controls.target.set(0, 0, 0)
  controls.update()
  requestRender()
}

async function initialize() {
  if (!host.value || !isWebGLAvailable()) {
    status.value = 'error'
    emit('error', 'This browser cannot show the 3D model.')
    return
  }

  try {
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(29, 1, 0.01, 10)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.8
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.value.append(renderer.domElement)

    controls = new OrbitControls(camera, renderer.domElement)
    configureOrbitControls(controls)
    controls.addEventListener('change', requestRender)
    resetView()

    scene.add(new THREE.HemisphereLight(0xf5f8f5, 0x67716d, 2.4))
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4)
    keyLight.position.set(-0.22, 0.32, 0.42)
    keyLight.castShadow = true
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0xb7d4ce, 1.7)
    rimLight.position.set(0.35, 0.02, -0.2)
    scene.add(rimLight)

    const groundMaterial = new THREE.ShadowMaterial({ color: 0x27302d, opacity: 0.16, transparent: true })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.36), groundMaterial)
    ground.name = 'CONTACT_SHADOW'
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.061
    ground.position.z = -0.045
    ground.receiveShadow = true
    scene.add(ground)

    const loadedModel = await loadE1002Model()
    if (!lifetime.adopt(loadedModel, disposeObject)) return
    model = loadedModel
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = child.name !== 'SCREEN'
        child.receiveShadow = child.name !== 'SCREEN'
      }
    })
    screenSource = createScreenTexture({ treatment: treatment.value, threshold: threshold.value })
    const screen = model.getObjectByName('SCREEN')
    screen.material.dispose()
    screen.material = new THREE.MeshBasicMaterial({ map: screenSource.texture, toneMapped: false, name: 'live-forecast' })
    scene.add(model)

    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host.value)
    resize()
    status.value = 'ready'
    emit('ready')
    requestRender()
  } catch (error) {
    if (!lifetime.active) return
    status.value = 'error'
    emit('error', error instanceof Error ? error.message : 'The 3D model could not be loaded.')
  }
}

watch([treatment, threshold], () => {
  screenSource?.update({ treatment: treatment.value, threshold: threshold.value })
  requestRender()
})

onMounted(initialize)
onBeforeUnmount(() => {
  lifetime.cancel()
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  controls?.removeEventListener('change', requestRender)
  controls?.dispose()
  screenSource?.dispose()
  disposeObject(model)
  disposeObject(scene?.getObjectByName('CONTACT_SHADOW'))
  renderer?.dispose()
  renderer?.domElement.remove()
})

defineExpose({ resetView, showFront })
</script>

<template>
  <div ref="host" class="scene-host" :data-scene-status="status">
    <span v-if="status === 'loading'" class="scene-status" role="status">Building your WindScout…</span>
  </div>
</template>

<style scoped>
.scene-host {
  position: relative;
  width: 100%;
  min-height: 32rem;
  overflow: hidden;
  cursor: grab;
}
.scene-host:active { cursor: grabbing; }
.scene-host :deep(canvas) { display: block; width: 100%; height: 100%; }
.scene-status {
  position: absolute;
  inset: 50% auto auto 50%;
  color: var(--muted);
  font: 500 0.7rem/1 'JetBrains Mono Variable', monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transform: translate(-50%, -50%);
}
</style>
