import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { scanProjectRoutes } from "../routeScanner.js"

export async function scanRoutes(fastify, { storage }) {
	fastify.post("/api/scan/routes", async (req, reply) => {
		const { path: subPath, baseUrl = "" } = req.body || {}

		const root = storage.projectPath
		const target = subPath ? resolve(root, subPath) : root
		if (!target.startsWith(resolve(root))) {
			return reply
				.status(400)
				.send({ error: "path must stay within the project directory" })
		}
		if (!existsSync(target) || !statSync(target).isDirectory()) {
			return reply.status(400).send({ error: `${target} is not a directory` })
		}

		try {
			const result = scanProjectRoutes(target, { baseUrl })
			return result
		} catch (e) {
			return reply.status(500).send({ error: e.message })
		}
	})
}
