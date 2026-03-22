import { Position, PortfolioState } from './types';
import { config } from './config';
import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(__dirname, '../data/portfolio.json');

/**
 * Load portfolio state from disk (persists across restarts)
 */
export function loadPortfolio(): PortfolioState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('⚠️  Could not load portfolio state, starting fresh');
  }

  return {
    startingCapitalGbp: config.startingCapitalGbp,
    currentCapitalGbp: config.startingCapitalGbp,
    openPositions: [],
    closedPositions: [],
    totalPnlGbp: 0,
    totalPnlPercent: 0,
    isHalted: false,
  };
}

/**
 * Save portfolio state to disk
 */
export function savePortfolio(state: PortfolioState): void {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Check if portfolio stop loss has been triggered
 * Halts bot if total loss exceeds 30%
 */
export function checkPortfolioStop(state: PortfolioState): boolean {
  const lossPercent = ((state.startingCapitalGbp - state.currentCapitalGbp) / state.startingCapitalGbp) * 100;
  if (lossPercent >= config.portfolioStopPercent) {
    state.isHalted = true;
    state.haltReason = `Portfolio stop triggered: ${lossPercent.toFixed(2)}% loss (limit: ${config.portfolioStopPercent}%)`;
    console.error(`🛑 PORTFOLIO STOP TRIGGERED: ${state.haltReason}`);
    return true;
  }
  return false;
}

/**
 * Can we open a new position?
 */
export function canOpenPosition(state: PortfolioState): boolean {
  if (state.isHalted) return false;
  if (state.openPositions.length >= config.maxPositions) return false;
  if (state.currentCapitalGbp < config.maxPositionSizeGbp) return false;
  return true;
}

/**
 * Open a new position
 */
export function openPosition(
  state: PortfolioState,
  tokenAddress: string,
  tokenSymbol: string,
  entryPriceUsd: number,
  amountGbp: number,
  solPrice: number
): Position {
  const amountSol = (amountGbp / solPrice);
  const stopLossPrice = entryPriceUsd * (1 - config.stopLossPercent / 100);
  const takeProfitPrice = entryPriceUsd * (1 + config.takeProfitPercent / 100);

  const position: Position = {
    id: `pos_${Date.now()}`,
    tokenAddress,
    tokenSymbol,
    entryPriceUsd,
    entryAmountGbp: amountGbp,
    entryAmountSol: amountSol,
    currentPriceUsd: entryPriceUsd,
    openedAt: new Date(),
    stopLossPrice,
    takeProfitPrice,
    status: 'open',
  };

  state.openPositions.push(position);
  state.currentCapitalGbp -= amountGbp;

  console.log(`📈 Opened position: ${tokenSymbol} @ $${entryPriceUsd}`);
  console.log(`   Stop loss: $${stopLossPrice.toFixed(6)} | Take profit: $${takeProfitPrice.toFixed(6)}`);

  return position;
}

/**
 * Close a position (stop loss, take profit, or manual)
 */
export function closePosition(
  state: PortfolioState,
  positionId: string,
  currentPriceUsd: number,
  reason: Position['closeReason'],
  solPrice: number
): void {
  const idx = state.openPositions.findIndex(p => p.id === positionId);
  if (idx === -1) return;

  const position = state.openPositions[idx];
  const priceChangePercent = ((currentPriceUsd - position.entryPriceUsd) / position.entryPriceUsd) * 100;
  const returnAmountGbp = position.entryAmountGbp * (1 + priceChangePercent / 100);
  const pnlGbp = returnAmountGbp - position.entryAmountGbp;

  position.status = 'closed';
  position.closeReason = reason;
  position.currentPriceUsd = currentPriceUsd;
  position.pnlGbp = pnlGbp;
  position.pnlPercent = priceChangePercent;

  state.currentCapitalGbp += returnAmountGbp;
  state.totalPnlGbp += pnlGbp;
  state.totalPnlPercent = ((state.currentCapitalGbp - state.startingCapitalGbp) / state.startingCapitalGbp) * 100;

  state.openPositions.splice(idx, 1);
  state.closedPositions.push(position);

  const emoji = pnlGbp >= 0 ? '✅' : '❌';
  console.log(`${emoji} Closed ${position.tokenSymbol}: ${priceChangePercent.toFixed(2)}% | £${pnlGbp.toFixed(2)} | Reason: ${reason}`);
}

/**
 * Print portfolio summary
 */
export function printSummary(state: PortfolioState): void {
  console.log('\n📊 Portfolio Summary:');
  console.log(`   Capital: £${state.currentCapitalGbp.toFixed(2)} / £${state.startingCapitalGbp}`);
  console.log(`   Total P&L: £${state.totalPnlGbp.toFixed(2)} (${state.totalPnlPercent.toFixed(2)}%)`);
  console.log(`   Open positions: ${state.openPositions.length}/${config.maxPositions}`);
  if (state.isHalted) console.log(`   🛑 HALTED: ${state.haltReason}`);
  console.log('');
}
