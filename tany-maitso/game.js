import Phaser from 'phaser'
import GameScene from './scenes/GameScene.js'
import { getGameConfig } from './systems/config.js'

const { canvas } = getGameConfig()

new Phaser.Game({
    type: Phaser.AUTO,
    width: canvas.width,
    height: canvas.height,
    backgroundColor: '#1a1a2e',
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    scene: [GameScene]
})
