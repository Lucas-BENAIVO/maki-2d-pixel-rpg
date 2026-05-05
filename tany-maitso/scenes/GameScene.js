import { Scene } from '@tialops/maki'
import { manager } from '../systems/manager.js'
import gameSettings from '../data/game-settings.json'
import zones from '../data/zones.json'
import dialogues from '../data/dialogues.json'
import quests from '../data/quests.json'

const STARTING_MAP = 'tany_maitso_map'
const PLAYER_SPEED = 120
const MAP_HALF_W = 140
const MAP_HALF_H = 380
const MAP_WIDTH = 680
const MAP_HEIGHT = 510
const BOTTOM_VISUAL_OFFSET = 28

// Une seule grande carte, divisée en 5 secteurs interconnectés.
const SECTOR_BOUNDS = [
    { id: 'zone1_masoala', x: 0, y: 255, w: 300, h: 255 },
    { id: 'zone2_tavy', x: 380, y: 255, w: 300, h: 255 },
    { id: 'zone3_vohemar', x: 0, y: 0, w: 300, h: 255 },
    { id: 'zone4_ranomafana', x: 300, y: 0, w: 80, h: 510 },
    { id: 'zone5_sanctuary', x: 380, y: 0, w: 300, h: 255 }
]

// Ordre de progression praticable sur la carte (sortie possible du secteur 1).
const SECTOR_UNLOCK_ORDER = [
    'zone1_masoala',
    'zone4_ranomafana',
    'zone2_tavy',
    'zone3_vohemar',
    'zone5_sanctuary'
]

export default class GameScene extends Scene {
    preload() {
        super.preload()
        this.lia = this.maki.player('lia')
        manager.map(this, STARTING_MAP)
        manager.preload(this)
    }

    create() {
        super.create()
        manager.create(this)

        this.zoneIndex = 0
        this.unlockedSectorIds = new Set([SECTOR_UNLOCK_ORDER[0]])
        this.unlockProgressIndex = 1
        this.ala = gameSettings.ala.initial
        this.fihavanana = gameSettings.fihavanana.initial
        this.currentQuestIndex = 0
        this.currentDialogueNodeId = null

        // Centre de la carte pleine image (680×510), aligné sur les limites du monde.
        this.lia.sprite.setPosition(MAP_HALF_W, MAP_HALF_H)
        this.lia.sprite.setCollideWorldBounds(false)
        if (this.lia.sprite.body) {
            // Hitbox plus petite et recentrée: le personnage peut descendre
            // visuellement plus bas (jusqu'au bord), sans sortir du monde.
            const body = this.lia.sprite.body
            body.setSize(body.width * 0.55, body.height * 0.45, true)
        }

        // Déplacement libre: on n'applique pas les collisions "murs" de la map.
        // Seuls les secteurs encore verrouillés bloquent le joueur.
        this.lockedSectorGroup = this.physics.add.staticGroup()
        this.physics.add.collider(this.lia.sprite, this.lockedSectorGroup)
        this.rebuildSectorLocks()

        this.cursors = this.input.keyboard.createCursorKeys()
        this.keys = this.input.keyboard.addKeys({
            up: 'Z',
            upAlt: 'W',
            left: 'Q',
            leftAlt: 'A',
            down: 'S',
            right: 'D',
            interact: 'E',
            plant: 'P',
            nextZone: 'N'
        })

        this.npc = this.add.circle(560, 300, 12, 0xf4c542).setDepth(10)
        this.npcLabel = this.add.text(525, 320, 'Tonton (E)', {
            fontSize: '12px',
            color: '#f6f6f6'
        }).setDepth(10)

        this.hud = this.add.text(12, 12, '', {
            fontSize: '14px',
            color: '#d7f9ff',
            backgroundColor: '#000000aa',
            padding: { x: 8, y: 6 }
        }).setScrollFactor(0).setDepth(20)

        this.message = this.add.text(12, 124, '', {
            fontSize: '13px',
            color: '#ffe4a3',
            backgroundColor: '#000000aa',
            padding: { x: 8, y: 6 },
            wordWrap: { width: 776 }
        }).setScrollFactor(0).setDepth(20)

        this.refreshHud()
        this.showMessage('MVP jouable: ZQSD/Fleches bouger, E parler, P planter (+Ala), N debloquer secteur.')
    }

