"use client"

import { useEffect, useId, useRef, useState } from "react"
import type { ChessGame, ChessPiece } from "@/lib/chess-engine"
import { cn } from "@/lib/utils"

interface ChessBoardProps {
  game: ChessGame
  flipped: boolean
  onMove: (from: string, to: string) => void
  hint?: { from: string; to: string } | null
  practiceMode?: boolean
}

interface MoveAnimation {
  key: string
  fromSquare: string
  toSquare: string
  piece: ChessPiece
  fromX: number
  fromY: number
  toX: number
  toY: number
  squareSize: number
  phase: "start" | "moving"
}

interface HintArrow {
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  height: number
}

const pieceSymbols: Record<string, string> = {
  wK: "♔",
  wQ: "♕",
  wR: "♖",
  wB: "♗",
  wN: "♘",
  wP: "♙",
  bK: "♚",
  bQ: "♛",
  bR: "♜",
  bB: "♝",
  bN: "♞",
  bP: "♟",
}

export default function ChessBoard({ game, flipped, onMove, hint, practiceMode }: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [validMoves, setValidMoves] = useState<string[]>([])
  const [boardPosition, setBoardPosition] = useState<Record<string, string>>({})
  const [moveAnimation, setMoveAnimation] = useState<MoveAnimation | null>(null)
  const [hintArrow, setHintArrow] = useState<HintArrow | null>(null)

  const boardRef = useRef<HTMLDivElement | null>(null)
  const squareRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const lastAnimatedMoveKeyRef = useRef<string>("")
  const animationTimeoutRef = useRef<number | null>(null)

  const arrowMarkerId = `hint-arrow-${useId().replace(/:/g, "-")}`

  useEffect(() => {
    const newPosition: Record<string, string> = {}
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"]
    const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"]

    for (const file of files) {
      for (const rank of ranks) {
        const square = file + rank
        const piece = game.getPiece(square)
        if (piece) {
          newPosition[square] = piece
        }
      }
    }

    setBoardPosition(newPosition)

    const lastMove = game.getLastMove()
    const moveCount = game.getMoveCount()
    if (!lastMove || moveCount === 0) {
      return
    }

    const moveKey = `${moveCount}:${lastMove.from}-${lastMove.to}-${lastMove.piece}`
    if (lastAnimatedMoveKeyRef.current === moveKey) {
      return
    }

    const boardElement = boardRef.current
    const fromSquareElement = squareRefs.current[lastMove.from]
    const toSquareElement = squareRefs.current[lastMove.to]

    if (!boardElement || !fromSquareElement || !toSquareElement) {
      lastAnimatedMoveKeyRef.current = moveKey
      return
    }

    const boardRect = boardElement.getBoundingClientRect()
    const fromRect = fromSquareElement.getBoundingClientRect()
    const toRect = toSquareElement.getBoundingClientRect()

    setMoveAnimation({
      key: moveKey,
      fromSquare: lastMove.from,
      toSquare: lastMove.to,
      piece: lastMove.piece,
      fromX: fromRect.left - boardRect.left,
      fromY: fromRect.top - boardRect.top,
      toX: toRect.left - boardRect.left,
      toY: toRect.top - boardRect.top,
      squareSize: fromRect.width,
      phase: "start",
    })

    lastAnimatedMoveKeyRef.current = moveKey

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMoveAnimation((previous) => (previous && previous.key === moveKey ? { ...previous, phase: "moving" } : previous))
      })
    })

    if (animationTimeoutRef.current) {
      window.clearTimeout(animationTimeoutRef.current)
    }

    animationTimeoutRef.current = window.setTimeout(() => {
      setMoveAnimation((previous) => (previous && previous.key === moveKey ? null : previous))
    }, 260)
  }, [game])

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const updateHintArrow = () => {
      if (!hint?.from || !hint?.to) {
        setHintArrow(null)
        return
      }

      const boardElement = boardRef.current
      const fromSquareElement = squareRefs.current[hint.from]
      const toSquareElement = squareRefs.current[hint.to]

      if (!boardElement || !fromSquareElement || !toSquareElement) {
        setHintArrow(null)
        return
      }

      const boardRect = boardElement.getBoundingClientRect()
      const fromRect = fromSquareElement.getBoundingClientRect()
      const toRect = toSquareElement.getBoundingClientRect()

      setHintArrow({
        x1: fromRect.left - boardRect.left + fromRect.width / 2,
        y1: fromRect.top - boardRect.top + fromRect.height / 2,
        x2: toRect.left - boardRect.left + toRect.width / 2,
        y2: toRect.top - boardRect.top + toRect.height / 2,
        width: boardRect.width,
        height: boardRect.height,
      })
    }

    updateHintArrow()
    window.addEventListener("resize", updateHintArrow)

    return () => {
      window.removeEventListener("resize", updateHintArrow)
    }
  }, [boardPosition, flipped, hint?.from, hint?.to])

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"]
  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"]

  const boardFiles = flipped ? [...files].reverse() : files
  const boardRanks = flipped ? [...ranks].reverse() : ranks

  const handleSquareClick = (square: string) => {
    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null)
        setValidMoves([])
        return
      }

      if (validMoves.includes(square)) {
        onMove(selectedSquare, square)
        setSelectedSquare(null)
        setValidMoves([])
        return
      }

      const piece = game.getPiece(square)
      if (piece && piece[0] === game.currentPlayer) {
        setSelectedSquare(square)
        setValidMoves(game.getValidMoves(square))
      } else {
        setSelectedSquare(null)
        setValidMoves([])
      }
      return
    }

    const piece = game.getPiece(square)
    if (piece && piece[0] === game.currentPlayer) {
      setSelectedSquare(square)
      setValidMoves(game.getValidMoves(square))
    }
  }

  const isLightSquare = (file: string, rank: string) => {
    const fileIndex = files.indexOf(file)
    const rankIndex = Number.parseInt(rank, 10)
    return (fileIndex + rankIndex) % 2 === 1
  }

  const getSquareColor = (square: string) => {
    const [file, rank] = square.split("")
    const isLight = isLightSquare(file, rank)

    if (selectedSquare === square) {
      return isLight ? "bg-yellow-300 border-2 border-yellow-600" : "bg-yellow-600 border-2 border-yellow-300"
    }

    if (validMoves.includes(square)) {
      return isLight ? "bg-green-200 border-2 border-green-500" : "bg-green-400 border-2 border-green-600"
    }

    if (hint?.from === square) {
      return isLight ? "bg-blue-200 border-2 border-blue-500" : "bg-blue-400 border-2 border-blue-600"
    }

    if (hint?.to === square) {
      return isLight ? "bg-red-200 border-2 border-red-500" : "bg-red-400 border-2 border-red-600"
    }

    return isLight ? "bg-amber-100" : "bg-amber-800"
  }

  return (
    <div className="relative w-fit mx-auto">
      <div ref={boardRef} className="relative grid grid-cols-8 gap-0 border-4 border-gray-900 w-fit">
        {boardRanks.map((rank) =>
          boardFiles.map((file) => {
            const square = file + rank
            const piece = boardPosition[square]
            const hideDestinationPieceDuringAnimation =
              !!moveAnimation && moveAnimation.toSquare === square && moveAnimation.piece === piece

            return (
              <div
                key={square}
                ref={(element) => {
                  squareRefs.current[square] = element
                }}
                className={cn(
                  "w-20 h-20 flex items-center justify-center relative text-5xl select-none cursor-pointer transition-colors duration-200",
                  getSquareColor(square),
                  "hover:opacity-90",
                )}
                onClick={() => handleSquareClick(square)}
              >
                {piece && !hideDestinationPieceDuringAnimation && <span className="drop-shadow-lg">{pieceSymbols[piece]}</span>}

                {rank === (flipped ? "8" : "1") && (
                  <div className="absolute bottom-1 right-1 text-xs font-bold opacity-70 text-gray-700">{file}</div>
                )}
                {file === (flipped ? "h" : "a") && (
                  <div className="absolute top-1 left-1 text-xs font-bold opacity-70 text-gray-700">{rank}</div>
                )}

                {validMoves.includes(square) && !piece && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 bg-gray-700 rounded-full opacity-70" />
                  </div>
                )}

                {validMoves.includes(square) && piece && (
                  <div className="absolute inset-0 border-4 border-red-500 rounded-lg opacity-80" />
                )}

                {selectedSquare === square && <div className="absolute inset-0 border-4 border-yellow-500 rounded-lg animate-pulse" />}
              </div>
            )
          }),
        )}

        {hintArrow && (
          <svg
            className="pointer-events-none absolute inset-0 z-20"
            viewBox={`0 0 ${hintArrow.width} ${hintArrow.height}`}
            preserveAspectRatio="none"
          >
            <defs>
              <marker id={arrowMarkerId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#1d4ed8" />
              </marker>
            </defs>
            <line
              x1={hintArrow.x1}
              y1={hintArrow.y1}
              x2={hintArrow.x2}
              y2={hintArrow.y2}
              stroke="#2563eb"
              strokeWidth="8"
              strokeLinecap="round"
              strokeOpacity="0.9"
              markerEnd={`url(#${arrowMarkerId})`}
            />
          </svg>
        )}

        {moveAnimation && moveAnimation.piece && (
          <div
            className="pointer-events-none absolute left-0 top-0 z-30 flex items-center justify-center transition-transform duration-200 ease-out"
            style={{
              width: `${moveAnimation.squareSize}px`,
              height: `${moveAnimation.squareSize}px`,
              transform: `translate(${moveAnimation.phase === "start" ? moveAnimation.fromX : moveAnimation.toX}px, ${
                moveAnimation.phase === "start" ? moveAnimation.fromY : moveAnimation.toY
              }px)`,
              fontSize: `${Math.max(42, moveAnimation.squareSize * 0.72)}px`,
            }}
          >
            <span className="drop-shadow-lg">{pieceSymbols[moveAnimation.piece]}</span>
          </div>
        )}
      </div>

      <div className="mt-6 text-center space-y-2">
        <div className="text-xl font-bold">{game.currentPlayer === "w" ? "White" : "Black"} to move</div>

        {selectedSquare && (
          <div className="text-sm text-blue-600">
            Selected: {selectedSquare} | Valid moves: {validMoves.length}
          </div>
        )}

        {practiceMode && hint && (
          <div className="text-sm text-red-600 font-medium">
            {hint.to ? `Move ${hint.from} to ${hint.to}` : `Move piece on ${hint.from}`}
          </div>
        )}
      </div>
    </div>
  )
}
