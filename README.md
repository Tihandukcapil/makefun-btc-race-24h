# makefun-btc-race-24h

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Tihandukcapil/makefun-btc-race-24h/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Tihandukcapil/makefun-btc-race-24h/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

DipRevert: a mean-reversion BTC trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty. It trades cbBTC/USDC on 1-minute on-chain bars, buys sharp dips 80 bps below the 4-hour mean and sells back at the mean, with a 100 bps hard stop and a 30-bar cooldown after a stop. Local dev grade: +5.02 USDC on the published dev window (4 trades, 0.3% max drawdown), beating every kit baseline (momentum +2.45, buy-and-hold +1.07, ema-cross -106.21). Sign up with referral code ks2r30ft.

## Run it

```sh
node cli/makefun.mjs grade-local --kit ../kit-btc-race-24h-20261117-0603/btc-race-24h-20261117-0603-kit --bot . --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ks2r30ft&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
