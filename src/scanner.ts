import axios from 'axios';
import { Token } from './types';
import { config } from './config';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

/**
 * Fetch trending Solana tokens from DexScreener
 * Filters by liquidity, age, and volume criteria
 */
export async function scanForCandidates(): Promise<Token[]> {
  console.log('🔍 Scanning for token candidates...');

  try {
    // Get top Solana pairs by volume
    const response = await axios.get(`${DEXSCREENER_API}/tokens/solana`, {
      timeout: 10000,
    });

    const pairs = response.data?.pairs || [];
    const now = new Date();
    const candidates: Token[] = [];

    for (const pair of pairs) {
      try {
        // Age filter: token must be >24 hours old
        const pairCreatedAt = new Date(pair.pairCreatedAt || 0);
        const ageHours = (now.getTime() - pairCreatedAt.getTime()) / (1000 * 60 * 60);
        if (ageHours < config.minTokenAgeHours) continue;

        // Liquidity filter: >$1M USD
        const liquidityUsd = pair.liquidity?.usd || 0;
        if (liquidityUsd < config.minLiquidityUsd) continue;

        // Volume filter: must have meaningful 24h volume
        const volume24h = pair.volume?.h24 || 0;
        if (volume24h < 100000) continue; // at least $100k daily volume

        // Price change in last few hours — look for upward momentum
        const priceChange4h = pair.priceChange?.h6 || 0; // use 6h as proxy for 4h
        if (priceChange4h <= 0) continue; // must be going up

        candidates.push({
          address: pair.baseToken?.address || '',
          symbol: pair.baseToken?.symbol || 'UNKNOWN',
          name: pair.baseToken?.name || 'Unknown Token',
          liquidityUsd,
          volume24h,
          volume4h: pair.volume?.h6 || 0, // 6h as proxy
          priceUsd: parseFloat(pair.priceUsd || '0'),
          priceChangePercent4h: priceChange4h,
          createdAt: pairCreatedAt,
        });

      } catch (err) {
        // Skip malformed pairs
        continue;
      }
    }

    console.log(`📊 Found ${candidates.length} candidates after filtering`);
    return candidates;

  } catch (err) {
    console.error('❌ Scanner error:', err);
    return [];
  }
}

/**
 * Check if a token is breaking resistance
 * Uses price action: 4h price > previous 4h high
 */
export function isBreakingResistance(token: Token): boolean {
  // A token breaking resistance will show strong positive price change
  // with accelerating momentum
  return token.priceChangePercent4h > 5; // >5% move in 4-6h = momentum signal
}

/**
 * Check buy volume dominance
 * Strong buy volume = volume trend is upward and price is following
 */
export function hasStrongBuyVolume(token: Token): boolean {
  // Volume-to-liquidity ratio as a proxy for buy pressure
  const volumeToLiquidity = token.volume4h / token.liquidityUsd;
  return volumeToLiquidity > 0.1; // volume is >10% of liquidity in 4h = strong
}
