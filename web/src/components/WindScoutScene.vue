<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { useConfiguratorStore } from '../stores/configurator'
import {
  createEpaperMaterial,
  createEpaperBacking,
  createMatteScreenFinish,
  createScreenRecessShadow,
  enhanceE1002Surface,
} from '../configurator/deviceSurface'
import { loadE1002Model } from '../configurator/modelLoader'
import { applyHeroPose, configureOrbitControls, isWebGLAvailable } from '../configurator/sceneController'
import { createResourceLifetime } from '../configurator/sceneLifetime'
import { createScreenTexture } from '../configurator/screenTexture'
import { createProductStudioEnvironment } from '../configurator/studioEnvironment'
import { configureAmbientOcclusion } from '../configurator/ambientOcclusion'
import { PRODUCT_LIGHTING } from '../configurator/productLighting'

const emit = defineEmits(['ready', 'error'])
const host = ref(null)
const status = ref('loading')
const store = useConfiguratorStore()
const {
  forecast,
  forecastRevision,
  effectiveShowTide,
  pendingForecastRevision,
  selectedModelId,
  selectedSpotId,
  treatment,
  threshold,
  showWeather,
  showTemperature,
  tide,
} = storeToRefs(store)

let renderer
let composer
let gtaoPass
let outputPass
let scene
let camera
let controls
let animationFrame
let resizeObserver
let screenSource

function currentDisplayConfig() {
  return {
    treatment: treatment.value,
    threshold: threshold.value,
    showWeather: showWeather.value,
    showTemperature: showTemperature.value,
    showTide: effectiveShowTide.value,
    tide: tide.value,
  }
}
let model
let environmentMap
let disposeSurface
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
  composer?.setSize(width, height)
  camera.aspect = width / height
  if (status.value === 'loading' && controls) applyHeroPose(camera, controls, width / height)
  // Reserve visual breathing room for the floating inspector while keeping the
  // orbit target on the device itself.
  if (width >= 900) camera.setViewOffset(width, height, Math.round(width * 0.13), 0, width, height)
  else camera.clearViewOffset()
  camera.updateProjectionMatrix()
  requestRender()
}

