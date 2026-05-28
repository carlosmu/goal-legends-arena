import { resetSplashUi } from './uiManager'
import { resetSceneLoadManager } from './sceneLoadManager'
import { resetNpcManager } from './npcManager'
import { resetAudioManager } from './audioManager'
import { resetCountryPicker } from './countryStore'

/** Reset module state on each client main() — hot reload keeps JS modules alive. */
export function resetClientSession(): void {
  resetSplashUi()
  resetCountryPicker()
  resetSceneLoadManager()
  resetNpcManager()
  resetAudioManager()
}
