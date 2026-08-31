/** WCAG relative luminance for a six-digit sRGB hex color. */
export function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const srgb = channel / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export function contrastRatio(hexA: string, hexB: string): number | null {
  const luminanceA = relativeLuminance(hexA)
  const luminanceB = relativeLuminance(hexB)
  if (luminanceA === null || luminanceB === null) return null
  return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05)
}

/** Black or white guarantees at least WCAG AA 4.5:1 for a valid hex color. */
export function readableTextColor(backgroundHex: string): '#ffffff' | '#000000' {
  const whiteRatio = contrastRatio(backgroundHex, '#ffffff')
  const blackRatio = contrastRatio(backgroundHex, '#000000')
  if (whiteRatio === null || blackRatio === null) return '#000000'
  return whiteRatio >= blackRatio ? '#ffffff' : '#000000'
}
