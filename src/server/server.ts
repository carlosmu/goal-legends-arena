import { engine } from '@dcl/sdk/ecs'
import {
  createStateEntity,
  loadPersistentLeaderboard,
  registerServerMessages,
  refreshPlayerCount,
  serverTick
} from './matchController'

export function initServer() {
  createStateEntity()
  registerServerMessages()
  engine.addSystem(() => {
    refreshPlayerCount()
    serverTick()
  })
  void loadPersistentLeaderboard()
}
