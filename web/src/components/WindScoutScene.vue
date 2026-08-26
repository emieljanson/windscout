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
const {
  forecast,
  forecastRevision,
  pendingForecastRevision,
  selectedModelId,
  selectedSpotId,
  treatment,
  threshold,
} = storeToRefs(store)

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
  if (status.value === 'loading' && controls) applyHeroPose(camera, controls, width / height)
  if (width >= 900) camera.setViewOffset(width, height, Math.round(width * 0.075), 0, width, height)
  else camera.clearViewOffset()
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

function createScreenGlare(screen) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float shift = dot(viewDirection, vec3(0.72, 0.18, 0.0));
        float center = 0.5 + shift * 0.32;
        float diagonal = vUv.x + vUv.y * 0.22;
        float band = 1.0 - smoothstep(0.035, 0.19, abs(diagonal - center));
        float grazing = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDirection)), 1.35);
        float alpha = band * (0.025 + grazing * 0.12);
        gl_FragColor = vec4(0.98, 1.0, 0.99, alpha);
      }
    `,
  })
  const glare = new THREE.Mesh(screen.geometry.clone(), material)
  glare.name = 'SCREEN_GLARE'
  glare.position.copy(screen.position)
  glare.rotation.copy(screen.rotation)
  glare.scale.copy(screen.scale)
  glare.position.z += 0.00035
  glare.renderOrder = 3
  screen.parent.add(glare)
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
    renderer.toneMappingExposure = 0.9
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.value.append(renderer.domElement)

    controls = new OrbitControls(camera, renderer.domElement)
    configureOrbitControls(controls)
    controls.addEventListener('change', requestRender)
    resetView()

    scene.add(new THREE.HemisphereLight(0xf5f8f5, 0x67716d, 1.75))
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.35)
    keyLight.position.set(-0.22, 0.32, 0.42)
    keyLight.castShadow = true
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0xb7d4ce, 0.8)
    rimLight.position.set(0.35, 0.02, -0.2)
    scene.add(rimLight)

    const groundMaterial = new THREE.ShadowMaterial({ color: 0x27302d, opacity: 0.13, transparent: true })
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
        child.receiveShadow = false
      }
    })
    const initialConfig = { treatment: treatment.value, threshold: threshold.value }
    const initialForecast = forecast.value
    const initialForecastRevision = forecastRevision.value
    const loadedScreenSource = await createScreenTexture({ forecast: initialForecast, config: initialConfig })
    if (!lifetime.adopt(loadedScreenSource, (source) => source.dispose())) return
    screenSource = loadedScreenSource
    if (treatment.value !== initialConfig.treatment || threshold.value !== initialConfig.threshold ||
        forecastRevision.value !== initialForecastRevision) {
      screenSource.update({
        forecast: forecast.value,
        config: { treatment: treatment.value, threshold: threshold.value },
      })
    }
    if (pendingForecastRevision.value === forecastRevision.value) store.publishForecast(forecastRevision.value)
    const screen = model.getObjectByName('SCREEN')
    screen.material.dispose()
    screen.material = new THREE.MeshBasicMaterial({ map: screenSource.texture, toneMapped: false, name: 'live-forecast' })
    createScreenGlare(screen)
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
  screenSource?.update({ config: { treatment: treatment.value, threshold: threshold.value } })
  requestRender()
})

watch(forecastRevision, () => {
  if (!screenSource) return
  try {
    screenSource.update({
      forecast: forecast.value,
      config: { treatment: treatment.value, threshold: threshold.value },
    })
    store.publishForecast(forecastRevision.value)
    requestRender()
  } catch {
    store.rejectForecastPublication(forecastRevision.value)
    requestRender()
  }
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

</script>

<template>
  <div
    ref="host"
    class="scene-host"
    :data-scene-status="status"
    :data-forecast-spot="selectedSpotId"
    :data-forecast-model="selectedModelId"
    :data-forecast-revision="forecastRevision"
  >
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
