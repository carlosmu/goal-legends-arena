import { Vector3 } from "@dcl/sdk/math"
import { isServer } from "@dcl/sdk/network"
import { EnvVar } from "@dcl/sdk/server"


export namespace DiscordWebhooks {
	// MARK: Vars
	const DISCORD_WEBHOOK_URL_KEY = "DISCORD_WEBHOOK_URL"

	let discordWebhookUrlPromise: Promise<string | null> | null = null

	// MARK: buildMessage
	const buildMessage = (title: string, description: string) => {
		return { embeds: [
			{
				title      : title,
				description: description,
				color      : 16776960,
				thumbnail  : {
					url: "https://cdn.discordapp.com/emojis/1474816925954609164.webp?size=128&animated=true"
				}
			}
		] }
	}

	// MARK: newPlayer
	export const newPlayer = (
		username: string, 
		userId  : string,
		position?: Vector3
	) => {
		const title     = `Goal Legends Arena :balloon: ${username} has joined the game!`
		let description = `UserID: ${userId}`

		if (position) {
			// Round off the position to 2 decimal places
			const roundedPosition = Vector3.create(
				Math.round(position.x * 100) / 100,
				Math.round(position.y * 100) / 100,
				Math.round(position.z * 100) / 100
			)
			description += `\nPosition: ${roundedPosition.x}, ${roundedPosition.y}, ${roundedPosition.z}`
		}

		const body = buildMessage(title, description)

		void sendDiscordMessage(body)
	}


	// MARK: getDiscordWebhookUrl
	/**
	 * Resolves the Discord webhook URL from server environment variables.
	 * The result is cached so concurrent sends share a single EnvVar lookup.
	 */
	async function getDiscordWebhookUrl(): Promise<string | null> {
		if (!isServer()) return null

		if (!discordWebhookUrlPromise) {
			discordWebhookUrlPromise = EnvVar.get(DISCORD_WEBHOOK_URL_KEY).then((url) => url || null)
		}

		return discordWebhookUrlPromise
	}


	// MARK: sendDiscordMessage
	async function sendDiscordMessage(body: object): Promise<void> {
		if (!isServer()) {
			console.log("discord-webhooks: sendDiscordMessage: skipped (not server)")
			return
		}

		const url = await getDiscordWebhookUrl()
		if (!url || url === "") {
			console.log("discord-webhooks: sendDiscordMessage: DISCORD_WEBHOOK_URL not configured")
			return
		}

		try {
			const response = await fetch(url, {
				method : "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify(body)
			})

			if (!response.ok) {
				console.log("discord-webhooks: sendDiscordMessage: webhook failed:", response.status, response.statusText)
			} else {
				console.log("discord-webhooks: sendDiscordMessage: message sent to Discord")
			}
		} catch (error) {
			console.log("discord-webhooks: sendDiscordMessage: error sending webhook:", error)
		}
	}
}