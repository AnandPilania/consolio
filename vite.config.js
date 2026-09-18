import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    root: 'ui',

    plugins: [react(), tailwindcss(), nodePolyfills()],

    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'ui'),
        },
    },

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
