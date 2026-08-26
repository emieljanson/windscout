import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { E1002_MODEL } from '../src/assets/e1002.js'

const require = createRequire(import.meta.url)
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDirectory = join(projectRoot, 'public', 'devices', 'e1002')
const modelPath = join(outputDirectory, 'e1002.glb')
const provenancePath = join(outputDirectory, 'provenance.json')

const meshRoles = Object.freeze({
  BODY: new Set([0, 1, 2, 3, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25]),
  CONTROLS: new Set([4, 5, 6, 7, 8, 9, 10, 11, 28, 29, 30, 39, 41, 50, 51, 52, 53, 54, 55]),
  PORTS: new Set([31, 32, 33, 34, 35, 37, 38, 40, 43, 44, 45, 49, 57, 59]),
  STAND: new Set([58]),
})

const excludedInternalMeshes = new Set([23, 24, 26, 27, 36, 42, 46, 47, 48, 56])

function hash(content) {
  return createHash('sha256').update(content).digest('hex')
}

function roleForMesh(index) {
  for (const [role, indexes] of Object.entries(meshRoles)) {
    if (indexes.has(index)) return role
  }
  return null
}

function geometryFromOcct(mesh) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array.flat(), 3))
  if (mesh.attributes.normal) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array.flat(), 3))
  } else {
    geometry.computeVertexNormals()
  }
  geometry.setIndex(mesh.index.array.flat())
  geometry.scale(0.001, 0.001, 0.001)
  geometry.computeBoundingBox()
  return geometry
}

function materialForRole(role) {
  const shared = { roughness: 0.72, metalness: 0.02 }
  if (role === 'PORTS') return new THREE.MeshStandardMaterial({ ...shared, color: 0x242826, name: 'port-black' })
  if (role === 'CONTROLS') return new THREE.MeshStandardMaterial({ ...shared, color: 0x717773, name: 'control-grey' })
  if (role === 'STAND') return new THREE.MeshStandardMaterial({ ...shared, color: 0xaeb1ac, name: 'stand-grey' })
  return new THREE.MeshStandardMaterial({ ...shared, color: 0xd1d2cc, name: 'shell-grey' })
}

function createScreen() {
  const geometry = new THREE.PlaneGeometry(0.159, 0.0954)
  const material = new THREE.MeshBasicMaterial({ color: 0xebece4, toneMapped: false, name: 'screen-preview' })
  const screen = new THREE.Mesh(geometry, material)
  screen.name = 'SCREEN'
  screen.position.set(0, 0.06, 0.0042)
  screen.userData.role = 'SCREEN'
  return screen
}

function buildScene(imported) {
  const root = new THREE.Group()
  root.name = 'E1002'
  root.userData = {
    source: E1002_MODEL.sourceUrl,
    enclosureMm: E1002_MODEL.enclosureMm,
    publicationRestricted: true,
  }

  const roleGroups = new Map()
  for (const role of Object.keys(meshRoles)) {
    const group = new THREE.Group()
    group.name = role
    group.userData.role = role
    root.add(group)
    roleGroups.set(role, group)
  }

  imported.meshes.forEach((mesh, index) => {
    if (excludedInternalMeshes.has(index)) return
    const role = roleForMesh(index)
    if (!role) return
    const object = new THREE.Mesh(geometryFromOcct(mesh), materialForRole(role))
    object.name = `${role}_${String(index).padStart(2, '0')}`
    object.userData = { role, sourceMesh: index }
    roleGroups.get(role).add(object)
  })

  root.add(createScreen())
  root.position.y = -0.06
  root.updateMatrixWorld(true)
  return root
}

