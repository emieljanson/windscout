import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { WAKE_BUTTON_COLOR } from './productColors'

export const USB_CABLE_COLOR = WAKE_BUTTON_COLOR
export const USB_CABLE_DURATION_MS = 1550
export const USB_CABLE_FADE_IN_MS = 1000
// Keep the deforming braid fine-grained through the slow final insertion.
// Coarser sampling was visible as small shape jumps near the socket.
const CABLE_ANIMATION_STEPS = 360

const DEVICE_REAL_WIDTH_MM = 176
const DEVICE_MODEL_WIDTH = 0.175
const MM_TO_SCENE_UNIT = DEVICE_MODEL_WIDTH / DEVICE_REAL_WIDTH_MM
const millimeters = (value) => value * MM_TO_SCENE_UNIT
const FLOOR_Y = -0.0578
const FLOOR_SURFACE_Y = FLOOR_Y - millimeters(1.45)
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1)
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const VERTICAL_PORT_ROLL = new THREE.Quaternion().setFromAxisAngle(LOCAL_FORWARD, Math.PI / 2)
// The real USB-C socket is vertical in the right side of the E1002 back pod.
// The connector housing stops against that thin side wall while its metal tip
// continues invisibly inside.
const USB_PORT = new THREE.Vector3(0.0437, -0.0071, -0.00535)
const CONNECTOR_HOUSING_FRONT = millimeters(12.4)
const CONNECTOR_INSERTED_ORIGIN_X = USB_PORT.x + CONNECTOR_HOUSING_FRONT
const CONNECTOR_PATH_POINTS = {
  compact: [
    [0.24, USB_PORT.y, USB_PORT.z],
    [0.2, USB_PORT.y, USB_PORT.z],
    [0.16, USB_PORT.y, USB_PORT.z],
    [0.125, USB_PORT.y, USB_PORT.z],
    [0.095, USB_PORT.y, USB_PORT.z],
    [0.075, USB_PORT.y, USB_PORT.z],
    [0.063, USB_PORT.y, USB_PORT.z],
    [CONNECTOR_INSERTED_ORIGIN_X, USB_PORT.y, USB_PORT.z],
  ],
  wide: [
    [0.24, USB_PORT.y, USB_PORT.z],
    [0.2, USB_PORT.y, USB_PORT.z],
    [0.16, USB_PORT.y, USB_PORT.z],
    [0.125, USB_PORT.y, USB_PORT.z],
    [0.095, USB_PORT.y, USB_PORT.z],
    [0.075, USB_PORT.y, USB_PORT.z],
    [0.063, USB_PORT.y, USB_PORT.z],
    [CONNECTOR_INSERTED_ORIGIN_X, USB_PORT.y, USB_PORT.z],
  ],
}

function createConnectorPath(compositionMode) {
  return new THREE.CatmullRomCurve3(
    CONNECTOR_PATH_POINTS[compositionMode].map((point) => new THREE.Vector3(...point)),
    false,
    'centripetal',
  )
}

class SepticBezierCurve3 extends THREE.Curve {
  constructor(...points) {
    super()
    this.points = points
  }

  getPoint(t, target = new THREE.Vector3()) {
    const inverse = 1 - t
    const weights = [
      inverse ** 7,
      7 * inverse ** 6 * t,
      21 * inverse ** 5 * t ** 2,
      35 * inverse ** 4 * t ** 3,
      35 * inverse ** 3 * t ** 4,
      21 * inverse ** 2 * t ** 5,
      7 * inverse * t ** 6,
      t ** 7,
    ]
    target.set(0, 0, 0)
    this.points.forEach((point, index) => target.addScaledVector(point, weights[index]))
    return target
  }
}

