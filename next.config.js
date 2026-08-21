/** @type {import('next').NextConfig} */
const nextConfig = {
  // Adiciona isto:
  eslint: {
    // Ignora os erros de ESLint durante o build
    ignoreDuringBuilds: true,
  },

  /*
   * Não há reescritas.
   *
   * Havia uma, /price-checker → public/mockups/price-checker.html, do tempo em
   * que o Price Checker era um mockup HTML autónomo. Havia assim três endereços
   * a responder à mesma pergunta — /pc, /price-checker e o ficheiro em
   * /mockups/ — e dois deles mostravam um desenho que já não é o produto.
   * O Price Checker é o /pc, em React, e é o único.
   */
};

module.exports = nextConfig; // (ou export default nextConfig se for .mjs)