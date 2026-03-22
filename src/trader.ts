import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import axios from 'axios';
import bs58 from 'bs58';
import { config } from './config';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

let connection: Connection;
let wallet: Keypair;

export function initTrader(): void {
  connection = new Connection(config.rpcUrl, 'confirmed');
  const secretKey = bs58.decode(config.walletPrivateKey);
  wallet = Keypair.fromSecretKey(secretKey);
  console.log(`✅ Trader initialised | Wallet: ${wallet.publicKey.toBase58()}`);
}

/**
 * Get current SOL price in USD via Jupiter
 */
export async function getSolPriceUsd(): Promise<number> {
  try {
    const response = await axios.get(`${JUPITER_QUOTE_API}/quote`, {
      params: {
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: 1_000_000_000, // 1 SOL in lamports
        slippageBps: 50,
      },
      timeout: 10000,
    });
    const outAmount = parseInt(response.data.outAmount);
    return outAmount / 1_000_000; // USDC has 6 decimals
  } catch (err) {
    console.error('❌ Could not fetch SOL price');
    throw err;
  }
}

/**
 * Execute a swap via Jupiter
 * inputMint → outputMint for amountLamports
 */
export async function executeSwap(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  label: string
): Promise<string | null> {
  try {
    console.log(`🔄 Swapping ${label}...`);

    // 1. Get quote
    const quoteResponse = await axios.get(`${JUPITER_QUOTE_API}/quote`, {
      params: {
        inputMint,
        outputMint,
        amount: amountLamports,
        slippageBps: 100, // 1% slippage max
      },
      timeout: 10000,
    });

    // 2. Get swap transaction
    const swapResponse = await axios.post(`${JUPITER_QUOTE_API}/swap`, {
      quoteResponse: quoteResponse.data,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }, { timeout: 15000 });

    // 3. Deserialise and sign
    const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet]);

    // 4. Send
    const txid = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`✅ Swap sent: ${txid}`);
    return txid;

  } catch (err: any) {
    console.error(`❌ Swap failed (${label}):`, err?.response?.data || err?.message);
    return null;
  }
}

/**
 * Buy a token with SOL
 * amountGbp → converted to SOL → swap to token
 */
export async function buyToken(
  tokenMint: string,
  tokenSymbol: string,
  amountGbp: number,
  solPriceUsd: number,
  gbpToUsdRate: number = 1.27
): Promise<string | null> {
  const amountUsd = amountGbp * gbpToUsdRate;
  const amountSol = amountUsd / solPriceUsd;
  const amountLamports = Math.floor(amountSol * 1_000_000_000);

  console.log(`🛒 Buying ${tokenSymbol}: £${amountGbp} → ${amountSol.toFixed(4)} SOL → ${tokenMint}`);
  return executeSwap(SOL_MINT, tokenMint, amountLamports, `SOL → ${tokenSymbol}`);
}

/**
 * Sell all of a token back to SOL
 */
export async function sellToken(
  tokenMint: string,
  tokenSymbol: string,
  tokenAmount: number,
  tokenDecimals: number = 6
): Promise<string | null> {
  const amountRaw = Math.floor(tokenAmount * Math.pow(10, tokenDecimals));
  console.log(`💰 Selling ${tokenSymbol}: ${tokenAmount} tokens → SOL`);
  return executeSwap(tokenMint, SOL_MINT, amountRaw, `${tokenSymbol} → SOL`);
}

/**
 * Get wallet SOL balance
 */
export async function getSolBalance(): Promise<number> {
  const balance = await connection.getBalance(wallet.publicKey);
  return balance / 1_000_000_000;
}
