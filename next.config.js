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
   * SEO-01 · SEO-04 · os ícones, o manifesto e a imagem de partilha na raiz,
   * resolvidos para a empresa do endereço por `app/api/brand/[file]`. Antes
   * dos ficheiros de `public/` (`beforeFiles`): não há um favicon só.
   *
   * Havia uma reescrita, /price-checker → public/mockups/price-checker.html,
   * do tempo em que o Price Checker era um mockup HTML autónomo. Saiu: o Price
   * Checker é o /pc, em React, e é o único.
   */
  async rewrites() {
    return {
      beforeFiles: [
        {
          source:
            "/:file(favicon\\.ico|favicon\\.svg|favicon-16x16\\.png|favicon-32x32\\.png|favicon-48x48\\.png|apple-touch-icon\\.png|icon-192\\.png|icon-512\\.png|icon-512-maskable\\.png|og-image\\.jpg|site\\.webmanifest)",
          destination: "/api/brand/:file",
        },
      ],
    }
  },
};

module.exports = nextConfig; // (ou export default nextConfig se for .mjs)