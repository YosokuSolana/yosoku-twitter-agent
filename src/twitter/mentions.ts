import { TwitterApi, TweetStream, TweetV2SingleStreamResult, TTweetv2Expansion, TTweetv2TweetField } from 'twitter-api-v2';
import { config } from '../config';
import { logger } from '../logger';

const STREAM_PARAMS = {
  'tweet.fields': ['author_id', 'conversation_id', 'in_reply_to_user_id', 'referenced_tweets', 'created_at', 'attachments'] as TTweetv2TweetField[],
  'media.fields': ['url', 'preview_image_url', 'type'] as any[],
  expansions: ['author_id', 'attachments.media_keys'] as TTweetv2Expansion[],
};

export async function setupStreamRules(bearerClient: TwitterApi): Promise<void> {
  const rules = await bearerClient.v2.streamRules();
  if (rules.data?.length) {
    await bearerClient.v2.updateStreamRules({
      delete: { ids: rules.data.map((r) => r.id) },
    });
  }
  await bearerClient.v2.updateStreamRules({
    add: [{ value: `@YosokuAgent`, tag: 'mentions' }],
  });
  logger.info('stream_rules_configured');
}

export async function connectStream(
  bearerClient: TwitterApi
): Promise<TweetStream<TweetV2SingleStreamResult>> {
  const stream = await bearerClient.v2.searchStream(STREAM_PARAMS);
  stream.autoReconnect = true;
  stream.autoReconnectRetries = Infinity;

  stream.on('connected', () => logger.info('stream_connected'));
  stream.on('reconnected', () => logger.info('stream_reconnected'));
  stream.on('connection error', (err) =>
    logger.error('stream_connection_error', { error: err?.message ?? String(err) })
  );

  return stream;
}

// Fallback: polling via userMentionTimeline
export async function pollMentions(
  client: TwitterApi,
  sinceId?: string | null
): Promise<{ tweets: any[]; newestId?: string; includes?: any }> {
  try {
    const timeline = await client.v2.userMentionTimeline(config.twitter.botUserId, {
      ...STREAM_PARAMS,
      max_results: 100,
      ...(sinceId ? { since_id: sinceId } : {}),
    } as any);

    const tweets = timeline.data?.data ?? [];
    const includes = timeline.includes ?? timeline.data?.includes;
    const newestId = tweets.length > 0 ? tweets[0].id : sinceId ?? undefined;
    return { tweets, newestId, includes };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('poll_mentions_error', { error: message });
    return { tweets: [], newestId: sinceId ?? undefined, includes: undefined };
  }
}
