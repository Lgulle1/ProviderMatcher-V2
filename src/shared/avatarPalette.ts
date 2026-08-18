/**
 * Single source of truth for a provider's fallback avatar (no photo): which
 * two letters show, and which color. Used by the dashboard (ProvidersPage,
 * ProviderProfilePage) and the embeddable widget (widget/src/widget.js) so a
 * provider looks the same in both places — same name in, same initials and
 * same color out.
 *
 * The embeddable widget is a standalone script with no Tailwind, so it needs
 * raw hex rather than a class name; each color carries both. widget.js
 * imports this file directly — esbuild strips the types at bundle time, no
 * build config needed on that side.
 */

export interface AvatarColor {
  /** Tailwind background class, for dashboard/React rendering. */
  readonly tw: string
  /** The same color as a hex value, for the widget's inline styles. */
  readonly hex: string
}

export const AVATAR_COLORS: readonly AvatarColor[] = [
  { tw: 'bg-indigo-500', hex: '#6366f1' },
  { tw: 'bg-violet-500', hex: '#8b5cf6' },
  { tw: 'bg-blue-500', hex: '#3b82f6' },
  { tw: 'bg-emerald-500', hex: '#10b981' },
  { tw: 'bg-amber-500', hex: '#f59e0b' },
  { tw: 'bg-rose-500', hex: '#f43f5e' },
  { tw: 'bg-pink-500', hex: '#ec4899' },
  { tw: 'bg-cyan-500', hex: '#06b6d4' },
]

/** First + last initial for a multi-word name, or just the first letter for a single word. */
export function initialsForName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

/** Deterministic index into AVATAR_COLORS for a given name — same name always gets the same color. */
export function avatarColorIndex(name: string): number {
  const sum = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return sum % AVATAR_COLORS.length
}
