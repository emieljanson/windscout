import * as THREE from 'three'

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const FALLBACK_NORMAL = new THREE.Vector3(0, 0, 1)

function pulseMaterial({ color, secondary = 0xffffff, speed = 0.2, density = 2.4, opacity = 1, ambient = 0.08, tailLength = 0.22, additive = false }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSecondary: { value: new THREE.Color(secondary) },
      uDensity: { value: density },
      uOpacity: { value: opacity },
      uSpeed: { value: speed },
      uAmbient: { value: ambient },
      uTailLength: { value: tailLength },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vViewNormal;
      void main() {
        vUv = uv;
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uSecondary;
      uniform float uDensity;
      uniform float uOpacity;
      uniform float uSpeed;
      uniform float uAmbient;
      uniform float uTailLength;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      void main() {
        float position = fract(vUv.x * uDensity);
        float head = fract(uTime * uSpeed);
        float behind = mod(head - position + 1.0, 1.0);
        float tail = pow(max(0.0, 1.0 - behind / uTailLength), 2.2);
        float hot = pow(max(0.0, 1.0 - behind / 0.028), 3.2);
        float rim = 0.64 + 0.36 * pow(max(abs(vViewNormal.z), 0.01), 0.35);
        float endFade = smoothstep(0.0, 0.035, vUv.x) * (1.0 - smoothstep(0.965, 1.0, vUv.x));
        float alpha = (uAmbient + tail * 0.86) * rim * uOpacity * endFade;
        vec3 color = mix(uColor, uSecondary, hot * 0.82);
        gl_FragColor = vec4(color * (1.0 + hot * 2.0), alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
}

function auraMaterial(color, opacity, fresnel = 0.35) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uFresnel: { value: fresnel },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uFresnel;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        float edge = mix(1.0, pow(1.0 - abs(vNormal.z), 1.55), uFresnel);
        float endFade = smoothstep(0.0, 0.05, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));
        gl_FragColor = vec4(uColor, edge * uOpacity * endFade);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  })
}

class OffsetCurve extends THREE.Curve {
  constructor(curve, radius, angle, turns = 0, phase = 0) {
    super()
    this.curve = curve
    this.radius = radius
    this.angle = angle
    this.turns = turns
    this.phase = phase
  }

  getPoint(t, target = new THREE.Vector3()) {
    const point = this.curve.getPointAt(t, target)
    const tangent = this.curve.getTangentAt(t).normalize()
    const normal = new THREE.Vector3().crossVectors(tangent, WORLD_UP)
    if (normal.lengthSq() < 0.000001) normal.copy(FALLBACK_NORMAL)
    normal.normalize()
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize()
    const angle = this.angle + this.phase + t * this.turns * Math.PI * 2
    return point.addScaledVector(normal, Math.cos(angle) * this.radius).addScaledVector(binormal, Math.sin(angle) * this.radius)
  }
}

function tube(curve, radius, material, segments = 280, radialSegments = 8) {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, radialSegments, false), material)
  mesh.frustumCulled = false
  return mesh
}

function glowLine(curve, color, radius, opacity, materials) {
  const group = new THREE.Group()
  const outer = auraMaterial(color, 0.13 * opacity, 0.42)
  const middle = auraMaterial(color, 0.28 * opacity, 0.15)
  const coreColor = new THREE.Color(color).lerp(new THREE.Color(0xf5ffff), 0.12)
  const inner = auraMaterial(coreColor, 0.74 * opacity, 0)
  materials.push(outer, middle, inner)
  group.add(tube(curve, radius * 3.8, outer, 240, 10), tube(curve, radius * 1.9, middle, 280, 8), tube(curve, radius, inner, 300, 7))
  return group
}

function glowingOrb(color, radius, opacity = 1) {
  const group = new THREE.Group()
  const haloMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13 * opacity, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })
  const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xf8ffff, transparent: true, opacity: 0.92 * opacity, depthTest: false, depthWrite: false, toneMapped: false })
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 3.2, 16, 10), haloMaterial), new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 9), coreMaterial))
  return group
}

function orientToCurve(object, curve, t) {
  object.position.copy(curve.getPointAt(t))
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(t).normalize())
}

