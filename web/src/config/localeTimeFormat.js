export function resolveTimeFormat(locale) {
  const { hour12, hourCycle } = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
  }).resolvedOptions()

  if (typeof hour12 === 'boolean') return hour12 ? '12-hour' : '24-hour'
  return hourCycle === 'h11' || hourCycle === 'h12' ? '12-hour' : '24-hour'
}
