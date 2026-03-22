import { Token, TradeSignal } from './types';
import { isBreakingResistance, hasStrongBuyVolume } from './scanner';
import { getSentiment, isPositiveSentiment } from './sentiment';
import { config } from './config';

/**
 * Evaluate a token and generate a trade signal
 * All criteria must pass for a BUY signal
 */
export async function evaluateToken(token: Token): Promise<TradeSignal | null> {
  const reasons: string[] = [];
  let confidence = 0;

  // --- FILTER 1: Liquidity ---
  if (token.liquidityUsd < config.minLiquidityUsd) return null;
  reasons.push(`✅ Liquidity: $${(token.liquidityUsd / 1_000_000).toFixed(2)}M`);
  confidence += 0.2;

  // --- FILTER 2: Token age ---
  const ageHours = (Date.now() - token.createdAt.getTime()) / (1000 * 60 * 60);
  if (ageHours < config.minTokenAgeHours) return null;
  reasons.push(`✅ Age: ${ageHours.toFixed(0)}h old`);
  confidence += 0.1;

  // --- FILTER 3: Strong buy volume ---
  if (!hasStrongBuyVolume(token)) return null;
  reasons.push(`✅ Strong buy volume: $${(token.volume4h / 1000).toFixed(0)}k in 4h`);
  confidence += 0.25;

  // --- FILTER 4: Breaking resistance ---
  if (!isBreakingResistance(token)) return null;
  reasons.push(`✅ Breaking resistance: +${token.priceChangePercent4h.toFixed(2)}% momentum`);
  confidence += 0.25;

  // --- FILTER 5: Positive sentiment ---
  const sentiment = await getSentiment(token.symbol);
  token.sentiment = sentiment;
  if (!isPositiveSentiment(sentiment)) {
    reasons.push(`❌ Negative sentiment: ${sentiment.score.toFixed(2)}`);
    return null;
  }
  if (sentiment.source !== 'unavailable') {
    reasons.push(`✅ Positive sentiment: ${sentiment.score.toFixed(2)} (${sentiment.mentions} mentions)`);
    confidence += 0.2;
  } else {
    reasons.push(`⚠️  Sentiment unavailable (proceeding)`);
    confidence += 0.1;
  }

  return {
    token,
    action: 'buy',
    reasons,
    confidence,
  };
}

/**
 * Should we sell? Check stop loss and take profit
 */
export function shouldSell(
  currentPrice: number,
  entryPrice: number,
  stopLossPrice: number,
  takeProfitPrice: number
): { sell: boolean; reason: string } {
  if (currentPrice <= stopLossPrice) {
    const loss = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2);
    return { sell: true, reason: `Stop loss hit: ${loss}%` };
  }

  if (currentPrice >= takeProfitPrice) {
    const gain = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2);
    return { sell: true, reason: `Take profit hit: +${gain}%` };
  }

  return { sell: false, reason: '' };
}
