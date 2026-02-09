# Yosoku Twitter Agent — Context

## Architecture
Twitter bot (@YosokuAgent) that creates Solana prediction markets via conversational flow:
1. User tweets "@YosokuAgent create a market"
2. Bot detects intent, checks spam filter (≥100 followers, ≥100 tweets)
3. Bot replies with fill-in template (Q, CAT, END, WALLET, optional DESC/RULES)
4. User replies with filled template
5. Bot parses, validates, creates market on-chain via Yosoku SDK
6. Bot replies with tradeable URL: https://yosoku.fun/markets/<marketPda>

## State Machine
```
TEMPLATE_SENT → CREATING_MARKET → DONE
                                → FAILED
TEMPLATE_SENT → EXPIRED (1 hour timeout)
```
On parse failure: stays TEMPLATE_SENT (user can retry)

## Yosoku SDK Integration
- Package: `yosoku` on npm (v0.1.0)
- `PredMarketClient.fromProvider(provider)` — main client
- `client.markets.createRegularMarket(params)` — creates market
- `parsePredMarketError(err)` — translates on-chain errors
- Params: `{ name, category, marketQuestion, eventDeadline, description, rules, resolverType: { type: "uma" } }`
- Returns: `RegularMarketResult` with `marketId`, `marketPda`, `signatures`

### On-chain behavior
- `eventDeadline` = when real-world event occurs (not a hard trading cutoff)
- Trading continues after deadline
- Anyone can propose resolution via UMA at any time
- Safety fallback: 50/50 auto-resolution if nobody proposes after deadline
- Creator = signer (bot wallet). User's WALLET is stored/logged for manual fee distribution.

## Twitter API
- Pay-as-you-go tier, v2 API with OAuth 1.0a
- Primary: Filtered stream (real-time, cost-efficient)
- Fallback: Polling via userMentionTimeline
- Stream rule: `@YosokuAgent`

## Environment Variables
See `.env.example` for full reference.

## Decisions Log
| Decision | Choice | Why |
|----------|--------|-----|
| Polling vs streaming | Filtered stream | Real-time, cost-efficient |
| Persistence | JSON file | Zero-dependency, sufficient for low volume |
| Resolver type | Always UMA | WalletVote requires voter pubkeys — too complex for Twitter UX |
| On parse failure | Stay in TEMPLATE_SENT | Let user retry |

## Known Issues / TODOs
- [ ] DRY_RUN mode for testing without on-chain calls
- [ ] Unit tests for intent-detector and template-parser
- [ ] Create hackathon project on Colosseum
- [ ] Set up GitHub repo
- [ ] Demo video
