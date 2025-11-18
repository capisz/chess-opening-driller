"use client"

import { useState, useEffect } from "react"
import ChessBoard from "@/components/chess-board"
import NotationImporter from "@/components/notation-importer"
import PracticeControls from "@/components/practice-controls"
import { ChessGame } from "@/lib/chess-engine"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface Opening {
  id: string
  name: string
  variations: Variation[]
}

export interface Variation {
  id: string
  name: string
  moves: string[]
}

export interface PracticeSession {
  variations: Variation[]
  currentVariationIndex: number
  currentMoveIndex: number
  attempts: number
  accuracy: { correct: number; total: number }
  completed: boolean
  userPlaysBlack: boolean
}

export default function ChessTrainer() {
  const [game, setGame] = useState(new ChessGame())
  const [flipped, setFlipped] = useState(false)
  const [openings, setOpenings] = useState<Opening[]>([])
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null)
  const [showHint, setShowHint] = useState<{ from: string; to: string } | null>(null)
  const [gameHistory, setGameHistory] = useState<string[]>([])

  useEffect(() => {
    // Load saved openings from localStorage
    const saved = localStorage.getItem("chess-openings")
    if (saved) {
      setOpenings(JSON.parse(saved))
    }
  }, [])

  const handleMove = (from: string, to: string) => {
    console.log(`=== Handle Move Called: ${from} -> ${to} ===`)

    if (practiceSession) {
      console.log("In practice mode")
      handlePracticeMove(from, to)
    } else {
      console.log("In free play mode")
      const newGame = game.clone()
      console.log("Attempting move in free play...")

      if (newGame.makeMove(from, to)) {
        console.log("Move successful in free play")
        setGame(newGame)
        const moveNotation = newGame.getLastMoveNotation()
        setGameHistory((prev) => [...prev, moveNotation])
      } else {
        console.log("Move failed in free play")
      }
    }
  }

  const handlePracticeMove = (from: string, to: string) => {
    console.log("=== Practice Move Handler ===")

    if (!practiceSession || practiceSession.completed) {
      console.log("No practice session or completed")
      return
    }

    const currentVariation = practiceSession.variations[practiceSession.currentVariationIndex]
    if (practiceSession.currentMoveIndex >= currentVariation.moves.length) {
      console.log("No more moves in variation")
      return
    }

    const expectedMove = currentVariation.moves[practiceSession.currentMoveIndex]
    console.log(`Expected move: ${expectedMove}`)

    const newGame = game.clone()
    console.log("Attempting practice move...")

    if (newGame.makeMove(from, to)) {
      const actualMove = newGame.getLastMoveNotation()
      console.log(`Actual move: ${actualMove}`)

      const normalizeMove = (move: string) => move.replace(/[+#!?]+$/, "").trim()

      if (normalizeMove(actualMove) === normalizeMove(expectedMove)) {
        // Correct move
        console.log("✓ Correct move!")
        setGame(newGame)
        const newHistory = [...gameHistory, actualMove]
        setGameHistory(newHistory)

        setPracticeSession((prev) => ({
          ...prev!,
          accuracy: { correct: prev!.accuracy.correct + 1, total: prev!.accuracy.total + 1 },
          attempts: 0,
          currentMoveIndex: prev!.currentMoveIndex + 1,
        }))
        setShowHint(null)

        // Make opponent's move automatically after a short delay
        setTimeout(() => {
          makeOpponentMove()
        }, 1000)
      } else {
        // Wrong move
        console.log("✗ Incorrect move!")
        setPracticeSession((prev) => ({
          ...prev!,
          accuracy: { correct: prev!.accuracy.correct, total: prev!.accuracy.total + 1 },
          attempts: prev!.attempts + 1,
        }))

        // Show hints based on attempts
        if (practiceSession.attempts === 1) {
          const moveData = game.parseAlgebraicNotation(expectedMove)
          if (moveData) {
            setShowHint({ from: moveData.from, to: "" })
          }
        } else if (practiceSession.attempts === 3) {
          const moveData = game.parseAlgebraicNotation(expectedMove)
          if (moveData) {
            setShowHint({ from: moveData.from, to: moveData.to })
          }
        }
      }
    } else {
      console.log("✗ Illegal move!")
    }
  }

  const makeOpponentMove = () => {
    if (!practiceSession || practiceSession.completed) return

    const currentVariation = practiceSession.variations[practiceSession.currentVariationIndex]
    if (practiceSession.currentMoveIndex >= currentVariation.moves.length) {
      // Variation complete, move to next or finish
      if (practiceSession.currentVariationIndex + 1 < practiceSession.variations.length) {
        const nextVariationIndex = practiceSession.currentVariationIndex + 1
        const nextVariation = practiceSession.variations[nextVariationIndex]
        const userPlaysBlack = isDefenseOpening(nextVariation.name)

        setPracticeSession((prev) => ({
          ...prev!,
          currentVariationIndex: nextVariationIndex,
          currentMoveIndex: 0,
          userPlaysBlack,
        }))

        const newGame = new ChessGame()
        setGame(newGame)
        setGameHistory([])

        if (userPlaysBlack && nextVariation.moves.length > 0) {
          setTimeout(() => {
            makeComputerMove(newGame, nextVariation.moves[0])
          }, 500)
        }
      } else {
        setPracticeSession((prev) => ({ ...prev!, completed: true }))
      }
      return
    }

    const opponentMove = currentVariation.moves[practiceSession.currentMoveIndex]
    makeComputerMove(game, opponentMove)
  }

  const startPractice = (selectedVariations: Variation[]) => {
    console.log("=== Starting Practice ===")
    console.log(
      "Selected variations:",
      selectedVariations.map((v) => v.name),
    )

    const shuffledVariations = [...selectedVariations].sort(() => Math.random() - 0.5)
    const firstVariation = shuffledVariations[0]
    const userPlaysBlack = isDefenseOpening(firstVariation.name)

    console.log(`First variation: ${firstVariation.name}`)
    console.log(`User plays black: ${userPlaysBlack}`)
    console.log(`Moves:`, firstVariation.moves)

    setPracticeSession({
      variations: shuffledVariations,
      currentVariationIndex: 0,
      currentMoveIndex: 0,
      attempts: 0,
      accuracy: { correct: 0, total: 0 },
      completed: false,
      userPlaysBlack,
    })

    const newGame = new ChessGame()
    setGame(newGame)
    setGameHistory([])
    setShowHint(null)

    // For defense openings, computer plays White's first move
    if (userPlaysBlack && firstVariation.moves.length > 0) {
      console.log("Making computer's first move:", firstVariation.moves[0])
      setTimeout(() => {
        makeComputerMove(newGame, firstVariation.moves[0])
      }, 1000)
    }
  }

  const isDefenseOpening = (variationName: string): boolean => {
    const defenseKeywords = [
      "defense",
      "defence",
      "declined",
      "counter",
      "sicilian",
      "french",
      "caro-kann",
      "alekhine",
      "pirc",
      "modern",
      "scandinavian",
      "nimzo",
    ]
    const lowerName = variationName.toLowerCase()
    return defenseKeywords.some((keyword) => lowerName.includes(keyword))
  }

  const makeComputerMove = (currentGame: ChessGame, moveNotation: string) => {
    console.log("=== Computer Move ===")
    console.log("Move notation:", moveNotation)
    console.log("Current player:", currentGame.currentPlayer)

    const moveData = currentGame.parseAlgebraicNotation(moveNotation)
    console.log("Parsed move data:", moveData)

    if (moveData) {
      const newGame = currentGame.clone()
      const success = newGame.makeMove(moveData.from, moveData.to)
      console.log("Computer move success:", success)

      if (success) {
        setGame(newGame)
        const actualMove = newGame.getLastMoveNotation()
        console.log("Computer move executed:", actualMove)
        setGameHistory((prev) => [...prev, actualMove])

        setPracticeSession((prev) => (prev ? { ...prev, currentMoveIndex: prev.currentMoveIndex + 1 } : null))
      }
    }
  }

  const stopPractice = () => {
    setPracticeSession(null)
    setShowHint(null)
    setGame(new ChessGame())
    setGameHistory([])
  }

  const saveOpening = (openingName: string, variationName: string, moves: string[]) => {
    const existingOpeningIndex = openings.findIndex((o) => o.name === openingName)

    if (existingOpeningIndex >= 0) {
      const updatedOpenings = [...openings]
      updatedOpenings[existingOpeningIndex].variations.push({
        id: Date.now().toString(),
        name: variationName,
        moves,
      })
      setOpenings(updatedOpenings)
      localStorage.setItem("chess-openings", JSON.stringify(updatedOpenings))
    } else {
      const newOpening: Opening = {
        id: Date.now().toString(),
        name: openingName,
        variations: [
          {
            id: Date.now().toString(),
            name: variationName,
            moves,
          },
        ],
      }
      const updatedOpenings = [...openings, newOpening]
      setOpenings(updatedOpenings)
      localStorage.setItem("chess-openings", JSON.stringify(updatedOpenings))
    }
  }

  const deleteVariation = (openingId: string, variationId: string) => {
    const updatedOpenings = openings
      .map((opening) => {
        if (opening.id === openingId) {
          return {
            ...opening,
            variations: opening.variations.filter((v) => v.id !== variationId),
          }
        }
        return opening
      })
      .filter((opening) => opening.variations.length > 0)

    setOpenings(updatedOpenings)
    localStorage.setItem("chess-openings", JSON.stringify(updatedOpenings))
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <h1 className="text-3xl font-bold text-center mb-6">Chess Opening Trainer</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Chess Board</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setFlipped(!flipped)}>
                    Flip Board
                  </Button>
                  {practiceSession && (
                    <Button variant="destructive" onClick={stopPractice}>
                      Stop Practice
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ChessBoard
                game={game}
                flipped={flipped}
                onMove={handleMove}
                hint={showHint}
                practiceMode={!!practiceSession}
              />

              {practiceSession && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold">
                      Practicing: {practiceSession.variations[practiceSession.currentVariationIndex]?.name}
                    </h3>
                    <div className="text-sm text-muted-foreground">
                      Variation {practiceSession.currentVariationIndex + 1} of {practiceSession.variations.length}
                    </div>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Playing as: {practiceSession.userPlaysBlack ? "Black" : "White"}</span>
                    <span>Attempts: {practiceSession.attempts}</span>
                  </div>
                  <div className="text-sm mb-2">
                    Expected move:{" "}
                    {practiceSession.variations[practiceSession.currentVariationIndex]?.moves[
                      practiceSession.currentMoveIndex
                    ] || "N/A"}
                  </div>
                  <div className="text-sm">
                    Accuracy:{" "}
                    {practiceSession.accuracy.total > 0
                      ? Math.round((practiceSession.accuracy.correct / practiceSession.accuracy.total) * 100)
                      : 0}
                    %
                  </div>
                  {practiceSession.completed && (
                    <div className="mt-2 p-2 bg-green-100 text-green-800 rounded text-center">
                      Practice Complete! Final Accuracy:{" "}
                      {Math.round((practiceSession.accuracy.correct / practiceSession.accuracy.total) * 100)}%
                    </div>
                  )}
                </div>
              )}

              {gameHistory.length > 0 && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">Game History</h4>
                  <div className="text-sm font-mono">
                    {gameHistory.map((move, index) => (
                      <span key={index} className="mr-2">
                        {Math.floor(index / 2) + 1}
                        {index % 2 === 0 ? "." : "..."} {move}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Tabs defaultValue="import" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="import">Import</TabsTrigger>
              <TabsTrigger value="practice">Practice</TabsTrigger>
            </TabsList>

            <TabsContent value="import">
              <NotationImporter onSave={saveOpening} />
            </TabsContent>

            <TabsContent value="practice">
              <PracticeControls
                openings={openings}
                onStartPractice={startPractice}
                onDeleteVariation={deleteVariation}
                practiceMode={!!practiceSession}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
