# Yosoku Twitter Agent

Create Solana prediction markets by tweeting.

## How It Works

1. **Tweet** `@AgentYosoku create a market`
2. **Bot replies** with a fill-in template
3. **Reply** with the filled template + an image
4. **Bot creates** the market on-chain and replies with a tradeable link

Markets are live at [yosoku.fun](https://yosoku.fun).

## Template Fields

| Field | Required | Description |
|-------|----------|-------------|
| `Q:` | ✅ | Your yes/no question |
| `CAT:` | ✅ | Category (crypto, sports, politics, etc.) |
| `END:` | ✅ | Event deadline (YYYY-MM-DD) |
| `WALLET:` | ✅ | Your Solana wallet for fee collection |
| `IMAGE` | ✅ | Attach an image to your tweet |
| `DESC:` | ❌ | Description |
| `RULES:` | ❌ | Resolution rules |
| `RESOLVER:` | ❌ | UMA (default) or comma-separated wallet addresses |

## Stack

- **Solana** — On-chain prediction markets via [Yosoku SDK](https://www.npmjs.com/package/yosoku)
- **UMA Oracle** — Decentralized resolution
- **Twitter v2 API** — Real-time mention polling
- **IPFS** — Market thumbnail storage via Pinata

## Security

- Verified account requirement
- Min 100 followers / 100 tweets
- Per-user rate limiting (3 markets/hour)
- Input sanitization and field length limits
- Image size cap (5MB) with CDN-only downloads

## Setup

```bash
cp .env.example .env
# Fill in Twitter API creds and Solana keypair
npm install
npm run build
npm start
```

## Architecture

```
Tweet → Poll Mentions → Intent Detect → Spam Filter → Send Template
                                                            ↓
Reply with Template → Parse Fields → Upload Image → Create Market → Reply with URL
```

## Built For

[Colosseum Agent Hackathon 2026](https://colosseum.com/agent-hackathon) — $100k prize pool, 10 days, build on Solana.

## License

MIT
