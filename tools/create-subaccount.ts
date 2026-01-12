import { z } from "zod";
import { wallet, type WalletFullContext } from "opentool/wallet";
import { createHyperliquidSubAccount } from "opentool/adapters/hyperliquid";
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
  description: "Create a Hyperliquid sub-account for the configured wallet.",
};

export const schema = z.object({
  name: z.string().min(1, "name is required").default(() => `subaccount-${Date.now()}`),
  environment: z.enum(["mainnet", "testnet"]).default("testnet"),
});

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { name, environment } = schema.parse(body);

  const chainConfig = resolveChainConfig(environment);
  const ctx = await wallet({
    chain: chainConfig.chain,
  });

  const result = await createHyperliquidSubAccount({
    wallet: ctx as WalletFullContext,
    environment,
    name,
  });

  await store({
    source: "hyperliquid",
    ref: `${environment}-subaccount-${Date.now()}`,
    status: "submitted",
    walletAddress: ctx.address,
    action: "subaccount-create",
    network: environment === "mainnet" ? "hyperliquid" : "hyperliquid-testnet",
    metadata: { environment, name, result },
  });

  return Response.json({
    ok: true,
    environment,
    name,
    walletAddress: ctx.address,
    result,
  });
}
