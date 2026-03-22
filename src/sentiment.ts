import axios from 'axios';
import { SentimentScore } from './types';

/**
 * Fetch social sentiment for a token using LunarCrush public data
 * Falls back to neutral if unavailable
 */
export async function getSentiment(tokenSymbol: string): Promise<SentimentScore> {
  try {
    // LunarCrush has a free tier for social sentiment
    // For now we use a simple heuristic based on trending data
    const response = await axios.get(
      `https://lunarcrush.com/api4/public/coins/list/v1`,
      {
        params: { symbol: tokenSymbol },
        timeout: 5000,
      }
    );

    const data = response.data?.data?.[0];
    if (!data) return neutralSentiment();

    // Galaxy score 0-100: >50 = positive, <50 = negative
    const galaxyScore = data.galaxy_score || 50;
    const score = (galaxyScore - 50) / 50; // normalize to -1 to +1
    const mentions = data.social_volume_24h || 0;

    return {
      score,
      mentions,
      source: 'lunarcrush',
    };

  } catch (err) {
    // Sentiment unavailable — return neutral, don't block trade
    return neutralSentiment();
  }
}

function neutralSentiment(): SentimentScore {
  return { score: 0, mentions: 0, source: 'unavailable' };
}

/**
 * Is sentiment positive enough to proceed?
 * We require at least neutral (>= 0) — negative sentiment blocks trades
 */
export function isPositiveSentiment(sentiment: SentimentScore): boolean {
  // If data unavailable, allow trade (don't block on missing data)
  if (sentiment.source === 'unavailable') return true;
  return sentiment.score >= 0;
}
