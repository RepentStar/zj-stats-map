import { theme } from '../theme.js'

/** Nearest-rank quantiles: thresholds are observed values, shared by all years. */
export function createClassification(values, classCount = 5) {
  if (!Number.isInteger(classCount) || classCount < 1 || classCount > 5) {
    throw new Error('分级数量必须为 1–5 的整数')
  }
  const sorted = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b)
  const breaks = [...new Set(Array.from({ length: classCount - 1 }, (_, index) =>
    sorted[Math.ceil(sorted.length * (index + 1) / classCount) - 1],
  ))].filter((value) => value !== undefined && value < sorted.at(-1))
  const palette = theme.mapColors
  const count = sorted.length ? breaks.length + 1 : 0
  const colors = Array.from({ length: count }, (_, index) =>
    palette[count === 1 ? 2 : Math.round(index * (palette.length - 1) / (count - 1))],
  )
  return {
    breaks, colors,
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
    classify(value) {
      if (!count || typeof value !== 'number' || !Number.isFinite(value)) return -1
      const index = breaks.findIndex((upper) => value <= upper)
      return index === -1 ? breaks.length : index
    },
  }
}

export function createClassifications(store) {
  return new Map([...store.indicators.keys()].map((indicator) => {
    const values = [...(store.stats.get(indicator)?.values() ?? [])]
      .flatMap((byCity) => [...byCity.values()])
    return [indicator, createClassification(values)]
  }))
}
