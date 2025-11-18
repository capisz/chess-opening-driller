"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface NotationImporterProps {
  onSave: (openingName: string, variationName: string, moves: string[]) => void
}

export default function NotationImporter({ onSave }: NotationImporterProps) {
  const [openingName, setOpeningName] = useState("")
  const [variationName, setVariationName] = useState("")
  const [notation, setNotation] = useState("")
  const [parsedMoves, setParsedMoves] = useState<string[]>([])

  const parseNotation = (pgn: string) => {
    // Enhanced PGN parser
    const moves = pgn
      .replace(/\d+\.\.\./g, "") // Remove black move numbers (1...)
      .replace(/\d+\./g, "") // Remove white move numbers (1.)
      .replace(/\{[^}]*\}/g, "") // Remove comments in braces
      .replace(/$$[^)]*$$/g, "") // Remove variations in parentheses
      .replace(/\$\d+/g, "") // Remove NAG annotations
      .replace(/[!?]+/g, "") // Remove move annotations
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim()
      .split(" ")
      .filter((move) => {
        // Filter out result markers and empty strings
        return (
          move &&
          !move.includes("*") &&
          !move.includes("1-0") &&
          !move.includes("0-1") &&
          !move.includes("1/2-1/2") &&
          move.length > 0
        )
      })

    return moves
  }

  const handleParse = () => {
    const moves = parseNotation(notation)
    setParsedMoves(moves)
  }

  const handleSave = () => {
    if (openingName && variationName && parsedMoves.length > 0) {
      onSave(openingName, variationName, parsedMoves)
      setOpeningName("")
      setVariationName("")
      setNotation("")
      setParsedMoves([])
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Chess Opening</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="opening-name">Opening Name</Label>
          <Input
            id="opening-name"
            placeholder="e.g., Sicilian Defense"
            value={openingName}
            onChange={(e) => setOpeningName(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="variation-name">Variation Name</Label>
          <Input
            id="variation-name"
            placeholder="e.g., Najdorf Variation"
            value={variationName}
            onChange={(e) => setVariationName(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="notation">PGN Notation</Label>
          <Textarea
            id="notation"
            placeholder="1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6..."
            value={notation}
            onChange={(e) => setNotation(e.target.value)}
            rows={6}
          />
        </div>

        <Button onClick={handleParse} className="w-full">
          Parse Notation
        </Button>

        {parsedMoves.length > 0 && (
          <div className="space-y-2">
            <Label>Parsed Moves ({parsedMoves.length} moves)</Label>
            <div className="p-3 bg-muted rounded text-sm max-h-32 overflow-y-auto">
              {parsedMoves.map((move, index) => (
                <span key={index} className="mr-2">
                  {Math.floor(index / 2) + 1}
                  {index % 2 === 0 ? "." : "..."} {move}
                </span>
              ))}
            </div>
            <Button onClick={handleSave} className="w-full" disabled={!openingName || !variationName}>
              Save Opening Variation
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