// Strong ease-out: movement starts immediately and then settles naturally as
// the connector reaches the socket. This evaluates cubic-bezier(.23, 1, .32, 1).
function easeStrongOut(progress) {
  const x = THREE.MathUtils.clamp(progress, 0, 1)
  if (x === 0 || x === 1) return x

  const coordinate = (time, firstControl, secondControl) => {
    const inverse = 1 - time
    return 3 * inverse ** 2 * time * firstControl
      + 3 * inverse * time ** 2 * secondControl
      + time ** 3
  }

  let low = 0
  let high = 1
  let time = x
  for (let iteration = 0; iteration < 12; iteration += 1) {
    time = (low + high) / 2
    if (coordinate(time, 0.23, 0.32) < x) low = time
    else high = time
  }
  return coordinate(time, 1, 1)
}

export function easeUsbCableProgress(progress) {
  return easeStrongOut(progress)
}

// The longer opacity ramp prevents the complete cable silhouette from popping
// into view on very wide canvases while its movement is already underway.
function easeUsbCableFade(progress) {
  return easeStrongOut(progress)
}

function connectorPositionAt(path, progress) {
  const value = THREE.MathUtils.clamp(progress, 0, 1)
  return path.getPointAt(value)
}

export function cablePoseAt(progress, compositionMode = 'compact') {
  const value = THREE.MathUtils.clamp(progress, 0, 1)
  const connectorPath = createConnectorPath(compositionMode)
  const connector = connectorPositionAt(connectorPath, value)
  const tangent = connectorPath.getTangentAt(value)
  // Stop the braid inside the final strain-relief section. Ending it at the
  // connector origin made the woven tube visibly poke through the green collar.
  const cableJoin = connector.clone().addScaledVector(tangent, -millimeters(6.2))
  const straightSheathLead = connector.clone().addScaledVector(tangent, -millimeters(36.2))
  const floorDepth = USB_PORT.z
  // Give the braided sheath enough run-up to lift as one broad, weighted arc.
  // A short run-up makes it behave like soft string and creates a sudden drop
  // immediately behind the connector.
  const floorApproachX = Math.max(connector.x + millimeters(105), 0.135)

  return {
    connector,
    tangent,
    cablePoints: [
      new THREE.Vector3(1.2, FLOOR_Y, floorDepth),
      new THREE.Vector3(0.75, FLOOR_Y, floorDepth),
      new THREE.Vector3(0.42, FLOOR_Y, floorDepth),
      new THREE.Vector3(floorApproachX, FLOOR_Y, floorDepth),
      straightSheathLead,
      cableJoin,
    ],
  }
}

