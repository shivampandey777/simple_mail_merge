import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Apps Script serves exactly one HTML file per view and cannot resolve
 * node_modules, so the whole React app is inlined into a single document.
 * The build script renames index.html to Dialog.html afterwards.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../src',
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
