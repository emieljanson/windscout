import { publicAssetUrl } from './publicAssetUrl.js'

export const E1003_MODEL = Object.freeze({
  url: publicAssetUrl('devices/e1003/e1003.glb'),
  provenanceUrl: publicAssetUrl('devices/e1003/provenance.json'),
  sourceUrl: 'https://files.seeedstudio.com/wiki/reterminal_e10xx/res/reTerminal_E1003_3D.stp',
  sourceSha256: 'fbcb819feac7228d764971a64a2fb27522eee235b8a9fb43e875cbf94e969240',
  enclosureMm: Object.freeze({ width: 224, height: 187, depth: 18.6, standDepth: 54.5 }),
  screenMm: Object.freeze({ width: 209.664, height: 157.248 }),
  screenAspect: 4 / 3,
  maxBytes: 3 * 1024 * 1024,
  requiredRoles: Object.freeze(['BODY', 'CONTROLS', 'PORTS', 'SCREEN']),
})
