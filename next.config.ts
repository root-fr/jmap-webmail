import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
  async rewrites() {
    const jmapServerUrl = process.env.JMAP_SERVER_URL || process.env.NEXT_PUBLIC_JMAP_SERVER_URL;
    if (!jmapServerUrl) return [];

    return [
      {
        source: '/jmap',
        destination: `${jmapServerUrl}/jmap`,
      },
      {
        source: '/jmap/:path*',
        destination: `${jmapServerUrl}/jmap/:path*`,
      },
      {
        source: '/download',
        destination: `${jmapServerUrl}/download`,
      },
      {
        source: '/download/:path*',
        destination: `${jmapServerUrl}/download/:path*`,
      },
      {
        source: '/upload',
        destination: `${jmapServerUrl}/upload`,
      },
      {
        source: '/upload/:path*',
        destination: `${jmapServerUrl}/upload/:path*`,
      },
      {
        source: '/eventsource',
        destination: `${jmapServerUrl}/eventsource`,
      },
      {
        source: '/eventsource/:path*',
        destination: `${jmapServerUrl}/eventsource/:path*`,
      },
    ];
  },
};

export default nextConfig;
