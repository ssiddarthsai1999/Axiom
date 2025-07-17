// components/Navbar.js
'use client'

import React, { useState } from 'react';
import { Bell, User, ChevronDown } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSelector, useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { selectUser, selectIsAuthenticated, logoutUser } from "../redux/slices/authSlice"

const Navbar = ({ className = '' }) => {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();
  
  // Get user data from Redux store
  const user = useSelector(selectUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const navItems = [
    { label: 'Swap', href: '/swap' },
    { label: 'Limit Orders', href: '/limit-orders' },
    { label: 'DCA', href: '/dca' },
    { label: 'Perpetuals', href: '/perpetuals' }
  ];

  const handleDropdownToggle = (dropdown) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
  };

  // Close dropdown when clicking on a link
  const handleDropdownLinkClick = () => {
    setActiveDropdown(null);
  };

  // Handle logout
  const handleLogout = () => {
    dispatch(logoutUser())
      .unwrap()
      .then(() => {
        setActiveDropdown(null);
        router.push('/auth');
      })
      .catch((error) => {
        console.error('Logout failed:', error);
        // Still close dropdown and redirect even if logout API fails
        setActiveDropdown(null);
        router.push('/auth');
      });
  };

  // Function to check if link is active
  const isActiveLink = (href) => {
    if (href === '/' && pathname !== '/') {
      return false;
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className={`bg-[#0d0c0e] border-b border-[#1F1E23] z-20 ${className}`}>
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between ">
          {/* Logo */}
          <div className="flex items-center lg:gap-14">
            <Link href="/perpetuals">
            <img 
              src="/medusalogo.svg" 
              alt="Medusa Logo" 
              className="w-[126px] h-[24px]"
            /></Link>
            
            {/* Center Navigation - Hidden on mobile, visible on large screens */}
            <div className="hidden lg:flex items-center justify-center flex-1">
              <div className="flex items-baseline space-x-8">
                {navItems.map((item) => {
                  const isActive = isActiveLink(item.href);
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`relative text-[14px] leading-[14px] font-[500] px-3 py-2 font-mono transition-colors duration-200 ${
                        isActive 
                          ? 'text-white' 
                          : 'text-[#919093] hover:text-white'
                      }`}
                    >
                      {item.label}
                      {isActive && (
                        <div className="absolute bottom-[-20px] left-0 right-0 h-1 bg-[#2133FF] rounded-t-sm"></div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right side items */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Deposit Button */}
            <button className="bg-[#212023] font-mono border border-[#FAFAFA33] duration-200 ease-in cursor-pointer hover:bg-[#2b2b2e] text-[#E5E5E5] px-3 py-2 sm:px-4 rounded-lg text-[12px] leading-[18px] font-[500] transition-colors duration-200">
              Deposit
            </button>

            {/* Notifications */}
            <button className="relative cursor-pointer bg-[#1F1E23] rounded-lg p-2 text-[#919093] hover:text-white transition-colors duration-200">
              <img 
                src="/notification.svg" 
                alt="Notifications" 
                className="w-5 h-5 hover:brightness-125 duration-200 ease-in"
              />
            </button>

            {/* Balance Display - Hidden on very small screens, visible on sm and up */}
            <div className="hidden sm:flex items-center space-x-2 lg:space-x-4 text-sm bg-[#1F1E23] rounded-lg p-2">
              <div className="flex items-center justify-center space-x-1">
                <img 
                  src="/eth.svg" 
                  alt="ETH" 
                  className="w-4 h-4"
                />
                <span className="text-white text-xs lg:text-sm">0</span>
                <div className="border border-[#323542] ml-2 h-4 w-[1px]" />
              </div>
              <div className="flex items-center justify-center space-x-1">
                <img 
                  src="/solana.svg" 
                  alt="SOL" 
                  className="w-4 h-4"
                />
                <span className="text-white text-xs lg:text-sm">0</span>
                <div className="border border-[#323542] ml-2 h-4 w-[1px]" />
              </div>
              <div className="flex items-center justify-center space-x-1">
                <img 
                  src="/usdc.svg" 
                  alt="USDC" 
                  className="w-4 h-4"
                />
                <span className="text-white text-xs lg:text-sm">0</span>   
                <img 
                  src="/downarrow.svg" 
                  alt="Dropdown" 
                  className="w-4 h-4 ml-2 cursor-pointer"
                />
              </div>
            </div>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => handleDropdownToggle('profile')}
                className="flex items-center space-x-2 text-[#919093] text-sm bg-[#1F1E23] hover:text-white p-2 rounded-lg transition-colors cursor-pointer duration-200"
              >
                {/* Show user photo if authenticated and available, otherwise show default */}
                {isAuthenticated && user?.picture ? (
                  <img 
                    src={user.picture} 
                    alt={user.name || 'User'} 
                    className="w-5 h-5 rounded-full border border-[#323542] object-cover"
                  />
                ) : (
                  <img 
                    src="/profile.svg" 
                    alt="Profile" 
                    className="w-5 h-5"
                  />
                )}
                <ChevronDown className="w-4 h-4 hidden sm:block" />
              </button>
              
              {activeDropdown === 'profile' && (
                <div className="absolute right-0 mt-2 w-48 bg-[#0d0c0e] border border-[#1F1E23] rounded-lg shadow-lg z-50">
                  <div className="py-1">
                    {isAuthenticated && user ? (
                      // Authenticated user menu
                      <>
                        {/* User email display */}
                        <div className="px-4 py-2 border-b border-[#1F1E23] mb-1">
                          <p className="text-xs text-[#919093] truncate">{user.email}</p>
                        </div>
                        
                        <Link 
                          href="/dashboard" 
                          onClick={handleDropdownLinkClick}
                          className="block px-4 py-2 text-sm text-[#919093] hover:text-white hover:bg-[#1F1E23] transition-colors"
                        >
                          Dashboard
                        </Link>
                        <button 
                          onClick={handleLogout}
                          className="block w-full text-left px-4 py-2 text-sm text-[#919093] hover:text-white hover:bg-[#1F1E23] transition-colors"
                        >
                          Logout
                        </button>
                      </>
                    ) : (
                      // Guest user menu
                      <Link 
                        href="/login" 
                        onClick={handleDropdownLinkClick}
                        className="block px-4 py-2 text-sm text-[#919093] hover:text-white hover:bg-[#1F1E23] transition-colors"
                      >
                        Login
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Overlay for dropdowns */}
      {activeDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setActiveDropdown(null)}
        ></div>
      )}
    </nav>
  );
};

export default Navbar;