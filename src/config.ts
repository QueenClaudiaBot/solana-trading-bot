import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // RPC
  rpcUrl: process.env.HELIUS_RPC_URL || '',

  // Wallet
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY || '',

  // Telegram
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',

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

  // Intervals (ms)
  marketScanIntervalMs: parseInt(process.env.MARKET_SCAN_INTERVAL_MS || '25000'),
  positionCheckIntervalMs: parseInt(process.env.POSITION_CHECK_INTERVAL_MS || '10000'),
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '300000'),

  // Daily report time (UTC)
  dailyReportHour: 6,
};

export function validateConfig(): void {
  if (!config.rpcUrl) throw new Error('HELIUS_RPC_URL is required');
  if (!config.walletPrivateKey || config.walletPrivateKey === 'YOUR_PRIVATE_KEY_HERE') {
    throw new Error('WALLET_PRIVATE_KEY is required');
  }
  if (!config.telegramBotToken || config.telegramBotToken === 'YOUR_BOT_TOKEN_HERE') {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set — alerts disabled');
  }
  console.log('✅ Config validated');
}