function createBraidTexture(size = 256) {
  const pixels = new Uint8Array(size * size * 4)
  const normalPixels = new Uint8Array(size * size * 4)
  const roughnessPixels = new Uint8Array(size * size * 4)
  const heights = new Float32Array(size * size)
  const channels = [
    (USB_CABLE_COLOR >> 16) & 0xff,
    (USB_CABLE_COLOR >> 8) & 0xff,
    USB_CABLE_COLOR & 0xff,
  ]

  const sampleWeave = (x, y) => {
    const u = x / size
    const v = y / size
    const phaseA = Math.cos(Math.PI * 2 * (u * 8 + v * 4))
    const phaseB = Math.cos(Math.PI * 2 * (u * 8 - v * 4 + 0.5))
    const strandA = Math.max(0, phaseA) ** 3.8
    const strandB = Math.max(0, phaseB) ** 3.8
    const crossing = Math.sin(Math.PI * 2 * u * 16) * Math.sin(Math.PI * 2 * v * 8)
    const raised = crossing >= 0
      ? strandA + strandB * 0.24
      : strandB + strandA * 0.24
    const fibre = Math.sin(Math.PI * 2 * (u * 112 + v * 7)) * 0.035
    return THREE.MathUtils.clamp(raised + fibre, 0, 1)
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size
      const v = y / size
      const weave = sampleWeave(x, y)
      const colourFibre = Math.sin(Math.PI * 2 * (u * 83 - v * 5)) * 0.006
      const brightness = 0.865 + weave * 0.075 + colourFibre
      const offset = (y * size + x) * 4
      pixels[offset] = Math.min(255, Math.round(channels[0] * brightness))
      pixels[offset + 1] = Math.min(255, Math.round(channels[1] * brightness))
      pixels[offset + 2] = Math.min(255, Math.round(channels[2] * brightness))
      pixels[offset + 3] = 255
      heights[y * size + x] = weave
      const roughness = Math.round(250 - weave * 12)
      roughnessPixels[offset] = roughness
      roughnessPixels[offset + 1] = roughness
      roughnessPixels[offset + 2] = roughness
      roughnessPixels[offset + 3] = 255
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = heights[y * size + ((x - 1 + size) % size)]
      const right = heights[y * size + ((x + 1) % size)]
      const down = heights[((y - 1 + size) % size) * size + x]
      const up = heights[((y + 1) % size) * size + x]
      const normal = new THREE.Vector3((left - right) * 1.65, (down - up) * 1.65, 1).normalize()
      const offset = (y * size + x) * 4
      normalPixels[offset] = Math.round((normal.x * 0.5 + 0.5) * 255)
      normalPixels[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255)
      normalPixels[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255)
      normalPixels[offset + 3] = 255
    }
  }

  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat)
  texture.name = 'usb-cable-braid-texture'
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(52, 1)
  texture.anisotropy = 8
  texture.needsUpdate = true

  const normalTexture = new THREE.DataTexture(normalPixels, size, size, THREE.RGBAFormat)
  normalTexture.name = 'usb-cable-braid-normal-texture'
  normalTexture.wrapS = THREE.RepeatWrapping
  normalTexture.wrapT = THREE.RepeatWrapping
  normalTexture.repeat.copy(texture.repeat)
  normalTexture.anisotropy = texture.anisotropy
  normalTexture.needsUpdate = true

  const roughnessTexture = new THREE.DataTexture(roughnessPixels, size, size, THREE.RGBAFormat)
  roughnessTexture.name = 'usb-cable-braid-roughness-texture'
  roughnessTexture.wrapS = THREE.RepeatWrapping
  roughnessTexture.wrapT = THREE.RepeatWrapping
  roughnessTexture.repeat.copy(texture.repeat)
  roughnessTexture.anisotropy = texture.anisotropy
  roughnessTexture.needsUpdate = true
  return { color: texture, normal: normalTexture, roughness: roughnessTexture }
}

