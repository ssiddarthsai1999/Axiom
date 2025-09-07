import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import WebSocketService from './WebsocketService';

/**
 * Hook to manage WebSocket wallet connections
 * Automatically handles switching between public data (zero address) and user data
 * Ensures only one WebSocket connection is created regardless of how many components use this hook
 */
export const useWebSocketWallet = () => {
  const { address, isConnected } = useAccount();
  const wsService = WebSocketService.getInstance();
  const hasInitialized = useRef(false);

  // Connect WebSocket and manage wallet address - only initialize once
  useEffect(() => {
    // Prevent multiple initialization calls from different components
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      
      if (!wsService.isConnected) {
        // Only connect if we have a valid address or if we explicitly want to connect to public data
        if (address && isConnected) {
          wsService.connect(address);
        } else {
          // Connect to public data if no wallet address
          wsService.connect();
        }
      }
    }
    
    // Always update wallet address when it changes, even if connection already exists
    if (wsService.isConnected) {
      if (isConnected && address) {
        wsService.updateWalletAddress(address);
      } else if (!isConnected && wsService.getCurrentWalletAddress()) {
        wsService.updateWalletAddress(null);
      }
    }
  }, [isConnected, address, wsService]); // Run when connection status or address changes

  return {
    currentWalletAddress: wsService.getCurrentWalletAddress(),
    isSubscribedToPublicData: wsService.isSubscribedToPublicData(),
    wsService
  };
};

export default useWebSocketWallet;
