import { z } from "zod";
import { wallet, WalletFullContext } from "opentool/wallet";
import { store } from "opentool/store";
import {
  cancelHyperliquidOrders,
  cancelHyperliquidOrdersByCloid,
} from "opentool/adapters/hyperliquid";

function resolveChainConfig(environment: "mainnet" | "testnet") {
  return environment === "mainnet"
    ? { chain: "arbitrum", rpcUrl: process.env.ARBITRUM_RPC_URL }
    : {
        chain: "arbitrum-sepolia",
        rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL,
      };
}

export const profile = {
  description:
    "Cancel a Hyperliquid order by oid or client order id (cloid). Logs to store.",
};

export const schema = z.object({
  oid: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/, "oid must be a positive integer"),
  ]).optional(),
  cloid: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "cloid must be a 0x-prefixed hex string")
    .optional(),
  symbol: z.string().min(1, "symbol is required").default("BTC-USD"),
  environment: z.enum(["mainnet", "testnet"]).default("testnet"),
});

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { oid, cloid, symbol, environment } = schema.parse(body);

  if (!oid && !cloid) {
    return Response.json(
      { ok: false, error: "oid or cloid is required" },
      { status: 400 }
    );
  }

  const chainConfig = resolveChainConfig(environment);
  const ctx = await wallet({
    chain: chainConfig.chain,
    rpcUrl: chainConfig.rpcUrl ?? process.env.RPC_URL,
  });

  let result: unknown;
  if (cloid) {
    result = await cancelHyperliquidOrdersByCloid({
      wallet: ctx as WalletFullContext,
      environment,
      cancels: [{ symbol, cloid: cloid as `0x${string}` }],
    });
  } else {
    const numericOid = typeof oid === "string" ? Number.parseInt(oid, 10) : oid;
    result = await cancelHyperliquidOrders({
      wallet: ctx as WalletFullContext,
      environment,
      cancels: [{ symbol, oid: numericOid! }],
    });
  }

  await store({
    source: "hyperliquid",
    ref: (cloid ?? oid ?? "").toString(),
    status: "cancelled",
    walletAddress: ctx.address,
    action: "order",
    metadata: { symbol, cancelled: cloid ?? oid, environment },
  });

  return Response.json({ ok: true, result });
}
