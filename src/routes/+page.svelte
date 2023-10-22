<script lang="ts">
  import { Chess as ChessJs, SQUARES } from "chess.js"
  import { onMount, tick } from "svelte"
  import { Chessground } from "svelte-chessground"
  import type { Key } from "chessground/types"

  let stockfish: Worker

  let onBestMove = (_from: string, _to: string) => {}

  async function loadStockfish() {
    const { default: Stockfish } = await import("stockfish/src/stockfish-nnue-16?worker")
    stockfish = new Stockfish()

    stockfish.onmessage = function onStockFishMessage(event: MessageEvent<string>) {
      const { data } = event
      const [command, ...rest] = data.split(" ")
      console.log(data)

      if (command === "bestmove") {
        const [move] = rest
        const [from, to] = [move.slice(0, 2), move.slice(2, 4)]
        onBestMove(from, to)
      } else if (command === "uciok") {
        stockfish.postMessage("setoption name Skill Level value 0")
      }
    }

    stockfish.postMessage("uci")
  }

  function stop() {
    onBestMove = () => {}
    stockfish.postMessage("stop")
  }

  let chessground: Chessground

  // Find all legal moves
  function toDests(chess: ChessJs) {
    const dests = new Map()
    SQUARES.forEach((s) => {
      const ms = chess.moves({ square: s, verbose: true })
      if (ms.length)
        dests.set(
          s,
          ms.map((m) => m.to),
        )
    })
    return dests
  }

  function gameOverReason(chess: ChessJs): string {
    const isCheckmate = chess.isCheckmate()
    const isStalemate = chess.isStalemate()
    const isDraw = chess.isDraw()

    if (isCheckmate) {
      return "Checkmate"
    } else if (isStalemate) {
      return "Stalemate"
    } else if (isDraw) {
      return "Draw"
    }

    throw new Error("Game is not over")
  }

  async function syncToChessground(chessground: Chessground, chess: ChessJs) {
    const color = chess.turn() == "w" ? "white" : "black"

    chessground.set({
      turnColor: color,
      movable: {
        color,
        dests: toDests(chess),
      },
      check: chess.isCheck(),
    })

    if (chess.isGameOver()) {
      await tick()

      alert("GAME OVER! - " + gameOverReason(chess))
    }
  }

  function playComputer(chessground: Chessground, chess: ChessJs) {
    chessground.set({ viewOnly: true })
    const fen = chess.fen()
    stockfish.postMessage(`position fen ${fen}`)

    stop()
    onBestMove = function onBestMove(from: string, to: string) {
      chess.move({ from: from, to: to })
      chessground.move(from as Key, to as Key)
      syncToChessground(chessground, chess)
      chessground.set({ viewOnly: false })
    }

    stockfish.postMessage("go depth 1 movetime 50")
  }

  function onMoveFnGenerator(chessground: Chessground, chess: ChessJs) {
    return function onMove(from: string, to: string) {
      chess.move({ from: from, to: to })
      syncToChessground(chessground, chess)

      if (chess.turn() === "b") {
        playComputer(chessground, chess)
      }
    }
  }

  const chess = new ChessJs()
  const config = {
    movable: {
      color: "white",
      free: false,
      dests: toDests(chess),
    },
  } as const

  function start() {
    chessground.set({
      movable: { events: { after: onMoveFnGenerator(chessground, chess) } },
    })

    loadStockfish()
  }

  onMount(start)
</script>

<div class="w-full h-screen flex justify-center items-center">
  <div class="max-w-2xl flex-1">
    <Chessground bind:this={chessground} {config} />
  </div>
</div>
