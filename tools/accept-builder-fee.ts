import { z } from "zod";
import { store } from "opentool/store";
import { wallet } from "opentool/wallet";
import {
  approveHyperliquidBuilderFee,
  recordHyperliquidBuilderApproval,
  type HyperliquidEnvironment,
} from "opentool/adapters/hyperliquid";

function resolveChainConfig(environment: HyperliquidEnvironment) {
  return environment === "mainnet"
    ? { chain: "arbitrum", rpcUrl: process.env.ARBITRUM_RPC_URL }
    : {
        chain: "arbitrum-sepolia",
        rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL,
      };
}

export const profile = {
  description:
    "Accept the Hyperliquid builder fee (signs and submits a max builder fee approval for the configured Turnkey wallet).",
};

export const schema = z.object({
  environment: z.enum(["mainnet", "testnet"]).default("testnet"),
});

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { environment } = schema.parse(body);

  const chainConfig = resolveChainConfig(environment);
  const context = await wallet({
    chain: chainConfig.chain,
  });

  const approval = await approveHyperliquidBuilderFee({
    environment,
    wallet: context,
  });

  await recordHyperliquidBuilderApproval({
    environment,
    walletAddress: context.address,
  });

  await store({
    source: "hyperliquid",
    ref: `${environment}-builder-${Date.now()}`,
    status: "submitted",
    walletAddress: context.address,
    action: "builder-approval",
  });

  return Response.json({
    ok: true,
    environment,
    walletAddress: context.address,
    approval,
  });
}
