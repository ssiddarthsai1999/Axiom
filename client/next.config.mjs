/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // For newer Next.js versions with server external packages support
  serverExternalPackages: ['pino-pretty', 'encoding'],
  
  // Serve charting library files as static assets
  async rewrites() {
    return [
      {
        source: '/charting_library-master/:path*',
        destination: '/charting_library-master/:path*',
      },
    ];
  },
  
  webpack: (config, { nextRuntime }) => {
    // Apply fallbacks only for browser bundles (not for server-side)
    if (typeof nextRuntime === "undefined") {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    // Externalize these modules to prevent webpack from trying to bundle them
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    
    return config;
  },
};

export default nextConfig;