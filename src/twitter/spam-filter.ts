import { TwitterApi } from 'twitter-api-v2';
import { config } from '../config';
import { logger } from '../logger';

const USER_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_HOUR = 3;

export async function passesSpamFilter(
  client: TwitterApi,
  userId: string,
  username: string,
  tweetId: string
): Promise<boolean> {
  try {
    // Per-user rate limit: max 3 market creation requests per hour
    const now = Date.now();
    const userLimit = USER_RATE_LIMIT.get(userId);
    if (userLimit) {
      if (now < userLimit.resetAt) {
        if (userLimit.count >= MAX_REQUESTS_PER_HOUR) {
          logger.info('user_rate_limited', { userId, username, tweetId });
          return false;
        }
        userLimit.count++;
      } else {
        USER_RATE_LIMIT.set(userId, { count: 1, resetAt: now + 3600_000 });
      }
    } else {
      USER_RATE_LIMIT.set(userId, { count: 1, resetAt: now + 3600_000 });
    }

    const { data } = await client.v2.user(userId, {
      'user.fields': ['public_metrics', 'verified', 'verified_type'],
    });

    const metrics = data.public_metrics;
    if (!metrics) {
      logger.warn('spam_filter_no_metrics', { userId, username, tweetId });
      return false;
    }

    const followers = metrics.followers_count ?? 0;
    const tweets = metrics.tweet_count ?? 0;
    const isVerified = (data as any).verified === true;

    if (followers < config.spamFilter.minFollowers || tweets < config.spamFilter.minTweets) {
      logger.info('spam_filtered', {
        userId,
        username,
        tweetId,
        followers: String(followers),
        tweets: String(tweets),
        minFollowers: String(config.spamFilter.minFollowers),
        minTweets: String(config.spamFilter.minTweets),
      });
      return false;
    }

    // Require verified account if configured
    if (config.spamFilter.requireVerified && !isVerified) {
      logger.info('spam_filtered_not_verified', { userId, username, tweetId });
      return false;
    }

    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('spam_filter_error', { userId, username, tweetId, error: message });
    return false;
  }
}
