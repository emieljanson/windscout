export const E1002_MODEL = Object.freeze({
  url: '/devices/e1002/e1002.glb',
  provenanceUrl: '/devices/e1002/provenance.json',
  sourceUrl: 'https://files.seeedstudio.com/wiki/reterminal_e10xx/res/reTerminal_E1001_E1002_3D.stp',
  sourceSha256: 'd007d0db5ecd78f2109ee9115aa562b31d058fc054172b7237a4692c6e30a6b1',
  enclosureMm: Object.freeze({ width: 176, height: 120, depth: 17, standDepth: 53 }),
  screenAspect: 800 / 480,
  maxBytes: 3 * 1024 * 1024,
  requiredRoles: Object.freeze(['BODY', 'CONTROLS', 'PORTS', 'STAND', 'SCREEN']),
})

export function validateModelProvenance(provenance) {
  if (!provenance || provenance.source?.url !== E1002_MODEL.sourceUrl) return false
  if (provenance.source?.sha256 !== E1002_MODEL.sourceSha256) return false
  if (provenance.publication?.redistributionConfirmed !== true) return false
  if (!provenance.publication?.permissionBasis) return false
  if (!E1002_MODEL.requiredRoles.every((role) => provenance.output?.roles?.includes(role))) return false
  return provenance.output?.bytes > 0 && provenance.output.bytes <= E1002_MODEL.maxBytes
}