    update() {
        this.movePlayer()

        if (Phaser.Input.Keyboard.JustDown(this.keys.interact)) {
            this.tryInteract()
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.plant)) {
            this.applyAlaDelta(gameSettings.ala.deltas.plantTree)
            this.showMessage('Tu plantes un arbre. Ala +2%.')
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.nextZone)) {
            this.unlockNextSector()
        }
        this.clampPlayerInsideMap()
        this.syncZoneFromPlayerPosition()
    }

    movePlayer() {
        const body = this.lia.sprite.body
        if (!body) return

        let vx = 0
        let vy = 0

        if (this.cursors.left.isDown || this.keys.left.isDown || this.keys.leftAlt.isDown) vx = -PLAYER_SPEED
        if (this.cursors.right.isDown || this.keys.right.isDown) vx = PLAYER_SPEED
        if (this.cursors.up.isDown || this.keys.up.isDown || this.keys.upAlt.isDown) vy = -PLAYER_SPEED
        if (this.cursors.down.isDown || this.keys.down.isDown) vy = PLAYER_SPEED

        body.setVelocity(vx, vy)
    }

    clampPlayerInsideMap() {
        const body = this.lia.sprite.body
        if (!body) return
        const minX = body.halfWidth
        const maxX = MAP_WIDTH - body.halfWidth
        const minY = body.halfHeight
        const maxY = MAP_HEIGHT + BOTTOM_VISUAL_OFFSET

        this.lia.sprite.x = Phaser.Math.Clamp(this.lia.sprite.x, minX, maxX)
        this.lia.sprite.y = Phaser.Math.Clamp(this.lia.sprite.y, minY, maxY)
    }

    tryInteract() {
        const distance = Phaser.Math.Distance.Between(
            this.lia.sprite.x,
            this.lia.sprite.y,
            this.npc.x,
            this.npc.y
        )
        if (distance > 52) {
            this.showMessage('Approche-toi de Tonton Maminiaina pour parler.')
            return
        }

        this.playDialogue('intro_baobab_maminiaina')
    }

    playDialogue(nodeId) {
        const node = dialogues.nodes.find((entry) => entry.id === nodeId)
        if (!node) return

        const firstLine = node.lines?.[0] ?? ''
        const firstChoice = node.choices?.[0]
        this.showMessage(`${node.speaker}: "${firstLine}"`)

        if (firstChoice?.effects?.fihavanana) {
            this.applyFihavananaDelta(firstChoice.effects.fihavanana)
        }
    }

    unlockNextSector() {
        if (this.unlockProgressIndex >= SECTOR_UNLOCK_ORDER.length) {
            this.showMessage('Tous les secteurs sont deja debloques.')
            return
        }

        const nextSectorId = SECTOR_UNLOCK_ORDER[this.unlockProgressIndex]
        this.unlockedSectorIds.add(nextSectorId)
        this.unlockProgressIndex += 1
        this.rebuildSectorLocks()

        const unlockedZone = zones.zones.find((zone) => zone.id === nextSectorId)
        this.showMessage(`Nouveau secteur debloque: ${unlockedZone.title}. Continue a pied.`)
        this.refreshHud()
    }

    syncZoneFromPlayerPosition() {
        const x = this.lia.sprite.x
        const y = this.lia.sprite.y
        const nextZoneIndex = SECTOR_BOUNDS.findIndex(
            (sector) =>
                x >= sector.x &&
                x < sector.x + sector.w &&
                y >= sector.y &&
                y < sector.y + sector.h
        )

        if (nextZoneIndex === -1 || nextZoneIndex === this.zoneIndex) return
        this.zoneIndex = nextZoneIndex
        this.currentQuestIndex = this.zoneIndex
        const zone = zones.zones[this.zoneIndex]
        this.showMessage(`Zone: ${zone.title} | Objectif: ${zone.goal}`)
        this.refreshHud()
    }

    rebuildSectorLocks() {
        this.lockedSectorGroup.clear(true, true)

        for (const sector of SECTOR_BOUNDS) {
            if (this.unlockedSectorIds.has(sector.id)) continue
            const rect = this.add.rectangle(
                sector.x + sector.w / 2,
                sector.y + sector.h / 2,
                sector.w,
                sector.h,
                0x000000,
                0
            )
            this.physics.add.existing(rect, true)
            this.lockedSectorGroup.add(rect)
        }
    }

    applyAlaDelta(delta) {
        const min = gameSettings.ala.min
        const max = gameSettings.ala.max
        this.ala = Phaser.Math.Clamp(this.ala + delta, min, max)
        this.refreshHud()
    }

    applyFihavananaDelta(delta) {
        const min = gameSettings.fihavanana.min
        const max = gameSettings.fihavanana.max
        this.fihavanana = Phaser.Math.Clamp(this.fihavanana + delta, min, max)
        this.refreshHud()
    }

    refreshHud() {
        const zone = zones.zones[this.zoneIndex]
        const quest = quests.quests[this.currentQuestIndex]
        this.hud.setText([
            `Zone: ${zone.title}`,
            `Ala: ${this.ala}%`,
            `Fihavanana: ${this.fihavanana}%`,
            `Quete: ${quest.title}`
        ])
    }

    showMessage(text) {
        this.message.setText(text)
    }
}
