<script lang="ts">
  import { Chess as ChessJs, SQUARES } from "chess.js"
  import { onMount } from "svelte"
  import { Chessground } from "svelte-chessground"
  import type { Key } from "chessground/types"

  let stockFish: Worker

  let onBestMove = (_from: string, _to: string) => {}

  void onMount(async function () {
    const { default: StockFish } = await import("stockfish/src/stockfish-nnue-16?worker")
    stockFish = new StockFish()
    stockFish.postMessage("setoption name Skill Level value 0")

    stockFish.onmessage = function onStockFishMessage(event: MessageEvent<string>) {
      const { data } = event
      const [command, ...rest] = data.split(" ")
      console.log(data)

      if (command === "bestmove") {
        const [move] = rest
        const [from, to] = [move.slice(0, 2), move.slice(2, 4)]
        onBestMove(from, to)
      }
    }
  })

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

  function syncToChessground(chessground: Chessground, chess: ChessJs) {
    const color = chess.turn() == "w" ? "white" : "black"
    chessground.set({
      turnColor: color,
      movable: {
        color,
        dests: toDests(chess),
      },
    })
  }

  function playComputer(chessground: Chessground, chess: ChessJs) {
    chessground.set({ viewOnly: true })

    onBestMove = function onBestMove(from: string, to: string) {
      chess.move({ from: from, to: to })
      chessground.move(from as Key, to as Key)
      syncToChessground(chessground, chess)
      chessground.set({ viewOnly: false })
    }

    const fen = chess.fen()
    stockFish.postMessage(`position fen ${fen}`)
    stockFish.postMessage("go depth 1 movetime 50")
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
  }

  onMount(start)
</script>

<div class="max-w-2xl">
  <Chessground bind:this={chessground} {config} />
</div>
