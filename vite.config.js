import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    root: 'ui',

    plugins: [react()],

    server: {
        port: 5173,
        proxy: {
            '/api': { target: 'http://localhost:4242', changeOrigin: true },
            '/ws': { target: 'ws://localhost:4242', ws: true },
        },
    },

    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },
    optimizeDeps: {
        include: ['react-resizable-panels']
    }
})
