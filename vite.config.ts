import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The CSP is only added to production builds: Vite's dev server injects inline scripts.
const csp: Plugin = {
  name: 'island-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:" />`,
    );
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), csp],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5199, strictPort: true },
});