function createCableFadeTexture(size = 256) {
  const pixels = new Uint8Array(size * 4)
  for (let x = 0; x < size; x += 1) {
    const u = x / (size - 1)
    const progress = THREE.MathUtils.clamp((u - 0.02) / 0.22, 0, 1)
    const opacity = Math.round((progress * progress * (3 - 2 * progress)) * 255)
    const offset = x * 4
    pixels[offset] = opacity
    pixels[offset + 1] = opacity
    pixels[offset + 2] = opacity
    pixels[offset + 3] = 255
  }

  const texture = new THREE.DataTexture(pixels, size, 1, THREE.RGBAFormat)
  texture.name = 'usb-cable-tail-fade-texture'
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function createConnector(materials) {
  const connector = new THREE.Group()
  connector.name = 'USB_C_CONNECTOR'
  // The opacity-controlled contact layer owns every cable shadow so the cable
  // and its grounding appear and disappear as one visual unit.

  const housing = new THREE.Mesh(
    new RoundedBoxGeometry(millimeters(9.2), millimeters(4.3), millimeters(13), 5, millimeters(0.9)),
    materials.housing,
  )
  housing.name = 'USB_C_CONNECTOR_HOUSING'
  housing.position.z = millimeters(5.9)

  const tip = new THREE.Mesh(
    new RoundedBoxGeometry(millimeters(8.25), millimeters(2.4), millimeters(6.65), 4, millimeters(1.1)),
    materials.metal,
  )
  tip.name = 'USB_C_CONNECTOR_TIP'
  tip.position.z = millimeters(15.725)

  const opening = new THREE.Mesh(
    new RoundedBoxGeometry(millimeters(6.5), millimeters(1.35), millimeters(0.24), 3, millimeters(0.55)),
    materials.port,
  )
  opening.name = 'USB_C_CONNECTOR_OPENING'
  opening.position.z = millimeters(19.17)

  const tongue = new THREE.Mesh(
    new RoundedBoxGeometry(millimeters(4.8), millimeters(0.42), millimeters(0.16), 2, millimeters(0.18)),
    materials.tongue,
  )
  tongue.name = 'USB_C_CONNECTOR_TONGUE'
  tongue.position.y = millimeters(-0.2)
  tongue.position.z = millimeters(19.34)

  connector.add(housing, tip, opening, tongue)
  const reliefSections = [
    { front: 2.15, back: 1.8, length: 3.2, z: -2.1 },
    { front: 1.8, back: 1.5, length: 3.4, z: -5.35 },
  ]
  reliefSections.forEach(({ front, back, length, z }, index) => {
    const relief = new THREE.Mesh(
      new THREE.CylinderGeometry(millimeters(back), millimeters(front), millimeters(length), 24, 2),
      materials.relief,
    )
    relief.name = `USB_C_STRAIN_RELIEF_${index + 1}`
    relief.rotation.x = Math.PI / 2
    relief.position.z = millimeters(z)
    connector.add(relief)
  })

  return connector
}

export function cableCurveForPoints(points) {
  if (points.length !== 6) {
    return new THREE.CatmullRomCurve3(points, false, 'centripetal')
  }

  // Apple-like restraint: one calm floor line and one continuous bend into the
  // strain relief. The final controls share the connector tangent, so the cable
  // starts yielding immediately but builds curvature gradually like stiff braid.
  const floorStart = points[0]
  const bendStart = points[3]
  const straightStart = points[4]
  const cableJoin = points.at(-1)
  const bendDistance = bendStart.distanceTo(cableJoin)
  const floorHandleLength = Math.min(millimeters(45), bendDistance * 0.36)
  const floorShoulderLength = Math.min(millimeters(72), bendDistance * 0.58)
  const bendDirectionX = Math.sign(straightStart.x - bendStart.x) || 1
  const connectorDirection = cableJoin.clone().sub(straightStart).normalize()
  const connectorShoulder = straightStart.clone()
    .add(new THREE.Vector3(-bendDirectionX * millimeters(24), 0, 0))
  const connectorControlThree = cableJoin.clone()
    .addScaledVector(connectorDirection, -millimeters(20))
  const connectorControlFour = cableJoin.clone()
    .addScaledVector(connectorDirection, -millimeters(10))
  const bendCurve = new SepticBezierCurve3(
    bendStart,
    bendStart.clone().add(new THREE.Vector3(bendDirectionX * floorHandleLength, 0, 0)),
    bendStart.clone().add(new THREE.Vector3(bendDirectionX * floorShoulderLength, 0, 0)),
    connectorShoulder,
    straightStart,
    connectorControlThree,
    connectorControlFour,
    cableJoin,
  )
  const curve = new THREE.CurvePath()
  curve.add(new THREE.LineCurve3(floorStart, bendStart))
  curve.add(bendCurve)
  return curve
}

function geometryForCable(points, radius = millimeters(1.45)) {
  const curve = cableCurveForPoints(points)
  // Fine longitudinal tessellation keeps tight floor bends round even in a
  // close orbit; the previous 72 segments exposed small direction facets.
  return new THREE.TubeGeometry(curve, 360, radius, 12, false)
}

function geometryForFloorEffect(points, {
  pointCount,
  radius,
  verticalScale,
  lift,
  depthOffset,
}) {
  const geometry = geometryForCable(points.slice(0, pointCount), millimeters(radius))
  const positions = geometry.attributes.position
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(
      index,
      FLOOR_SURFACE_Y + (positions.getY(index) - FLOOR_Y) * verticalScale + millimeters(lift),
    )
    positions.setZ(index, positions.getZ(index) + millimeters(depthOffset))
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

function geometryForContactShadow(points) {
  return geometryForFloorEffect(points, {
    pointCount: 4,
    radius: 1.78,
    verticalScale: 0.025,
    lift: 0.05,
    depthOffset: 0,
  })
}

function orientConnector(connector, tangent) {
  // Keep the plug's thin side vertical while its forward axis follows the
  // insertion path, so it stays vertical while entering the side-facing
  // USB-C socket from the right.
  const forward = tangent.clone().normalize()
  const right = new THREE.Vector3().crossVectors(WORLD_UP, forward).normalize()
  const up = new THREE.Vector3().crossVectors(forward, right).normalize()
  connector.quaternion
    .setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward))
    .multiply(VERTICAL_PORT_ROLL)
}

