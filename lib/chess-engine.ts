export type ChessPiece = "wK" | "wQ" | "wR" | "wB" | "wN" | "wP" | "bK" | "bQ" | "bR" | "bB" | "bN" | "bP" | null

export interface ChessPosition {
  [square: string]: ChessPiece
}

export interface Move {
  from: string
  to: string
  piece: ChessPiece
  captured?: ChessPiece
  notation: string
}

export class ChessGame {
  private position: ChessPosition
  public currentPlayer: "w" | "b"
  private moveHistory: Move[]

  constructor() {
    this.position = this.getInitialPosition()
    this.currentPlayer = "w"
    this.moveHistory = []
  }

  private getInitialPosition(): ChessPosition {
    return {
      a8: "bR",
      b8: "bN",
      c8: "bB",
      d8: "bQ",
      e8: "bK",
      f8: "bB",
      g8: "bN",
      h8: "bR",
      a7: "bP",
      b7: "bP",
      c7: "bP",
      d7: "bP",
      e7: "bP",
      f7: "bP",
      g7: "bP",
      h7: "bP",
      a2: "wP",
      b2: "wP",
      c2: "wP",
      d2: "wP",
      e2: "wP",
      f2: "wP",
      g2: "wP",
      h2: "wP",
      a1: "wR",
      b1: "wN",
      c1: "wB",
      d1: "wQ",
      e1: "wK",
      f1: "wB",
      g1: "wN",
      h1: "wR",
    }
  }

  getPiece(square: string): ChessPiece {
    return this.position[square] || null
  }

  makeMove(from: string, to: string): boolean {
    console.log(`=== Making Move: ${from} -> ${to} ===`)
    console.log(`Current player: ${this.currentPlayer}`)

    const piece = this.getPiece(from)
    console.log(`Piece at ${from}:`, piece)

    if (!piece) {
      console.log("❌ No piece at source square")
      return false
    }

    // Fix: Check piece color properly
    const pieceColor = piece.charAt(0) as "w" | "b"
    console.log(`Piece color: ${pieceColor}, Current player: ${this.currentPlayer}`)

    if (pieceColor !== this.currentPlayer) {
      console.log(`❌ Piece belongs to ${pieceColor}, but current player is ${this.currentPlayer}`)
      return false
    }

    const validMoves = this.getValidMoves(from)
    console.log(`Valid moves from ${from}:`, validMoves)

    if (!validMoves.includes(to)) {
      console.log(`❌ ${to} is not in valid moves`)
      return false
    }

    const captured = this.getPiece(to)
    let notation = this.generateMoveNotation(from, to, piece, captured)

    // Handle castling
    if (piece[1] === "K" && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
      const isKingside = to > from
      const rookFrom = isKingside ? `h${from[1]}` : `a${from[1]}`
      const rookTo = isKingside ? `f${from[1]}` : `d${from[1]}`

      this.position[rookTo] = this.position[rookFrom]
      delete this.position[rookFrom]
      notation = isKingside ? "O-O" : "O-O-O"
    }

    // Make the move
    this.position[to] = piece
    delete this.position[from]

    this.moveHistory.push({ from, to, piece, captured, notation })

    // Switch turns
    this.currentPlayer = this.currentPlayer === "w" ? "b" : "w"
    console.log(`✅ Move successful: ${notation}`)
    console.log(`New current player: ${this.currentPlayer}`)
    console.log("=== End Move ===")

    return true
  }

  getLastMoveNotation(): string {
    return this.moveHistory[this.moveHistory.length - 1]?.notation || ""
  }

  private generateMoveNotation(from: string, to: string, piece: ChessPiece, captured?: ChessPiece): string {
    if (!piece) return ""

    const [color, type] = piece

    if (type === "P") {
      if (captured || from[0] !== to[0]) {
        return `${from[0]}x${to}`
      } else {
        return to
      }
    } else {
      let notation = type

      const ambiguousMoves = this.findAmbiguousMoves(from, to, piece)
      if (ambiguousMoves.length > 0) {
        const sameFile = ambiguousMoves.some((move) => move[0] === from[0])
        const sameRank = ambiguousMoves.some((move) => move[1] === from[1])

        if (!sameFile) {
          notation += from[0]
        } else if (!sameRank) {
          notation += from[1]
        } else {
          notation += from
        }
      }

      if (captured) notation += "x"
      notation += to

      return notation
    }
  }

  private findAmbiguousMoves(from: string, to: string, piece: ChessPiece): string[] {
    if (!piece) return []

    const ambiguous: string[] = []
    const [color, type] = piece

    for (const square in this.position) {
      const otherPiece = this.position[square]
      if (otherPiece && otherPiece[0] === color && otherPiece[1] === type && square !== from) {
        const validMoves = this.getValidMoves(square)
        if (validMoves.includes(to)) {
          ambiguous.push(square)
        }
      }
    }

    return ambiguous
  }

