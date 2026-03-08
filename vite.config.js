import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/Organize-Yourselves/' : '/',
  server: {
    port: 3001,
    open: false
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split TipTap/ProseMirror into its own chunk
          if (id.includes('@tiptap') || id.includes('prosemirror')) {
            return 'tiptap';
          }
          // Split Firebase into its own chunk
          if (id.includes('firebase') || id.includes('@firebase')) {
            return 'firebase';
          }
        },
      },
    },
  },
});
