"use client";

import { wagmiAdapter, projectId } from "@/config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { mainnet, arbitrum } from "@reown/appkit/networks";
import { cookieToInitialState, WagmiProvider } from "wagmi";
import { getBaseUrl } from "@/utils/getBaseUrl";
// 1. Create query client for caching
const queryClient = new QueryClient();
const BASE_URL= getBaseUrl()
// 2. Check for Reown Cloud project ID
if (!projectId) {
    throw new Error("Project ID is not defined");
}

// 3. Set your app metadata
const metadata = {
    name: "Ascend App",
    description: "Login with Web3 or Socials",
    url: `${BASE_URL}`, // Must match your actual domain in prod
    icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

// 4. Create AppKit modal
const modal = createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks: [mainnet, arbitrum],
    defaultNetwork: mainnet,
    metadata,
    features: {
        socials: [""],
        email: false,
        auth: false,
        analytics: true,
        emailShowWallets: true, // default to true
    },
});

// 5. Final exported provider
export function AppKitProvider({ children, cookies = null }) {
    const initialState = cookieToInitialState(
        wagmiAdapter.wagmiConfig,
        cookies
    );

    return (
        <WagmiProvider
            config={wagmiAdapter.wagmiConfig}
            initialState={initialState}
        >
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </WagmiProvider>
    );
}