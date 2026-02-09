import { TwitterApi } from 'twitter-api-v2';
import { PredMarketClient } from 'yosoku';
import { Conversation, ConversationState } from './types';
import { detectIntent } from './intent-detector';
import { parseTemplate } from './template-parser';
import { passesSpamFilter } from '../twitter/spam-filter';
import { sendTemplate, sendSuccess, sendError, sendValidationError } from '../twitter/replies';
import { createMarket } from '../solana/market-creator';
import { getImageUrlFromTweet, downloadImage, uploadImageToIpfs } from '../twitter/image';
import { JsonStore } from '../store/json-store';
import { config } from '../config';
import { logger } from '../logger';
import * as crypto from 'crypto';

const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function genId(): string {
  return crypto.randomUUID();
}

export class ConversationManager {
  constructor(
    private twitterClient: TwitterApi,
    private solanaClient: PredMarketClient,
    private store: JsonStore
  ) {}

  async processTweet(tweet: any, authorUsername: string, includes?: any): Promise<void> {
    const tweetId = tweet.id;
    const authorId = tweet.author_id;
    const text = tweet.text ?? '';

    if (this.store.isProcessed(tweetId)) return;
    this.store.markProcessed(tweetId);

    logger.info('mention_received', {
      tweetId,
      userId: authorId,
      username: authorUsername,
      text,
    });

    // Check if this is a reply to one of our template tweets
    const referencedTweets = tweet.referenced_tweets ?? [];
    const repliedTo = referencedTweets.find((r: any) => r.type === 'replied_to');

    if (repliedTo) {
      const conversation = this.store.getConversationByTemplateReplyTweetId(repliedTo.id);
      if (conversation && conversation.state === ConversationState.TEMPLATE_SENT) {
        await this.handleFilledTemplate(conversation, tweet, authorUsername, includes);
        return;
      }
    }

    // Check if this tweet contains filled template fields (standalone submission)
    const { parseTemplate: tryParse } = require('./template-parser');
    const imageUrl = getImageUrlFromTweet(tweet, includes);
    const standalone = tryParse(text, !!imageUrl);
    if (standalone.success) {
      await this.handleStandaloneSubmission(tweet, authorId, authorUsername, standalone, imageUrl);
      return;
    }

    // New mention — check for create market intent
    const { isCreateMarket } = detectIntent(text);
    if (!isCreateMarket) return;

    await this.handleNewCreateRequest(tweet, authorId, authorUsername);
  }

