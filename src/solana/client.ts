import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { PredMarketClient } from 'yosoku';
import { config } from '../config';
import bs58 from 'bs58';

export function createSolanaClient(): PredMarketClient {
  const keypair = Keypair.fromSecretKey(bs58.decode(config.solana.keypair));
  const connection = new Connection(config.solana.rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  return PredMarketClient.fromProvider(provider as any);
}
