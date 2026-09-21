import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://smeredith15.github.io/movies/
// Stamp the build so the page can say which one it is running. Without this,
// "did my change deploy, or is the browser holding an old bundle?" is
// guesswork — and we have guessed at it once already.
const commit = (process.env.GITHUB_SHA ?? 'local').slice(0, 7);
const builtAt = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  plugins: [react()],
  base: '/movies/',
  define: {
    __BUILD__: JSON.stringify(`${commit} · ${builtAt}`),
  },
});
