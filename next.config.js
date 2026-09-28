/** @type {import('next').NextConfig} */
const nextConfig = {
  // Adiciona isto:
  eslint: {
    // Ignora os erros de ESLint durante o build
    ignoreDuringBuilds: true,
  },

  /*
   * T-18 · o comprovativo sobe por uma server action, e o Next 14 corta o
   * corpo de uma server action em 1 MB por omissão. O ecrã promete 8 MB; uma
   * fotografia de telemóvel tem 3. O limite fica acima dos 8 MB porque o
   * ficheiro vai em FormData, que pesa um pouco mais do que o ficheiro.
   * O nginx tem de deixar passar o mesmo (`client_max_body_size 12M`).
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "9mb",
    },
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