"use client"

import { useEffect, useMemo, useState } from "react"
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
  openingName?: string
}

export type TrainingColor = "auto" | "w" | "b"

export interface PracticeOptions {
  masteryTarget: number
  trainingColor: TrainingColor
}

interface VariationProgress {
  successCount: number
  failureCount: number
}

export interface PracticeSession {
  variations: Variation[]
  progress: Record<string, VariationProgress>
  currentVariationIndex: number
  currentMoveIndex: number
  attemptsOnCurrentMove: number
  accuracy: { correct: number; total: number }
  completed: boolean
  masteryTarget: number
  trainingColor: TrainingColor
  userColor: "w" | "b"
  statusMessage: string
}

interface MoveHintDetails {
  openingName: string
  variationName: string
  notation: string
  from: string
  to: string
  moveLabel: string
  sideLabel: "White" | "Black"
}

const DEFENSE_KEYWORDS = [
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

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const shuffleArray = <T,>(values: T[]): T[] => {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }
  return shuffled
}

const cloneProgress = (progress: Record<string, VariationProgress>): Record<string, VariationProgress> => {
  const nextProgress: Record<string, VariationProgress> = {}

  Object.entries(progress).forEach(([variationId, variationProgress]) => {
    nextProgress[variationId] = { ...variationProgress }
  })

  return nextProgress
}

const resolveUserColor = (variation: Variation, trainingColor: TrainingColor): "w" | "b" => {
  if (trainingColor === "w" || trainingColor === "b") {
    return trainingColor
  }

  const searchableName = `${variation.openingName || ""} ${variation.name}`.toLowerCase()
  return DEFENSE_KEYWORDS.some((keyword) => searchableName.includes(keyword)) ? "b" : "w"
}

const formatPlyLabel = (plyIndex: number, notation: string): { moveLabel: string; sideLabel: "White" | "Black" } => {
  const moveNumber = Math.ceil((plyIndex + 1) / 2)
  const isBlackMove = (plyIndex + 1) % 2 === 0

  return {
    moveLabel: `${isBlackMove ? `${moveNumber}...` : `${moveNumber}.`}${notation}`,
    sideLabel: isBlackMove ? "Black" : "White",
  }
}

const IDLE_HINT_DELAY_MS = 12000

