# tany-maitso

A Phaser game built with [@tialops/maki](https://www.npmjs.com/package/@tialops/maki).

## What You Get

- A ready-to-run Phaser game setup
- A starter scene: `scenes/GameScene.js`
- A starter sprite: `sprites/lia.png`
- Main entry file: `game.js`

## Very Simple Flow

1. Run dev server

```bash
maki dev
```

2. Add a scene

Create `scenes/MenuScene.js`:

```js
import { Scene } from '@tialops/maki'

export default class MenuScene extends Scene {
    preload() { super.preload() }
    create()  { super.create()  }
    update()  {}
}
```

Then register it in `game.js`:

```js
import Phaser from 'phaser'
import GameScene from './scenes/GameScene.js'
import MenuScene from './scenes/MenuScene.js'

new Phaser.Game({
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#1a1a2e',
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [MenuScene, GameScene]
})
```

3. Create a tilemap

```bash
maki tilemap
```

| Prompt | Notes |
|--------|-------|
| Tile size | 8 / 16 / 32 / 64 px or custom |
| Map name | saved as `assets/maps/<name>.json` |
| Load existing? | reloads a previously saved map to edit |
| Map width (tiles) | defaults to canvas width ÷ tile size |
| Map height (tiles) | defaults to canvas height ÷ tile size |

Canvas size is read from `maki.config.js` so the default dimensions always match your game.
Paint tiles, mark collision areas, then click **Export**.

4. Add your own sprite

- Put your spritesheet PNG inside `sprites/`
- Run:

```bash
maki new sprite
```

This creates `maki.config.js` based on your sprite layout.