  parseAlgebraicNotation(notation: string): { from: string; to: string } | null {
    console.log(`Parsing notation: "${notation}" for player ${this.currentPlayer}`)

    notation = notation.replace(/[+#!?]+$/, "").trim()

    // Handle castling
    if (notation === "O-O" || notation === "0-0") {
      const rank = this.currentPlayer === "w" ? "1" : "8"
      return { from: `e${rank}`, to: `g${rank}` }
    }
    if (notation === "O-O-O" || notation === "0-0-0") {
      const rank = this.currentPlayer === "w" ? "1" : "8"
      return { from: `e${rank}`, to: `c${rank}` }
    }

    let pieceType = "P"
    let fromFile = ""
    let fromRank = ""
    let isCapture = false
    let toSquare = ""

    // Parse notation patterns
    if (/^[a-h][1-8]$/.test(notation)) {
      toSquare = notation
      pieceType = "P"
    } else if (/^[a-h]x[a-h][1-8]$/.test(notation)) {
      fromFile = notation[0]
      toSquare = notation.slice(2)
      pieceType = "P"
      isCapture = true
    } else if (/^[KQRBN][a-h][1-8]$/.test(notation)) {
      pieceType = notation[0]
      toSquare = notation.slice(1)
    } else if (/^[KQRBN]x[a-h][1-8]$/.test(notation)) {
      pieceType = notation[0]
      toSquare = notation.slice(2)
      isCapture = true
    } else if (/^[KQRBN][a-h][a-h][1-8]$/.test(notation)) {
      pieceType = notation[0]
      fromFile = notation[1]
      toSquare = notation.slice(2)
    } else if (/^[KQRBN][1-8][a-h][1-8]$/.test(notation)) {
      pieceType = notation[0]
      fromRank = notation[1]
      toSquare = notation.slice(2)
    } else if (/^[KQRBN][a-h]x[a-h][1-8]$/.test(notation)) {
      pieceType = notation[0]
      fromFile = notation[1]
      toSquare = notation.slice(3)
      isCapture = true
    } else if (/^[KQRBN][1-8]x[a-h][1-8]$/.test(notation)) {
      pieceType = notation[0]
      fromRank = notation[1]
      toSquare = notation.slice(3)
      isCapture = true
    } else {
      console.log("❌ Unrecognized notation pattern:", notation)
      return null
    }

    const candidates = this.findCandidatePieces(pieceType, toSquare, fromFile, fromRank, isCapture)
    console.log(`Found ${candidates.length} candidates:`, candidates)

    if (candidates.length === 0) {
      console.log("❌ No valid candidates found")
      return null
    }

    return { from: candidates[0], to: toSquare }
  }

  private findCandidatePieces(
    pieceType: string,
    toSquare: string,
    fromFile: string,
    fromRank: string,
    isCapture: boolean,
  ): string[] {
    const candidates: string[] = []
    const targetPieceCode = `${this.currentPlayer}${pieceType}`

    console.log(`Looking for ${targetPieceCode} pieces that can move to ${toSquare}`)

    for (const square in this.position) {
      const piece = this.position[square]
      if (!piece || piece !== targetPieceCode) continue

      // Check file/rank constraints
      if (fromFile && square[0] !== fromFile) continue
      if (fromRank && square[1] !== fromRank) continue

      // Check if this piece can legally move to the target square
      const validMoves = this.getValidMoves(square)
      if (!validMoves.includes(toSquare)) continue

      // Validate capture logic
      const targetPiece = this.getPiece(toSquare)
      if (isCapture) {
        if (targetPiece && targetPiece[0] !== this.currentPlayer) {
          candidates.push(square)
        } else if (pieceType === "P" && !targetPiece) {
          // En passant logic
          const [file, rank] = toSquare.split("")
          const captureRank = this.currentPlayer === "w" ? "5" : "4"
          if (rank === (this.currentPlayer === "w" ? "6" : "3")) {
            const enPassantSquare = `${file}${captureRank}`
            const enPassantPiece = this.getPiece(enPassantSquare)
            if (enPassantPiece && enPassantPiece[0] !== this.currentPlayer && enPassantPiece[1] === "P") {
              candidates.push(square)
            }
          }
        }
      } else {
        if (!targetPiece) {
          candidates.push(square)
        }
      }
    }

    return candidates
  }

  getValidMoves(square: string): string[] {
    const piece = this.getPiece(square)
    if (!piece) {
      console.log(`No piece at ${square}`)
      return []
    }

    // Fix: Only get moves for pieces belonging to current player
    const pieceColor = piece.charAt(0) as "w" | "b"
    if (pieceColor !== this.currentPlayer) {
      console.log(`Piece at ${square} belongs to ${pieceColor}, but current player is ${this.currentPlayer}`)
      return []
    }

    console.log(`Getting valid moves for ${piece} at ${square}`)

    const moves: string[] = []
    const [color, type] = piece

    switch (type) {
      case "P":
        moves.push(...this.getPawnMoves(square, color as "w" | "b"))
        break
      case "R":
        moves.push(...this.getRookMoves(square))
        break
      case "N":
        moves.push(...this.getKnightMoves(square))
        break
      case "B":
        moves.push(...this.getBishopMoves(square))
        break
      case "Q":
        moves.push(...this.getQueenMoves(square))
        break
      case "K":
        moves.push(...this.getKingMoves(square))
        break
    }

    const validMoves = moves.filter((move) => this.isValidSquare(move) && this.canMoveTo(square, move))
    console.log(`Valid moves for ${piece} at ${square}:`, validMoves)
    return validMoves
  }

  private getPawnMoves(square: string, color: "w" | "b"): string[] {
    const moves: string[] = []
    const [file, rank] = square.split("")
    const fileIndex = "abcdefgh".indexOf(file)
    const rankIndex = Number.parseInt(rank) - 1
    const direction = color === "w" ? 1 : -1
    const startRank = color === "w" ? 1 : 6

    console.log(`Pawn moves for ${color} pawn at ${square}, direction: ${direction}`)

    // Forward move
    const oneForward = `${file}${rankIndex + 1 + direction}`
    if (this.isValidSquare(oneForward) && !this.getPiece(oneForward)) {
      moves.push(oneForward)

      // Two squares forward from starting position
      if (rankIndex === startRank) {
        const twoForward = `${file}${rankIndex + 1 + direction * 2}`
        if (this.isValidSquare(twoForward) && !this.getPiece(twoForward)) {
          moves.push(twoForward)
        }
      }
    }

    // Captures
    for (const fileOffset of [-1, 1]) {
      const newFileIndex = fileIndex + fileOffset
      if (newFileIndex >= 0 && newFileIndex < 8) {
        const captureSquare = `${"abcdefgh"[newFileIndex]}${rankIndex + 1 + direction}`
        if (this.isValidSquare(captureSquare)) {
          const targetPiece = this.getPiece(captureSquare)
          if (targetPiece && targetPiece[0] !== color) {
            moves.push(captureSquare)
          }
        }
      }
    }

    console.log(`Pawn at ${square} can move to:`, moves)
    return moves
  }

  private getRookMoves(square: string): string[] {
    const moves: string[] = []
    const directions = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]

    for (const [dx, dy] of directions) {
      moves.push(...this.getLinearMoves(square, dx, dy))
    }

    return moves
  }

  private getBishopMoves(square: string): string[] {
    const moves: string[] = []
    const directions = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]

    for (const [dx, dy] of directions) {
      moves.push(...this.getLinearMoves(square, dx, dy))
    }

    return moves
  }

