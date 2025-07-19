// Updated authSlice.js - Add dashboard token handling
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Helper function to safely access localStorage
const getTokenFromStorage = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth_token');
  }
  return null;
};

const setTokenInStorage = (token) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('auth_token', token);
  }
};

const removeTokenFromStorage = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_redirect');
  }
};

// Helper function to decode JWT token
const decodeJWT = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
};

// New async thunk for handling dashboard token
export const handleDashboardToken = createAsyncThunk(
  'auth/handleDashboardToken',
  async (token, { rejectWithValue }) => {
    try {
      if (!token) {
        throw new Error('No token provided');
      }

      // Decode JWT to get user information
      const decoded = decodeJWT(token);
      if (!decoded) {
        throw new Error('Invalid token format');
      }

      // Check if token is expired
      const currentTime = Date.now() / 1000;
      if (decoded.exp < currentTime) {
        throw new Error('Token expired');
      }

      // Store token in localStorage
      setTokenInStorage(token);

      // Return user data from JWT
      const userData = {
        email: decoded.email,
        name: decoded.name,
        user_id: decoded.user_id,
        picture: decoded.picture, // If available
      };

      return { token, user: userData };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for checking authentication status
export const checkAuthStatus = createAsyncThunk(
  'auth/checkStatus',
  async (_, { rejectWithValue }) => {
    try {
      const token = getTokenFromStorage();
      if (!token) {
        throw new Error('No token found');
      }

      // First, check if token is valid by decoding it
      const decoded = decodeJWT(token);
      if (!decoded) {
        removeTokenFromStorage();
        throw new Error('Invalid token');
      }

      // Check if token is expired
      const currentTime = Date.now() / 1000;
      if (decoded.exp < currentTime) {
        removeTokenFromStorage();
        throw new Error('Token expired');
      }

      // Optionally verify with backend
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        removeTokenFromStorage();
        throw new Error('Token invalid');
      }

      const userData = await response.json();
      
      // ✅ Simple, clean logging
      console.log('🎉 [AUTH SUCCESS] Complete user data from backend:');
      console.log(userData);
      console.log('🔑 Available fields:', Object.keys(userData));
      
      return userData;
    } catch (error) {
      console.log('❌ [AUTH ERROR]:', error.message);
      removeTokenFromStorage();
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for logout
export const logoutUser = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      const token = getTokenFromStorage();
      
      if (token) {
        // Optional: Call backend logout endpoint
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      removeTokenFromStorage();
    }
  }
);

const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.isLoading = true;
      state.error = null;
    },
    loginSuccess: (state, action) => {
      state.isLoading = false;
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.error = null;
      setTokenInStorage(action.payload.token);
    },
    loginFailure: (state, action) => {
      state.isLoading = false;
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.error = action.payload;
      removeTokenFromStorage();
    },
    clearError: (state) => {
      state.error = null;
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },
    initializeAuth: (state) => {
      // Only run on client side
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('auth_token');
        if (token) {
          state.token = token;
          // Try to decode user info from token
          const decoded = decodeJWT(token);
          if (decoded) {
            const currentTime = Date.now() / 1000;
            if (decoded.exp > currentTime) {
              state.user = {
                email: decoded.email,
                name: decoded.name,
                user_id: decoded.user_id,
                picture: decoded.picture,
              };
              state.isAuthenticated = true;
            } else {
              // Token expired
              localStorage.removeItem('auth_token');
              state.token = null;
            }
          }
        }
      }
      state.isLoading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // Handle dashboard token
      .addCase(handleDashboardToken.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(handleDashboardToken.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.error = null;
      })
      .addCase(handleDashboardToken.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.error = action.payload;
      })
      // Check auth status
      .addCase(checkAuthStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(checkAuthStatus.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
        state.error = null;
      })
      .addCase(checkAuthStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.error = action.payload;
      })
      // Logout
      .addCase(logoutUser.fulfilled, (state) => {
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.error = null;
        state.isLoading = false;
      });
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  clearError,
  setLoading,
  initializeAuth,
} = authSlice.actions;

export default authSlice.reducer;

// Selectors
export const selectAuth = (state) => state.auth;
export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectIsLoading = (state) => state.auth.isLoading;
export const selectAuthError = (state) => state.auth.error;
export const selectToken = (state) => state.auth.token;
