/**
 * Queen Claudia's Solana Trading Bot
 * 
 * Requirements:
 * 1. Runs as continuous daemon (PM2)
 * 2. Scans markets every 20-30s
 * 3. Checks positions every 10s
 * 4. Auto-restarts via PM2/Docker on crash
 * 5. Heartbeat logs every 5 mins
 * 6. State file survives restarts
 * 7. Telegram alerts for all important events
 * 8. Daily performance report at 6am UTC via Telegram
 */

import { validateConfig, config } from './config';
import { initTrader, getSolPriceUsd, getSolBalance, buyToken } from './trader';
import { scanForCandidates } from './scanner';
import { evaluateToken, shouldSell } from './strategy';
import {
  loadPortfolio,
  savePortfolio,
  checkPortfolioStop,
  canOpenPosition,
  openPosition,
  closePosition,
  printSummary,
} from './portfolio';
import {
  alertBotStarted,
  alertBotRestarted,
  alertPositionOpened,
  alertPositionClosed,
  alertPortfolioStop,
  alertHeartbeat,
  alertCriticalError,
  sendDailyReport,
} from './telegram';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const GBP_TO_USD = 1.27;
const STATE_FLAG = path.join(__dirname, '../data/.last_start');

let solPriceUsd = 0;
let lastDailyReportDate = '';
let isFirstStart = true;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function refreshSolPrice(): Promise<void> {
  try {
    solPriceUsd = await getSolPriceUsd();
  } catch {
    console.warn('⚠️  Could not refresh SOL price');
  }
}

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

function writeHeartbeatLog(portfolio: ReturnType<typeof loadPortfolio>): void {
  const logDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const entry = {
    timestamp: new Date().toISOString(),
    status: portfolio.isHalted ? 'HALTED' : 'RUNNING',
    solPriceUsd,
    capitalGbp: portfolio.currentCapitalGbp,
    totalPnlGbp: portfolio.totalPnlGbp,
    totalPnlPercent: portfolio.totalPnlPercent,
    openPositions: portfolio.openPositions.length,
    closedPositions: portfolio.closedPositions.length,
  };

  const logFile = path.join(logDir, 'heartbeat.log');
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  console.log(`💓 Heartbeat logged @ ${entry.timestamp}`);
}

function detectRestart(): boolean {
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(STATE_FLAG)) {
    return true; // was previously running → this is a restart
  }
  fs.writeFileSync(STATE_FLAG, new Date().toISOString());
  return false;
}

// ─── Position monitor (every 10s) ───────────────────────────────────────────

async function monitorPositions(): Promise<void> {
  const portfolio = loadPortfolio();
  if (portfolio.openPositions.length === 0) return;

  let changed = false;
  for (const position of [...portfolio.openPositions]) {
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
      const closeReason = currentPrice <= position.stopLossPrice ? 'stop_loss' : 'take_profit';
      console.log(`🔔 ${reason} — closing ${position.tokenSymbol}`);
      closePosition(portfolio, position.id, currentPrice, closeReason, solPriceUsd);
      const closed = portfolio.closedPositions[portfolio.closedPositions.length - 1];
      await alertPositionClosed(closed);
      changed = true;
    }
  }

  if (changed) savePortfolio(portfolio);
}

// ─── Market scan (every 25s) ─────────────────────────────────────────────────

async function scanMarkets(): Promise<void> {
  const portfolio = loadPortfolio();

  if (portfolio.isHalted) return;

  // Check portfolio stop loss
  if (checkPortfolioStop(portfolio)) {
    savePortfolio(portfolio);
    await alertPortfolioStop(portfolio);
    return;
  }

  if (!canOpenPosition(portfolio)) return;

  const candidates = await scanForCandidates();

  for (const candidate of candidates) {
    if (!canOpenPosition(portfolio)) break;

    const alreadyHolding = portfolio.openPositions.some(
      p => p.tokenAddress === candidate.address
    );
    if (alreadyHolding) continue;

    const signal = await evaluateToken(candidate);
    if (!signal || signal.confidence < 0.7) continue;

    console.log(`\n🎯 Signal: ${candidate.symbol} (confidence: ${(signal.confidence * 100).toFixed(0)}%)`);
    signal.reasons.forEach(r => console.log(`   ${r}`));

    const txid = await buyToken(
      candidate.address,
      candidate.symbol,
      config.maxPositionSizeGbp,
      solPriceUsd,
      GBP_TO_USD
    );

    if (txid) {
      const position = openPosition(
        portfolio,
        candidate.address,
        candidate.symbol,
        candidate.priceUsd,
        config.maxPositionSizeGbp,
        solPriceUsd
      );
      savePortfolio(portfolio);
      await alertPositionOpened(position);
    }

    await new Promise(r => setTimeout(r, 2000));
  }
}

