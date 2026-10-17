import type { NextConfig } from 'next';

const config: NextConfig = {
  compress: false,
  serverExternalPackages: ['better-sqlite3'],
};

export default config;
