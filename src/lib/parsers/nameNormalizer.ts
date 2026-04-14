export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  )

  for (let i = 0; i <= a.length; i += 1) {
    dp[i][0] = i
  }
  for (let j = 0; j <= b.length; j += 1) {
    dp[0][j] = j
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }

  return dp[a.length][b.length]
}

export function fuzzyMatch(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) {
    return 1
  }
  if (a.length === 0 || b.length === 0) {
    return 0
  }

  const distance = levenshteinDistance(a, b)
  return 1 - distance / Math.max(a.length, b.length)
}
