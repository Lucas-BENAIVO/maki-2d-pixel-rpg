import { Scene } from '@tialops/maki'
import { manager } from '../systems/manager.js'
import gameSettings from '../data/game-settings.json'
import zones from '../data/zones.json'
import dialogues from '../data/dialogues.json'
import quests from '../data/quests.json'

const STARTING_MAP = 'tany_maitso_map'
const PLAYER_SPEED = 120
const MAP_HALF_W = 340
const MAP_HALF_H = 255

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
        this.ala = gameSettings.ala.initial
        this.fihavanana = gameSettings.fihavanana.initial
        this.currentQuestIndex = 0
        this.currentDialogueNodeId = null

        // Centre de la carte pleine image (680×510), aligné sur les limites du monde.
        this.lia.sprite.setPosition(MAP_HALF_W, MAP_HALF_H)
        this.lia.sprite.setCollideWorldBounds(true)

        this.physics.add.collider(this.lia.sprite, manager.getWallGroup(this, STARTING_MAP))

        this.cursors = this.input.keyboard.createCursorKeys()
        this.keys = this.input.keyboard.addKeys({
            up: 'Z',
            left: 'Q',
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
        this.showMessage('MVP jouable: ZQSD/Fleches bouger, E parler, P planter (+Ala), N zone suivante.')
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
            this.advanceZone()
        }
    }

    movePlayer() {
        const body = this.lia.sprite.body
        if (!body) return

        let vx = 0
        let vy = 0

        if (this.cursors.left.isDown || this.keys.left.isDown) vx = -PLAYER_SPEED
        if (this.cursors.right.isDown || this.keys.right.isDown) vx = PLAYER_SPEED
        if (this.cursors.up.isDown || this.keys.up.isDown) vy = -PLAYER_SPEED
        if (this.cursors.down.isDown || this.keys.down.isDown) vy = PLAYER_SPEED

        body.setVelocity(vx, vy)
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

    advanceZone() {
        this.zoneIndex = (this.zoneIndex + 1) % zones.zones.length
        this.currentQuestIndex = (this.currentQuestIndex + 1) % quests.quests.length
        const zone = zones.zones[this.zoneIndex]
        const quest = quests.quests[this.currentQuestIndex]
        this.showMessage(`Zone: ${zone.title} | Objectif: ${zone.goal} | Quete: ${quest.title}`)
        this.refreshHud()
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
