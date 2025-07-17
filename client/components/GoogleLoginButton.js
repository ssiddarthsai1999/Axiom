"use client"

import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useState } from 'react';
import { 
  selectIsLoading, 
  selectAuthError, 
  loginStart, 
  loginSuccess, 
  loginFailure,
  clearError,
  checkAuthStatus 
} from '../redux/slices/authSlice';

const GoogleLoginButton = ({ 
  redirectTo = '/dashboard',
  className = '',
  children,
  onSuccess,
  onError 
}) => {
  const dispatch = useDispatch();
  const isLoading = useSelector(selectIsLoading);
  const error = useSelector(selectAuthError);
  const [isClient, setIsClient] = useState(false);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  // Ensure we're on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Handle OAuth callback on component mount
  useEffect(() => {
    if (!isClient) return;
    
    const handleOAuthCallback = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      const error = urlParams.get('error');
      const user = urlParams.get('user');

      if (token) {
        const userData = user ? JSON.parse(decodeURIComponent(user)) : null;
        
        dispatch(loginSuccess({ 
          token, 
          user: userData 
        }));

        // Get redirect URL or default to dashboard
        const storedRedirect = localStorage.getItem('auth_redirect') || redirectTo;
        localStorage.removeItem('auth_redirect');
        
        // Clean URL and redirect
        window.history.replaceState({}, document.title, window.location.pathname);
        
        if (onSuccess) {
          onSuccess(userData);
        } else {
          window.location.href = storedRedirect;
        }
      } else if (error) {
        const errorMessage = `Authentication failed: ${error}`;
        dispatch(loginFailure(errorMessage));
        
        if (onError) {
          onError(errorMessage);
        }
      }
    };

    handleOAuthCallback();
  }, [dispatch, redirectTo, onSuccess, onError, isClient]);

  // Check auth status on component mount
  useEffect(() => {
    if (!isClient) return;
    
    const token = localStorage.getItem('auth_token');
    if (token) {
      dispatch(checkAuthStatus());
    }
  }, [dispatch, isClient]);

  const handleGoogleLogin = () => {
    if (isLoading || !isClient) return;

    // Clear any previous errors
    dispatch(clearError());
    
    // Set loading state
    dispatch(loginStart());
    
    // Store the redirect URL for after login
    localStorage.setItem('auth_redirect', redirectTo);
    
    // Redirect to your Express API Google OAuth endpoint
    window.location.href = `${API_BASE_URL}/auth/google/login?next=${encodeURIComponent(redirectTo)}`;
  };

  // Don't render anything until client-side
  if (!isClient) {
    return (
      <div className="space-y-2">
        <button
          disabled
          className={`flex items-center justify-center gap-3 px-6 py-3 bg-white border border-gray-300 rounded-lg shadow-sm opacity-50 cursor-not-allowed ${className}`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="text-gray-700 font-medium">Loading...</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className={`flex items-center justify-center gap-3 px-6 py-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${className}`}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {children || (
          <span className="text-gray-700 font-medium">
            {isLoading ? 'Signing in...' : 'Continue with Google'}
          </span>
        )}
      </button>
      
      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-2 rounded border border-red-200">
          {error}
        </div>
      )}
    </div>
  );
};

export default GoogleLoginButton;