import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const Messages = {
  occupySpot: Schemas.Map({ team: Schemas.String }),
  submitDirection: Schemas.Map({ dir: Schemas.String }),
  streakDecision: Schemas.Map({ continue: Schemas.Int }),
  spectatorChallenge: Schemas.Map({ accept: Schemas.Int }),
  clientReadyPing: Schemas.Map({}),
  teleport: Schemas.Map({
    x: Schemas.Number,
    y: Schemas.Number,
    z: Schemas.Number,
    cx: Schemas.Number,
    cy: Schemas.Number,
    cz: Schemas.Number
  })
}

export const room = registerMessages(Messages)
