import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { nodePolyfills } from "vite-plugin-node-polyfills"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    root: "ui",

    plugins: [
        react(),
        tailwindcss(),
        nodePolyfills({
            include: [
                "buffer",
                "process",
                "util",
                "stream",
                "events",
                "path",
                "querystring",
                "crypto",
                "http",
                "https",
                "fs",
            ],
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
        }),
    ],

    resolve: {
        alias: {
            "@": path.resolve(__dirname, "ui"),
        },
    },

    server: {
        port: 5173,
        proxy: {
            "/api": { target: "http://localhost:4242", changeOrigin: true },
            "/ws": { target: "ws://localhost:4242", ws: true },
        },
    },

    build: {
        outDir: "../dist",
        emptyOutDir: true,
        chunkSizeWarningLimit: 700,
        rolldownOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes("node_modules")) return

                    if (id.includes("react") || id.includes("zustand")) {
                        return "vendor-react"
                    }
                    if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("sonner")) {
                        return "vendor-ui"
                    }
                    if (id.includes("@dnd-kit")) {
                        return "vendor-dnd"
                    }
                    if (
                        id.includes("crypto-browserify") ||
                        id.includes("asn1.js") ||
                        id.includes("elliptic") ||
                        id.includes("browserify-") ||
                        id.includes("node-libs-browser")
                    ) {
                        return "vendor-crypto-polyfills"
                    }
                    if (id.includes("httpsnippet") || id.includes("form-data")) {
                        return "vendor-httpsnippet"
                    }
                    if (id.includes("yaml")) {
                        return "vendor-yaml"
                    }
                }
            },
        },
    },

    optimizeDeps: {
        include: ["react-resizable-panels"],
        exclude: ["fastify", "@grpc/grpc-js", "ws"],
    },
})
