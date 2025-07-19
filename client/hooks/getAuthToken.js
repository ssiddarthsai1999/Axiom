// hooks/getAuthToken.js
"use client";

import { useSelector } from 'react-redux';
import { selectUser } from '../redux/slices/authSlice';

// Simple function to get auth token (can be used anywhere)
export const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth_token');
  }
  return null;
};

// Hook version that can access Redux state
export const useAuthToken = () => {
  const user = useSelector(selectUser);
  
  const getToken = () => {
    if (typeof window !== 'undefined') {
      // Try localStorage first, then Redux user state
      return localStorage.getItem('auth_token') || user?.access_token || null;
    }
    return user?.access_token || null;
  };

  return getToken();
};

// Enhanced hook with token management
export const useAuth = () => {
  const user = useSelector(selectUser);
  
  const getToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token') || user?.access_token || null;
    }
    return user?.access_token || null;
  };

  const setToken = (token) => {
    if (typeof window !== 'undefined' && token) {
      localStorage.setItem('auth_token', token);
    }
  };

  const removeToken = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  };

  const isTokenValid = () => {
    const token = getToken();
    if (!token) return false;
    
    try {
      // Basic JWT validation (check if it exists and has parts)
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      // Decode payload to check expiration
      const payload = JSON.parse(atob(parts[1]));
      const currentTime = Date.now() / 1000;
      
      return payload.exp && payload.exp > currentTime;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  };

  return {
    token: getToken(),
    getToken,
    setToken,
    removeToken,
    isTokenValid,
    user
  };
};

export default getAuthToken;