import { z } from "zod";
import { store } from "opentool/store";
import { wallet } from "opentool/wallet";
import {
  HyperliquidApiError,
  setHyperliquidPortfolioMargin,
} from "opentool/adapters/hyperliquid";
import type { WalletFullContext } from "opentool/wallet";

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
    "Enable/disable Hyperliquid portfolio margin (account unification mode) for a wallet or subaccount user address.",
};

export const schema = z.object({
  enabled: z.boolean().default(true),
  environment: z.enum(["mainnet", "testnet"]).default("testnet"),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const { enabled, environment } = schema.parse(body);

    const chainConfig = resolveChainConfig(environment);
    const context = await wallet({
      chain: chainConfig.chain,
    });

    const walletAddress = context.address;

    const result = await setHyperliquidPortfolioMargin({
      wallet: context as WalletFullContext,
      environment,
      enabled,
      user: walletAddress as `0x${string}`,
    });

    await store({
      source: "hyperliquid",
      ref: `portfolio-margin-${Date.now()}`,
      status: "submitted",
      walletAddress,
      action: "portfolio-margin",
      metadata: {
        environment,
        enabled,
        user: walletAddress as `0x${string}`,
        result,
      },
    });

    return Response.json({
      ok: true,
      environment,
      enabled,
      user: walletAddress as `0x${string}`,
      result,
    });
  } catch (error) {
    const message =
      error instanceof HyperliquidApiError
        ? error.message
        : error instanceof Error
        ? error.message
        : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
}
