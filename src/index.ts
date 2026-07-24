import { isServer } from '@dcl/sdk/network'
import { initServer } from './server/server'
import { setupUi } from './client/uiManager'
import { initClient } from './client/setup'
import { initNPCSystem } from './client/npcManager'
import { initPlayerCloneSystem } from './client/playerCloneManager'
import { initGameplayCamera } from './client/gameplayCamera'
import { initSceneLoadManager } from './client/sceneLoadManager'
import { resetClientSession } from './client/clientSession'
import { initPortals } from './client/portalManager'
import { DiscordWebhooks } from './webhooks/discord-webhooks'
import { onEnterScene } from '@dcl/sdk/src/players'
import { Transform } from '@dcl/sdk/ecs'

/**
 * Debe ser síncrono: tras el primer await el runtime sella el motor y ya no se pueden
 * crear entidades ni componentes (AudioSource, MeshRenderer, estado de partida, etc.).
 */
export function main() {
  if (isServer()) {
    initServer()
    return
  }
  resetClientSession()
  setupUi()
  initSceneLoadManager()
  initClient()
  initNPCSystem()
  initPlayerCloneSystem()
  initGameplayCamera()
  initPortals()

  //Discord Webhook
  onEnterScene((player) => {
    const playerPosition = Transform.getOrNull(player.entity)?.position
    DiscordWebhooks.newPlayer(player.name, player.userId, playerPosition)
  })
}
