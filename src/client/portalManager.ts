import { changeRealm } from '~system/RestrictedActions'
import { Portal } from '../portal'

/** World this scene's exit portal teleports to. */
const KICKOFF_WORLD = 'kickoff.dcl.eth'

/**
 * Spawns the scene's portals (client-only). Instantiating a `Portal` creates its entities
 * immediately, so this must run from the synchronous `main()` before the engine is sealed.
 */
export function initPortals(): void {
  new Portal({
    position: { x: 16, y: 0, z: 46 },
    rotation: { x: 0, y: 0, z: 0 },
    locationId: KICKOFF_WORLD,
    name: 'Kickoff',
    thumbnail: 'assets/images/kickoff-thumbnail.png',
    enable: true,
    callback: () => {
      void changeRealm({ realm: KICKOFF_WORLD })
    }
  })
}