function createLightCore(curve, materials, animators) {
  const group = new THREE.Group()
  group.add(glowLine(curve, 0x147f9b, 0.00044, 1.35, materials))
  const envelope = auraMaterial(0x3caebf, 0.1, 0.9)
  materials.push(envelope)
  group.add(tube(curve, 0.003, envelope, 320, 20))
  const colors = [0x078da9, 0x169b78, 0x326fbd, 0x7654b4, 0xc97926, 0x3babb8, 0x64bcc7]
  colors.forEach((color, index) => {
    const lane = new OffsetCurve(curve, index === 6 ? 0 : 0.00055 + (index % 2) * 0.00018, index / 6 * Math.PI * 2, index % 2 ? -0.42 : 0.42, index * 0.46)
    const material = pulseMaterial({ color, secondary: 0xffffff, speed: 0.095 + index * 0.007, density: 0.9, opacity: index === 6 ? 1 : 0.82, ambient: index === 6 ? 0.42 : 0.13, tailLength: 0.42, additive: true })
    materials.push(material)
    group.add(tube(lane, index === 6 ? 0.00022 : 0.00013, material, 310, 7))
  })
  ;[0.05, 0.38, 0.72].forEach((phase, index) => {
    const orb = glowingOrb([0x8eeaf2, 0x8bd1ff, 0xffd09a][index], 0.00028, 0.74)
    group.add(orb)
    animators.push((time, reducedMotion) => {
      orb.position.copy(curve.getPointAt(reducedMotion ? phase : (phase + time * 0.052) % 1))
      const breathe = reducedMotion ? 1 : 0.88 + Math.sin(time * 3.2 + index) * 0.12
      orb.scale.setScalar(breathe)
    })
  })
  return group
}

function makeBranch(root, delta, bend) {
  return new THREE.CatmullRomCurve3([root, root.clone().addScaledVector(delta, 0.24).addScaledVector(bend, 0.2), root.clone().addScaledVector(delta, 0.62).add(bend), root.clone().add(delta)], false, 'centripetal')
}

function createMatrixJunction(curve, materials, animators) {
  const group = new THREE.Group()
  const mainMaterial = pulseMaterial({ color: 0x087563, secondary: 0xd9ffff, speed: 0.075, density: 1, opacity: 1, ambient: 0.28, tailLength: 0.16 })
  materials.push(mainMaterial)
  group.add(glowLine(curve, 0x087765, 0.00038, 1.05, materials), tube(curve, 0.0002, mainMaterial, 300, 7))
  const junctions = [
    { t: 0.62, branches: [
      { delta: [0.02, 0.038, -0.008], bend: [0.004, 0, 0.004], color: 0x07977c },
      { delta: [-0.018, 0.026, 0.016], bend: [-0.003, 0.005, 0], color: 0x277ac8 },
      { delta: [0.03, 0.013, 0.016], bend: [0, 0.006, 0.004], color: 0x13a88a },
    ] },
    { t: 0.82, branches: [
      { delta: [0.018, 0.034, 0.008], bend: [0.004, 0, -0.004], color: 0x267bc9 },
      { delta: [-0.024, 0.018, -0.014], bend: [-0.003, 0.004, 0], color: 0x079b7e },
    ] },
  ]
  junctions.forEach((junction, junctionIndex) => {
    const root = curve.getPointAt(junction.t)
    const node = glowingOrb(junctionIndex ? 0x428ed8 : 0x21aa91, 0.00035, 0.95)
    const nodeHalo = new THREE.Mesh(new THREE.SphereGeometry(0.00135, 24, 16), new THREE.MeshBasicMaterial({ color: junctionIndex ? 0x428ed8 : 0x21aa91, transparent: true, opacity: 0.12, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }))
    node.add(nodeHalo)
    node.position.copy(root)
    group.add(node)
    const ringMaterial = auraMaterial(junctionIndex ? 0x64aeef : 0x52d6b9, 0.52, 0)
    materials.push(ringMaterial)
    ;[0.0014, 0.00225].forEach((radius) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.000075, 6, 28), ringMaterial)
      orientToCurve(ring, curve, junction.t)
      group.add(ring)
    })
    junction.branches.forEach((spec, branchIndex) => {
      const branch = makeBranch(root, new THREE.Vector3(...spec.delta), new THREE.Vector3(...spec.bend))
      const material = pulseMaterial({ color: spec.color, secondary: 0xffffff, speed: 0.12 + branchIndex * 0.015, density: 0.72, opacity: 0.86, ambient: 0.11, tailLength: 0.24, additive: true })
      materials.push(material)
      const structuralMaterial = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.86,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
      group.add(glowLine(branch, spec.color, 0.00032, 0.82, materials), tube(branch, 0.0003, structuralMaterial, 110, 7), tube(branch, 0.00017, material, 110, 6))
      const packet = glowingOrb(spec.color, 0.00023, 0.8)
      group.add(packet)
      animators.push((time, reducedMotion) => {
        const progress = reducedMotion ? 0.44 : (time * 0.14 - junction.t * 2.2 - branchIndex * 0.16 + 5) % 1
        packet.position.copy(branch.getPointAt(progress))
        packet.visible = progress > 0.05 && progress < 0.96
      })
    })
    animators.push((time, reducedMotion) => node.scale.setScalar(reducedMotion ? 1 : 0.9 + Math.pow(Math.max(0, Math.sin(time * 1.9 - junctionIndex * 1.1)), 8) * 0.35))
  })
  return group
}

