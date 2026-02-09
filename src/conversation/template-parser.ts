import { PublicKey } from '@solana/web3.js';
import { MarketParams, ResolverTypeConfig } from './types';

interface ParseResult {
  success: boolean;
  params?: MarketParams;
  feeReceiverWallet?: string;
  errors: string[];
  needsImage?: boolean;
}

function extractField(text: string, label: string): string | undefined {
  // Try line-start match first, then anywhere in text
  const lineRegex = new RegExp(`^\\s*${label}:\\s*(.+)`, 'im');
  const lineMatch = text.match(lineRegex);
  if (lineMatch) return lineMatch[1].trim();

  // Fallback: match anywhere (for single-line tweets)
  const anyRegex = new RegExp(`(?:^|\\s)${label}:\\s*(.+?)(?=\\s+(?:Q|CAT|END|WALLET|DESC|RULES|RESOLVER):| *$)`, 'is');
  const anyMatch = text.match(anyRegex);
  return anyMatch ? anyMatch[1].trim() : undefined;
}

const MAX_QUESTION_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_RULES_LENGTH = 500;
const MAX_CATEGORY_LENGTH = 50;

function sanitizeText(text: string): string {
  // Remove null bytes, control chars (except newlines), and trim
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function isValidBase58PublicKey(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

function parseResolverType(raw: string | undefined): { resolver: ResolverTypeConfig; errors: string[] } {
  if (!raw || raw.toLowerCase() === 'uma') {
    return { resolver: { type: 'uma' }, errors: [] };
  }

  // Custom resolver: comma-separated list of Solana pubkeys
  const addresses = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const errors: string[] = [];
  const validVoters: string[] = [];

  for (const addr of addresses) {
    if (isValidBase58PublicKey(addr)) {
      validVoters.push(addr);
    } else {
      errors.push(`Invalid resolver wallet: ${addr}`);
    }
  }

  if (validVoters.length === 0 && errors.length === 0) {
    errors.push('RESOLVER must be "UMA" or a comma-separated list of Solana wallet addresses');
  }

  if (errors.length > 0) {
    return { resolver: { type: 'uma' }, errors };
  }

  return { resolver: { type: 'walletVote', voters: validVoters }, errors: [] };
}

export function parseTemplate(text: string, hasImage: boolean = false): ParseResult {
  const errors: string[] = [];

  // Strip @mentions
  const cleaned = text.replace(/@\w+/g, '').trim();

  const question = extractField(cleaned, 'Q');
  const category = extractField(cleaned, 'CAT');
  const endDateStr = extractField(cleaned, 'END');
  const wallet = extractField(cleaned, 'WALLET');
  const description = extractField(cleaned, 'DESC');
  const rules = extractField(cleaned, 'RULES');
  const resolverRaw = extractField(cleaned, 'RESOLVER');

  if (!question) {
    errors.push('Q (question) is required');
  } else if (sanitizeText(question).length > MAX_QUESTION_LENGTH) {
    errors.push(`Q must be under ${MAX_QUESTION_LENGTH} characters`);
  }
  if (!category) {
    errors.push('CAT (category) is required');
  } else if (sanitizeText(category).length > MAX_CATEGORY_LENGTH) {
    errors.push(`CAT must be under ${MAX_CATEGORY_LENGTH} characters`);
  }
  if (description && sanitizeText(description).length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`DESC must be under ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  if (rules && sanitizeText(rules).length > MAX_RULES_LENGTH) {
    errors.push(`RULES must be under ${MAX_RULES_LENGTH} characters`);
  }

  if (!endDateStr) {
    errors.push('END (end date) is required');
  } else {
    const parsed = new Date(endDateStr + 'T23:59:59Z');
    if (isNaN(parsed.getTime())) {
      errors.push('END must be a valid date (YYYY-MM-DD)');
    } else if (parsed <= new Date()) {
      errors.push('END must be a future date');
    }
  }

  if (!wallet) {
    errors.push('WALLET (Solana wallet address) is required');
  } else if (!isValidBase58PublicKey(wallet)) {
    errors.push('WALLET must be a valid Solana wallet address');
  }

  if (!hasImage) {
    errors.push('Please attach an image to your tweet for the market thumbnail');
  }

  const { resolver, errors: resolverErrors } = parseResolverType(resolverRaw);
  errors.push(...resolverErrors);

  if (errors.length > 0) {
    return { success: false, errors, needsImage: !hasImage };
  }

  return {
    success: true,
    params: {
      question: sanitizeText(question!),
      category: sanitizeText(category!),
      endDate: endDateStr!,
      description: description ? sanitizeText(description) : undefined,
      rules: rules ? sanitizeText(rules) : undefined,
      resolverType: resolver,
    },
    feeReceiverWallet: wallet!,
    errors: [],
  };
}

export function buildTemplateReply(username: string): string {
  return `@${username} To create a market, reply with an image and:\n\nQ: [Your yes/no question]\nCAT: [Category e.g. crypto, sports]\nEND: [YYYY-MM-DD]\nWALLET: [Your Solana wallet]\n\nOptional:\nDESC: [Description]\nRULES: [Resolution rules]\nRESOLVER: [UMA (default) or wallet1,wallet2,...]`;
}
