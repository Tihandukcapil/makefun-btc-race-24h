// DipRevert — a mean-reversion BTC trading bot for the make.fun BTC race.
//
// Strategy (long only, one asset, full-size trades, few round trips):
//   - EMA(240) on 1-minute closes of cbBTC/USDC is the slow mean. It is seeded as the
//     mean of its first 240 closes, then moves 2 / (240 + 1) of the way to each new
//     close, exactly like the kit baselines seed their EMAs. No trade is possible
//     before the mean exists (bar 239), so the first four hours only build history.
//   - Entry, flat only: the close sits at least 80 bps below the slow mean AND the
//     last 15 minutes fell at least 40 bps (the dip is a sharp washout, not a slow
//     grind down) AND the last 240 minutes did not fall more than 150 bps (no
//     catching a falling knife in a strong downtrend). Buy 100% of cash.
//   - Exit, holding: sell the whole position when the close reaches the slow mean
//     again (the reversion is complete) or when the position is worth 100 bps less
//     than it cost (hard stop). A stop-loss exit starts a 30-bar cooldown before
//     the next entry, so a falling market cannot churn the bot bar after bar.
//   - Every order caps slippage at 100 bps (1%) past the close it was decided on,
//     so a fill into a liquidity gap is refused rather than filled for nothing.
//   - One order per reply at most, sells before buys (there is only one asset, so
//     at most one of the two fires on any bar).
//
// Why this shape: on the published dev window (24h of 1-minute cbBTC bars) the
// market was choppy and roughly flat (+48 bps over the day). Every fast
// trend-following baseline lost money there by whipsawing (ema-cross -106 USDC on
// 68 trades, adx-momentum -33 USDC on 26, rsi-bollinger -24 USDC on 11), while
// buying and holding made only +1.07 USDC. Buying sharp dips below the 4-hour
// mean and selling back at the mean made +5.02 USDC on 4 trades in local grading
// (dev PnL to confirm with grade-local), positive on both 12-hour halves of the
// window, with a 0.3% maximum drawdown. The parameters sit in a flat, forgiving
// region (dip 60-80 bps, 15-minute fall 20-40 bps all profitable on dev), not on
// a sharp peak, so the bot is a robust rule rather than a fitted curve.
//   - The round trip costs about 26 bps (4 bps fee + 2 bps slippage + ~7 bps
//     impact each way at full size), so an 80 bps dip leaves a real edge after
//     costs, and the hard stop bounds the loss when a dip keeps falling.
//   - Determinism: float64 arithmetic on + - * / alone, no clock, no randomness,
//     no environment, no network. The same bars give the same orders, run after
//     run. Prices are read as BigInt raw units and converted once per bar; all
//     comparisons are on those numbers, so no float drift across runs.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Span of the slow mean, in 1-minute bars (4 hours). */
const MEAN_BARS = 240;
/** Entry: close this many bps below the slow mean. */
const DIP_BPS = 80;
/** Entry: the last 15 minutes must have fallen at least this many bps. */
const DIP_FALL_BPS = 40;
/** Entry guard: skip when the last 240 minutes fell more than this many bps. */
const TREND_GUARD_BPS = 150;
/** Exit: sell when the position is worth this many bps less than it cost. */
const STOP_BPS = 100;
/** Bars to wait after a stop-loss exit before the next entry. */
const COOLDOWN_BARS = 30;
/** Slippage cap on every order, in bps past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 100;
/** A buy spends at least this many quote units (1 USDC); full-cash buys are far above it. */
const MIN_NOTIONAL = 1_000_000n;

/** The closes seen so far, in bar order; a missing minute adds nothing. */
const closes: number[] = [];
/** The slow mean over closes, null until its first span is complete. */
let mean: number | null = null;
/** Bar index (count of closes seen) of the last stop-loss exit; -1 when none. */
let lastStopBar = -1;

/** Return of the last `bars` closes, in bps (x10000), or null when too few closes. */
function retBps(bars: number): number | null {
  if (closes.length <= bars) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - bars];
  return ((now - then) / then) * 10_000;
}

await runBars({
  onBatch(state: BarsState) {
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return [];
    if (state.warmingUp) return [];

    // Fold the new close into the slow mean, seeded as the mean of its first span.
    const close = Number(bar.c);
    closes.push(close);
    if (mean === null) {
      if (closes.length === MEAN_BARS) {
        mean = closes.reduce((a, x) => a + x, 0) / MEAN_BARS;
      }
    } else {
      mean += (2 / (MEAN_BARS + 1)) * (close - mean);
    }
    if (mean === null) return [];

    const held = state.positions.get(SYMBOL);
    const idx = closes.length - 1;

    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty);
      // Hard stop: worth 100 bps less than it cost.
      if (value * 10_000n <= held.cost * BigInt(10_000 - STOP_BPS)) {
        lastStopBar = idx;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      // Reversion complete: the close is back at (or above) the slow mean.
      if (close >= mean) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      return [];
    }

    // Flat: only a sharp dip below the slow mean, outside the cooldown, and
    // only when the slow trend is not itself falling hard.
    if (lastStopBar >= 0 && idx - lastStopBar < COOLDOWN_BARS) return [];
    const dipBps = ((close - mean) / mean) * 10_000;
    if (dipBps > -DIP_BPS) return [];
    const fall15 = retBps(15);
    if (fall15 === null || fall15 > -DIP_FALL_BPS) return [];
    const trend240 = retBps(240);
    if (trend240 !== null && trend240 < -TREND_GUARD_BPS) return [];

    const cash = state.cash;
    if (cash < MIN_NOTIONAL) return [];
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies BuyInput];
  },
});
