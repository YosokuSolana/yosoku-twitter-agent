export enum ConversationState {
  TEMPLATE_SENT = 'TEMPLATE_SENT',
  CREATING_MARKET = 'CREATING_MARKET',
  DONE = 'DONE',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export interface MarketParams {
  question: string;
  category: string;
  endDate: string;       // YYYY-MM-DD
  description?: string;
  rules?: string;
  imageUri?: string;
  resolverType: ResolverTypeConfig;
}

export type ResolverTypeConfig =
  | { type: 'uma' }
  | { type: 'walletVote'; voters: string[] };

export interface MarketResult {
  marketId: string;
  marketPda: string;
  signatures: string[];
  url: string;
}

export interface Conversation {
  id: string;                          // unique conversation ID
  triggerTweetId: string;              // original mention tweet
  templateReplyTweetId?: string;       // bot's template reply
  filledReplyTweetId?: string;         // user's filled template reply
  userId: string;
  username: string;
  state: ConversationState;
  params?: MarketParams;
  feeReceiverWallet?: string;
  marketResult?: MarketResult;
  errorMessage?: string;
  createdAt: string;                   // ISO 8601
  updatedAt: string;                   // ISO 8601
  expiresAt: string;                   // ISO 8601 (default: createdAt + 1 hour)
}
