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

  useEffect(() => {
    // Update WebSocket service with current wallet address
    if (isConnected && address) {
      console.log('🔗 Wallet connected, updating WebSocket subscriptions:', address);
      wsService.updateWalletAddress(address);
    } else {
      console.log('🔌 Wallet disconnected, switching to public data');
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
