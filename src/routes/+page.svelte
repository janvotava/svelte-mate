<script lang="ts">
  import { Chess as ChessJs, SQUARES } from "chess.js"
  import { onMount } from "svelte"
  import { Chessground } from "svelte-chessground"

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

  function playOtherSide(chessground: Chessground, chess: ChessJs) {
    return (from: string, to: string) => {
      chess.move({ from: from, to: to })
      const color = chess.turn() == "w" ? "white" : "black"
      chessground.set({
        turnColor: color,
        movable: {
          color: color,
          dests: toDests(chess),
        },
      })
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
      movable: { events: { after: playOtherSide(chessground, chess) } },
    })
  }

  onMount(start)
</script>

<div class="max-w-2xl">
  <Chessground bind:this={chessground} {config} />
</div>
