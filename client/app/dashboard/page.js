"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectUser,
  selectIsAuthenticated,
  selectIsLoading,
  selectAuthError,
  handleDashboardToken,
  logoutUser
} from "../../redux/slices/authSlice";

export default function Dashboard() {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector(selectUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isLoading = useSelector(selectIsLoading);
  const error = useSelector(selectAuthError);

  // Hydration state
  const [isMounted, setIsMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [referralCode, setReferralCode] = useState(null);
  const [isLoadingReferral, setIsLoadingReferral] = useState(false);
  const [referralError, setReferralError] = useState(null);
  
  // Apply referral state
  const [applyReferralCode, setApplyReferralCode] = useState('');
  const [isApplyingReferral, setIsApplyingReferral] = useState(false);
  const [applyReferralError, setApplyReferralError] = useState(null);
  const [applyReferralSuccess, setApplyReferralSuccess] = useState(false);

  console.log("user", user);

  // Handle client-side mounting
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch referral code from API
  const fetchReferralCode = async () => {
    if (!isMounted) return;
    
    setIsLoadingReferral(true);
    setReferralError(null);
    
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No auth token found');
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user/my-referrals`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token is invalid, logout user
          handleLogout();
          return;
        }
        throw new Error(`Failed to fetch referral code: ${response.status}`);
      }

      const data = await response.json();
      console.log('Referral code response:', data);
      
      // Handle the new API response format: { message, errors, data: { my_referral_code } }
      if (data.data && data.data.my_referral_code) {
        setReferralCode(data.data.my_referral_code);
      } else if (data.data && data.data.referral_code) {
        // Fallback for referral_code property
        setReferralCode(data.data.referral_code);
      } else if (data.referral_code) {
        // Fallback for direct referral_code property
        setReferralCode(data.referral_code);
      } else if (typeof data === 'string') {
        // Fallback for string response
        setReferralCode(data);
      } else {
        console.error('Unexpected response format:', data);
        throw new Error('Invalid response format - no referral code found');
      }
    } catch (error) {
      console.error('Error fetching referral code:', error);
      setReferralError(error.message);
    } finally {
      setIsLoadingReferral(false);
    }
  };

  useEffect(() => {
    if (!isMounted) return;
    
    // Check for access_token in URL (from OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');

    if (accessToken) {
      // Handle the token from URL
      dispatch(handleDashboardToken(accessToken))
        .unwrap()
        .then(() => {
          // Clean up URL by removing token
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
          // Fetch referral code after successful authentication
          fetchReferralCode();
        })
        .catch((error) => {
          console.error('Token handling failed:', error);
          router.push('/login');
        });
    } else if (!isAuthenticated && !isLoading) {
      // No token in URL and not authenticated, redirect to login
      router.push('/login');
    } else if (isAuthenticated && !isLoading) {
      // User is authenticated, fetch referral code
      fetchReferralCode();
    }
  }, [isMounted, dispatch, router, isAuthenticated, isLoading]);

  const handleLogout = () => {
    if (isMounted) {
      localStorage.removeItem('auth_token');
    }
    dispatch(logoutUser())
      .unwrap()
      .then(() => {
        router.push('/login');
      })
      .catch(() => {
        router.push('/login');
      });
  };

  const copyToClipboard = async () => {
    const codeToApply = referralCode || user?.referral_code;
    if (!codeToApply) return;
    
    try {
      await navigator.clipboard.writeText(codeToApply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Apply referral code function
  const applyReferral = async () => {
    if (!applyReferralCode.trim()) {
      setApplyReferralError('Please enter a referral code');
      return;
    }

    setIsApplyingReferral(true);
    setApplyReferralError(null);
    setApplyReferralSuccess(false);

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No auth token found');
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user/apply-referral`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          referral_code: applyReferralCode.trim()
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          return;
        }
        
        // Try to get error message from response
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.detail || `Failed to apply referral code: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Apply referral response:', data);
      
      setApplyReferralSuccess(true);
      setApplyReferralCode('');
      
      // Show success message for 3 seconds
      setTimeout(() => {
        setApplyReferralSuccess(false);
      }, 3000);

    } catch (error) {
      console.error('Error applying referral code:', error);
      setApplyReferralError(error.message);
    } finally {
      setIsApplyingReferral(false);
    }
  };

  const retryFetchReferral = () => {
    fetchReferralCode();
  };

  // Show loading while mounting or authenticating
  if (!isMounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-4 p-8 bg-white rounded-lg shadow-md">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
            <p className="text-red-600">{error}</p>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect to login
  }

  // Use API referral code if available, fallback to user object
  const displayReferralCode = referralCode || user?.referral_code;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {user.picture && (
                  <img
                    src={user.picture}
                    alt={user.name || 'User'}
                    className="w-8 h-8 rounded-full border border-gray-200"
                  />
                )}
                <div className="text-sm">
                  <p className="font-medium text-gray-900">{user.name || 'User'}</p>
                  <p className="text-gray-600">{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* User Information */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">User Information</h2>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Name</dt>
                  <dd className="mt-1 text-sm text-gray-900">{user.name}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">User ID</dt>
                  <dd className="mt-1 text-sm text-gray-900">{user.user_id}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Apply Referral Code */}
          <div className="mt-6">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Apply Referral Code</h2>
              
              {applyReferralSuccess ? (
                <div className="bg-green-100 border border-green-200 rounded-md p-4">
                  <p className="text-sm text-green-800">✓ Referral code applied successfully!</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center space-x-3">
                    <input
                      type="text"
                      value={applyReferralCode}
                      onChange={(e) => setApplyReferralCode(e.target.value)}
                      placeholder="Enter referral code"
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      disabled={isApplyingReferral}
                    />
                    <button
                      onClick={applyReferral}
                      disabled={isApplyingReferral || !applyReferralCode.trim()}
                      className={`px-6 py-3 rounded-md text-sm font-medium transition-colors ${
                        isApplyingReferral || !applyReferralCode.trim()
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {isApplyingReferral ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Applying...
                        </div>
                      ) : (
                        'Apply'
                      )}
                    </button>
                  </div>
                  
                  {applyReferralError && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3">
                      <p className="text-sm text-red-600">{applyReferralError}</p>
                    </div>
                  )}
                  
                  <p className="text-sm text-gray-600 mt-3">
                    Have a referral code? Enter it above to get rewards and benefits!
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Referral Code */}
          <div className="mt-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Your Referral Code</h2>
              
              {isLoadingReferral ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-600">Loading referral code...</span>
                  </div>
                </div>
              ) : referralError ? (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-red-800">Error loading referral code</h3>
                      <p className="text-sm text-red-600 mt-1">{referralError}</p>
                    </div>
                    <button
                      onClick={retryFetchReferral}
                      className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : displayReferralCode ? (
                <>
                  <div className="flex items-center space-x-3">
                    <code className="bg-white px-4 py-3 rounded-md text-xl font-mono text-blue-600 border flex-1">
                      {displayReferralCode}
                    </code>
                    <button
                      onClick={copyToClipboard}
                      className={`px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                        copied 
                          ? 'bg-green-100 text-green-700 border border-green-200' 
                          : 'bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200'
                      }`}
                    >
                      {copied ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mt-3">
                    Share this code with friends to earn rewards when they sign up!
                  </p>
                  {referralCode && (
                    <p className="text-xs text-blue-600 mt-2">
                      ✓ Loaded from API
                    </p>
                  )}
                </>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <p className="text-sm text-yellow-800">No referral code available</p>
                  <button
                    onClick={retryFetchReferral}
                    className="mt-2 px-3 py-1 bg-yellow-100 text-yellow-700 text-sm rounded hover:bg-yellow-200 transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}