export function createUsbCable(initialCompositionMode = 'compact') {
  let compositionMode = initialCompositionMode
  let currentProgress = 0
  const braidTextures = createBraidTexture()
  const cableFadeTexture = createCableFadeTexture()
  const materials = {
    braid: new THREE.MeshPhysicalMaterial({
      name: 'usb-cable-braid',
      map: braidTextures.color,
      alphaMap: cableFadeTexture,
      transparent: true,
      normalMap: braidTextures.normal,
      normalScale: new THREE.Vector2(0.46, 0.46),
      roughnessMap: braidTextures.roughness,
      roughness: 0.96,
      metalness: 0,
      clearcoat: 0,
      sheen: 0.035,
      sheenColor: 0x86c942,
      sheenRoughness: 1,
      anisotropy: 0,
      envMapIntensity: 0.38,
    }),
    housing: new THREE.MeshPhysicalMaterial({
      name: 'usb-cable-housing',
      color: 0x76b63a,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.54,
      envMapIntensity: 0.9,
    }),
    relief: new THREE.MeshPhysicalMaterial({
      name: 'usb-cable-relief',
      color: 0x72b039,
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.04,
      clearcoatRoughness: 0.76,
      envMapIntensity: 0.7,
    }),
    metal: new THREE.MeshPhysicalMaterial({
      name: 'usb-cable-metal',
      color: 0xc9cdca,
      roughness: 0.3,
      metalness: 0.92,
      envMapIntensity: 1.2,
    }),
    tongue: new THREE.MeshStandardMaterial({
      name: 'usb-cable-tongue',
      color: 0x526055,
      roughness: 0.68,
      metalness: 0.05,
    }),
    port: new THREE.MeshStandardMaterial({
      name: 'usb-cable-port',
      color: 0x171a18,
      roughness: 0.74,
      metalness: 0,
    }),
    shadow: new THREE.MeshBasicMaterial({
      name: 'usb-cable-contact-shadow',
      color: 0x35403b,
      alphaMap: cableFadeTexture,
      transparent: true,
      opacity: 0.085,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  }
  const materialAppearance = new Map(
    Object.values(materials).map((material) => [material, {
      opacity: material.opacity,
      transparent: material.transparent,
    }]),
  )

  const object = new THREE.Group()
  object.name = 'USB_CABLE'
  object.visible = false

  const initialPose = cablePoseAt(0, compositionMode)
  const contactShadow = new THREE.Mesh(
    geometryForContactShadow(initialPose.cablePoints),
    materials.shadow,
  )
  contactShadow.name = 'USB_CABLE_CONTACT_SHADOW'
  contactShadow.renderOrder = -1
  object.add(contactShadow)

  const sheath = new THREE.Mesh(geometryForCable(initialPose.cablePoints), materials.braid)
  sheath.name = 'USB_CABLE_SHEATH'
  // The studio key casts a long shadow behind the rising cable at this scale.
  // Ground the cable with the controlled floor layers instead, so the contact
  // stays visually underneath it from the full orbit range.
  sheath.castShadow = false
  sheath.receiveShadow = true
  object.add(sheath)

  const connector = createConnector(materials)
  object.add(connector)
  connector.position.copy(initialPose.connector)
  orientConnector(connector, initialPose.tangent)
  let cableAnimationStep = 0

  function setProgress(progress, forceGeometry = false) {
    currentProgress = progress
    const pose = cablePoseAt(progress, compositionMode)
    const nextCableAnimationStep = Math.round(progress * CABLE_ANIMATION_STEPS)
    if (forceGeometry || nextCableAnimationStep !== cableAnimationStep) {
      const cablePose = cablePoseAt(nextCableAnimationStep / CABLE_ANIMATION_STEPS, compositionMode)
      sheath.geometry.dispose()
      sheath.geometry = geometryForCable(cablePose.cablePoints)
      contactShadow.geometry.dispose()
      contactShadow.geometry = geometryForContactShadow(cablePose.cablePoints)
      cableAnimationStep = nextCableAnimationStep
    }
    connector.position.copy(pose.connector)
    orientConnector(connector, pose.tangent)
  }

  function setOpacity(opacity) {
    const value = THREE.MathUtils.clamp(opacity, 0, 1)
    materialAppearance.forEach((appearance, material) => {
      const transparent = appearance.transparent || value < 1
      material.opacity = appearance.opacity * value
      if (material.transparent !== transparent) {
        material.transparent = transparent
        material.needsUpdate = true
      }
    })
  }

  return {
    object,
    setOpacity,
    setProgress,
    setCompositionMode(nextCompositionMode) {
      if (nextCompositionMode === compositionMode) return
      compositionMode = nextCompositionMode
      setProgress(currentProgress, true)
    },
    dispose() {
      const geometries = new Set()
      object.traverse((child) => { if (child.geometry) geometries.add(child.geometry) })
      geometries.forEach((geometry) => geometry.dispose())
      Object.values(materials).forEach((material) => material.dispose())
      Object.values(braidTextures).forEach((texture) => texture.dispose())
      cableFadeTexture.dispose()
    },
  }
}

export function createUsbCableAnimation({ cable, reducedMotion, requestRender }) {
  let animationStart
  let startProgress = 0
  let startOpacity = 0
  let currentProgress = 0
  let currentOpacity = 0
  let targetVisible = false
  let motionDuration = 0
  let opacityDuration = 0

  function finishAtTarget() {
    const target = Number(targetVisible)
    animationStart = undefined
    currentProgress = target
    currentOpacity = target
    cable.setProgress(currentProgress)
    cable.setOpacity(currentOpacity)
    cable.object.visible = targetVisible
  }

  function setVisible(visible, timestamp = performance.now()) {
    if (visible === targetVisible) return
    if (animationStart !== undefined) update(timestamp)
    targetVisible = visible
    if (reducedMotion()) {
      finishAtTarget()
      requestRender()
      return
    }

    startProgress = currentProgress
    startOpacity = currentOpacity
    const target = Number(visible)
    motionDuration = Math.abs(target - startProgress) * USB_CABLE_DURATION_MS
    opacityDuration = Math.abs(target - startOpacity) * USB_CABLE_FADE_IN_MS
    if (motionDuration === 0 && opacityDuration === 0) finishAtTarget()
    else {
      cable.object.visible = true
      cable.setProgress(currentProgress)
      cable.setOpacity(currentOpacity)
      animationStart = timestamp
    }
    requestRender()
  }

  function update(timestamp) {
    if (animationStart === undefined || reducedMotion()) return false
    const elapsed = timestamp - animationStart
    const motionProgress = motionDuration === 0 ? 1 : Math.min(1, elapsed / motionDuration)
    const fadeProgress = opacityDuration === 0 ? 1 : Math.min(1, elapsed / opacityDuration)
    const target = Number(targetVisible)
    currentProgress = THREE.MathUtils.lerp(
      startProgress,
      target,
      easeUsbCableProgress(motionProgress),
    )
    currentOpacity = THREE.MathUtils.lerp(
      startOpacity,
      target,
      easeUsbCableFade(fadeProgress),
    )
    if (motionProgress === 1 && fadeProgress === 1) {
      finishAtTarget()
      return false
    }
    cable.setOpacity(currentOpacity)
    cable.setProgress(currentProgress)
    return true
  }

  function finishForReducedMotion() {
    if (animationStart === undefined) return
    finishAtTarget()
    requestRender()
  }

  return { finishForReducedMotion, setVisible, update }
}
