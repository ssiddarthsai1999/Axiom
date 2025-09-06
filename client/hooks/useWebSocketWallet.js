import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import WebSocketService from './WebsocketService';

/**
 * Hook to manage WebSocket wallet connections
 * Automatically handles switching between public data (zero address) and user data
 */
export const useWebSocketWallet = () => {
  const { address, isConnected } = useAccount();
  const wsService = WebSocketService.getInstance();

  // Connect WebSocket with initial wallet address if available
  useEffect(() => {
    if (!wsService.isConnected) {
      wsService.connect(address);
    } else {
      // If WebSocket is already connected but we have a wallet address, update it
      if (address) {
        wsService.updateWalletAddress(address);
      }
    }
  }, []); // Only run once on mount

  useEffect(() => {
    // Update WebSocket service with current wallet address
    if (isConnected && address) {
      wsService.updateWalletAddress(address);
    } else {
      wsService.updateWalletAddress(null);
    }
  }, [isConnected, address, wsService]);

  return {
    currentWalletAddress: wsService.getCurrentWalletAddress(),
    isSubscribedToPublicData: wsService.isSubscribedToPublicData(),
    wsService
  };
};

export default useWebSocketWallet;
