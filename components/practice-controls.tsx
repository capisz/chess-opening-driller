"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Play } from "lucide-react"
import type { Opening, PracticeOptions, TrainingColor, Variation } from "@/app/page"

interface PracticeControlsProps {
  openings: Opening[]
  onStartPractice: (variations: Variation[], options: PracticeOptions) => void
  onDeleteVariation: (openingId: string, variationId: string) => void
  practiceMode: boolean
}

const MIN_MASTERY_TARGET = 1
const MAX_MASTERY_TARGET = 10

export default function PracticeControls({
  openings,
  onStartPractice,
  onDeleteVariation,
  practiceMode,
}: PracticeControlsProps) {
  const [selectedOpeningId, setSelectedOpeningId] = useState<string>("")
  const [selectedVariations, setSelectedVariations] = useState<Set<string>>(new Set())
  const [masteryTarget, setMasteryTarget] = useState(3)
  const [trainingColor, setTrainingColor] = useState<TrainingColor>("auto")

  useEffect(() => {
    if (openings.length === 0) {
      setSelectedOpeningId("")
      setSelectedVariations(new Set())
      return
    }

    const selectedOpeningStillExists = openings.some((opening) => opening.id === selectedOpeningId)
    if (!selectedOpeningId || !selectedOpeningStillExists) {
      setSelectedOpeningId(openings[0].id)
    }
  }, [openings, selectedOpeningId])

  const activeOpening = useMemo(() => openings.find((opening) => opening.id === selectedOpeningId) || null, [openings, selectedOpeningId])

  useEffect(() => {
    if (!activeOpening) {
      setSelectedVariations(new Set())
      return
    }

    const variationIds = new Set(activeOpening.variations.map((variation) => variation.id))
    setSelectedVariations(variationIds)
  }, [activeOpening?.id])

  const handleVariationToggle = (variationId: string, checked: boolean) => {
    const nextSelection = new Set(selectedVariations)
    if (checked) {
      nextSelection.add(variationId)
    } else {
      nextSelection.delete(variationId)
    }
    setSelectedVariations(nextSelection)
  }

  const toggleAllActiveVariations = (checked: boolean) => {
    if (!activeOpening) return

    const nextSelection = checked
      ? new Set(activeOpening.variations.map((variation) => variation.id))
      : new Set<string>()

    setSelectedVariations(nextSelection)
  }

  const startPractice = () => {
    if (!activeOpening) {
      return
    }

    const selectedVariationObjects = activeOpening.variations
      .filter((variation) => selectedVariations.has(variation.id))
      .map((variation) => ({
        ...variation,
        openingName: variation.openingName || activeOpening.name,
      }))

    if (selectedVariationObjects.length === 0) {
      return
    }

    const normalizedMasteryTarget = Math.max(MIN_MASTERY_TARGET, Math.min(MAX_MASTERY_TARGET, masteryTarget || 1))

    onStartPractice(selectedVariationObjects, {
      masteryTarget: normalizedMasteryTarget,
      trainingColor,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice Openings</CardTitle>
      </CardHeader>
      <CardContent>
        {openings.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">No openings saved yet. Import PGN to get started.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="opening-select">Select Opening</Label>
              <select
                id="opening-select"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedOpeningId}
                onChange={(event) => setSelectedOpeningId(event.target.value)}
                disabled={practiceMode}
              >
                {openings.map((opening) => (
                  <option key={opening.id} value={opening.id}>
                    {opening.name} ({opening.variations.length} variation{opening.variations.length !== 1 ? "s" : ""})
                  </option>
                ))}
              </select>
            </div>

            {activeOpening && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{activeOpening.name}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleAllActiveVariations(true)}
                      disabled={practiceMode}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleAllActiveVariations(false)}
                      disabled={practiceMode}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {activeOpening.variations.map((variation) => (
                    <div key={variation.id} className="flex items-center justify-between rounded border bg-muted/30 p-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`variation-${variation.id}`}
                          checked={selectedVariations.has(variation.id)}
                          onCheckedChange={(checked) => handleVariationToggle(variation.id, !!checked)}
                          disabled={practiceMode}
                        />
                        <label htmlFor={`variation-${variation.id}`} className="cursor-pointer text-sm">
                          {variation.name}
                        </label>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{variation.moves.length} plies</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDeleteVariation(activeOpening.id, variation.id)}
                          disabled={practiceMode}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 border-t pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="mastery-target">Mastery Repetitions</Label>
                  <Input
                    id="mastery-target"
                    type="number"
                    min={MIN_MASTERY_TARGET}
                    max={MAX_MASTERY_TARGET}
                    value={masteryTarget}
                    onChange={(event) => setMasteryTarget(Number.parseInt(event.target.value, 10) || 1)}
                    disabled={practiceMode}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="training-color">Train As</Label>
                  <select
                    id="training-color"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={trainingColor}
                    onChange={(event) => setTrainingColor(event.target.value as TrainingColor)}
                    disabled={practiceMode}
                  >
                    <option value="auto">Auto</option>
                    <option value="w">White</option>
                    <option value="b">Black</option>
                  </select>
                </div>
              </div>

              <p className="text-sm font-medium">
                Selected: {selectedVariations.size} variation{selectedVariations.size !== 1 ? "s" : ""}
              </p>

              <Button onClick={startPractice} disabled={practiceMode || selectedVariations.size === 0} className="w-full">
                <Play className="mr-2 h-4 w-4" />
                Start Drill
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
