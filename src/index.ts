import { config } from './config';
import { logger } from './logger';
import { createTwitterClient, createBearerClient } from './twitter/client';
import { setupStreamRules, connectStream, pollMentions } from './twitter/mentions';
import { createSolanaClient } from './solana/client';
import { JsonStore } from './store/json-store';
import { ConversationManager } from './conversation/manager';

async function main(): Promise<void> {
  logger.info('starting', { rpcUrl: config.solana.rpcUrl });

  const twitterClient = createTwitterClient();
  const bearerClient = createBearerClient();
  const solanaClient = createSolanaClient();
  const store = new JsonStore();
  const manager = new ConversationManager(twitterClient, solanaClient, store);

  // Expire stale conversations every 60s
  const expiryInterval = setInterval(() => manager.expireStaleConversations(), 60_000);

  // Force polling mode — stream is unreliable on pay-as-you-go tier
  const usePolling = true;

  if (usePolling) {
    logger.info('polling_mode_started', { intervalMs: String(config.mentionPollIntervalMs) });

    const shutdown = () => {
      logger.info('shutting_down');
      clearInterval(expiryInterval);
      store.save();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    const poll = async () => {
      try {
        const sinceId = store.getLastMentionId();
        logger.debug('polling', { sinceId: sinceId ?? 'none' });
        const { tweets, newestId, includes } = await pollMentions(twitterClient, sinceId);
        logger.debug('poll_result', { count: String(tweets.length), newestId: newestId ?? 'none' });

        if (newestId) store.setLastMentionId(newestId);

        for (const tweet of tweets.reverse()) {
          if (tweet.author_id === config.twitter.botUserId) continue;
          // Resolve username from includes or fetch
          const author = includes?.users?.find((u: any) => u.id === tweet.author_id);
          let username = author?.username ?? 'unknown';
          if (username === 'unknown') {
            try {
              const { data } = await twitterClient.v2.user(tweet.author_id!);
              username = data.username;
            } catch { /* use unknown */ }
          }
          await manager.processTweet(tweet, username, includes);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('poll_error', { error: message, stack: err instanceof Error ? err.stack : undefined });
      }
    };

    await poll();
    setInterval(poll, config.mentionPollIntervalMs);

    // Keep alive
    await new Promise(() => {});
  }
}

main().catch((err) => {
  logger.error('fatal', { error: err instanceof Error ? err.message : String(err), stack: err?.stack });
  process.exit(1);
});
