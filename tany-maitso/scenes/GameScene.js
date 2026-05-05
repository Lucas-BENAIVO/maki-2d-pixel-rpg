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
const VERTICAL_ZONE_SPLIT_Y = 271
const RIGHT_ZONE_START_X = 316
const PLAYER_HITBOX_WIDTH_RATIO = 0.9
const PLAYER_HITBOX_HEIGHT_RATIO = 0.45
const LOCKED_RIGHT_BOTTOM_MARGIN_X = 44
const LOCKED_RIGHT_TOP_SHIFT_X = 80
const TONTON_PRIMARY_POS = { x: 180, y: 390 } // Secteur 1: village de Masoala
const TONTON_SECONDARY_POS = { x: 308, y: 340 } // Entree du corridor de Ranomafana (secteur 4)
const SACRED_ANIMAL_MARKERS = [
    { x: 510, y: 120, color: 0x9cf4ff, label: 'Lemurien sacre' },
    { x: 612, y: 92, color: 0xc6ff9c, label: 'Camaleon sacre' },
    { x: 568, y: 188, color: 0xffdfa3, label: 'Voromahery sacre' }
]
const NON_PLAYABLE_AREAS = [
    // Zone noire en bas a droite: hors zone jouable.
    { x: 556, y: 288, w: 124, h: 222 }
]

