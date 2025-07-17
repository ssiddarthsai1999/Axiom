"use client"

import { Provider } from 'react-redux';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { store } from './store';
import { initializeAuth } from './slices/authSlice';

// Client-side auth initializer component
function AuthInitializer({ children }) {
  const dispatch = useDispatch();

  useEffect(() => {
    // Initialize auth state from localStorage on client side only
    dispatch(initializeAuth());
  }, [dispatch]);

  return children;
}

export default function ReduxProvider({ children }) {
  return (
    <Provider store={store}>
      <AuthInitializer>
        {children}
      </AuthInitializer>
    </Provider>
  );
}