export function sendToType(wss, type, payload) {
	wss.clients.forEach((client) => {
		if (client.consolioType === type && client.readyState === 1)
			client.send(JSON.stringify(payload))
	})
}
