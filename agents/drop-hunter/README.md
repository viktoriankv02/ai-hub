# Drop Hunter

Drop Hunter is the research/ranking layer of AI Hub.

It does **not** claim that a project will distribute a token or reward. Instead, it scores observable opportunity signals and keeps the evidence separate from the score.

## First-wave targets

1. Ink Sepolia
2. Plasma Testnet
3. Arc Testnet
4. Tempo Testnet (Moderato)
5. Base Sepolia
6. Ethereum Sepolia

## Score model

The deterministic scorer uses these weighted signals:

- funding evidence — 15%
- developer program — 15%
- testnet activity — 12%
- mainnet readiness — 8%
- on-chain verifiability — 15%
- ecosystem activity — 10%
- reward signals — 15%
- user fit — 5%
- timing — 5%

External evidence must be supplied before funding, reward or developer-program signals affect a project's score.

## Usage

```powershell
npm run drop-hunter
```

The next evolution is an evidence collector that can ingest project docs, GitHub activity, developer programs, funding announcements and on-chain observations into the same scoring model.