function inspectScene(scene) {
  const fullBox = new THREE.Box3().setFromObject(scene)
  const enclosureBox = new THREE.Box3()
  for (const role of ['BODY', 'CONTROLS', 'PORTS']) {
    enclosureBox.union(new THREE.Box3().setFromObject(scene.getObjectByName(role)))
  }
  const enclosureSize = enclosureBox.getSize(new THREE.Vector3()).multiplyScalar(1000)
  const fullSize = fullBox.getSize(new THREE.Vector3()).multiplyScalar(1000)
  const measured = {
    enclosureMm: {
      width: Number(enclosureSize.x.toFixed(1)),
      height: Number(enclosureSize.y.toFixed(1)),
      depth: Number(enclosureSize.z.toFixed(1)),
    },
    totalStandDepthMm: Number(fullSize.z.toFixed(1)),
  }

  const tolerances = { width: 2, height: 1, depth: 1, standDepth: 1 }
  if (Math.abs(measured.enclosureMm.width - E1002_MODEL.enclosureMm.width) > tolerances.width) {
    throw new Error(`Model width ${measured.enclosureMm.width} mm does not match the documented enclosure`)
  }
  if (Math.abs(measured.enclosureMm.height - E1002_MODEL.enclosureMm.height) > tolerances.height) {
    throw new Error(`Model height ${measured.enclosureMm.height} mm does not match the documented enclosure`)
  }
  if (Math.abs(measured.enclosureMm.depth - E1002_MODEL.enclosureMm.depth) > tolerances.depth) {
    throw new Error(`Model depth ${measured.enclosureMm.depth} mm does not match the documented enclosure`)
  }
  if (Math.abs(measured.totalStandDepthMm - E1002_MODEL.enclosureMm.standDepth) > tolerances.standDepth) {
    throw new Error(`Model stand depth ${measured.totalStandDepthMm} mm does not match the documented assembly`)
  }
  for (const role of E1002_MODEL.requiredRoles) {
    if (!scene.getObjectByName(role)) throw new Error(`Model is missing the ${role} scene role`)
  }
  return measured
}

class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onloadend?.({ target: this })
    }, (error) => this.onerror?.(error))
  }
}

async function exportBinary(scene) {
  if (!globalThis.FileReader) globalThis.FileReader = NodeFileReader
  const exporter = new GLTFExporter()
  return new Uint8Array(await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    trs: false,
  }))
}

async function main() {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'windscout-e1002-'))
  try {
    await mkdir(outputDirectory, { recursive: true })
    const sourcePath = join(temporaryDirectory, 'e1002.stp')
    const response = await fetch(E1002_MODEL.sourceUrl)
    if (!response.ok) throw new Error(`CAD download failed with HTTP ${response.status}`)
    const sourceBytes = new Uint8Array(await response.arrayBuffer())
    await writeFile(sourcePath, sourceBytes)

    const occt = await require('occt-import-js')()
    const imported = occt.ReadStepFile(await readFile(sourcePath), {
      linearUnit: 'millimeter',
      linearDeflectionType: 'absolute_value',
      linearDeflection: 0.5,
      angularDeflection: 0.5,
    })
    if (!imported.success) throw new Error('OpenCascade could not read the STEP assembly')

    const scene = buildScene(imported)
    const measured = inspectScene(scene)
    const binary = await exportBinary(scene)
    if (binary.byteLength > E1002_MODEL.maxBytes) {
      throw new Error(`Generated model is ${(binary.byteLength / 1024 / 1024).toFixed(2)} MB; limit is 3 MB`)
    }

    await writeFile(modelPath, binary)
    const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
    const provenance = {
      generatedAt: new Date().toISOString(),
      source: {
        url: E1002_MODEL.sourceUrl,
        sha256: hash(sourceBytes),
        documentedDimensionsMm: E1002_MODEL.enclosureMm,
      },
      conversion: {
        importer: `occt-import-js@${packageJson.devDependencies['occt-import-js']}`,
        exporter: `three@${packageJson.dependencies.three}`,
        linearDeflectionMm: 0.5,
        angularDeflection: 0.5,
        excludedInternalMeshes: [...excludedInternalMeshes],
        addedScreenMm: { width: 159, height: 95.4, aspect: E1002_MODEL.screenAspect },
      },
      output: {
        file: 'e1002.glb',
        bytes: binary.byteLength,
        sha256: hash(binary),
        roles: E1002_MODEL.requiredRoles,
        sourceMeshes: imported.meshes.length,
        measured,
      },
      publication: {
        redistributionConfirmed: false,
        restriction: 'Local design development only until Seeed confirms CAD redistribution terms.',
      },
    }
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`)
    console.log(`Prepared ${modelPath}`)
    console.log(`${(binary.byteLength / 1024 / 1024).toFixed(2)} MB · ${imported.meshes.length} source meshes · roles ${E1002_MODEL.requiredRoles.join(', ')}`)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
