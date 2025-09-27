import React, { useState, useEffect } from 'react';
import { transferUSDC } from '@/utils/hyperLiquidSDK';

const TransferModal = ({ isOpen, onClose, webData2Data, spotData, userAddress, signer, isMainnet = true }) => {
  const [transferDirection, setTransferDirection] = useState('perpsToSpot'); // 'perpsToSpot' or 'spotToPerps'
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Calculate max amounts from websocket data
  const getMaxAmounts = () => {
    let maxPerps = 0;
    let maxSpot = 0;

    // Get max from perps (clearinghouseState)
    if (webData2Data?.clearinghouseState?.withdrawable) {
      maxPerps = parseFloat(webData2Data.clearinghouseState.withdrawable);
    }

    // Get max from spot (spotState)
    if (spotData?.balances) {
      const usdcBalance = spotData.balances.find(balance => balance.coin === 'USDC');
      if (usdcBalance) {
        maxSpot = parseFloat(usdcBalance.total);
      }
    }

    return { maxPerps, maxSpot };
  };

  const { maxPerps, maxSpot } = getMaxAmounts();
  const currentMax = transferDirection === 'perpsToSpot' ? maxPerps : maxSpot;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setError('');
      setTransferDirection('perpsToSpot');
    }
  }, [isOpen]);

  const handleAmountChange = (e) => {
    const value = e.target.value;
    if (value === '' || (!isNaN(value) && parseFloat(value) >= 0)) {
      setAmount(value);
      setError('');
    }
  };

  const handleMaxClick = () => {
    setAmount(currentMax.toString());
  };

  const handleTransfer = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (parseFloat(amount) > currentMax) {
      setError(`Amount exceeds maximum available (${currentMax.toFixed(2)} USDC)`);
      return;
    }

    if (!signer) {
      setError('Wallet not connected. Please connect your wallet first.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await transferUSDC(
        signer,
        transferDirection === 'perpsToSpot',
        parseFloat(amount),
        isMainnet
      );

      if (result.status === 'ok') {
        // Success - close modal and reset form
        onClose();
        setAmount('');
      } else {
        setError(result.response?.data?.status?.error || 'Transfer failed');
      }
    } catch (err) {
      console.error('Transfer error:', err);
      setError(err.message || 'Transfer failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#1A202C] rounded-lg p-6 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-semibold">Transfer USDC</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 text-xl"
          >
            ×
          </button>
        </div>

        {/* Description */}
        <p className="text-gray-400 text-sm mb-6">
          Transfer USDC between your Perps and Spot balances.
        </p>

        {/* Transfer Direction Selector */}
        <div className="flex items-center justify-center mb-6">
          <div className="flex items-center bg-[#2D3748] rounded-lg p-1">
            <button
              onClick={() => setTransferDirection('perpsToSpot')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                transferDirection === 'perpsToSpot'
                  ? 'bg-[#00D4AA] text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Perps
            </button>
            <div className="mx-2 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <button
              onClick={() => setTransferDirection('spotToPerps')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                transferDirection === 'spotToPerps'
                  ? 'bg-[#00D4AA] text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Spot
            </button>
          </div>
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0"
              className="w-full bg-[#2D3748] border border-[#4A5568] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#00D4AA]"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">

              <button
                onClick={handleMaxClick}
                className="text-[#00D4AA] text-sm font-medium hover:text-[#00B894]"
              >
                MAX
              </button>
              <span className="text-[#00D4AA] text-sm font-medium">
                {currentMax.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Confirm Button */}
        <button
          onClick={handleTransfer}
          disabled={isLoading || !amount || parseFloat(amount) <= 0 || !signer}
          className="w-full bg-[#00D4AA] hover:bg-[#00B894] disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          {isLoading ? 'Processing...' : !signer ? 'Wallet Not Connected' : 'Confirm'}
        </button>
      </div>
    </div>
  );
};

export default TransferModal;
