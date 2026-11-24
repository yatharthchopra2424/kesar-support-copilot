import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built site works from any path (Cloudflare Pages, a subfolder, file preview).
export default defineConfig({ plugins: [react()], base: './' });
