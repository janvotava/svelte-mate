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

  let isReady = true

  function playComputer(chessground: Chessground, chess: ChessJs) {
    isReady = false
    const fen = chess.fen()
    console.log(`position fen ${fen}`)
    stockfish.postMessage(`position fen ${fen}`)

    stop()
    onBestMove = function onBestMove(from: string, to: string) {
      chess.move({ from: from, to: to })
      chessground.move(from as Key, to as Key)
      syncToChessground(chessground, chess)
      calculateScore(chess)

      isReady = true
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

  async function start() {
    // WORKAROUND: Chessground is unhappy when initialized with `viewOnly` set to false.
    isReady = false

    chessground.set({
      movable: { events: { after: onMoveFnGenerator(chessground, chess) } },
    })

    await loadStockfish()
    await tick()

    isReady = true
  }

  function undo(chessground: Chessground, chess: ChessJs) {
    stop()

    function undo() {
      const move = chess.undo()
      if (!move) {
        return
      }

      chessground.move(move.to, move.from)
      syncToChessground(chessground, chess)
    }

    undo()
    undo()

    calculateScore(chess)
  }

  onMount(start)
</script>

<div class="w-full h-screen flex justify-center items-center">
  <div class="max-w-3xl flex-1 flex">
    <Chessground bind:this={chessground} {config} viewOnly={!isReady} />

    <div
      class="flex flex-col flex-nowrap justify-end w-5 bg-zinc-900 overflow-hidden dark:bg-zinc-700"
    >
      <div
        class="bg-zinc-100 overflow-hidden"
        role="progressbar"
        style="height: {whiteWinProbability}%"
        aria-valuenow={whiteWinProbability}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>

    <div class="ml-5">
      <button
        type="button"
        on:click={() => undo(chessground, chess)}
        disabled={!isReady}
        class="bg-zinc-700 px-7 py-3 rounded-lg text-zinc-200 font-semibold text-lg hover:bg-zinc-600"
        >Undo</button
      >
    </div>
  </div>
</div>
