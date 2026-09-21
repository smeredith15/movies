import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://smeredith15.github.io/movies/
export default defineConfig({
  plugins: [react()],
  base: '/movies/',
});
