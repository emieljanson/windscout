export const AMBIENT_OCCLUSION = Object.freeze({
  radius: 0.018,
  distanceExponent: 1.5,
  thickness: 0.008,
  distanceFallOff: 1.35,
  scale: 0.7,
  samples: 16,
  blendIntensity: 0.52,
  denoiseRadius: 3,
  denoiseSamples: 8,
})

export function configureAmbientOcclusion(pass) {
  pass.updateGtaoMaterial({
    radius: AMBIENT_OCCLUSION.radius,
    distanceExponent: AMBIENT_OCCLUSION.distanceExponent,
    thickness: AMBIENT_OCCLUSION.thickness,
    distanceFallOff: AMBIENT_OCCLUSION.distanceFallOff,
    scale: AMBIENT_OCCLUSION.scale,
    samples: AMBIENT_OCCLUSION.samples,
  })
  pass.updatePdMaterial({
    radius: AMBIENT_OCCLUSION.denoiseRadius,
    samples: AMBIENT_OCCLUSION.denoiseSamples,
    rings: 2,
    radiusExponent: 2,
    lumaPhi: 8,
    depthPhi: 2,
    normalPhi: 3,
  })
  pass.blendIntensity = AMBIENT_OCCLUSION.blendIntensity
  return pass
}
