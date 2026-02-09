import * as fs from 'fs';
import * as path from 'path';
import { Conversation } from '../conversation/types';

const MAX_PROCESSED_TWEETS = 10000;

interface StoreData {
  lastMentionId: string | null;
  conversations: Record<string, Conversation>;
  processedTweetIds: string[];
}

export class JsonStore {
  private data: StoreData;
  private processedSet: Set<string>;
  private filePath: string;

  constructor(filePath: string = './data/store.json') {
    this.filePath = filePath;
    this.data = this.load();
    this.processedSet = new Set(this.data.processedTweetIds);
  }

  private load(): StoreData {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { lastMentionId: null, conversations: {}, processedTweetIds: [] };
    }
  }

  save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  getLastMentionId(): string | null {
    return this.data.lastMentionId;
  }

  setLastMentionId(id: string): void {
    this.data.lastMentionId = id;
    this.save();
  }

  isProcessed(tweetId: string): boolean {
    return this.processedSet.has(tweetId);
  }

  markProcessed(tweetId: string): void {
    if (!this.processedSet.has(tweetId)) {
      this.processedSet.add(tweetId);
      this.data.processedTweetIds.push(tweetId);
      if (this.data.processedTweetIds.length > MAX_PROCESSED_TWEETS) {
        const removed = this.data.processedTweetIds.splice(0, this.data.processedTweetIds.length - MAX_PROCESSED_TWEETS);
        for (const id of removed) this.processedSet.delete(id);
      }
    }
    this.save();
  }

  getConversation(id: string): Conversation | undefined {
    return this.data.conversations[id];
  }

  getConversationByTemplateReplyTweetId(tweetId: string): Conversation | undefined {
    return Object.values(this.data.conversations).find(
      (c) => c.templateReplyTweetId === tweetId
    );
  }

  getAllConversations(): Conversation[] {
    return Object.values(this.data.conversations);
  }

  saveConversation(conversation: Conversation): void {
    this.data.conversations[conversation.id] = conversation;
    this.save();
  }

  /** Count markets created by a user */
  getUserMarketCount(userId: string): number {
    return Object.values(this.data.conversations).filter(
      (c) => c.userId === userId && (c.state === 'DONE' || c.state === 'CREATING_MARKET')
    ).length;
  }
}
