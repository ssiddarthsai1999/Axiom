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

  // Connect WebSocket and manage wallet address
  useEffect(() => {
    if (!wsService.isConnected) {
      // Only connect if we have a valid address or if we explicitly want to connect to public data
      if (address && isConnected) {
        wsService.connect(address);
      } else {
        // Connect to public data if no wallet address
        wsService.connect();
      }
    } else {
      // If WebSocket is already connected, update wallet address based on connection status
      if (isConnected && address) {
        wsService.updateWalletAddress(address);
      } else {
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