// Une seule grande carte, divisée en 5 secteurs interconnectés.
const SECTOR_BOUNDS = [
    { id: 'zone1_masoala', x: 0, y: VERTICAL_ZONE_SPLIT_Y, w: 300, h: MAP_HEIGHT - VERTICAL_ZONE_SPLIT_Y },
    { id: 'zone2_tavy', x: RIGHT_ZONE_START_X, y: VERTICAL_ZONE_SPLIT_Y, w: MAP_WIDTH - RIGHT_ZONE_START_X, h: MAP_HEIGHT - VERTICAL_ZONE_SPLIT_Y },
    { id: 'zone3_vohemar', x: 0, y: 0, w: 300, h: VERTICAL_ZONE_SPLIT_Y },
    { id: 'zone4_ranomafana', x: 300, y: 0, w: RIGHT_ZONE_START_X - 300, h: 510 },
    { id: 'zone5_sanctuary', x: RIGHT_ZONE_START_X, y: 0, w: MAP_WIDTH - RIGHT_ZONE_START_X, h: VERTICAL_ZONE_SPLIT_Y }
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
        this.isGameOver = false
        this.sacredAnimalsSpawned = false
        this.sacredAnimalEntities = []

        // Centre de la carte pleine image (680×510), aligné sur les limites du monde.
        this.lia.sprite.setPosition(MAP_HALF_W, MAP_HALF_H)
        this.lia.sprite.setCollideWorldBounds(false)
        if (this.lia.sprite.body) {
            // Hitbox plus petite et recentrée: le personnage peut descendre
            // visuellement plus bas (jusqu'au bord), sans sortir du monde.
            const body = this.lia.sprite.body
            body.setSize(
                body.width * PLAYER_HITBOX_WIDTH_RATIO,
                body.height * PLAYER_HITBOX_HEIGHT_RATIO,
                true
            )
        }

        // Déplacement libre: on n'applique pas les collisions "murs" de la map.
        // Seuls les secteurs encore verrouillés bloquent le joueur.
        this.lockedSectorGroup = this.physics.add.staticGroup()
        this.physics.add.collider(this.lia.sprite, this.lockedSectorGroup)
        this.rebuildSectorLocks()
        this.nonPlayableGroup = this.physics.add.staticGroup()
        this.buildNonPlayableCollisions()
        this.physics.add.collider(this.lia.sprite, this.nonPlayableGroup)

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
            nextZone: 'N',
            extinguishFire: 'F',
            plantVoanAla: 'V',
            convinceVillager: 'C',
            ignoreFire: 'I',
            activateMining: 'M'
        })

        this.npc = this.add.circle(TONTON_PRIMARY_POS.x, TONTON_PRIMARY_POS.y, 12, 0xf4c542).setDepth(10)
        this.npcLabel = this.add.text(0, 0, 'Dadatoa (E)', {
            fontSize: '12px',
            color: '#f6f6f6'
        }).setDepth(10)
        this.updateNpcLabelPosition()

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
        this.showMessage('MVP: ZQSD/Fleches bouger, E parler, P/F/V/C/I/M actions Ala, N debloquer secteur.')
    }

    update() {
        if (this.isGameOver) return

        this.movePlayer()

        if (Phaser.Input.Keyboard.JustDown(this.keys.interact)) {
            this.tryInteract()
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.plant)) {
            this.applyAlaDeltaWithFeedback(
                gameSettings.ala.deltas.plantTree,
                'Tu plantes un arbre. Ala +2%.'
            )
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.extinguishFire)) {
            this.applyAlaDeltaWithFeedback(
                gameSettings.ala.deltas.extinguishFire,
                'Tu eteins un incendie. Ala +5%.'
            )
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.plantVoanAla)) {
            this.applyAlaDeltaWithFeedback(
                gameSettings.ala.deltas.plantVoanAla,
                "Tu plantes une Voan'Ala. Ala +10%."
            )
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.convinceVillager)) {
            this.applyAlaDeltaWithFeedback(
                gameSettings.ala.deltas.convinceVillager,
                'Tu convaincs un villageois. Ala +3%.'
            )
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.ignoreFire)) {
            this.applyAlaDeltaWithFeedback(
                gameSettings.ala.deltas.fireSpreadIgnored,
                'Un incendie se propage sans intervention. Ala -5%.'
            )
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.activateMining)) {
            this.applyAlaDeltaWithFeedback(
                gameSettings.ala.deltas.miningZoneActive,
                'Une zone miniere est activee. Ala -8%.'
            )
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.nextZone)) {
            this.unlockNextSector()
        }
        this.clampPlayerInsideMap()
        this.syncZoneFromPlayerPosition()
        this.updateNpcLabelPosition()
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
            this.showMessage('Approche-toi de Dadatoa Maminiaina pour parler.')
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
        if (nextSectorId === 'zone4_ranomafana') {
            this.setNpcPosition(TONTON_SECONDARY_POS.x, TONTON_SECONDARY_POS.y)
        }

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
            let lockX = sector.x
            let lockW = sector.w
            if (sector.id === 'zone2_tavy') {
                lockX = sector.x - LOCKED_RIGHT_BOTTOM_MARGIN_X
                lockW = sector.w + LOCKED_RIGHT_BOTTOM_MARGIN_X
            } else if (sector.id === 'zone5_sanctuary') {
                lockX = sector.x + LOCKED_RIGHT_TOP_SHIFT_X
                lockW = sector.w - LOCKED_RIGHT_TOP_SHIFT_X
            }
            const rect = this.add.rectangle(
                lockX + lockW / 2,
                sector.y + sector.h / 2,
                lockW,
                sector.h,
                0x000000,
                0
            )
            this.physics.add.existing(rect, true)
            this.lockedSectorGroup.add(rect)
        }
    }

    buildNonPlayableCollisions() {
        this.nonPlayableGroup.clear(true, true)
        for (const area of NON_PLAYABLE_AREAS) {
            const rect = this.add.rectangle(
                area.x + area.w / 2,
                area.y + area.h / 2,
                area.w,
                area.h,
                0x000000,
                0
            )
            this.physics.add.existing(rect, true)
            this.nonPlayableGroup.add(rect)
        }
    }

    applyAlaDelta(delta) {
        const min = gameSettings.ala.min
        const max = gameSettings.ala.max
        this.ala = Phaser.Math.Clamp(this.ala + delta, min, max)
        this.refreshHud()
        this.evaluateAlaState()
    }

    applyAlaDeltaWithFeedback(delta, actionText) {
        this.applyAlaDelta(delta)
        if (!this.isGameOver) {
            this.showMessage(actionText)
        }
    }

    evaluateAlaState() {
        if (this.ala <= gameSettings.ala.gameOverAt) {
            this.triggerGameOver()
            return
        }
        if (!this.sacredAnimalsSpawned && this.ala > gameSettings.ala.sacredAnimalsThreshold) {
            this.spawnSacredAnimals()
            this.showMessage('Ala depasse 80%: les animaux sacres apparaissent sur la carte.')
        }
    }

    triggerGameOver() {
        this.isGameOver = true
        if (this.lia.sprite.body) {
            this.lia.sprite.body.setVelocity(0, 0)
        }
        this.showMessage('Ala est tombee a 0%. Game Over.')
    }

    spawnSacredAnimals() {
        this.sacredAnimalsSpawned = true
        this.sacredAnimalEntities = SACRED_ANIMAL_MARKERS.map((marker) => {
            const aura = this.add.circle(marker.x, marker.y, 10, marker.color).setDepth(11)
            const label = this.add.text(marker.x - 34, marker.y + 12, marker.label, {
                fontSize: '10px',
                color: '#f5ffe5',
                backgroundColor: '#00000088',
                padding: { x: 4, y: 2 }
            }).setDepth(11)
            return { aura, label }
        })
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

    setNpcPosition(x, y) {
        this.npc.setPosition(x, y)
        this.updateNpcLabelPosition()
    }

    updateNpcLabelPosition() {
        this.npcLabel.setPosition(this.npc.x - 35, this.npc.y + 20)
    }
}
