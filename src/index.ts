import { isServer } from '@dcl/sdk/network'
import { initServer } from './server/server'
import { setupUi } from './client/uiManager'
import { initClient } from './client/setup'
import { initNPCSystem } from './client/npcManager'

/**
 * Debe ser síncrono: tras el primer await el runtime sella el motor y ya no se pueden
 * crear entidades ni componentes (AudioSource, MeshRenderer, estado de partida, etc.).
 */
export function main() {
  if (isServer()) {
    initServer()
    return
  }
  setupUi()
  initClient()
  initNPCSystem()
}
