# cbbtc-bounce-bot

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/connersss/cbbtc-bounce-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/connersss/cbbtc-bounce-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A long-only dip-and-bounce trading bot for Coinbase Wrapped BTC (cbBTC) on Solana, built for make.fun's 24-hour BTC trading race. It stays in cash and waits for a real dip: the close at least 55 bps below the highest close of the last 20 bars, confirmed by the last two closes both rising (the bounce has started). It then buys with all its cash and sells the whole position at +100 bps take-profit, -30 bps stop-loss, or after 10 bars, whichever comes first. It never opens a position in the last 20 bars of the window. Deterministic integer arithmetic on the bars the harness sends, no network, no wall clock, no randomness. On the published dev window it made +$14.51 net PnL (return +1.45%) in 4 trades, max drawdown 0.17%.

## Run it

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=2ywg2db9&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