  private async handleNewCreateRequest(
    tweet: any,
    userId: string,
    username: string
  ): Promise<void> {
    const tweetId = tweet.id;

    // Spam filter
    const passes = await passesSpamFilter(this.twitterClient, userId, username, tweetId);
    if (!passes) return;

    logger.info('intent_detected', { tweetId, userId, username });

    const replyTweetId = await sendTemplate(this.twitterClient, username, tweetId);
    if (!replyTweetId) return;

    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: genId(),
      triggerTweetId: tweetId,
      templateReplyTweetId: replyTweetId,
      userId,
      username,
      state: ConversationState.TEMPLATE_SENT,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + EXPIRY_MS).toISOString(),
    };

    this.store.saveConversation(conversation);
  }

  private async handleFilledTemplate(
    conversation: Conversation,
    tweet: any,
    username: string,
    includes?: any
  ): Promise<void> {
    const tweetId = tweet.id;
    const text = tweet.text ?? '';
    const imageUrl = getImageUrlFromTweet(tweet, includes);

    conversation.filledReplyTweetId = tweetId;
    conversation.updatedAt = new Date().toISOString();

    logger.info('template_received', {
      tweetId,
      conversationId: conversation.id,
      username,
    });

    const parsed = parseTemplate(text, !!imageUrl);

    if (!parsed.success) {
      logger.info('template_parse_failed', {
        tweetId,
        conversationId: conversation.id,
        errors: parsed.errors.join('; '),
      });
      await sendValidationError(this.twitterClient, username, tweetId, parsed.errors);
      // Keep TEMPLATE_SENT so user can retry
      this.store.saveConversation(conversation);
      return;
    }

    // Upload image to IPFS
    if (imageUrl) {
      try {
        logger.info('downloading_image', { tweetId, imageUrl });
        const imgBuffer = await downloadImage(imageUrl);
        const ipfsUri = await uploadImageToIpfs(imgBuffer);
        parsed.params!.imageUri = ipfsUri;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('image_upload_failed', { tweetId, error: msg });
        await sendError(this.twitterClient, username, tweetId, 'Failed to upload image. Please try again.');
        return;
      }
    }

    conversation.params = parsed.params;
    conversation.feeReceiverWallet = parsed.feeReceiverWallet;
    conversation.state = ConversationState.CREATING_MARKET;
    conversation.updatedAt = new Date().toISOString();
    this.store.saveConversation(conversation);

    logger.info('market_creating', {
      conversationId: conversation.id,
      question: parsed.params!.question,
      feeReceiverWallet: parsed.feeReceiverWallet,
    });

    const result = await createMarket(this.solanaClient, parsed.params!);

    if (result.success) {
      conversation.state = ConversationState.DONE;
      conversation.marketResult = {
        marketId: result.marketId!,
        marketPda: result.marketPda!,
        signatures: result.signatures!,
        url: `${config.marketBaseUrl}/${result.marketPda}`,
      };
      conversation.updatedAt = new Date().toISOString();
      this.store.saveConversation(conversation);

      logger.info('market_created', {
        conversationId: conversation.id,
        marketId: result.marketId,
        marketPda: result.marketPda,
        feeReceiverWallet: conversation.feeReceiverWallet,
      });

      await sendSuccess(
        this.twitterClient,
        username,
        tweetId,
        result.marketPda!,
        parsed.params!.question
      );
    } else {
      conversation.state = ConversationState.FAILED;
      conversation.errorMessage = result.error;
      conversation.updatedAt = new Date().toISOString();
      this.store.saveConversation(conversation);

      await sendError(this.twitterClient, username, tweetId, result.error ?? 'Unknown error');
    }
  }

  private async handleStandaloneSubmission(
    tweet: any,
    userId: string,
    username: string,
    parsed: any,
    imageUrl?: string
  ): Promise<void> {
    const tweetId = tweet.id;

    // Spam filter
    const passes = await passesSpamFilter(this.twitterClient, userId, username, tweetId);
    if (!passes) return;

    logger.info('standalone_template_received', { tweetId, userId, username });

    // Upload image to IPFS
    if (imageUrl) {
      try {
        logger.info('downloading_image', { tweetId, imageUrl });
        const imgBuffer = await downloadImage(imageUrl);
        const ipfsUri = await uploadImageToIpfs(imgBuffer);
        parsed.params!.imageUri = ipfsUri;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('image_upload_failed', { tweetId, error: msg });
        await sendError(this.twitterClient, username, tweetId, 'Failed to upload image. Please try again.');
        return;
      }
    }

    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: genId(),
      triggerTweetId: tweetId,
      filledReplyTweetId: tweetId,
      userId,
      username,
      state: ConversationState.CREATING_MARKET,
      params: parsed.params,
      feeReceiverWallet: parsed.feeReceiverWallet,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + EXPIRY_MS).toISOString(),
    };
    this.store.saveConversation(conversation);

    const result = await createMarket(this.solanaClient, parsed.params!);

    if (result.success) {
      conversation.state = ConversationState.DONE;
      conversation.marketResult = {
        marketId: result.marketId!,
        marketPda: result.marketPda!,
        signatures: result.signatures!,
        url: `${config.marketBaseUrl}/${result.marketPda}`,
      };
      conversation.updatedAt = new Date().toISOString();
      this.store.saveConversation(conversation);

      logger.info('market_created', {
        conversationId: conversation.id,
        marketId: result.marketId,
        marketPda: result.marketPda,
        feeReceiverWallet: conversation.feeReceiverWallet,
      });

      await sendSuccess(this.twitterClient, username, tweetId, result.marketPda!, parsed.params!.question);
    } else {
      conversation.state = ConversationState.FAILED;
      conversation.errorMessage = result.error;
      conversation.updatedAt = new Date().toISOString();
      this.store.saveConversation(conversation);

      await sendError(this.twitterClient, username, tweetId, result.error ?? 'Unknown error');
    }
  }

  expireStaleConversations(): void {
    const now = Date.now();
    for (const conv of this.store.getAllConversations()) {
      if (
        conv.state === ConversationState.TEMPLATE_SENT &&
        new Date(conv.expiresAt).getTime() <= now
      ) {
        conv.state = ConversationState.EXPIRED;
        conv.updatedAt = new Date().toISOString();
        this.store.saveConversation(conv);
        logger.info('conversation_expired', {
          conversationId: conv.id,
          username: conv.username,
        });
      }
    }
  }
}
