import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAccount, useWalletClient } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';

// Import the fixed trading functions
// Note: In your actual app, import from '../utils/atomTrading'
const { buyAtomMarket, getAccountState, checkWalletCompatibility } = {
  buyAtomMarket: async (amount, signer, isMainnet) => {
    // Placeholder - use the actual import
    console.log('buyAtomMarket called with:', { amount, signer, isMainnet });
    return { status: 'ok', response: { data: { statuses: [{ filled: { avgPx: '10.25' } }] } } };
  },
  getAccountState: async (address, isMainnet) => {
    // Placeholder - use the actual import
    return { marginSummary: { accountValue: '1000', marginUsed: '100' } };
  },
  checkWalletCompatibility: (walletName) => true
};

const SimpleAtomTrader = ({ className = '' }) => {
  // State
  const [amount, setAmount] = useState('');
  const [isBuying, setIsBuying] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [accountData, setAccountData] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  // Wagmi hooks
  const { address, isConnected, connector } = useAccount();
  const { data: walletClient } = useWalletClient();
  const modal = useAppKit();

  // Check wallet compatibility
  useEffect(() => {
    if (connector?.name) {
      const isCompatible = checkWalletCompatibility(connector.name);
      if (!isCompatible) {
        setError('Your wallet may have issues with cross-chain signing. Consider using MetaMask with developer mode enabled.');
      }
    }
  }, [connector]);

  // Initialize wallet when connected
  useEffect(() => {
    if (isConnected && address && walletClient) {
      initializeWallet();
      loadAccountData();
    } else {
      setWallet(null);
      setAccountData(null);
    }
  }, [isConnected, address, walletClient]);

  const initializeWallet = async () => {
    try {
      console.log('🔄 Initializing wallet for ATOM trading...');
      
      // Create ethers provider and signer
      const provider = new ethers.BrowserProvider(walletClient.transport);
      const signer = await provider.getSigner();
      
      // Check if MetaMask and suggest developer mode
      if (connector?.name === 'MetaMask') {
        console.log('💡 MetaMask detected. If signing fails, enable developer mode in settings.');
      }
      
      setWallet({
        address: address,
        signer: signer,
        provider: provider,
        walletName: connector?.name || 'Unknown'
      });
      
      console.log('✅ Wallet initialized successfully');
      setError('');
      
    } catch (error) {
      console.error('❌ Wallet initialization failed:', error);
      setError('Failed to initialize wallet: ' + error.message);
    }
  };

  const loadAccountData = async () => {
    if (!address) return;
    
    try {
      console.log('🔄 Loading account data...');
      const accountState = await getAccountState(address, true);
      setAccountData(accountState);
      console.log('✅ Account data loaded');
    } catch (error) {
      console.error('❌ Failed to load account data:', error);
      // Don't show error for account data, as user might not be onboarded yet
    }
  };

  const connectWallet = async () => {
    try {
      modal.open();
    } catch (error) {
      console.error('Error opening wallet modal:', error);
      setError('Failed to open wallet connection');
    }
  };

  const handleBuyAtom = async () => {
    if (!wallet || !wallet.signer) {
      setError('Please connect your wallet first');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsBuying(true);
    setError('');
    setStatus('');

    try {
      console.log(`🚀 Starting ATOM market buy for ${amount} tokens...`);
      setStatus('🔄 Preparing cross-chain signature...');
      
      // Show different message based on wallet
      if (wallet.walletName === 'MetaMask') {
        setStatus('🔐 Please sign in MetaMask. Note: The request will show chainId 1337 - this is normal for Hyperliquid.');
      } else {
        setStatus('🔐 Please sign the transaction in your wallet...');
      }
      
      const result = await buyAtomMarket(parseFloat(amount), wallet.signer, true);
      
      console.log('✅ ATOM buy order result:', result);
      
      if (result && result.status === 'ok') {
        const orderData = result.response?.data;
        
        if (orderData?.statuses && orderData.statuses.length > 0) {
          const orderStatus = orderData.statuses[0];
          
          if (orderStatus.filled) {
            setStatus(`✅ Successfully bought ${amount} ATOM at $${orderStatus.filled.avgPx}!`);
          } else if (orderStatus.resting) {
            setStatus(`✅ ATOM buy order placed! Order ID: ${orderStatus.resting.oid}`);
          } else {
            setStatus(`✅ ATOM buy order placed successfully!`);
          }
        } else {
          setStatus(`✅ Successfully bought ${amount} ATOM!`);
        }
        
        // Clear amount and reload account data
        setAmount('');
        setTimeout(() => {
          loadAccountData();
        }, 2000);
        
      } else {
        throw new Error(result.response || 'Unknown error occurred');
      }
      
    } catch (error) {
      console.error('❌ ATOM buy error:', error);
      
      let errorMessage = error.message || 'Failed to buy ATOM';
      
      // Handle specific errors with better messages
      if (errorMessage.includes('User rejected') || errorMessage.includes('denied')) {
        errorMessage = 'Transaction was cancelled';
      } else if (errorMessage.includes('does not exist')) {
        errorMessage = 'Your wallet is not onboarded to Hyperliquid. Please visit app.hyperliquid.xyz to deposit USDC first.';
      } else if (errorMessage.includes('Insufficient margin')) {
        errorMessage = 'Insufficient USDC balance. Please deposit more USDC to Hyperliquid.';
      } else if (errorMessage.includes('chainId')) {
        errorMessage = 'Cross-chain signing failed. Try enabling developer mode in MetaMask settings: Settings → Advanced → Scroll down to "Show test networks"';
      }
      
      setError(errorMessage);
      
    } finally {
      setIsBuying(false);
    }
  };

  const getAccountValue = () => {
    if (!accountData?.marginSummary?.accountValue) return '0.00';
    return parseFloat(accountData.marginSummary.accountValue).toFixed(2);
  };

  const getAvailableMargin = () => {
    if (!accountData?.marginSummary) return '0.00';
    const accountValue = parseFloat(accountData.marginSummary.accountValue || 0);
    const marginUsed = parseFloat(accountData.marginSummary.marginUsed || 0);
    return (accountValue - marginUsed).toFixed(2);
  };

  return (
    <div className={`bg-gray-900 text-white p-6 rounded-lg max-w-md mx-auto ${className}`}>
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">ATOM Market Buy</h2>
        <p className="text-gray-400 text-sm">Trade ATOM-PERP on Hyperliquid</p>
      </div>

      {/* Connection Status */}
      {!isConnected ? (
        <div className="mb-6 p-4 bg-blue-900 bg-opacity-30 border border-blue-600 rounded">
          <p className="text-blue-400 text-sm mb-3">Connect your wallet to start trading ATOM</p>
          <button
            onClick={connectWallet}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <div className="mb-6 p-4 bg-green-900 bg-opacity-30 border border-green-600 rounded">
          <div className="flex justify-between items-center">
            <p className="text-green-400 text-sm">
              ✅ Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
            <span className="text-xs text-gray-400">{wallet?.walletName}</span>
          </div>
        </div>
      )}

      {/* Wallet Compatibility Warning */}
      {isConnected && wallet?.walletName === 'MetaMask' && (
        <div className="mb-4 p-3 bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded">
          <p className="text-yellow-400 text-xs">
            💡 Tip: If signing fails, enable "Show test networks" in MetaMask → Settings → Advanced
          </p>
        </div>
      )}

      {/* Account Info */}
      {isConnected && accountData && (
        <div className="mb-6 p-4 bg-gray-800 rounded">
          <h3 className="text-sm font-medium mb-2">Account Info</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Account Value:</span>
              <span>${getAccountValue()} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Available Margin:</span>
              <span>${getAvailableMargin()} USDC</span>
            </div>
          </div>
        </div>
      )}

      {/* Amount Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Amount (ATOM tokens)
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          step="0.001"
          min="0"
          className="w-full p-3 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          disabled={!isConnected || isBuying}
        />
        <p className="text-xs text-gray-500 mt-1">
          Market order - executes at best available price
        </p>
      </div>

      {/* Quick Amount Buttons */}
      <div className="mb-6">
        <p className="text-sm font-medium mb-2">Quick amounts:</p>
        <div className="grid grid-cols-4 gap-2">
          {['0.1', '0.5', '1.0', '5.0'].map((quickAmount) => (
            <button
              key={quickAmount}
              onClick={() => setAmount(quickAmount)}
              disabled={!isConnected || isBuying}
              className="py-2 px-3 bg-gray-700 hover:bg-gray-600 text-sm rounded transition-colors disabled:opacity-50"
            >
              {quickAmount}
            </button>
          ))}
        </div>
      </div>

      {/* Buy Button */}
      <button
        onClick={handleBuyAtom}
        disabled={!isConnected || !amount || parseFloat(amount) <= 0 || isBuying}
        className={`w-full py-3 px-4 rounded font-medium transition-colors ${
          !isConnected || !amount || parseFloat(amount) <= 0 || isBuying
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
      >
        {isBuying ? '🔄 Processing...' : `Buy ${amount || '0'} ATOM (Market)`}
      </button>

      {/* Status Messages */}
      {status && (
        <div className="mt-4 p-3 bg-green-900 bg-opacity-30 border border-green-600 rounded">
          <p className="text-green-400 text-sm">{status}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-900 bg-opacity-30 border border-red-600 rounded">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Advanced Options */}
      <div className="mt-6">
        <button
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
          className="text-xs text-gray-400 hover:text-gray-300"
        >
          {showAdvancedOptions ? '▼' : '▶'} Advanced Info
        </button>
        
        {showAdvancedOptions && (
          <div className="mt-3 p-3 bg-gray-800 rounded text-xs text-gray-400">
            <p className="mb-2">• Hyperliquid uses chainId 1337 for trading signatures</p>
            <p className="mb-2">• Your wallet stays connected to Arbitrum (chainId 42161)</p>
            <p className="mb-2">• The SDK handles the cross-chain signing automatically</p>
            <p>• Market orders use IOC (Immediate-or-Cancel) with high limit price</p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-6 p-4 bg-gray-800 rounded">
        <h3 className="text-sm font-medium mb-2">How it works:</h3>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• Connect any wallet (stays on Arbitrum)</li>
          <li>• Our SDK handles the cross-chain signing</li>
          <li>• Orders execute at current market price</li>
          <li>• Requires USDC deposited in Hyperliquid</li>
        </ul>
      </div>

      {/* Onboard Link */}
      {isConnected && !accountData && (
        <div className="mt-4 p-3 bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded">
          <p className="text-yellow-400 text-sm mb-2">
            First time? Deposit USDC to start trading.
          </p>
          <a
            href="https://app.hyperliquid.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-sm underline"
          >
            🚀 Go to Hyperliquid App
          </a>
        </div>
      )}
    </div>
  );
};

export default SimpleAtomTrader;