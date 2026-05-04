import makiConfig from '../maki.config.js'
import gameSettings from '../data/game-settings.json'

/**
 * Point unique de lecture : dimensions Maki + paramètres de jeu (JSON).
 * Modifier les JSON / maki.config.js sans toucher à la logique Phaser.
 */
export function getGameConfig() {
  return {
    maki: makiConfig,
    game: gameSettings,
    canvas: {
      width: makiConfig.width,
      height: makiConfig.height
    }
  }
}
