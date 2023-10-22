<script lang="ts">
  import { Chess as ChessJs, SQUARES } from "chess.js"
  import { onMount, tick } from "svelte"
  import { Chessground } from "svelte-chessground"
  import type { Key } from "chessground/types"

  let stockfish: Worker

  let onBestMove = (_from: string, _to: string) => {}
  let onInfo = (_centiPawns: number) => {}

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
      } else if (command === "info") {
        const data = rest.join(" ")

        const cpRegex = /score cp (-?\d+)/
        const match = data.match(cpRegex)

        if (match && match[1]) {
          const cpValue = parseInt(match[1], 10)
          onInfo(cpValue)
        }
      } else if (command === "uciok") {
        stockfish.postMessage("setoption name Skill Level value 0")
        stockfish.postMessage("setoption name Threads value 4")
        stockfish.postMessage("setoption name Hash value 256")
      }
    }

    stockfish.postMessage("uci")
  }

  function stop() {
    onBestMove = () => {}
    onInfo = () => {}
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
      stop()
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
      calculateScore(chess)
    }

    stockfish.postMessage("go depth 1 movetime 50")
  }

  let whiteWinProbability = 50

  function calculateScore(chess: ChessJs) {
    stop()

    const fen = chess.fen()
    stockfish.postMessage(`position fen ${fen}`)

    onInfo = (centiPawns) => {
      whiteWinProbability = 50 + 50 * (2 / (1 + Math.exp(-0.004 * centiPawns)) - 1)
    }

    stockfish.postMessage("go depth 20 movetime 2000")
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
  <div class="max-w-2xl flex-1 flex">
    <Chessground bind:this={chessground} {config} />
    <div
      class="flex flex-col flex-nowrap justify-end w-10 bg-gray-900 overflow-hidden dark:bg-gray-700"
    >
      <div
        class="bg-gray-100 overflow-hidden"
        role="progressbar"
        style="height: {whiteWinProbability}%"
        aria-valuenow={whiteWinProbability}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  </div>
</div>
