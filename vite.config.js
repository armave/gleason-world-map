import {defineConfig} from 'vite';

export default defineConfig({
  // Relative URLs support the GitHub Pages project path (/gleason-world-map/).
  base:'./',
  build:{
    outDir:'dist',
    emptyOutDir:true,
    sourcemap:true,
    target:'es2022'
  },
  server:{
    host:'127.0.0.1',
    port:5173,
    strictPort:true
  },
  preview:{
    host:'127.0.0.1',
    port:4173,
    strictPort:true
  }
});