function createFieldSheath(curve, materials, animators) {
  const group = new THREE.Group()
  const fieldMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x1ea087) }, uAccent: { value: new THREE.Color(0x438bd0) } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vViewNormal;
      void main() {
        vUv = uv;
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uAccent;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      void main() {
        float helixA = pow(max(0.0, cos((vUv.y * 2.0 + vUv.x * 9.0 - uTime * 0.12) * 6.28318)), 14.0);
        float helixB = pow(max(0.0, cos((vUv.y * 2.0 - vUv.x * 7.0 + uTime * 0.085) * 6.28318)), 16.0);
        float ring = pow(max(0.0, cos((vUv.x * 15.0 - uTime * 0.28) * 6.28318)), 22.0);
        float breathe = 0.5 + 0.5 * sin((vUv.x * 1.35 - uTime * 0.045) * 6.28318);
        float rim = pow(1.0 - abs(vViewNormal.z), 1.7);
        float endFade = smoothstep(0.0, 0.055, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));
        vec3 color = mix(uColor, uAccent, clamp(helixB + breathe * 0.2, 0.0, 1.0));
        float alpha = (0.018 + rim * 0.14 + helixA * 0.34 + helixB * 0.27 + ring * 0.12) * endFade;
        gl_FragColor = vec4(color * (1.0 + helixA * 0.8 + ring * 0.34), alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
  })
  materials.push(fieldMaterial)
  group.add(tube(curve, 0.00305, fieldMaterial, 340, 32))
  const aura = auraMaterial(0x54cdb4, 0.055, 0.95)
  materials.push(aura)
  group.add(tube(curve, 0.00365, aura, 300, 24))
  const threadColors = [0x55d1b3, 0x4e9ed8, 0x86e5d3, 0x2b917f]
  for (let index = 0; index < 8; index += 1) {
    const lane = new OffsetCurve(curve, 0.00278, index / 8 * Math.PI * 2, index % 2 ? -3.1 : 3.1, index * 0.3)
    const material = pulseMaterial({ color: threadColors[index % threadColors.length], secondary: 0xdffff8, speed: index % 2 ? 0.065 : -0.052, density: 1.2, opacity: 0.48, ambient: 0.055, tailLength: 0.36, additive: true })
    materials.push(material)
    group.add(tube(lane, 0.000075, material, 300, 5))
  }
  const breathingRing = new THREE.Mesh(new THREE.TorusGeometry(0.00345, 0.00012, 7, 34), auraMaterial(0x8ce9d7, 0.65, 0))
  materials.push(breathingRing.material)
  group.add(breathingRing)
  animators.push((time, reducedMotion) => {
    const t = reducedMotion ? 0.58 : (time * 0.055 + 0.15) % 1
    orientToCurve(breathingRing, curve, t)
    breathingRing.scale.setScalar(reducedMotion ? 1 : 0.88 + Math.sin(time * 2.4) * 0.12)
  })
  return group
}

export function createCableEffects(curve) {
  const materials = []
  const animators = []
  const root = new THREE.Group()
  root.name = 'PROTOTYPE_CABLE_EFFECTS'
  const variants = [
    createLightCore(curve, materials, animators),
    createMatrixJunction(curve, materials, animators),
    createFieldSheath(curve, materials, animators),
  ]
  variants.forEach((variant, index) => {
    variant.name = `PROTOTYPE_CABLE_VARIANT_${index + 1}`
    variant.visible = index === 0
    root.add(variant)
  })
  return {
    root,
    setVariant(index) {
      variants.forEach((variant, variantIndex) => { variant.visible = variantIndex === index })
    },
    update(time, reducedMotion) {
      const value = reducedMotion ? 1.4 : time
      materials.forEach((material) => {
        if (material.uniforms?.uTime) material.uniforms.uTime.value = value
      })
      animators.forEach((animate) => animate(value, reducedMotion))
    },
    dispose() {
      root.traverse((object) => {
        object.geometry?.dispose()
        object.material?.dispose?.()
      })
    },
  }
}
