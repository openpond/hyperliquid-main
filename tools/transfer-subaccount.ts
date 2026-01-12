import { wallet, WalletFullContext } from "opentool/wallet";
import { transferHyperliquidSubAccount } from "opentool/adapters/hyperliquid";
import { z } from "zod";
import { store } from "opentool/store";

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
    "Transfer USDC between main account and a Hyperliquid sub-account.",
};

export const schema = z.object({
  subAccountUser: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "subAccountUser must be a 0x-prefixed address"),
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v >= 0, "amount must be non-negative"),
  direction: z.enum(["deposit", "withdraw"]).default("deposit"),
  environment: z.enum(["mainnet", "testnet"]).default("testnet"),
});

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ ok: false, error: parsed.error.flatten() }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }
  const { subAccountUser, amount, direction, environment } = parsed.data;

  const chainConfig = resolveChainConfig(environment);
  const ctx = await wallet({
    chain: chainConfig.chain,
  });

  const result = await transferHyperliquidSubAccount({
    wallet: ctx as WalletFullContext,
    environment,
    subAccountUser: subAccountUser as `0x${string}`,
    isDeposit: direction === "deposit",
    usd: amount,
  });

  await store({
    source: "hyperliquid",
    ref: `${environment}-subaccount-transfer-${Date.now()}`,
    status: "submitted",
    walletAddress: ctx.address,
    action: "subaccount-transfer",
    network: environment === "mainnet" ? "hyperliquid" : "hyperliquid-testnet",
    metadata: {
      environment,
      subAccountUser,
      direction,
      amount,
      result,
    },
  });

  return Response.json({
    ok: true,
    environment,
    subAccountUser,
    direction,
    amount,
    result,
  });
}
