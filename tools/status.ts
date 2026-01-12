import { z } from "zod";
import { store } from "opentool/store";
import { wallet } from "opentool/wallet";
import { fetchHyperliquidClearinghouseState } from "opentool/adapters/hyperliquid";

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
    "Check Hyperliquid clearinghouse state for the configured Turnkey wallet (confirms user existence).",
};

export const schema = z.object({
  environment: z.enum(["mainnet", "testnet"]).default("testnet"),
  subAccounts: z
    .array(z.string().regex(/^0x[a-fA-F0-9]{40}$/, "subAccount must be a 0x address"))
    .optional()
    .default([]),
});

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { environment, subAccounts } = schema.parse(body);

  const chainConfig = resolveChainConfig(environment);
  const context = await wallet({
    chain: chainConfig.chain,
  });

  const walletAddress = context.address;
  const snapshots = await Promise.all(
    [walletAddress, ...(subAccounts ?? [])].map(async (addr) => {
      const clearinghouse = await fetchHyperliquidClearinghouseState({
        environment,
        walletAddress: addr as `0x${string}`,
      });
      return { walletAddress: addr, clearinghouse };
    })
  );

  await store({
    source: "hyperliquid",
    ref: `status-${Date.now()}`,
    status: "submitted",
    walletAddress,
    action: "status",
    network: environment === "mainnet" ? "hyperliquid" : "hyperliquid-testnet",
    metadata: {
      environment,
      snapshots,
    },
  });

  return Response.json({
    ok: true,
    environment,
    walletAddress,
    snapshots,
  });
}
