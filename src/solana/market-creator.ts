import { PredMarketClient, parsePredMarketError } from 'yosoku';
import { MarketParams } from '../conversation/types';
import { logger } from '../logger';

interface CreateResult {
  success: boolean;
  marketId?: string;
  marketPda?: string;
  signatures?: string[];
  error?: string;
}

export async function createMarket(
  client: PredMarketClient,
  params: MarketParams
): Promise<CreateResult> {
  try {
    logger.info('market_creating', {
      question: params.question,
      category: params.category,
      endDate: params.endDate,
    });

    const endDateObj = new Date(params.endDate + 'T23:59:59Z');

    // Build resolver type for SDK
    let resolverType: any = { type: 'uma' };
    if (params.resolverType?.type === 'walletVote') {
      const { PublicKey } = require('@solana/web3.js');
      resolverType = {
        type: 'walletVote',
        voters: params.resolverType.voters.map((v: string) => new PublicKey(v)),
      };
    }

    const result = await client.markets.createRegularMarket({
      name: params.question,
      category: params.category,
      marketQuestion: params.question,
      eventDeadline: endDateObj,
      description: params.description,
      rules: params.rules,
      imageUri: params.imageUri,
      resolverType,
    });

    const marketPda = result.marketPda?.toString?.() ?? result.marketPda;
    const marketId = result.marketId?.toString?.() ?? result.marketId;
    const signatures = result.signatures ?? [];

    logger.info('market_created', {
      marketId: String(marketId),
      marketPda: String(marketPda),
    });

    return {
      success: true,
      marketId: String(marketId),
      marketPda: String(marketPda),
      signatures: signatures.map(String),
    };
  } catch (err: unknown) {
    let errorMsg: string;
    try {
      const parsed = parsePredMarketError(err);
      errorMsg = parsed?.message ?? (err instanceof Error ? err.message : String(err));
    } catch {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    logger.error('market_creation_failed', {
      error: errorMsg,
      stack: err instanceof Error ? err.stack : undefined,
    });

    return { success: false, error: errorMsg };
  }
}
