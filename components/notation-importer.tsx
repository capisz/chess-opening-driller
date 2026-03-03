"use client"

import { type ChangeEvent, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { parsePgnGames, type ParsedPgnVariation } from "@/lib/pgn"

interface NotationImporterProps {
  onSave: (openingName: string, variationName: string, moves: string[]) => void
}

interface ImportCandidate extends ParsedPgnVariation {
  id: string
  selected: boolean
  source: string
  occurrenceCount: number
}

interface RawParsedVariation {
  source: string
  variation: ParsedPgnVariation
}

const DEFAULT_OPENING_PLIES = 8
const MAX_VISIBLE_LINES = 300

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const resolveTopEco = (ecoCountByCode: Map<string, number>): string | null => {
  let topEco: string | null = null
  let topCount = 0

  ecoCountByCode.forEach((count, eco) => {
    if (count > topCount) {
      topCount = count
      topEco = eco
    }
  })

  return topEco
}

const collapseParsedVariations = (parsedVariations: RawParsedVariation[]): Omit<ImportCandidate, "id" | "selected">[] => {
  const buckets = new Map<
    string,
    {
      representative: ParsedPgnVariation
      sourceSet: Set<string>
      occurrenceCount: number
      ecoCountByCode: Map<string, number>
    }
  >()

  parsedVariations.forEach(({ source, variation }) => {
    const key = `${variation.openingName}::${variation.moves.join(" ")}`
    const existing = buckets.get(key)

    if (!existing) {
      const ecoCountByCode = new Map<string, number>()
      const eco = variation.tags.ECO?.trim()
      if (eco) {
        ecoCountByCode.set(eco, 1)
      }

      buckets.set(key, {
        representative: variation,
        sourceSet: new Set([source]),
        occurrenceCount: 1,
        ecoCountByCode,
      })
      return
    }

    existing.occurrenceCount += 1
    existing.sourceSet.add(source)

    const eco = variation.tags.ECO?.trim()
    if (eco) {
      existing.ecoCountByCode.set(eco, (existing.ecoCountByCode.get(eco) || 0) + 1)
    }
  })

  return Array.from(buckets.values())
    .map((bucket) => {
      const representative = bucket.representative
      const movePreview = representative.moves.slice(0, 4).join(" ")
      const topEco = resolveTopEco(bucket.ecoCountByCode)

      const variationName = representative.tags.Variation?.trim() || (topEco ? `${topEco} • ${movePreview}` : movePreview)

      return {
        openingName: representative.openingName,
        variationName,
        moves: representative.moves,
        tags: representative.tags,
        source: bucket.sourceSet.size === 1 ? Array.from(bucket.sourceSet)[0] : `${bucket.sourceSet.size} sources`,
        occurrenceCount: bucket.occurrenceCount,
      }
    })
    .sort((left, right) => right.occurrenceCount - left.occurrenceCount || left.variationName.localeCompare(right.variationName))
}

export default function NotationImporter({ onSave }: NotationImporterProps) {
  const [openingName, setOpeningName] = useState("")
  const [notation, setNotation] = useState("")
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[]>([])
  const [detectedCount, setDetectedCount] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)

  const normalizedOpeningName = openingName.trim()

  const selectedCount = useMemo(
    () => importCandidates.reduce((count, candidate) => count + (candidate.selected ? 1 : 0), 0),
    [importCandidates],
  )

  const loadCandidates = (rawParsedVariations: RawParsedVariation[]) => {
    const collapsed = collapseParsedVariations(rawParsedVariations)

    if (collapsed.length === 0) {
      setImportError("No playable move sequences were found in the imported PGN.")
      setImportCandidates([])
      setDetectedCount(0)
      return
    }

    const visible = collapsed.slice(0, MAX_VISIBLE_LINES).map((candidate) => ({
      ...candidate,
      id: createId(),
      selected: true,
    }))

    setImportError(null)
    setDetectedCount(collapsed.length)
    setImportCandidates(visible)
  }

  const parseTextInput = () => {
    if (!notation.trim()) {
      setImportError("Paste PGN text before parsing.")
      return
    }

    const parsedVariations = parsePgnGames(notation, {
      defaultOpeningName: normalizedOpeningName || "Imported Opening",
      maxPlies: DEFAULT_OPENING_PLIES,
    })

    loadCandidates(parsedVariations.map((variation) => ({ source: "Pasted Text", variation })))
  }

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const parsedFromFiles: RawParsedVariation[] = []

    for (const file of Array.from(files)) {
      const fileText = await file.text()
      const fallbackOpeningName = normalizedOpeningName || file.name.replace(/\.[^.]+$/, "") || "Imported Opening"

      const parsedVariations = parsePgnGames(fileText, {
        defaultOpeningName: fallbackOpeningName,
        maxPlies: DEFAULT_OPENING_PLIES,
      })

      parsedVariations.forEach((variation) => {
        parsedFromFiles.push({
          source: file.name,
          variation,
        })
      })
    }

    loadCandidates(parsedFromFiles)
    event.target.value = ""
  }

  const toggleCandidate = (candidateId: string, checked: boolean) => {
    setImportCandidates((previous) =>
      previous.map((candidate) => (candidate.id === candidateId ? { ...candidate, selected: checked } : candidate)),
    )
  }

  const toggleAll = (checked: boolean) => {
    setImportCandidates((previous) => previous.map((candidate) => ({ ...candidate, selected: checked })))
  }

  const saveSelectedVariations = () => {
    const selectedVariations = importCandidates.filter((candidate) => candidate.selected)
    if (selectedVariations.length === 0) {
      return
    }

    selectedVariations.forEach((candidate) => {
      onSave(candidate.openingName, candidate.variationName, candidate.moves)
    })

    setImportCandidates([])
    setDetectedCount(0)
    setImportError(null)
    setNotation("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import PGN</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="opening-name">Opening Name (Optional Override)</Label>
          <Input
            id="opening-name"
            placeholder="e.g. Sicilian Defense"
            value={openingName}
            onChange={(event) => setOpeningName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pgn-file">Upload .pgn File</Label>
          <Input id="pgn-file" type="file" accept=".pgn,.txt" multiple onChange={handleFileImport} />
          <p className="text-xs text-muted-foreground">Only the opening phase is imported (first {DEFAULT_OPENING_PLIES} plies).</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notation">Or Paste PGN Text</Label>
          <Textarea
            id="notation"
            placeholder="Paste one line or a full multi-game PGN"
            value={notation}
            onChange={(event) => setNotation(event.target.value)}
            rows={8}
          />
          <Button onClick={parseTextInput} className="w-full" variant="outline">
            Parse Pasted PGN
          </Button>
        </div>

        {importError && <p className="text-sm text-destructive">{importError}</p>}

        {importCandidates.length > 0 && (
          <div className="space-y-3 rounded border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Detected Lines: {detectedCount}</p>
              {detectedCount > importCandidates.length && (
                <p className="text-xs text-muted-foreground">Showing top {importCandidates.length} lines by frequency.</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
                Clear
              </Button>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {importCandidates.map((candidate) => {
                const previewMoves = candidate.moves.slice(0, 8).join(" ")

                return (
                  <div key={candidate.id} className="rounded border bg-muted/30 p-2">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id={`candidate-${candidate.id}`}
                        checked={candidate.selected}
                        onCheckedChange={(checked) => toggleCandidate(candidate.id, !!checked)}
                      />
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`candidate-${candidate.id}`} className="cursor-pointer text-sm font-medium">
                          {candidate.openingName} • {candidate.variationName}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {candidate.occurrenceCount} game{candidate.occurrenceCount !== 1 ? "s" : ""} • {candidate.source}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {previewMoves}
                          {candidate.moves.length > 8 ? " ..." : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <Button onClick={saveSelectedVariations} className="w-full" disabled={selectedCount === 0}>
              Save Selected Variations ({selectedCount})
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
