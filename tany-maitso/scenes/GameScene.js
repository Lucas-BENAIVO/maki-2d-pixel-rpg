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
const SACRED_ANIMAL_MARKERS = [
    { x: 510, y: 120, color: 0x9cf4ff, label: 'Lemurien sacre' },
    { x: 612, y: 92, color: 0xc6ff9c, label: 'Camaleon sacre' },
    { x: 568, y: 188, color: 0xffdfa3, label: 'Voromahery sacre' }
]
const FIRE_INTERACT_DISTANCE = 56
const FIRE_MARKERS = [
    // Zone 2 (Tavy) = bas droite, mais on évite la zone noire non-jouable (x>=556,y>=288).
    // On évite aussi la proximité immédiate de Dada Koto (x≈474,y≈390).
    // Positions dispersées, toutes dans la zone jouable.
    { id: 'fire_tavy_1', zoneId: 'zone2_tavy', x: 360, y: 330 },
    { id: 'fire_tavy_2', zoneId: 'zone2_tavy', x: 370, y: 448 },
    { id: 'fire_tavy_3', zoneId: 'zone2_tavy', x: 500, y: 350 }
]
const NPC_INTERACT_DISTANCE = 52
const NPC_STATE_WARY = 'wary'
const NPC_STATE_NEUTRAL = 'neutral'
const NPC_STATE_ALLY = 'ally'
const NPC_STATE_LABELS = {
    [NPC_STATE_WARY]: 'Mefiant',
    [NPC_STATE_NEUTRAL]: 'Neutre',
    [NPC_STATE_ALLY]: 'Allie'
}
const STORY_NPCS = [
    {
        id: 'tonton_maminiaina',
        name: 'Tonton Maminiaina',
        zoneId: 'zone1_masoala',
        x: 176,
        y: 386,
        tint: 0xfff06a
    },
    {
        id: 'noro_randria',
        name: 'Noro Randria',
        zoneId: 'zone1_masoala',
        x: 242,
        y: 360,
        tint: 0xfff06a
    },
    {
        id: 'dada_koto',
        name: 'Dada Koto',
        zoneId: 'zone2_tavy',
        x: 474,
        y: 390,
        tint: 0xfff06a
    },
    {
        id: 'viktor_lauzon',
        name: 'Viktor Lauzon',
        zoneId: 'zone5_sanctuary',
        x: 546,
        y: 146,
        tint: 0xfff06a
    }
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
        this.isNarrativeEnding = false
        this.sacredAnimalsSpawned = false
        this.sacredAnimalEntities = []
        this.storyFlags = {
            noroJoined: false,
            spiritualApproachUnlocked: false,
            economicApproachUnlocked: false,
            dadaKotoConvinced: false,
            proofCount: 0,
            blessed: false
        }
        this.npcTrustScores = {}
        this.npcStates = {}
        this.activeDialogue = null

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
            activateMining: 'M',
            choice1: 'ONE',
            choice2: 'TWO',
            choice3: 'THREE'
        })

        this.buildStoryNpcs()
        this.buildFireMarkers()

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
        this.dialogueBox = this.add.text(12, 208, '', {
            fontSize: '13px',
            color: '#f9f9f9',
            backgroundColor: '#000000dd',
            padding: { x: 8, y: 6 },
            wordWrap: { width: 776 }
        }).setScrollFactor(0).setDepth(25).setVisible(false)

        this.refreshHud()
        this.updateStoryNpcVisibility()
        this.updateFireVisibility()
        this.updateNpcLabelPosition()
        this.updateFireLabelPosition()
        this.showMessage('MVP: ZQSD/Fleches bouger, E parler, P/V/C actions Ala, F/I pres d un incendie, N debloquer secteur.')
    }

    update() {
        if (this.isGameOver || this.isNarrativeEnding) return

        if (this.activeDialogue) {
            this.handleDialogueInput()
            return
        }

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
            this.tryResolveFire('extinguish')
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
            this.tryResolveFire('ignore')
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
        this.updateFireLabelPosition()
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
        let nearestNpc = null
        let nearestDistance = Number.POSITIVE_INFINITY
        for (const npc of this.storyNpcs) {
            if (!npc.sprite.visible) continue
            const distance = Phaser.Math.Distance.Between(
                this.lia.sprite.x,
                this.lia.sprite.y,
                npc.sprite.x,
                npc.sprite.y
            )
            if (distance < nearestDistance) {
                nearestDistance = distance
                nearestNpc = npc
            }
        }

        if (!nearestNpc || nearestDistance > NPC_INTERACT_DISTANCE) {
            this.showMessage('Approche-toi d un personnage pour parler (E).')
            return
        }

        this.interactWithStoryNpc(nearestNpc.id)
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
        this.updateStoryNpcVisibility()
        this.updateFireVisibility()
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
        this.updateStoryNpcVisibility()
        this.updateFireVisibility()
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

    triggerNarrativeEnding() {
        if (this.isNarrativeEnding) return
        this.isNarrativeEnding = true
        if (this.lia.sprite.body) {
            this.lia.sprite.body.setVelocity(0, 0)
        }
        this.dialogueBox.setVisible(false)
        this.activeDialogue = null

        let endingTitle = ''
        let endingText = ''
        if (this.fihavanana > 80) {
            endingTitle = 'Fin A - La Renaissance'
            endingText = 'La foret renait entierement, le pere est libere, et un programme de reforestation demarre.'
        } else if (this.fihavanana >= 40) {
            endingTitle = "Fin B - L'Espoir Fragile"
            endingText = 'La foret est partiellement sauvee, Viktor est expulse mais reviendra. La lutte continue.'
        } else {
            endingTitle = 'Fin C - Le Sacrifice'
            endingText = 'Le pere est sauve mais la foret est en grande partie perdue. "Chaque arbre plante est une victoire."'
        }

        this.showMessage(`${endingTitle} | ${endingText}`)
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
        const nearestNpc = this.getNearestVisibleNpc()
        const nearestNpcState = nearestNpc ? NPC_STATE_LABELS[this.getNpcState(nearestNpc.id)] : '-'
        this.hud.setText([
            `Zone: ${zone.title}`,
            `Ala: ${this.ala}%`,
            `Fihavanana: ${this.fihavanana}%`,
            `Quete: ${quest.title}`,
            `Etat PNJ proche: ${nearestNpcState}`
        ])
    }

    showMessage(text) {
        this.message.setText(text)
    }

    buildStoryNpcs() {
        this.storyNpcs = STORY_NPCS.map((definition) => {
            const sprite = this.add.sprite(definition.x, definition.y, 'lia').setDepth(10)
            sprite.setScale(1)
            sprite.setTint(definition.tint)
            sprite.setAlpha(1)
            if (definition.id === 'noro_randria' || definition.id === 'viktor_lauzon') {
                sprite.setFlipX(true)
            }
            const label = this.add.text(0, 0, `${definition.name} (E)`, {
                fontSize: '12px',
                color: '#f6f6f6'
            })
                .setDepth(10)
                .setBackgroundColor('#000000cc')
                .setPadding(3, 1, 3, 1)
                .setStroke('#000000', 2)
            return { ...definition, sprite, label }
        })
    }

    updateNpcLabelPosition() {
        for (const npc of this.storyNpcs) {
            npc.label.setPosition(npc.sprite.x - 54, npc.sprite.y + 20)
        }
    }

    updateStoryNpcVisibility() {
        for (const npc of this.storyNpcs) {
            const visible = this.unlockedSectorIds.has(npc.zoneId)
            npc.sprite.setVisible(visible)
            npc.label.setVisible(visible)
        }
    }

    buildFireMarkers() {
        this.fireMarkers = FIRE_MARKERS.map((definition) => {
            const glow = this.add.circle(definition.x, definition.y + 6, 15, 0xff7a00, 0.28).setDepth(11)
            const sprite = this.add.triangle(
                definition.x,
                definition.y + 3,
                0,
                14,
                12,
                14,
                6,
                0,
                0xff5a00
            ).setDepth(12)
            const ember = this.add.triangle(
                definition.x,
                definition.y + 5,
                3,
                11,
                9,
                11,
                6,
                2,
                0xffd27a
            ).setDepth(13)
            const label = this.add.text(0, 0, 'Incendie (F/I)', {
                fontSize: '11px',
                color: '#fff0d9'
            })
                .setDepth(13)
                .setBackgroundColor('#000000cc')
                .setPadding(3, 1, 3, 1)
                .setStroke('#000000', 2)

            this.tweens.add({
                targets: [sprite, ember],
                scaleY: { from: 0.88, to: 1.12 },
                scaleX: { from: 0.94, to: 1.06 },
                duration: 520 + Math.floor(Math.random() * 220),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            })
            this.tweens.add({
                targets: glow,
                alpha: { from: 0.2, to: 0.38 },
                duration: 640 + Math.floor(Math.random() * 180),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            })

            return {
                ...definition,
                glow,
                sprite,
                ember,
                label,
                isActive: true
            }
        })
    }

    updateFireLabelPosition() {
        for (const fire of this.fireMarkers) {
            fire.label.setPosition(fire.x - 42, fire.y + 18)
        }
    }

    updateFireVisibility() {
        const currentSectorId = SECTOR_BOUNDS[this.zoneIndex]?.id
        for (const fire of this.fireMarkers) {
            const visible =
                fire.isActive &&
                this.unlockedSectorIds.has(fire.zoneId) &&
                currentSectorId === fire.zoneId
            fire.glow.setVisible(visible)
            fire.sprite.setVisible(visible)
            fire.ember.setVisible(visible)
            fire.label.setVisible(visible)
        }
    }

    getNearestActiveFire() {
        let nearestFire = null
        let nearestDistance = Number.POSITIVE_INFINITY
        for (const fire of this.fireMarkers) {
            if (!fire.isActive || !fire.sprite.visible) continue
            const distance = Phaser.Math.Distance.Between(
                this.lia.sprite.x,
                this.lia.sprite.y,
                fire.x,
                fire.y
            )
            if (distance < nearestDistance) {
                nearestDistance = distance
                nearestFire = fire
            }
        }
        if (!nearestFire || nearestDistance > FIRE_INTERACT_DISTANCE) {
            return null
        }
        return nearestFire
    }

    tryResolveFire(action) {
        const nearestFire = this.getNearestActiveFire()
        if (!nearestFire) {
            this.showMessage('Aucun incendie a proximite. Approche-toi d une flamme en zone Tavy.')
            return
        }
        if (action === 'extinguish') {
            this.applyAlaDeltaWithFeedback(
                gameSettings.ala.deltas.extinguishFire,
                'Tu eteins un incendie. Ala +5%.'
            )
        } else {
            this.applyAlaDeltaWithFeedback(
                gameSettings.ala.deltas.fireSpreadIgnored,
                'Tu laisses bruler un incendie. Ala -5%.'
            )
        }
        nearestFire.isActive = false
        this.updateFireVisibility()
    }

    interactWithStoryNpc(npcId) {
        this.openDialogueForNpc(npcId)
    }

    openDialogueForNpc(npcId) {
        const state = this.getNpcState(npcId)
        const npcDialogues = dialogues.npcDialogues?.[npcId]
        const node = npcDialogues?.[state]
        if (!node) {
            this.showMessage('Ity olona ity mbola tsy vonona hiresaka.')
            return
        }
        this.activeDialogue = { npcId, node }
        if (this.lia.sprite.body) this.lia.sprite.body.setVelocity(0, 0)
        this.renderDialogue()
    }

    renderDialogue() {
        if (!this.activeDialogue) return
        const { node } = this.activeDialogue
        const lines = [
            `${node.speaker}: ${node.text}`,
            '',
            `1) ${node.choices[0].text}`,
            `2) ${node.choices[1].text}`,
            `3) ${node.choices[2].text}`,
            '',
            'Safidio ny valiny: 1 / 2 / 3'
        ]
        this.dialogueBox.setText(lines)
        this.dialogueBox.setVisible(true)
    }

    handleDialogueInput() {
        if (!this.activeDialogue) return
        if (Phaser.Input.Keyboard.JustDown(this.keys.choice1)) {
            this.selectDialogueChoice(0)
            return
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.choice2)) {
            this.selectDialogueChoice(1)
            return
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.choice3)) {
            this.selectDialogueChoice(2)
        }
    }

    selectDialogueChoice(choiceIndex) {
        if (!this.activeDialogue) return
        const { npcId, node } = this.activeDialogue
        const choice = node.choices[choiceIndex]
        if (!choice) return

        let trustDelta = choice.trust ?? 0
        let fihavananaDelta = choice.fihavanana ?? 0
        const feedbackParts = []

        if (choice.needsEconomic && !this.storyFlags.economicApproachUnlocked) {
            trustDelta -= 2
            fihavananaDelta -= 3
            feedbackParts.push('Tsy mbola nosokafana ny fomba ara-toekarena ka tsy nino i Dada Koto.')
        }
        if (choice.needsSpiritual && !this.storyFlags.spiritualApproachUnlocked) {
            trustDelta -= 2
            fihavananaDelta -= 3
            feedbackParts.push('Tsy mbola nohamafisina ny fomba ara-panahy ka nihena ny fitokisana.')
        }
        if (choice.requireProofs && this.storyFlags.proofCount < 3) {
            trustDelta -= 2
            fihavananaDelta -= 2
            feedbackParts.push('Tsy ampy porofo (3 no ilaina) ka mbola misalasala i Viktor.')
        }
        if (choice.requireDadaSupport && !this.storyFlags.dadaKotoConvinced) {
            trustDelta -= 1
            fihavananaDelta -= 2
            feedbackParts.push('Tsy mbola miaraka aminao i Dada Koto, ka malemy ny valiny.')
        }

        if (fihavananaDelta !== 0) {
            this.applyFihavananaDelta(fihavananaDelta)
        }
        this.applyNpcTrustDelta(npcId, trustDelta)
        this.applyDialogueRewards(choice, npcId, feedbackParts)

        const stateLabel = NPC_STATE_LABELS[this.getNpcState(npcId)]
        const summary = [
            `${node.speaker}: safidy voaray.`,
            `Fihavanana ${fihavananaDelta >= 0 ? '+' : ''}${fihavananaDelta}.`,
            `Etat ankehitriny: ${stateLabel}.`
        ]
        if (feedbackParts.length > 0) {
            summary.push(feedbackParts.join(' '))
        }
        this.showMessage(summary.join(' '))
        this.dialogueBox.setVisible(false)
        this.activeDialogue = null
        if (npcId === 'viktor_lauzon') {
            this.triggerNarrativeEnding()
            return
        }
        this.refreshHud()
    }

    applyDialogueRewards(choice, npcId, feedbackParts) {
        if (choice.unlockInfo) {
            feedbackParts.push(`Info voasokatra: ${choice.unlockInfo}.`)
        }
        if (choice.proofGain) {
            this.storyFlags.proofCount = Math.min(3, this.storyFlags.proofCount + choice.proofGain)
            feedbackParts.push(`Porofo voaangona: ${this.storyFlags.proofCount}/3.`)
        }
        if (choice.joinTeam) {
            this.storyFlags.noroJoined = true
            feedbackParts.push('Noro tafiditra ao anaty ekipa.')
        }
        if (choice.unlockApproach === 'economic') {
            this.storyFlags.economicApproachUnlocked = true
            feedbackParts.push('Fomba ara-toekarena voasokatra.')
        }
        if (choice.unlockApproach === 'spiritual') {
            this.storyFlags.spiritualApproachUnlocked = true
            feedbackParts.push('Fomba ara-panahy voasokatra.')
        }
        if (choice.bless) {
            this.storyFlags.blessed = true
            this.applyFihavananaDelta(2)
            feedbackParts.push('Nahazo tso-drano: Fihavanana +2 fanampiny.')
        }
        if (choice.teachCharcoal) {
            this.storyFlags.dadaKotoConvinced = true
            this.applyAlaDelta(gameSettings.ala.deltas.convinceVillager)
            feedbackParts.push('Dada Koto nanaiky hampianatra charbon vert. Ala +3%.')
        }
        if (choice.finalSupport) {
            this.storyFlags.dadaKotoConvinced = true
            feedbackParts.push('Dada Koto hiaraka aminao amin ny famaranana.')
        }
        if (npcId === 'tonton_maminiaina') {
            this.storyFlags.spiritualApproachUnlocked = true
        }
        if (npcId === 'noro_randria' && this.storyFlags.noroJoined) {
            this.storyFlags.economicApproachUnlocked = true
        }
    }

    getNpcState(npcId) {
        if (!this.npcStates[npcId]) {
            this.npcStates[npcId] = NPC_STATE_NEUTRAL
        }
        return this.npcStates[npcId]
    }

    applyNpcTrustDelta(npcId, trustDelta) {
        const current = this.npcTrustScores[npcId] ?? 0
        const next = Phaser.Math.Clamp(current + trustDelta, -6, 6)
        this.npcTrustScores[npcId] = next
        if (next <= -2) {
            this.npcStates[npcId] = NPC_STATE_WARY
            return
        }
        if (next >= 3) {
            this.npcStates[npcId] = NPC_STATE_ALLY
            return
        }
        this.npcStates[npcId] = NPC_STATE_NEUTRAL
    }

    getNearestVisibleNpc() {
        let nearestNpc = null
        let nearestDistance = Number.POSITIVE_INFINITY
        for (const npc of this.storyNpcs) {
            if (!npc.sprite.visible) continue
            const distance = Phaser.Math.Distance.Between(
                this.lia.sprite.x,
                this.lia.sprite.y,
                npc.sprite.x,
                npc.sprite.y
            )
            if (distance < nearestDistance) {
                nearestDistance = distance
                nearestNpc = npc
            }
        }
        return nearestNpc
    }
}
