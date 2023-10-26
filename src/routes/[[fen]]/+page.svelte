<script lang="ts">
  import { Chess as ChessJs, SQUARES, type Color, type Square, type PieceSymbol } from "chess.js"
  import { onMount, tick } from "svelte"
  import { Chessground } from "svelte-chessground"
  import type { Key } from "chessground/types"
  import { page } from "$app/stores"
  import PromotionDialog from "$lib/components/PromotionDialog.svelte"

  export let data
  let stockfish: Worker | undefined

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
        if (move === "(none)") {
          return
        }

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
        this.postMessage("setoption name Skill Level value 0")
        this.postMessage("setoption name Threads value 4")
        this.postMessage("setoption name Hash value 256")

        isReady = true
        calculateScore(chess)
      }
    }

    stockfish.postMessage("uci")
  }

  function stop() {
    onBestMove = () => {}
    onInfo = () => {}
    stockfish?.postMessage("stop")
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

  function forceChessJsAndChessgroundPositionSync() {
    chessground.set({ fen: chess.fen() })
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

    const isPositionSynced = chessground.getFen() === chess.fen().split(" ")[0]
    if (!isPositionSynced) {
      forceChessJsAndChessgroundPositionSync()
    }

    if (chess.isGameOver()) {
      isReady = false
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
    stockfish?.postMessage(`position fen ${fen}`)

    stop()
    onBestMove = function onBestMove(from: string, to: string) {
      chess.move({ from: from, to: to })
      chessground.move(from as Key, to as Key)
      syncToChessground(chessground, chess)
      calculateScore(chess)

      isReady = true
    }

    stockfish?.postMessage("go depth 1 movetime 50")
  }

  let whiteWinProbability = 50

  function calculateScore(chess: ChessJs) {
    stop()

    const fen = chess.fen()
    stockfish?.postMessage(`position fen ${fen}`)

    onInfo = (centiPawns) => {
      whiteWinProbability = 50 + 50 * (2 / (1 + Math.exp(-0.004 * centiPawns)) - 1)
    }

    stockfish?.postMessage("go depth 20 movetime 2000")
  }

  type PromotionQuestion = {
    from: Square
    to: Square
    color: Color
  }

  let promotionQuestion: PromotionQuestion | undefined = undefined

  function onMoveFnGenerator(chessground: Chessground, chess: ChessJs) {
    return function onMove(from: string, to: string) {
      const isPromotion =
        chess
          .moves({ verbose: true })
          .filter((move) => move.from === from && move.to === to && move.flags.includes("p"))
          .length > 0

      if (isPromotion) {
        isReady = false
        promotionQuestion = {
          from: from as Square,
          to: to as Square,
          color: chess.turn(),
        }
      } else {
        chess.move({ to, from })
        afterMove(chessground, chess)
      }
    }
  }

  function afterMove(chessground: Chessground, chess: ChessJs) {
    syncToChessground(chessground, chess)

    if (chess.turn() === "b") {
      playComputer(chessground, chess)
    }
  }

  $: chess = new ChessJs(data.fen)
  $: config = {
    movable: {
      color: "white",
      free: false,
      dests: toDests(chess),
    },
  } as const

  function promote(chessground: Chessground, chess: ChessJs, piece: PieceSymbol) {
    if (!promotionQuestion) {
      throw new Error("Promotion question not set")
    }

    const { to, from } = promotionQuestion
    chess.move({ to, from, promotion: piece })
    promotionQuestion = undefined
    isReady = true
    afterMove(chessground, chess)
  }

  onMount(() => loadStockfish())
  onMount(() => {
    // WORKAROUND: Chessground is unhappy when initialized with `viewOnly` set to false.
    isReady = false
  })

  async function start(chessground: Chessground, chess: ChessJs) {
    stop()

    chessground.set({
      movable: { events: { after: onMoveFnGenerator(chessground, chess) } },
    })

    syncToChessground(chessground, chess)
  }

  function undo(chessground: Chessground, chess: ChessJs) {
    stop()

    chess.undo()
    chess.undo()

    syncToChessground(chessground, chess)
    calculateScore(chess)
  }

  function copyFenToClipboard(chess: ChessJs) {
    const { url } = $page
    const fen = chess.fen()

    navigator.clipboard.writeText(`${url.protocol}://${url.host}/${encodeURIComponent(fen)}`)
  }

  $: chessground && chess && start(chessground, chess)
</script>

<div
  class="grid gap-1 grid-rows-[0_20px_minmax(100px,calc(100vw-2.5rem))_200px_1fr] md:grid-rows-1 md:grid-cols-[1fr_20px_minmax(100px,calc(100vh-2.5rem))_200px_1fr] p-5"
>
  <div />

  <div class="bg-zinc-900 overflow-hidden dark:bg-zinc-700">
    <div
      class="bg-zinc-100 overflow-hidden md:min-w-full max-md:min-h-full"
      role="progressbar"
      style="height:{whiteWinProbability}%;width:{whiteWinProbability}%"
      aria-valuenow={whiteWinProbability}
      aria-valuemin={0}
      aria-valuemax={100}
    />
  </div>

  <div class="relative">
    <Chessground bind:this={chessground} {config} viewOnly={!isReady} />
    {#if promotionQuestion}
      <PromotionDialog
        square={promotionQuestion.to}
        orientation={promotionQuestion.color}
        callback={(piece) => promote(chessground, chess, piece)}
      />
    {/if}
  </div>

  <div class="flex flex-wrap items-start space-x-2">
    <a
      href="/"
      class="bg-zinc-700 px-7 py-3 rounded-lg text-zinc-200 font-semibold text-lg hover:bg-zinc-600"
    >
      New Game
    </a>

    <button
      type="button"
      on:click={() => undo(chessground, chess)}
      disabled={!isReady}
      class="bg-zinc-700 px-7 py-3 rounded-lg text-zinc-200 font-semibold text-lg hover:bg-zinc-600"
      >Undo</button
    >

    <button
      type="button"
      on:click={() => copyFenToClipboard(chess)}
      disabled={!isReady}
      class="bg-zinc-700 px-7 py-3 rounded-lg text-zinc-200 font-semibold text-lg hover:bg-zinc-600"
      >Save to clipboard</button
    >
  </div>

  <div />
</div>
