import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from "@dcl/sdk/react-ecs"
import { Color4, Vector3 } from "@dcl/sdk/math"
import { movePlayerTo, triggerEmote } from "~system/RestrictedActions"

/** Centro geométrico de la escena 2x2 parcels. */
const SCENE_CENTER = Vector3.create(16, 1, 16)
const CLAP_DELAY_MS = 2000

function wait(ms: number) {
    return new Promise<void>((resolve) => setTimeout(() => resolve(), ms))
}

function randomBetween(min: number, max: number) {
    return min + Math.random() * (max - min)
}

async function teleportTeamSpawn(xMin: number, xMax: number) {
    const x = randomBetween(xMin, xMax)
    const z = randomBetween(9, 19)
    const y = 6

    await movePlayerTo({
        newRelativePosition: Vector3.create(x, y, z),
        cameraTarget: SCENE_CENTER
    })
    await wait(CLAP_DELAY_MS)
    await triggerEmote({ predefinedEmote: "clap" })
}

export function setupUi() {
    ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

export const uiMenu = () => (
    <UiEntity
        uiTransform={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start"
        }}
    >
        <UiEntity
            uiTransform={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                margin: { top: "10vh" },
                padding: { top: 20, bottom: 20, left: 28, right: 28 }
            }}
            uiBackground={{ color: Color4.create(0, 0, 0, 0.8) }}
        >
            <Label
                value="Welcome to"
                fontSize={22}
                color={Color4.White()}
                textAlign="middle-center"
                uiTransform={{ margin: { bottom: 6 } }}
            />
            <Label
                value="Goal Legends Arena"
                fontSize={40}
                color={Color4.White()}
                textAlign="middle-center"
                uiTransform={{ margin: { bottom: 12 } }}
            />
            <Label
                value="Choose a Team to begin"
                fontSize={20}
                color={Color4.create(0.9, 0.9, 0.95, 1)}
                textAlign="middle-center"
                uiTransform={{ margin: { bottom: 18 } }}
            />
            <UiEntity
                uiTransform={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center"
                }}
            >
                <Button
                    value="The Blues"
                    fontSize={18}
                    color={Color4.White()}
                    textAlign="middle-center"
                    uiTransform={{
                        width: 240,
                        height: 44,
                        margin: { right: 12 },
                        borderWidth: 2,
                        borderColor: Color4.White()
                    }}
                    uiBackground={{ color: Color4.create(0.12, 0.38, 0.92, 1) }}
                    onMouseDown={() => {
                        void teleportTeamSpawn(26, 29)
                    }}
                />
                <Button
                    value="The Reds"
                    fontSize={18}
                    color={Color4.White()}
                    textAlign="middle-center"
                    uiTransform={{
                        width: 240,
                        height: 44,
                        borderWidth: 2,
                        borderColor: Color4.White()
                    }}
                    uiBackground={{ color: Color4.create(0.88, 0.18, 0.22, 1) }}
                    onMouseDown={() => {
                        void teleportTeamSpawn(3, 6)
                    }}
                />
            </UiEntity>
        </UiEntity>
    </UiEntity>
)