export default function ChessTrainer() {
  const [game, setGame] = useState(() => new ChessGame())
  const [flipped, setFlipped] = useState(false)
  const [openings, setOpenings] = useState<Opening[]>([])
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null)
  const [showHint, setShowHint] = useState<{ from: string; to: string } | null>(null)
  const [hintMessage, setHintMessage] = useState<string | null>(null)
  const [gameHistory, setGameHistory] = useState<string[]>([])

  useEffect(() => {
    const savedOpenings = localStorage.getItem("chess-openings")
    if (!savedOpenings) return

    try {
      const parsedOpenings = JSON.parse(savedOpenings) as Opening[]

      const normalizedOpenings = parsedOpenings
        .map((opening) => ({
          id: opening.id || createId(),
          name: opening.name,
          variations: (opening.variations || []).map((variation) => ({
            id: variation.id || createId(),
            name: variation.name,
            moves: variation.moves || [],
            openingName: variation.openingName || opening.name,
          })),
        }))
        .filter((opening) => opening.variations.length > 0)

      setOpenings(normalizedOpenings)
    } catch {
      setOpenings([])
    }
  }, [])

  const pickNextVariationIndex = (session: PracticeSession, excludeIndex?: number): number | null => {
    const unmastered = session.variations
      .map((variation, index) => ({
        index,
        mastered: (session.progress[variation.id]?.successCount || 0) >= session.masteryTarget,
      }))
      .filter((item) => !item.mastered)

    if (unmastered.length === 0) {
      return null
    }

    const pool = excludeIndex !== undefined && unmastered.length > 1
      ? unmastered.filter((variation) => variation.index !== excludeIndex)
      : unmastered

    const fallbackPool = pool.length > 0 ? pool : unmastered
    const selection = fallbackPool[Math.floor(Math.random() * fallbackPool.length)]

    return selection.index
  }

  const advanceWithAutoplay = (startingGame: ChessGame, startingHistory: string[], startingSession: PracticeSession) => {
    let workingGame = startingGame.clone()
    let workingHistory = [...startingHistory]

    const workingSession: PracticeSession = {
      ...startingSession,
      progress: cloneProgress(startingSession.progress),
    }

    let safetyCounter = 0

    while (!workingSession.completed && safetyCounter < 256) {
      safetyCounter += 1

      const currentVariation = workingSession.variations[workingSession.currentVariationIndex]
      if (!currentVariation) {
        workingSession.completed = true
        workingSession.statusMessage = "Practice stopped due to missing variation data."
        break
      }

      const expectedMove = currentVariation.moves[workingSession.currentMoveIndex]

      if (!expectedMove) {
        const progressForVariation = workingSession.progress[currentVariation.id]
        if (progressForVariation) {
          progressForVariation.successCount += 1
        }

        const nextVariationIndex = pickNextVariationIndex(workingSession, workingSession.currentVariationIndex)

        if (nextVariationIndex === null) {
          workingSession.completed = true
          workingSession.statusMessage = "All selected variations are mastered."
          break
        }

        const nextVariation = workingSession.variations[nextVariationIndex]
        workingSession.currentVariationIndex = nextVariationIndex
        workingSession.currentMoveIndex = 0
        workingSession.attemptsOnCurrentMove = 0
        workingSession.userColor = resolveUserColor(nextVariation, workingSession.trainingColor)
        workingSession.statusMessage = `Completed ${currentVariation.name}. Switching to ${nextVariation.name}.`

        workingGame = new ChessGame()
        workingHistory = []
        continue
      }

      if (workingGame.currentPlayer === workingSession.userColor) {
        break
      }

      const moveData = workingGame.parseAlgebraicNotation(expectedMove)
      if (!moveData || !workingGame.makeMove(moveData.from, moveData.to)) {
        workingSession.completed = true
        workingSession.statusMessage = `Unable to auto-play move \"${expectedMove}\" in ${currentVariation.name}.`
        break
      }

      workingHistory.push(workingGame.getLastMoveNotation())
      workingSession.currentMoveIndex += 1
    }

    if (safetyCounter >= 256) {
      workingSession.completed = true
      workingSession.statusMessage = "Practice stopped due to an internal safety limit."
    }

    setGame(workingGame)
    setGameHistory(workingHistory)
    setPracticeSession(workingSession)
  }

  const handlePracticeMove = (from: string, to: string) => {
    if (!practiceSession || practiceSession.completed) {
      return
    }

    const currentVariation = practiceSession.variations[practiceSession.currentVariationIndex]
    if (!currentVariation) {
      return
    }

    const expectedNotation = currentVariation.moves[practiceSession.currentMoveIndex]
    if (!expectedNotation) {
      advanceWithAutoplay(game, gameHistory, practiceSession)
      return
    }

    const expectedMove = game.parseAlgebraicNotation(expectedNotation)

    if (!expectedMove) {
      setPracticeSession({
        ...practiceSession,
        completed: true,
        statusMessage: `Could not parse expected move \"${expectedNotation}\" in ${currentVariation.name}.`,
      })
      setHintMessage(null)
      return
    }

    if (from !== expectedMove.from || to !== expectedMove.to) {
      const nextProgress = cloneProgress(practiceSession.progress)
      const currentProgress = nextProgress[currentVariation.id] || {
        successCount: 0,
        failureCount: 0,
      }

      nextProgress[currentVariation.id] = {
        ...currentProgress,
        failureCount: currentProgress.failureCount + 1,
      }

      const resetSession: PracticeSession = {
        ...practiceSession,
        progress: nextProgress,
        currentMoveIndex: 0,
        attemptsOnCurrentMove: practiceSession.attemptsOnCurrentMove + 1,
        accuracy: {
          correct: practiceSession.accuracy.correct,
          total: practiceSession.accuracy.total + 1,
        },
        userColor: resolveUserColor(currentVariation, practiceSession.trainingColor),
        statusMessage: `Incorrect move. Restarted ${currentVariation.name}.`,
      }

      const nextAttemptCount = practiceSession.attemptsOnCurrentMove + 1
      if (nextAttemptCount >= 3) {
        setShowHint({ from: expectedMove.from, to: expectedMove.to })
        setHintMessage(
          `Hint unlocked after 3 mistakes: play ${expectedNotation} (${expectedMove.from} to ${expectedMove.to}).`,
        )
      } else {
        setShowHint(null)
        setHintMessage(`Incorrect move (${nextAttemptCount}/3). Hint arrow will appear after 3 mistakes.`)
      }

      advanceWithAutoplay(new ChessGame(), [], resetSession)
      return
    }

    const nextGame = game.clone()
    if (!nextGame.makeMove(from, to)) {
      return
    }

    const updatedSession: PracticeSession = {
      ...practiceSession,
      currentMoveIndex: practiceSession.currentMoveIndex + 1,
      attemptsOnCurrentMove: 0,
      accuracy: {
        correct: practiceSession.accuracy.correct + 1,
        total: practiceSession.accuracy.total + 1,
      },
      statusMessage: `Correct move: ${expectedNotation}`,
    }

    setShowHint(null)
    setHintMessage(null)
    advanceWithAutoplay(nextGame, [...gameHistory, nextGame.getLastMoveNotation()], updatedSession)
  }

  const handleMove = (from: string, to: string) => {
    if (practiceSession) {
      handlePracticeMove(from, to)
      return
    }

    const nextGame = game.clone()
    if (!nextGame.makeMove(from, to)) {
      return
    }

    setGame(nextGame)
    setGameHistory((previous) => [...previous, nextGame.getLastMoveNotation()])
  }

  const startPractice = (selectedVariations: Variation[], options: PracticeOptions) => {
    if (selectedVariations.length === 0) {
      return
    }

    const variations = shuffleArray(selectedVariations).map((variation) => ({
      ...variation,
      openingName: variation.openingName || "Imported Opening",
    }))

    const progress: Record<string, VariationProgress> = {}
    variations.forEach((variation) => {
      progress[variation.id] = {
        successCount: 0,
        failureCount: 0,
      }
    })

    const normalizedMasteryTarget = Math.max(1, options.masteryTarget || 1)
    const firstVariation = variations[0]

    const initialSession: PracticeSession = {
      variations,
      progress,
      currentVariationIndex: 0,
      currentMoveIndex: 0,
      attemptsOnCurrentMove: 0,
      accuracy: { correct: 0, total: 0 },
      completed: false,
      masteryTarget: normalizedMasteryTarget,
      trainingColor: options.trainingColor,
      userColor: resolveUserColor(firstVariation, options.trainingColor),
      statusMessage: "Starting training.",
    }

    setShowHint(null)
    setHintMessage("Starting training.")
    advanceWithAutoplay(new ChessGame(), [], initialSession)
  }

  const stopPractice = () => {
    setPracticeSession(null)
    setShowHint(null)
    setHintMessage(null)
    setGame(new ChessGame())
    setGameHistory([])
  }

  const saveOpening = (openingName: string, variationName: string, moves: string[]) => {
    const normalizedOpeningName = openingName.trim()
    const normalizedVariationName = variationName.trim()
    const normalizedMoves = moves.map((move) => move.trim()).filter((move) => move.length > 0)

    if (!normalizedOpeningName || !normalizedVariationName || normalizedMoves.length === 0) {
      return
    }

    const newVariation: Variation = {
      id: createId(),
      name: normalizedVariationName,
      moves: normalizedMoves,
      openingName: normalizedOpeningName,
    }

    setOpenings((previous) => {
      const existingOpeningIndex = previous.findIndex(
        (opening) => opening.name.toLowerCase() === normalizedOpeningName.toLowerCase(),
      )

      let nextOpenings: Opening[]

      if (existingOpeningIndex >= 0) {
        nextOpenings = previous.map((opening, index) => {
          if (index !== existingOpeningIndex) return opening

          return {
            ...opening,
            name: normalizedOpeningName,
            variations: [...opening.variations, newVariation],
          }
        })
      } else {
        nextOpenings = [
          ...previous,
          {
            id: createId(),
            name: normalizedOpeningName,
            variations: [newVariation],
          },
        ]
      }

      localStorage.setItem("chess-openings", JSON.stringify(nextOpenings))
      return nextOpenings
    })
  }

  const deleteVariation = (openingId: string, variationId: string) => {
    setOpenings((previous) => {
      const nextOpenings = previous
        .map((opening) => {
          if (opening.id !== openingId) {
            return opening
          }

          return {
            ...opening,
            variations: opening.variations.filter((variation) => variation.id !== variationId),
          }
        })
        .filter((opening) => opening.variations.length > 0)

      localStorage.setItem("chess-openings", JSON.stringify(nextOpenings))
      return nextOpenings
    })
  }

  const masteredCount = useMemo(() => {
    if (!practiceSession) return 0

    return practiceSession.variations.filter(
      (variation) => (practiceSession.progress[variation.id]?.successCount || 0) >= practiceSession.masteryTarget,
    ).length
  }, [practiceSession])

  const activeVariation = practiceSession ? practiceSession.variations[practiceSession.currentVariationIndex] : null
  const currentHintDetails = useMemo<MoveHintDetails | null>(() => {
    if (!practiceSession || practiceSession.completed || !activeVariation) {
      return null
    }

    const expectedNotation = activeVariation.moves[practiceSession.currentMoveIndex]
    if (!expectedNotation) {
      return null
    }

    const parsedMove = game.parseAlgebraicNotation(expectedNotation)
    if (!parsedMove) {
      return null
    }

    const { moveLabel, sideLabel } = formatPlyLabel(practiceSession.currentMoveIndex, expectedNotation)

    return {
      openingName: activeVariation.openingName || "Opening",
      variationName: activeVariation.name,
      notation: expectedNotation,
      from: parsedMove.from,
      to: parsedMove.to,
      moveLabel,
      sideLabel,
    }
  }, [activeVariation, game, practiceSession])

  useEffect(() => {
    if (!practiceSession || practiceSession.completed || !currentHintDetails) {
      return
    }

    const idleTimer = window.setTimeout(() => {
      setShowHint({ from: currentHintDetails.from, to: currentHintDetails.to })
      setHintMessage(
        `Hint due to inactivity: ${currentHintDetails.sideLabel} response ${currentHintDetails.moveLabel} (${currentHintDetails.from} to ${currentHintDetails.to}).`,
      )
    }, IDLE_HINT_DELAY_MS)

    return () => {
      window.clearTimeout(idleTimer)
    }
  }, [
    currentHintDetails,
    practiceSession?.completed,
    practiceSession?.currentMoveIndex,
    practiceSession?.currentVariationIndex,
    practiceSession?.attemptsOnCurrentMove,
  ])

  const revealHintForCurrentMove = () => {
    if (!currentHintDetails) {
      return
    }

    setShowHint({ from: currentHintDetails.from, to: currentHintDetails.to })
    setHintMessage(
      `${currentHintDetails.sideLabel} response ${currentHintDetails.moveLabel}: move ${currentHintDetails.from} to ${currentHintDetails.to}.`,
    )
  }

  const trainingTitle = activeVariation
    ? `${activeVariation.openingName || "Opening"} ${practiceSession?.userColor === "b" ? "Black" : "White"}`
    : "Chess Opening Trainer"
  const boardFlipped = practiceSession ? practiceSession.userColor === "b" : flipped

  return (
    <div className="container mx-auto max-w-6xl p-4">
      <h1 className="mb-6 text-center text-4xl font-bold tracking-tight">{trainingTitle}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Chess Board</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setFlipped((previous) => !previous)}
                    disabled={!!practiceSession}
                  >
                    {practiceSession ? "Auto Orientation" : "Flip Board"}
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
                flipped={boardFlipped}
                onMove={handleMove}
                hint={showHint}
                practiceMode={!!practiceSession}
              />

              {gameHistory.length > 0 && (
                <div className="mt-4 rounded-lg bg-muted p-3">
                  <h4 className="mb-2 font-semibold">Game History</h4>
                  <div className="text-sm font-mono">
                    {gameHistory.map((move, index) => (
                      <span key={`${move}-${index}`} className="mr-2">
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
          {practiceSession && activeVariation && (
            <Card className="border-sky-300 bg-sky-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-2xl">{trainingTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded border border-sky-300 bg-sky-100 p-3 text-sky-900">
                  <p className="text-lg font-medium">☐ {practiceSession.statusMessage}</p>
                </div>

                <div className="rounded border border-sky-300 bg-sky-100 p-3 text-sky-900">
                  <p className="text-base">
                    Hint arrows appear after 3 mistakes or 12 seconds of inactivity. Use the button below to reveal
                    the current move immediately if needed.
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-sky-400 text-sky-700"
                  onClick={revealHintForCurrentMove}
                  disabled={!currentHintDetails}
                >
                  Show hints for this move
                </Button>

                {currentHintDetails && (
                  <div className="space-y-1 rounded border bg-background p-3 text-sm">
                    <p className="font-semibold">
                      {currentHintDetails.sideLabel} response {currentHintDetails.moveLabel}:
                    </p>
                    <p className="text-muted-foreground">
                      {hintMessage ||
                        `${currentHintDetails.openingName} • ${currentHintDetails.variationName} expects ${currentHintDetails.notation}.`}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span>Playing as: {practiceSession.userColor === "w" ? "White" : "Black"}</span>
                  <span>Mastered: {masteredCount}/{practiceSession.variations.length}</span>
                  <span>Mistakes this line: {practiceSession.attemptsOnCurrentMove}</span>
                  <span>
                    Accuracy:{" "}
                    {practiceSession.accuracy.total > 0
                      ? Math.round((practiceSession.accuracy.correct / practiceSession.accuracy.total) * 100)
                      : 0}
                    %
                  </span>
                </div>

                <div className="space-y-1 rounded border bg-background p-3">
                  {practiceSession.variations.map((variation) => {
                    const progress = practiceSession.progress[variation.id] || { successCount: 0, failureCount: 0 }
                    const mastered = progress.successCount >= practiceSession.masteryTarget

                    return (
                      <div key={variation.id} className="flex items-center justify-between text-sm">
                        <span className={mastered ? "font-medium text-green-700" : ""}>{variation.name}</span>
                        <span className="text-muted-foreground">
                          {progress.successCount}/{practiceSession.masteryTarget} • {progress.failureCount} failed
                        </span>
                      </div>
                    )
                  })}
                </div>

                {practiceSession.completed && (
                  <div className="rounded bg-green-100 p-2 text-center text-green-800">
                    Drill complete. All selected variations reached mastery.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
