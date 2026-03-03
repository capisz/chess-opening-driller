export interface ParsedPgnVariation {
  openingName: string
  variationName: string
  moves: string[]
  tags: Record<string, string>
}

interface ParsePgnOptions {
  defaultOpeningName?: string
  defaultVariationPrefix?: string
  maxPlies?: number
}

const RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"])

const stripNestedSections = (text: string, startChar: string, endChar: string): string => {
  let depth = 0
  let result = ""

  for (const char of text) {
    if (char === startChar) {
      depth += 1
      continue
    }

    if (char === endChar && depth > 0) {
      depth -= 1
      continue
    }

    if (depth === 0) {
      result += char
    }
  }

  return result
}

const normalizeToken = (token: string): string => token.replace(/[!?]+/g, "").trim()

export const extractMovesFromPgn = (input: string): string[] => {
  if (!input.trim()) return []

  let cleaned = input.replace(/\r\n/g, "\n")
  cleaned = stripNestedSections(cleaned, "{", "}")
  cleaned = stripNestedSections(cleaned, "(", ")")
  cleaned = cleaned.replace(/;[^\n]*/g, " ")
  cleaned = cleaned.replace(/\$\d+/g, " ")
  cleaned = cleaned.replace(/^\s*\[[^\]]+\]\s*$/gm, " ")
  cleaned = cleaned.replace(/\d+\.{1,3}/g, " ")
  cleaned = cleaned.replace(/\s+/g, " ").trim()

  if (!cleaned) return []

  return cleaned
    .split(" ")
    .map(normalizeToken)
    .filter((token) => token.length > 0 && !RESULT_TOKENS.has(token))
}

const parseTags = (gameText: string): Record<string, string> => {
  const tags: Record<string, string> = {}
  const tagRegex = /^\s*\[(\w+)\s+"([^"]*)"\]\s*$/gm

  let match = tagRegex.exec(gameText)
  while (match) {
    const [, key, value] = match
    tags[key] = value.trim()
    match = tagRegex.exec(gameText)
  }

  return tags
}

const compactWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim()

const buildOpeningName = (tags: Record<string, string>, fallbackOpeningName: string): string => {
  if (tags.Opening && tags.Opening.trim().length > 0) {
    return compactWhitespace(tags.Opening)
  }

  if (fallbackOpeningName.trim().length > 0) {
    return compactWhitespace(fallbackOpeningName)
  }

  if (tags.ECO && tags.ECO.trim().length > 0) {
    return `ECO ${tags.ECO.trim()}`
  }

  return "Imported Opening"
}

const buildVariationName = (
  tags: Record<string, string>,
  defaultVariationPrefix: string,
  gameIndex: number,
): string => {
  if (tags.Variation && tags.Variation.trim().length > 0) {
    return compactWhitespace(tags.Variation)
  }

  const white = tags.White?.trim()
  const black = tags.Black?.trim()
  const eco = tags.ECO?.trim()

  if (eco && white && black) {
    return `${eco} - ${white} vs ${black}`
  }

  if (eco) {
    return `${eco} - ${defaultVariationPrefix} ${gameIndex + 1}`
  }

  if (white && black) {
    return `${white} vs ${black}`
  }

  return `${defaultVariationPrefix} ${gameIndex + 1}`
}

const splitPgnIntoGames = (pgnText: string): string[] => {
  const normalized = pgnText.replace(/\r\n/g, "\n").trim()
  if (!normalized) return []

  if (!/\[[A-Za-z]+\s+"[^"]*"\]/.test(normalized)) {
    return [normalized]
  }

  return normalized
    .split(/\n\s*\n(?=\s*\[)/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
}

export const parsePgnGames = (pgnText: string, options?: ParsePgnOptions): ParsedPgnVariation[] => {
  const games = splitPgnIntoGames(pgnText)
  if (games.length === 0) return []

  const defaultOpeningName = options?.defaultOpeningName?.trim() || "Imported Opening"
  const defaultVariationPrefix = options?.defaultVariationPrefix?.trim() || "Line"
  const maxPlies = options?.maxPlies && options.maxPlies > 0 ? Math.floor(options.maxPlies) : undefined

  return games
    .map((gameText, index) => {
      const tags = parseTags(gameText)
      const moves = extractMovesFromPgn(gameText)
      const normalizedMoves = maxPlies ? moves.slice(0, maxPlies) : moves

      if (normalizedMoves.length === 0) {
        return null
      }

      const openingName = buildOpeningName(tags, defaultOpeningName)
      const variationName = buildVariationName(tags, defaultVariationPrefix, index)

      return {
        openingName,
        variationName,
        moves: normalizedMoves,
        tags,
      }
    })
    .filter((variation): variation is ParsedPgnVariation => variation !== null)
}
