/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@citizen-shield/api',
    '@citizen-shield/auth',
    '@citizen-shield/config',
    '@citizen-shield/types',
    '@citizen-shield/utils',
    '@citizen-shield/validation',
  ],
  typedRoutes: true,
};

export default nextConfig;
