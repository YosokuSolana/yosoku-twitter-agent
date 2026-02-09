import { TwitterApi } from 'twitter-api-v2';
import { config } from '../config';
import { logger } from '../logger';
import { buildTemplateReply } from '../conversation/template-parser';

export async function sendTemplate(
  client: TwitterApi,
  username: string,
  replyToId: string
): Promise<string | null> {
  try {
    const text = buildTemplateReply(username);
    const { data } = await client.v2.reply(text, replyToId);
    logger.info('template_sent', { tweetId: replyToId, replyTweetId: data.id, username });
    return data.id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('template_send_failed', { tweetId: replyToId, username, error: message });
    return null;
  }
}

export async function sendSuccess(
  client: TwitterApi,
  username: string,
  replyToId: string,
  marketPda: string,
  question: string
): Promise<void> {
  try {
    const url = `${config.marketBaseUrl}/${marketPda}`;
    const text = `@${username} Your prediction market is live!\n\n"${question}"\n\nTrade here: ${url}`;
    const { data } = await client.v2.reply(text, replyToId);
    logger.info('success_reply_sent', { tweetId: replyToId, replyTweetId: data.id, username, marketPda });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('success_reply_failed', { tweetId: replyToId, username, error: message });
  }
}

export async function sendError(
  client: TwitterApi,
  username: string,
  replyToId: string,
  errorMsg: string
): Promise<void> {
  try {
    const text = `@${username} Sorry, something went wrong creating your market: ${errorMsg}`;
    await client.v2.reply(text, replyToId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('error_reply_failed', { tweetId: replyToId, username, error: message });
  }
}

export async function sendValidationError(
  client: TwitterApi,
  username: string,
  replyToId: string,
  errors: string[]
): Promise<void> {
  try {
    const errorList = errors.map((e) => `• ${e}`).join('\n');
    const text = `@${username} Please fix these fields and reply again:\n${errorList}`;
    await client.v2.reply(text, replyToId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('validation_reply_failed', { tweetId: replyToId, username, error: message });
  }
}