  private getQueenMoves(square: string): string[] {
    return [...this.getRookMoves(square), ...this.getBishopMoves(square)]
  }

  private getKnightMoves(square: string): string[] {
    const moves: string[] = []
    const [file, rank] = square.split("")
    const fileIndex = "abcdefgh".indexOf(file)
    const rankIndex = Number.parseInt(rank) - 1

    const knightMoves = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ]

    for (const [dx, dy] of knightMoves) {
      const newFileIndex = fileIndex + dx
      const newRankIndex = rankIndex + dy

      if (newFileIndex >= 0 && newFileIndex < 8 && newRankIndex >= 0 && newRankIndex < 8) {
        moves.push(`${"abcdefgh"[newFileIndex]}${newRankIndex + 1}`)
      }
    }

    return moves
  }

  private getKingMoves(square: string): string[] {
    const moves: string[] = []
    const [file, rank] = square.split("")
    const fileIndex = "abcdefgh".indexOf(file)
    const rankIndex = Number.parseInt(rank) - 1

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue

        const newFileIndex = fileIndex + dx
        const newRankIndex = rankIndex + dy

        if (newFileIndex >= 0 && newFileIndex < 8 && newRankIndex >= 0 && newRankIndex < 8) {
          moves.push(`${"abcdefgh"[newFileIndex]}${newRankIndex + 1}`)
        }
      }
    }

    return moves
  }

  private getLinearMoves(square: string, dx: number, dy: number): string[] {
    const moves: string[] = []
    const [file, rank] = square.split("")
    const fileIndex = "abcdefgh".indexOf(file)
    const rankIndex = Number.parseInt(rank) - 1

    let newFileIndex = fileIndex + dx
    let newRankIndex = rankIndex + dy

    while (newFileIndex >= 0 && newFileIndex < 8 && newRankIndex >= 0 && newRankIndex < 8) {
      const newSquare = `${"abcdefgh"[newFileIndex]}${newRankIndex + 1}`
      const piece = this.getPiece(newSquare)

      if (!piece) {
        moves.push(newSquare)
      } else {
        if (piece[0] !== this.getPiece(square)![0]) {
          moves.push(newSquare)
        }
        break
      }

      newFileIndex += dx
      newRankIndex += dy
    }

    return moves
  }

  private isValidSquare(square: string): boolean {
    return /^[a-h][1-8]$/.test(square)
  }

  private canMoveTo(from: string, to: string): boolean {
    const fromPiece = this.getPiece(from)
    const toPiece = this.getPiece(to)

    if (!fromPiece) return false
    if (toPiece && toPiece[0] === fromPiece[0]) return false

    return true
  }

  clone(): ChessGame {
    const newGame = new ChessGame()
    newGame.position = { ...this.position }
    newGame.currentPlayer = this.currentPlayer
    newGame.moveHistory = [...this.moveHistory]
    return newGame
  }
}
