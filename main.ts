// cbbtc-bounce-bot: a long-only dip-and-bounce bot for cbBTC on the
// agent-fun/bars-replay/v1 wire. It speaks the hello / batch / orders / bar
// protocol through the vendored shim and trades one symbol, CBBTC, against
// USDC, one minute bar at a time.
//
// The idea, in one paragraph: BTC drifts and oscillates in small steps, and
// a full round trip costs about 30 bps in fees, slippage and pool impact, so
// most minutes are not worth trading. The bot stays in cash and waits for a
// real dip: the close at least 55 bps below the highest close of the last 20
// bars, with the last two closes both rising (the bounce has started). It
// then buys with all its cash and sells the whole position when the close
// reaches 100 bps above its entry fill price, when it falls 30 bps below it,
// or after 10 bars, whichever comes first. It never enters in the last 20
// bars of the window, because a position opened there has no time to pay for
// its round-trip cost before the final flatten. Long only, no leverage, one
// open position at most, deterministic: every decision is integer arithmetic
// on the bars the harness sent, seeded by nothing but the bar time.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// How far back the recent high is measured, in bars.
const LOOKBACK_BARS = 20;
// The close must sit this far (bps) below the recent high to count as a dip.
const DIP_MIN_BPS = 55n;
// The bounce is confirmed when this many latest closes rise in a row.
const BOUNCE_BARS = 2;
// Exit the long position at this much profit (bps) over the entry fill price.
const TAKE_PROFIT_BPS = 100n;
// Exit the long position at this much loss (bps) under the entry fill price.
const STOP_LOSS_BPS = 30n;
// Exit the long position after this many bars, even with no take-profit hit.
const MAX_HOLD_BARS = 10;
// A fill further than this (bps) from the close the order was decided on is
// refused by the harness, so cap the orders' own tolerance there.
const MAX_SLIPPAGE_BPS = 150;
// Never open a position this close to the end of the window (1440 bars).
const NO_TRADE_TAIL_BARS = 20;
const WINDOW_BARS = 1440;
// The smallest buy the harness accepts, in quote units (1 USDC).
const MIN_NOTIONAL = 1_000_000n;

// The closes of every bar seen, oldest first, as raw price integers.
const closes: bigint[] = [];
// The fill price of the open position, or null while flat.
let entryPrice: bigint | null = null;
// Bars held since the open position's buy filled.
let holdBars = 0;

function recentHigh(): bigint {
  let hi = closes[closes.length - 1];
  for (let k = 1; k < LOOKBACK_BARS; k++) {
    const c = closes[closes.length - 1 - k];
    if (c > hi) hi = c;
  }
  return hi;
}

function bounceConfirmed(): boolean {
  for (let k = 1; k <= BOUNCE_BARS; k++) {
    if (closes[closes.length - k] <= closes[closes.length - k - 1]) return false;
  }
  return true;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    // First, fold in the fills of the orders decided on the previous batch:
    // a filled buy opens the position and fixes its entry fill price, a
    // filled sell closes it.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        entryPrice = BigInt(fill.price);
        holdBars = 0;
      } else {
        entryPrice = null;
        holdBars = 0;
      }
    }

    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    closes.push(close);

    const position = state.positions.get(SYMBOL);
    const qty = position?.qty ?? 0n;

    if (qty === 0n) {
      // Flat: wait for a dip with a bounce behind it.
      if (state.warmingUp) return [];
      if (batch.seq >= WINDOW_BARS - NO_TRADE_TAIL_BARS) return [];
      if (closes.length < LOOKBACK_BARS) return [];
      const hi = recentHigh();
      const dipBps = ((hi - close) * 10_000n) / hi;
      if (dipBps < DIP_MIN_BPS) return [];
      if (!bounceConfirmed()) return [];
      // Spend all the cash, but never past the position-weight cap: the cap
      // is measured on the position's value at the latest close, and when
      // flat the cash and the equity are the same, so this binds only if a
      // fill or a mark ever left the two apart.
      const cash = state.cash;
      const room = state.weightRoom(SYMBOL);
      const notional = cash < room ? cash : room;
      if (notional < MIN_NOTIONAL) return [];
      return [
        {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: notional,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }

    // Long: manage the exit on this bar's close.
    holdBars += 1;
    if (entryPrice === null) {
      // The buy filled before this session saw its fill line; fall back to
      // the position's average cost so the exits still have a reference.
      const cost = position?.cost ?? 0n;
      if (qty > 0n && cost > 0n) {
        const scale = state.symbols.get(SYMBOL);
        if (scale !== undefined) {
          entryPrice =
            (cost * 10n ** BigInt(scale.qty_scale + scale.price_scale)) /
            (qty * 10n ** BigInt(state.hello.capital.quote_scale));
        }
      }
      if (entryPrice === null) return [];
    }
    const tpHit = close * 10_000n >= entryPrice * (10_000n + TAKE_PROFIT_BPS);
    const slHit = close * 10_000n <= entryPrice * (10_000n - STOP_LOSS_BPS);
    const timedOut = holdBars >= MAX_HOLD_BARS;
    if (tpHit || slHit || timedOut) {
      return [
        {
          side: 'sell',
          symbol: SYMBOL,
          qty,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  },
});