// ─── Heartbeat (every 5 mins) ────────────────────────────────────────────────

async function heartbeat(): Promise<void> {
  await refreshSolPrice();
  const portfolio = loadPortfolio();
  writeHeartbeatLog(portfolio);
  printSummary(portfolio);
  await alertHeartbeat(portfolio, solPriceUsd);
}

// ─── Daily report (6am UTC) ──────────────────────────────────────────────────

async function checkDailyReport(): Promise<void> {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  if (now.getUTCHours() === config.dailyReportHour && lastDailyReportDate !== todayKey) {
    lastDailyReportDate = todayKey;
    const portfolio = loadPortfolio();
    await sendDailyReport(portfolio, solPriceUsd);
    console.log('📊 Daily report sent');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('👑 Queen Claudia\'s Solana Trading Bot');
  console.log('======================================');

  try {
    validateConfig();
    initTrader();

    const isRestart = detectRestart();

    const balance = await getSolBalance();
    console.log(`💰 Wallet SOL balance: ${balance.toFixed(4)} SOL`);

    if (balance < 0.05) {
      console.warn('⚠️  Low SOL balance — please top up wallet before trading');
    }

    await refreshSolPrice();
    console.log(`💲 SOL price: $${solPriceUsd.toFixed(2)}`);

    const portfolio = loadPortfolio();
    console.log(`\n📂 State loaded: ${portfolio.openPositions.length} open positions`);

    console.log(`\n⚙️  Settings:`);
    console.log(`   Market scan: every ${config.marketScanIntervalMs / 1000}s`);
    console.log(`   Position check: every ${config.positionCheckIntervalMs / 1000}s`);
    console.log(`   Heartbeat: every ${config.heartbeatIntervalMs / 1000 / 60} mins`);
    console.log(`   Daily report: 06:00 UTC\n`);

    // Alert Telegram
    if (isRestart) {
      await alertBotRestarted('PM2/Docker auto-restart after crash or server reboot');
    } else {
      await alertBotStarted();
    }

    // ── Start intervals ──

    // Position monitor: every 10s
    setInterval(async () => {
      try {
        await monitorPositions();
      } catch (err: any) {
        console.error('❌ Position monitor error:', err?.message);
      }
    }, config.positionCheckIntervalMs);

    // Market scan: every 25s
    setInterval(async () => {
      try {
        await scanMarkets();
      } catch (err: any) {
        console.error('❌ Market scan error:', err?.message);
      }
    }, config.marketScanIntervalMs);

    // Heartbeat: every 5 mins
    setInterval(async () => {
      try {
        await heartbeat();
      } catch (err: any) {
        console.error('❌ Heartbeat error:', err?.message);
      }
    }, config.heartbeatIntervalMs);

    // Daily report check: every minute
    setInterval(async () => {
      try {
        await checkDailyReport();
      } catch (err: any) {
        console.error('❌ Daily report error:', err?.message);
      }
    }, 60 * 1000);

    // Run first cycles immediately
    await monitorPositions();
    await scanMarkets();

    console.log('✅ Bot running. Press Ctrl+C to stop (or use PM2).\n');

  } catch (err: any) {
    console.error('💥 Fatal startup error:', err?.message);
    await alertCriticalError(`Fatal startup error: ${err?.message}`);
    // Don't exit — let PM2 handle restart
    throw err;
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', async (err) => {
  console.error('💥 Uncaught exception:', err);
  await alertCriticalError(`Uncaught exception: ${err.message}`);
  // PM2 will restart us
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  console.error('💥 Unhandled rejection:', reason);
  await alertCriticalError(`Unhandled rejection: ${reason}`);
});

main().catch(async (err) => {
  await alertCriticalError(`Startup failed: ${err?.message}`);
  process.exit(1);
});
