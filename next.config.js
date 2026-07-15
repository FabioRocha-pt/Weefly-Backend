/** @type {import('next').NextConfig} */
const nextConfig = {
  // Adiciona isto:
  eslint: {
    // Ignora os erros de ESLint durante o build
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig; // (ou export default nextConfig se for .mjs)