const SOURCE_MESH_GROUPS = Object.freeze([
  Object.freeze({ group: 'TOP_CONTROLS', meshes: new Set([241, 243, 244, 245]) }),
  Object.freeze({ group: 'MICRO_SD', meshes: new Set([246, 247, 248, 249, 250, 251]) }),
  Object.freeze({ group: 'POWER_SWITCH', meshes: new Set([252, 253, 254, 255, 256, 257, 258]) }),
  Object.freeze({ group: 'USB_C', meshes: new Set([259, 260, 261, 262, 263]) }),
  Object.freeze({ group: 'STATUS_CIRCLE', meshes: new Set([264]) }),
  Object.freeze({ group: 'LIGHTNING_BOLT', meshes: new Set([265]) }),
  Object.freeze({ group: 'EXPANSION_PORT', meshes: new Set([266, 267, 268, 269, 270, 271, 272]) }),
])

export function markingGroupForSourceMesh(sourceMesh, embeddedGroup) {
  return SOURCE_MESH_GROUPS.find(({ meshes }) => meshes.has(sourceMesh))?.group ?? embeddedGroup
}
