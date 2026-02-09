const PATTERNS = [
  /create\s+(?:a\s+)?(?:prediction\s+)?market/i,
  /new\s+(?:prediction\s+)?market/i,
  /make\s+(?:a\s+)?(?:prediction\s+)?market/i,
];

export function detectIntent(text: string): { isCreateMarket: boolean } {
  // Strip @mentions
  const cleaned = text.replace(/@\w+/g, '').trim();
  const isCreateMarket = PATTERNS.some((p) => p.test(cleaned));
  return { isCreateMarket };
}
