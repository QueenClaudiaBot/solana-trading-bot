import axios from 'axios';
import { config } from './config';
import { PortfolioState, Position } from './types';

const enabled = () => !!config.telegramBotToken && config.telegramBotToken !== 'YOUR_BOT_TOKEN_HERE';

async function send(message: string): Promise<void> {
  if (!enabled()) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
      {
        chat_id: config.telegramChatId,
        text: message,
        parse_mode: 'HTML',
      },
      { timeout: 10000 }
    );
  } catch (err: any) {
    console.error('❌ Telegram send failed:', err?.message);
  }
}

export async function alertBotStarted(): Promise<void> {
  await send(
    `👑 <b>Queen Claudia Bot Started</b>\n\n` +
    `🟢 Bot is live and monitoring markets\n` +
    `📊 Scan interval: every 25s\n` +
    `🔍 Position checks: every 10s\n` +
    `💰 Starting capital: £${config.startingCapitalGbp}\n` +
    `⚙️ Max positions: ${config.maxPositions} × £${config.maxPositionSizeGbp}`
  );
}

export async function alertBotRestarted(reason: string): Promise<void> {
  await send(
    `🔄 <b>Queen Claudia Bot Restarted</b>\n\n` +
    `Reason: ${reason}\n` +
    `🟢 Resuming from saved state...`
  );
}

export async function alertPositionOpened(position: Position): Promise<void> {
  await send(
    `📈 <b>Position Opened</b>\n\n` +
    `Token: <b>${position.tokenSymbol}</b>\n` +
    `Entry price: $${position.entryPriceUsd.toFixed(6)}\n` +
    `Amount: £${position.entryAmountGbp.toFixed(2)}\n` +
    `🛑 Stop loss: $${position.stopLossPrice.toFixed(6)} (-${config.stopLossPercent}%)\n` +
    `🎯 Take profit: $${position.takeProfitPrice.toFixed(6)} (+${config.takeProfitPercent}%)`
  );
}

export async function alertPositionClosed(position: Position): Promise<void> {
  const emoji = (position.pnlGbp || 0) >= 0 ? '✅' : '❌';
  const reasonEmoji = position.closeReason === 'take_profit' ? '🎯' :
    position.closeReason === 'stop_loss' ? '🛑' : '🔵';

  await send(
    `${emoji} <b>Position Closed</b>\n\n` +
    `Token: <b>${position.tokenSymbol}</b>\n` +
    `${reasonEmoji} Reason: ${position.closeReason?.replace('_', ' ').toUpperCase()}\n` +
    `Entry: $${position.entryPriceUsd.toFixed(6)}\n` +
    `Exit: $${position.currentPriceUsd.toFixed(6)}\n` +
    `P&L: <b>${(position.pnlGbp || 0) >= 0 ? '+' : ''}£${(position.pnlGbp || 0).toFixed(2)} (${(position.pnlPercent || 0).toFixed(2)}%)</b>`
  );
}

export async function alertPortfolioStop(state: PortfolioState): Promise<void> {
  await send(
    `🚨 <b>PORTFOLIO STOP TRIGGERED</b>\n\n` +
    `${state.haltReason}\n\n` +
    `💰 Capital remaining: £${state.currentCapitalGbp.toFixed(2)}\n` +
    `📉 Total loss: £${Math.abs(state.totalPnlGbp).toFixed(2)}\n\n` +
    `⛔ Bot has halted all trading.\n` +
    `Send /resume to restart trading.`
  );
}

export async function alertHeartbeat(state: PortfolioState, solPrice: number): Promise<void> {
  const openPos = state.openPositions.map(p => {
    const pnlPct = ((p.currentPriceUsd - p.entryPriceUsd) / p.entryPriceUsd * 100).toFixed(2);
    return `  • ${p.tokenSymbol}: ${parseFloat(pnlPct) >= 0 ? '+' : ''}${pnlPct}%`;
  }).join('\n') || '  None';

  await send(
    `💓 <b>Heartbeat</b> — ${new Date().toUTCString()}\n\n` +
    `🤖 Bot status: ${state.isHalted ? '🛑 HALTED' : '🟢 Running'}\n` +
    `💲 SOL price: $${solPrice.toFixed(2)}\n` +
    `💰 Capital: £${state.currentCapitalGbp.toFixed(2)} / £${state.startingCapitalGbp}\n` +
    `📊 Total P&L: ${state.totalPnlGbp >= 0 ? '+' : ''}£${state.totalPnlGbp.toFixed(2)} (${state.totalPnlPercent.toFixed(2)}%)\n` +
    `📂 Open positions (${state.openPositions.length}/${config.maxPositions}):\n${openPos}`
  );
}

export async function alertCriticalError(error: string): Promise<void> {
  await send(
    `💥 <b>CRITICAL ERROR</b>\n\n` +
    `${error}\n\n` +
    `⚠️ Bot may have stopped. Please check immediately.`
  );
}

export async function sendDailyReport(state: PortfolioState, solPrice: number): Promise<void> {
  const today = new Date().toLocaleDateString('en-GB');
  const todaysClosed = state.closedPositions.filter(p => {
    const closed = new Date(p.openedAt);
    return closed.toLocaleDateString('en-GB') === today;
  });

  const wins = todaysClosed.filter(p => (p.pnlGbp || 0) > 0).length;
  const losses = todaysClosed.filter(p => (p.pnlGbp || 0) <= 0).length;
  const winRate = todaysClosed.length > 0 ? ((wins / todaysClosed.length) * 100).toFixed(0) : 'N/A';
  const todayPnl = todaysClosed.reduce((sum, p) => sum + (p.pnlGbp || 0), 0);

  const bestTrade = todaysClosed.sort((a, b) => (b.pnlPercent || 0) - (a.pnlPercent || 0))[0];
  const worstTrade = todaysClosed.sort((a, b) => (a.pnlPercent || 0) - (b.pnlPercent || 0))[0];

  await send(
    `📊 <b>Daily Performance Report — ${today}</b>\n\n` +
    `💲 SOL price: $${solPrice.toFixed(2)}\n` +
    `💰 Portfolio value: £${state.currentCapitalGbp.toFixed(2)}\n` +
    `📈 Total P&L: ${state.totalPnlGbp >= 0 ? '+' : ''}£${state.totalPnlGbp.toFixed(2)} (${state.totalPnlPercent.toFixed(2)}%)\n\n` +
    `<b>Today's trading:</b>\n` +
    `  Trades closed: ${todaysClosed.length}\n` +
    `  Wins: ${wins} | Losses: ${losses}\n` +
    `  Win rate: ${winRate}%\n` +
    `  Today's P&L: ${todayPnl >= 0 ? '+' : ''}£${todayPnl.toFixed(2)}\n\n` +
    (bestTrade ? `🏆 Best trade: ${bestTrade.tokenSymbol} +${(bestTrade.pnlPercent || 0).toFixed(2)}%\n` : '') +
    (worstTrade && worstTrade !== bestTrade ? `📉 Worst trade: ${worstTrade.tokenSymbol} ${(worstTrade.pnlPercent || 0).toFixed(2)}%\n` : '') +
    `\n🤖 Bot status: ${state.isHalted ? '🛑 HALTED' : '🟢 Running'}`
  );
}
