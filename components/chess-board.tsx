"use client"

import { useState, useEffect } from "react"
import type { ChessGame } from "@/lib/chess-engine"
import { cn } from "@/lib/utils"

interface ChessBoardProps {
  game: ChessGame
  flipped: boolean
  onMove: (from: string, to: string) => void
  hint?: { from: string; to: string } | null
  practiceMode?: boolean
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

  // Update board position when game changes
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
    console.log("Board position updated:", newPosition)
  }, [game])

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"]
  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"]

  const boardFiles = flipped ? [...files].reverse() : files
  const boardRanks = flipped ? [...ranks].reverse() : ranks

  const handleSquareClick = (square: string) => {
    console.log(`=== Square clicked: ${square} ===`)
    console.log(`Current player: ${game.currentPlayer}`)
    console.log(`Selected square: ${selectedSquare}`)
    console.log(`Piece at ${square}:`, game.getPiece(square))
    console.log(`Valid moves:`, validMoves)

    if (selectedSquare) {
      if (selectedSquare === square) {
        // Clicking the same square - deselect
        console.log("Deselecting square")
        setSelectedSquare(null)
        setValidMoves([])
      } else if (validMoves.includes(square)) {
        // Valid move - execute it
        console.log(`Executing move: ${selectedSquare} -> ${square}`)
        onMove(selectedSquare, square)
        setSelectedSquare(null)
        setValidMoves([])
      } else {
        // Try to select a new piece
        const piece = game.getPiece(square)
        if (piece && piece[0] === game.currentPlayer) {
          console.log(`Selecting new piece at ${square}`)
          setSelectedSquare(square)
          const moves = game.getValidMoves(square)
          console.log(`Valid moves from ${square}:`, moves)
          setValidMoves(moves)
        } else {
          console.log("Invalid selection - clearing selection")
          setSelectedSquare(null)
          setValidMoves([])
        }
      }
    } else {
      // No square selected - try to select this one
      const piece = game.getPiece(square)
      console.log(`Trying to select piece:`, piece)

      if (piece && piece[0] === game.currentPlayer) {
        console.log(`Selecting ${square}`)
        setSelectedSquare(square)
        const moves = game.getValidMoves(square)
        console.log(`Valid moves from ${square}:`, moves)
        setValidMoves(moves)
      } else {
        console.log("Cannot select this square")
      }
    }
    console.log("=== End square click ===")
  }

  const isLightSquare = (file: string, rank: string) => {
    const fileIndex = files.indexOf(file)
    const rankIndex = Number.parseInt(rank)
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
    <div className="relative">
      <div className="grid grid-cols-8 gap-0 border-4 border-gray-900 w-fit mx-auto">
        {boardRanks.map((rank) =>
          boardFiles.map((file) => {
            const square = file + rank
            const piece = boardPosition[square]

            return (
              <div
                key={square}
                className={cn(
                  "w-20 h-20 flex items-center justify-center relative text-5xl select-none cursor-pointer transition-all duration-200",
                  getSquareColor(square),
                  "hover:opacity-90",
                )}
                onClick={() => handleSquareClick(square)}
              >
                {piece && <span className="drop-shadow-lg">{pieceSymbols[piece]}</span>}

                {/* Square labels */}
                {rank === (flipped ? "8" : "1") && (
                  <div className="absolute bottom-1 right-1 text-xs font-bold opacity-70 text-gray-700">{file}</div>
                )}
                {file === (flipped ? "h" : "a") && (
                  <div className="absolute top-1 left-1 text-xs font-bold opacity-70 text-gray-700">{rank}</div>
                )}

                {/* Move indicators */}
                {validMoves.includes(square) && !piece && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 bg-gray-700 rounded-full opacity-70" />
                  </div>
                )}

                {validMoves.includes(square) && piece && (
                  <div className="absolute inset-0 border-4 border-red-500 rounded-lg opacity-80" />
                )}

                {/* Selection indicator */}
                {selectedSquare === square && (
                  <div className="absolute inset-0 border-4 border-yellow-500 rounded-lg animate-pulse" />
                )}
              </div>
            )
          }),
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
