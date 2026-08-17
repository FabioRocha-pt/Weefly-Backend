/** @type {import('next').NextConfig} */
const nextConfig = {
  // Adiciona isto:
  eslint: {
    // Ignora os erros de ESLint durante o build
    ignoreDuringBuilds: true,
  },

  /*
   * Mockups estáticos servidos em URLs limpos.
   *
   * O Price Checker (P1 → P9) é uma página autónoma: traz o seu próprio
   * <head>, tipografia e folha de estilos, e por isso não passa pelo layout
   * da app — envolvê-la no RootLayout partiria o desenho. Fica em
   * public/mockups/ e é reescrita para um caminho apresentável.
   *
   * A query string passa na reescrita, por isso os parâmetros do link
   * (?lang= &currency= &cc= &agent= &ref=) continuam a funcionar.
   */
  async rewrites() {
    return [
      { source: "/price-checker", destination: "/mockups/price-checker.html" },
    ];
  },
};

module.exports = nextConfig; // (ou export default nextConfig se for .mjs)