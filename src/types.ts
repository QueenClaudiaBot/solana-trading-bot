export interface Token {
  address: string;
  symbol: string;
  name: string;
  liquidityUsd: number;
  volume24h: number;
  volume4h: number;
  priceUsd: number;
  priceChangePercent4h: number;
  createdAt: Date;
  sentiment?: SentimentScore;
}

export interface SentimentScore {
  score: number;       // -1 (negative) to +1 (positive)
  mentions: number;
  source: string;
}

export interface Position {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  entryPriceUsd: number;
  entryAmountGbp: number;
  entryAmountSol: number;
  currentPriceUsd: number;
  openedAt: Date;
  stopLossPrice: number;
  takeProfitPrice: number;
  status: 'open' | 'closed';
  closeReason?: 'stop_loss' | 'take_profit' | 'manual' | 'portfolio_stop';
  pnlGbp?: number;
  pnlPercent?: number;
}

export interface PortfolioState {
  startingCapitalGbp: number;
  currentCapitalGbp: number;
  openPositions: Position[];
  closedPositions: Position[];
  totalPnlGbp: number;
  totalPnlPercent: number;
  isHalted: boolean;
  haltReason?: string;
}

export interface TradeSignal {
  token: Token;
  action: 'buy' | 'sell';
  reason: string[];
  confidence: number; // 0-1
}
