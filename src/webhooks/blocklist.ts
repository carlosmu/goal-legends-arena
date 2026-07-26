export function isBlockedPlayer(userId: string): boolean {
    return blockedUserIds.includes(userId)
}

const blockedUserIds = [
    "0x5c61f3a6bee08f43f886bf20adac296495ee77a2", // Schneeflocke1 - bot (there's Schneeflocke1 through Schneeflocke99)
]
