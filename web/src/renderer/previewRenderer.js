export const PREVIEW_WIDTH = 800
export const PREVIEW_HEIGHT = 480

const CHART_TOP = 150
const CHART_BOTTOM = 402
const CHART_HEIGHT = CHART_BOTTOM - CHART_TOP

export function createPreviewFrame(forecast, config) {
  const samples = forecast.days.flatMap((day) => day.samples)
  const thresholdY = CHART_BOTTOM - (config.threshold / 40) * CHART_HEIGHT
  return {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    spot: forecast.spot,
    days: forecast.days.length,
    sampleCount: samples.length,
    treatment: config.treatment,
    threshold: config.threshold,
    thresholdY,
    signature: `${config.treatment}:${config.threshold}:${thresholdY.toFixed(2)}:${samples.map((sample) => sample[0]).join(',')}`,
  }
}

function line(context, x1, y1, x2, y2, width = 1) {
  context.beginPath()
  context.moveTo(x1, y1)
  context.lineTo(x2, y2)
  context.lineWidth = width
  context.stroke()
}

function drawThresholdTreatment(context, frame) {
  const y = Math.round(frame.thresholdY)
  if (frame.treatment === 'background-fade') {
    const gradient = context.createLinearGradient(0, y - 46, 0, y + 80)
    gradient.addColorStop(0, 'rgba(21, 24, 23, 0)')
    gradient.addColorStop(1, 'rgba(21, 24, 23, 0.11)')
    context.fillStyle = gradient
    context.fillRect(14, y - 46, 772, CHART_BOTTOM - y + 82)
  } else if (frame.treatment === 'threshold-line') {
    context.strokeStyle = '#d44531'
    line(context, 16, y, 784, y, 3)
    context.fillStyle = '#d44531'
    context.font = '700 13px "JetBrains Mono Variable", monospace'
    context.fillText(`${frame.threshold} KTS`, 700, y - 9)
  }
}

function drawArrow(context, x, y, degrees) {
  context.save()
  context.translate(x, y)
  context.rotate((degrees * Math.PI) / 180)
  context.beginPath()
  context.moveTo(0, -7)
  context.lineTo(-6, 6)
  context.lineTo(0, 3)
  context.lineTo(6, 6)
  context.closePath()
  context.fill()
  context.restore()
}

export function renderForecastPreview(context, forecast, config) {
  const frame = createPreviewFrame(forecast, config)
  context.save()
  context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
  context.fillStyle = '#ebece4'
  context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
  context.strokeStyle = '#171a18'
  context.fillStyle = '#171a18'
  context.textBaseline = 'alphabetic'

  context.lineWidth = 2
  context.strokeRect(13, 13, 774, 454)
  context.font = '720 31px "Inter Variable", sans-serif'
  context.fillText(forecast.spot, 30, 54)
  context.font = '500 11px "JetBrains Mono Variable", monospace'
  context.fillText(forecast.coordinates, 31, 75)
  context.textAlign = 'right'
  context.fillText(`UPDATED ${forecast.updated}`, 768, 54)
  context.fillText('OPEN-METEO · 5 DAY', 768, 75)
  context.textAlign = 'left'
  line(context, 14, 102, 786, 102, 2)

  drawThresholdTreatment(context, frame)
  context.strokeStyle = '#171a18'

  const dayWidth = 154.4
  forecast.days.forEach((day, dayIndex) => {
    const left = 14 + dayIndex * dayWidth
    if (dayIndex > 0) line(context, left, 103, left, 466)
    context.fillStyle = '#171a18'
    context.font = '700 14px "JetBrains Mono Variable", monospace'
    context.textAlign = 'center'
    context.fillText(day.day, left + dayWidth / 2, 124)
    context.font = '500 10px "JetBrains Mono Variable", monospace'
    context.fillText(day.date, left + dayWidth / 2, 140)
    line(context, left, 148, left + dayWidth, 148)

    day.samples.forEach((sample, sampleIndex) => {
      const x = left + 18 + sampleIndex * 29
      const sustainedY = CHART_BOTTOM - (sample[0] / 40) * CHART_HEIGHT
      const gustY = CHART_BOTTOM - (sample[1] / 40) * CHART_HEIGHT
      const barHeight = CHART_BOTTOM - sustainedY
      context.fillStyle = '#171a18'
      if (frame.treatment === 'solid' && sample[0] < frame.threshold) {
        context.globalAlpha = 0.28
      }
      context.fillRect(x - 6, sustainedY, 12, barHeight)
      context.globalAlpha = 1
      line(context, x, sustainedY, x, gustY, 2)
      line(context, x - 3, gustY, x + 3, gustY, 2)
      drawArrow(context, x, 420, sample[2])
      context.font = '700 11px "JetBrains Mono Variable", monospace'
      context.textAlign = 'center'
      context.fillText(String(sample[0]), x, 450)
    })
  })

  context.restore()
  return frame
}
