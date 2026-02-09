import 'dotenv/config';

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  twitter: {
    consumerKey: required('TWITTER_CONSUMER_KEY'),
    consumerSecret: required('TWITTER_CONSUMER_SECRET'),
    accessToken: required('TWITTER_ACCESS_TOKEN'),
    accessSecret: required('TWITTER_ACCESS_SECRET'),
    bearerToken: required('TWITTER_BEARER_TOKEN'),
    botUserId: required('TWITTER_BOT_USER_ID'),
  },
  solana: {
    rpcUrl: optional('SOLANA_RPC_URL', 'https://api.devnet.solana.com'),
    keypair: required('SOLANA_KEYPAIR'),
  },
  spamFilter: {
    minFollowers: parseInt(optional('MIN_FOLLOWERS', '100'), 10),
    minTweets: parseInt(optional('MIN_TWEETS', '100'), 10),
    requireVerified: optional('REQUIRE_VERIFIED', 'true') === 'true',
  },
  mentionPollIntervalMs: parseInt(optional('MENTION_POLL_INTERVAL_MS', '15000'), 10),
  marketBaseUrl: optional('MARKET_BASE_URL', 'https://yosoku.fun/markets'),
  logLevel: optional('LOG_LEVEL', 'info'),
};