function renderFrame() {
  animationFrame = undefined
  const changed = controls?.update() ?? false
  if (composer) composer.render()
  else renderer?.render(scene, camera)
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

function createPerspectiveSurface() {
  const gridMaterial = new THREE.ShaderMaterial({
    name: 'perspective-line-surface',
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    extensions: { derivatives: true },
    uniforms: {
      lineColor: { value: new THREE.Color(0x68736e) },
      spacing: { value: 0.032 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 lineColor;
      uniform float spacing;
      varying vec3 vWorldPosition;

      void main() {
        vec2 coordinate = vWorldPosition.xz / spacing;
        vec2 footprint = max(fwidth(coordinate), vec2(0.0001));
        vec2 distanceToLine = abs(fract(coordinate - 0.5) - 0.5) / footprint;
        float line = 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
        float cellSizeInPixels = 1.0 / max(footprint.x, footprint.y);
        float densityFade = smoothstep(3.5, 9.0, cellSizeInPixels);
        float cameraDistance = distance(cameraPosition, vWorldPosition);
        float horizonFade = 1.0 - smoothstep(0.58, 1.35, cameraDistance);
        float stageFade = 1.0 - smoothstep(0.28, 0.82, length(vWorldPosition.xz));

        float surfaceVeil = horizonFade * stageFade * 0.032;
        float gridAlpha = line * densityFade * horizonFade * stageFade * stageFade * 0.24;
        gl_FragColor = vec4(lineColor, surfaceVeil + gridAlpha);
      }
    `,
  })
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), gridMaterial)
  grid.name = 'SURFACE_GRID'
  grid.rotation.x = -Math.PI / 2
  grid.position.y = -0.06035
  grid.renderOrder = -1
  return grid
}

function createPhysicalShadowLayer() {
  const material = new THREE.ShadowMaterial({
    color: 0x4d524f,
    opacity: 0.22,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  const shadowLayer = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.52), material)
  shadowLayer.name = 'PHYSICAL_SHADOW_LAYER'
  shadowLayer.rotation.x = -Math.PI / 2
  shadowLayer.position.y = -0.0604
  shadowLayer.receiveShadow = true
  shadowLayer.renderOrder = 0
  return shadowLayer
}

function createContactOcclusion() {
  const material = new THREE.ShaderMaterial({
    name: 'contact-occlusion',
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float ends = 1.0 - smoothstep(0.46, 0.5, abs(vUv.x - 0.5));
        float frontTail = smoothstep(0.0, 0.5, vUv.y);
        float backTail = 1.0 - smoothstep(0.5, 1.0, vUv.y);
        float contact = vUv.y < 0.5 ? frontTail : backTail;
        contact = pow(max(contact, 0.0), 1.9);
        gl_FragColor = vec4(vec3(0.075, 0.082, 0.078), ends * contact * 0.46);
      }
    `,
  })
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(0.175, 0.012), material)
  contact.name = 'CONTACT_OCCLUSION'
  contact.rotation.x = -Math.PI / 2
  // BODY_03 touches the surface across x ±87.5 mm and z 0…4 mm. The tiny
  // 1 mm front reveal keeps the occlusion visibly attached to that edge.
  contact.position.set(0, -0.06012, 0.004)
  contact.renderOrder = 1
  return contact
}

async function initialize() {
  if (!host.value || !isWebGLAvailable()) {
    status.value = 'error'
    emit('error', 'This browser cannot show the 3D model.')
    return
  }

  try {
    const lighting = PRODUCT_LIGHTING
    scene = new THREE.Scene()
    scene.background = new THREE.Color(lighting.background)
    camera = new THREE.PerspectiveCamera(29, 1, 0.01, 10)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.value.append(renderer.domElement)

    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    gtaoPass = configureAmbientOcclusion(new GTAOPass(scene, camera, 1, 1))
    composer.addPass(gtaoPass)
    outputPass = new OutputPass()
    composer.addPass(outputPass)

    controls = new OrbitControls(camera, renderer.domElement)
    configureOrbitControls(controls)
    controls.addEventListener('change', requestRender)
    resetView()

    environmentMap = createProductStudioEnvironment(renderer, lighting.environment)
    scene.environment = environmentMap

    scene.add(new THREE.HemisphereLight(
      lighting.hemisphere.sky,
      lighting.hemisphere.ground,
      lighting.hemisphere.intensity,
    ))
    const keyLight = new THREE.DirectionalLight(lighting.key.color, lighting.key.intensity)
    // A high, near-centred studio key keeps the cast shadow tucked behind the
    // enclosure. The older side key projected a detached rectangle to the
    // right, which made the product read as if it were hovering.
    keyLight.position.set(...lighting.key.position)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(512, 512)
    keyLight.shadow.camera.near = 0.1
    keyLight.shadow.camera.far = 1.2
    keyLight.shadow.camera.left = -0.19
    keyLight.shadow.camera.right = 0.19
    keyLight.shadow.camera.top = 0.17
    keyLight.shadow.camera.bottom = -0.1
    keyLight.shadow.bias = -0.00002
    keyLight.shadow.normalBias = 0.00012
    keyLight.shadow.radius = 5
    scene.add(keyLight)
    const softbox = new THREE.RectAreaLight(
      lighting.softbox.color,
      lighting.softbox.intensity,
      lighting.softbox.width,
      lighting.softbox.height,
    )
    // Mirror the hero camera across the front plane so the satin insert catches
    // one broad, believable highlight instead of only becoming diffusely brighter.
    softbox.position.set(...lighting.softbox.position)
    softbox.lookAt(0, 0, 0)
    scene.add(softbox)
    const accent = new THREE.RectAreaLight(
      lighting.accent.color,
      lighting.accent.intensity,
      lighting.accent.width,
      lighting.accent.height,
    )
    accent.position.set(...lighting.accent.position)
    accent.lookAt(0, 0, 0)
    scene.add(accent)
    const rimLight = new THREE.DirectionalLight(lighting.rim.color, lighting.rim.intensity)
    rimLight.position.set(...lighting.rim.position)
    scene.add(rimLight)

    scene.add(createPerspectiveSurface())
    scene.add(createPhysicalShadowLayer())
    scene.add(createContactOcclusion())

    const loadedModel = await loadE1002Model()
    if (!lifetime.adopt(loadedModel, disposeObject)) return
    model = loadedModel
    disposeSurface = enhanceE1002Surface(model, renderer)
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = child.name !== 'SCREEN'
        child.receiveShadow = false
      }
    })
    const initialConfig = currentDisplayConfig()
    const initialForecast = forecast.value
    const initialForecastRevision = forecastRevision.value
    const loadedScreenSource = await createScreenTexture({ forecast: initialForecast, config: initialConfig })
    if (!lifetime.adopt(loadedScreenSource, (source) => source.dispose())) return
    screenSource = loadedScreenSource
    if (treatment.value !== initialConfig.treatment || threshold.value !== initialConfig.threshold ||
        showWeather.value !== initialConfig.showWeather ||
        showTemperature.value !== initialConfig.showTemperature ||
        effectiveShowTide.value !== initialConfig.showTide || tide.value !== initialConfig.tide ||
        forecastRevision.value !== initialForecastRevision) {
      screenSource.update({
        forecast: forecast.value,
        config: currentDisplayConfig(),
      })
    }
    if (pendingForecastRevision.value === forecastRevision.value) store.publishForecast(forecastRevision.value)
    const screen = model.getObjectByName('SCREEN')
    // The CAD display opening is centred 0.85 mm below the imported screen
    // plane. Move the complete display stack, rather than stretching the UI,
    // so the visible reveal is even while the 800×480 aspect ratio stays exact.
    screen.position.y -= 0.00085
    screen.material.dispose()
    screen.material = createEpaperMaterial(screenSource.texture)
    const screenBacking = createEpaperBacking(screen)
    createScreenRecessShadow(screenBacking)
    createMatteScreenFinish(screenBacking)
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

watch([treatment, threshold, showWeather, showTemperature, effectiveShowTide, tide], () => {
  try {
    screenSource?.update({ config: currentDisplayConfig() })
  } catch {
    store.reportConfigurationRenderFailure()
  }
  requestRender()
})

watch(forecastRevision, () => {
  if (!screenSource) return
  try {
    screenSource.update({
      forecast: forecast.value,
      config: currentDisplayConfig(),
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
  disposeSurface?.()
  environmentMap?.dispose()
  gtaoPass?.dispose()
  outputPass?.dispose()
  composer?.dispose()
  disposeObject(model)
  disposeObject(scene?.getObjectByName('SURFACE_GRID'))
  disposeObject(scene?.getObjectByName('PHYSICAL_SHADOW_LAYER'))
  disposeObject(scene?.getObjectByName('CONTACT_OCCLUSION'))
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
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
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
