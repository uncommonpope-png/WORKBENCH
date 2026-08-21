import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    define: {
      'process.env.GSK_MCP_URL': JSON.stringify(process.env.GSK_MCP_URL || 'http://127.0.0.1:3001'),
      'process.env.MCP_API_KEY': JSON.stringify(process.env.MCP_API_KEY || 'gsk-dev-key'),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      // Single React instance across the whole graph — prevents
      // "Invalid hook call / more than one copy of React" white screens.
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      // Eagerly bundle ALL runtime deps in ONE pass at server start.
      // Lazy discovery (e.g. zod found mid-session) splits the graph into
      // two optimizer generations and duplicates React.
      include: [
        'react',
        'react-dom/client',
        '@solana/web3.js',
        'lucide-react',
        'motion/react',
        'react-markdown',
        'three',
        'zod',
      ],
    },
    server: {
      // Force clients to never cache modules — defeats stale-bundle loops
      // where a browser keeps serving an old build after server restarts.
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
