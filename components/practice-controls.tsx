"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Trash2, Play } from "lucide-react"
import type { Opening, Variation } from "@/app/page"

interface PracticeControlsProps {
  openings: Opening[]
  onStartPractice: (variations: Variation[]) => void
  onDeleteVariation: (openingId: string, variationId: string) => void
  practiceMode: boolean
}

export default function PracticeControls({
  openings,
  onStartPractice,
  onDeleteVariation,
  practiceMode,
}: PracticeControlsProps) {
  const [selectedVariations, setSelectedVariations] = useState<Set<string>>(new Set())

  const handleVariationToggle = (variationId: string, checked: boolean) => {
    const newSelected = new Set(selectedVariations)
    if (checked) {
      newSelected.add(variationId)
    } else {
      newSelected.delete(variationId)
    }
    setSelectedVariations(newSelected)
  }

  const handleOpeningToggle = (opening: Opening, checked: boolean) => {
    const newSelected = new Set(selectedVariations)
    opening.variations.forEach((variation) => {
      if (checked) {
        newSelected.add(variation.id)
      } else {
        newSelected.delete(variation.id)
      }
    })
    setSelectedVariations(newSelected)
  }

  const getSelectedVariationObjects = (): Variation[] => {
    const selected: Variation[] = []
    openings.forEach((opening) => {
      opening.variations.forEach((variation) => {
        if (selectedVariations.has(variation.id)) {
          selected.push(variation)
        }
      })
    })
    return selected
  }

  const startPractice = () => {
    const variations = getSelectedVariationObjects()
    if (variations.length > 0) {
      onStartPractice(variations)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice Openings</CardTitle>
      </CardHeader>
      <CardContent>
        {openings.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No openings saved yet. Import some notation to get started!
          </p>
        ) : (
          <div className="space-y-4">
            {openings.map((opening) => {
              const allVariationsSelected = opening.variations.every((v) => selectedVariations.has(v.id))
              const someVariationsSelected = opening.variations.some((v) => selectedVariations.has(v.id))

              return (
                <div key={opening.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`opening-${opening.id}`}
                        checked={allVariationsSelected}
                        onCheckedChange={(checked) => handleOpeningToggle(opening, !!checked)}
                        className={
                          someVariationsSelected && !allVariationsSelected ? "data-[state=checked]:bg-orange-500" : ""
                        }
                      />
                      <label htmlFor={`opening-${opening.id}`} className="font-semibold cursor-pointer">
                        {opening.name}
                      </label>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {opening.variations.length} variation{opening.variations.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="ml-6 space-y-2">
                    {opening.variations.map((variation) => (
                      <div key={variation.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`variation-${variation.id}`}
                            checked={selectedVariations.has(variation.id)}
                            onCheckedChange={(checked) => handleVariationToggle(variation.id, !!checked)}
                          />
                          <label htmlFor={`variation-${variation.id}`} className="text-sm cursor-pointer">
                            {variation.name}
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{variation.moves.length} moves</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onDeleteVariation(opening.id, variation.id)}
                            disabled={practiceMode}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            <div className="pt-4 border-t">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium">
                  Selected: {selectedVariations.size} variation{selectedVariations.size !== 1 ? "s" : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedVariations(new Set())}
                  disabled={practiceMode || selectedVariations.size === 0}
                >
                  Clear All
                </Button>
              </div>
              <Button
                onClick={startPractice}
                disabled={practiceMode || selectedVariations.size === 0}
                className="w-full"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Random Practice ({selectedVariations.size} variations)
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
