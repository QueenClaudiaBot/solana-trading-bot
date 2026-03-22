/**
 * Queen Claudia's Solana Trading Bot
 * Conservative momentum strategy with strict risk management
 * 
 * Strategy: Hybrid DCA + Momentum
 * - Scans for established tokens with strong momentum signals
 * - Applies 5-point entry filter (liquidity, age, volume, resistance, sentiment)
 * - Enforces hard stop loss (-15%) and take profit (+30%) on every trade
 * - Portfolio hard stop at -30% total loss
 */

import { validateConfig, config } from './config';
import { initTrader, getSolPriceUsd, getSolBalance, buyToken } from './trader';
import { scanForCandidates } from './scanner';
import { evaluateToken } from './strategy';
import {
  loadPortfolio,
  savePortfolio,
  checkPortfolioStop,
  canOpenPosition,
  openPosition,
  closePosition,
  printSummary,
} from './portfolio';
import { shouldSell } from './strategy';
import axios from 'axios';

const GBP_TO_USD = 1.27; // approximate — update periodically

async function getCurrentTokenPrice(tokenAddress: string): Promise<number | null> {
  try {
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { timeout: 5000 }
    );
    const pair = response.data?.pairs?.[0];
    return pair ? parseFloat(pair.priceUsd || '0') : null;
  } catch {
    return null;
  }
}

async function monitorPositions(portfolio: ReturnType<typeof loadPortfolio>, solPriceUsd: number): Promise<void> {
  for (const position of portfolio.openPositions) {
    const currentPrice = await getCurrentTokenPrice(position.tokenAddress);
    if (!currentPrice) continue;

    position.currentPriceUsd = currentPrice;
    const { sell, reason } = shouldSell(
      currentPrice,
      position.entryPriceUsd,
      position.stopLossPrice,
      position.takeProfitPrice,
    );

    if (sell) {
      console.log(`🔔 ${reason} for ${position.tokenSymbol}`);
      closePosition(portfolio, position.id, currentPrice, 
        currentPrice <= position.stopLossPrice ? 'stop_loss' : 'take_profit',
        solPriceUsd
      );
    }
  }
}

async function runCycle(): Promise<void> {
  const portfolio = loadPortfolio();

  // Check if bot is halted
  if (portfolio.isHalted) {
    console.log(`🛑 Bot halted: ${portfolio.haltReason}`);
    printSummary(portfolio);
    return;
  }

  // Check portfolio stop
  if (checkPortfolioStop(portfolio)) {
    savePortfolio(portfolio);
    return;
  }

  let solPriceUsd: number;
  try {
    solPriceUsd = await getSolPriceUsd();
    console.log(`💲 SOL price: $${solPriceUsd.toFixed(2)}`);
  } catch {
    console.error('❌ Could not get SOL price, skipping cycle');
    return;
  }

  // Monitor existing positions
  await monitorPositions(portfolio, solPriceUsd);

  // Scan for new opportunities if we can open positions
  if (canOpenPosition(portfolio)) {
    const candidates = await scanForCandidates();

    for (const candidate of candidates) {
      if (!canOpenPosition(portfolio)) break;

      // Skip if already holding this token
      const alreadyHolding = portfolio.openPositions.some(
        p => p.tokenAddress === candidate.address
      );
      if (alreadyHolding) continue;

      const signal = await evaluateToken(candidate);
      if (!signal || signal.confidence < 0.7) continue;

      console.log(`\n🎯 Signal: ${candidate.symbol} (confidence: ${(signal.confidence * 100).toFixed(0)}%)`);
      signal.reasons.forEach(r => console.log(`   ${r}`));

      // Execute buy
      const txid = await buyToken(
        candidate.address,
        candidate.symbol,
        config.maxPositionSizeGbp,
        solPriceUsd,
        GBP_TO_USD
      );

      if (txid) {
        openPosition(
          portfolio,
          candidate.address,
          candidate.symbol,
          candidate.priceUsd,
          config.maxPositionSizeGbp,
          solPriceUsd
        );
      }

      // Small delay between trades
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  printSummary(portfolio);
  savePortfolio(portfolio);
}

async function main(): Promise<void> {
  console.log('👑 Queen Claudia\'s Solana Trading Bot starting...');
  console.log('================================================');

  // Validate config
  validateConfig();

  // Init trader (wallet + RPC connection)
  initTrader();

  // Check wallet balance
  const balance = await getSolBalance();
  console.log(`💰 Wallet SOL balance: ${balance.toFixed(4)} SOL`);

  if (balance < 0.05) {
    console.warn('⚠️  Low SOL balance — please top up wallet before trading');
  }

  console.log(`\n⚙️  Bot settings:`);
  console.log(`   Max position: £${config.maxPositionSizeGbp}`);
  console.log(`   Max positions: ${config.maxPositions}`);
  console.log(`   Stop loss: -${config.stopLossPercent}%`);
  console.log(`   Take profit: +${config.takeProfitPercent}%`);
  console.log(`   Portfolio stop: -${config.portfolioStopPercent}%`);
  console.log(`   Scan interval: ${config.scanIntervalMs / 1000}s\n`);

  // Run first cycle immediately
  await runCycle();

  // Then run on interval
  setInterval(async () => {
    try {
      await runCycle();
    } catch (err) {
      console.error('❌ Cycle error:', err);
    }
  }, config.scanIntervalMs);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
