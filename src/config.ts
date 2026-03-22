import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // RPC
  rpcUrl: process.env.HELIUS_RPC_URL || '',

  // Wallet
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY || '',

  // Capital rules
  startingCapitalGbp: parseFloat(process.env.STARTING_CAPITAL_GBP || '150'),
  maxPositionSizeGbp: parseFloat(process.env.MAX_POSITION_SIZE_GBP || '15'),
  maxPositions: parseInt(process.env.MAX_POSITIONS || '3'),

  // Risk rules
  stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || '15'),
  takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || '30'),
  portfolioStopPercent: parseFloat(process.env.PORTFOLIO_STOP_PERCENT || '30'),

  // Token filters
  minLiquidityUsd: parseFloat(process.env.MIN_LIQUIDITY_USD || '1000000'),
  minTokenAgeHours: parseFloat(process.env.MIN_TOKEN_AGE_HOURS || '24'),
  volumeLookbackHours: parseFloat(process.env.VOLUME_LOOKBACK_HOURS || '4'),

  // Scan interval (ms)
  scanIntervalMs: 60 * 1000, // every 60 seconds
};

export function validateConfig(): void {
  if (!config.rpcUrl) throw new Error('HELIUS_RPC_URL is required');
  if (!config.walletPrivateKey) throw new Error('WALLET_PRIVATE_KEY is required');
  console.log('✅ Config validated');
}
