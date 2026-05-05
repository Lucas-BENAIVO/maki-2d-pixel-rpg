// Extension du manager @tialops/maki : mode fullImage pour une carte = une image PNG
// (sans découpage en spritesheet de tuiles).

const _sceneMaps = new Map()
const _wallGroups = new Map()

function getMapsForScene(scene) {
    const key = scene.sys.settings.key
    if (!_sceneMaps.has(key)) _sceneMaps.set(key, new Set())
    return _sceneMaps.get(key)
}

export const manager = {
    map(scene, mapName) {
        getMapsForScene(scene).add(mapName)
    },

    preload(scene) {
        for (const mapName of getMapsForScene(scene)) {
            scene.load.json(mapName, `maps/${mapName}.json`)
            scene.load.once(`filecomplete-json-${mapName}`, () => {
                const mapData = scene.cache.json.get(mapName)
                const tilesetUrl = mapData.tileset.replace(/^assets\//, '')
                const tilesetKey = `${mapName}_tileset`
                if (mapData.fullImage) {
                    scene.load.image(tilesetKey, tilesetUrl)
                } else {
                    scene.load.spritesheet(tilesetKey, tilesetUrl, {
                        frameWidth: mapData.tileSize,
                        frameHeight: mapData.tileSize
                    })
                }
                const furniture = mapData.layers?.furniture ?? []
                const seen = new Set()
                furniture.forEach(({ src }) => {
                    if (seen.has(src)) return
                    seen.add(src)
                    const key = `${mapName}_furniture_${src}`
                    if (!scene.textures.exists(key)) {
                        scene.load.image(key, src.replace(/^assets\//, ''))
                    }
                })
            })
        }
    },

    create(scene) {
        for (const mapName of getMapsForScene(scene)) {
            const mapData = scene.cache.json.get(mapName)
            const { tileSize, layers, collisions, fullImage } = mapData
            const tilesetKey = `${mapName}_tileset`

            if (fullImage) {
                const w = mapData.imageWidth
                const h = mapData.imageHeight
                if (typeof w !== 'number' || typeof h !== 'number') {
                    console.warn(
                        `[maki] fullImage requiert imageWidth et imageHeight dans maps/${mapName}.json`
                    )
                }
                scene.add.image(0, 0, tilesetKey).setOrigin(0, 0).setDepth(0)
                if (w > 0 && h > 0) {
                    scene.physics.world.setBounds(0, 0, w, h)
                }
            } else {
                const floorGrid = layers.floor ?? layers.wall ?? []
                floorGrid.forEach((row, rowIndex) => {
                    row.forEach((tileId, colIndex) => {
                        if (tileId !== 0) {
                            scene.add
                                .image(
                                    colIndex * tileSize,
                                    rowIndex * tileSize,
                                    tilesetKey,
                                    tileId - 1
                                )
                                .setOrigin(0, 0)
                                .setDepth(0)
                        }
                    })
                })
            }

            const furniture = layers?.furniture ?? []
            furniture.forEach(({ src, x, y, w, h }) => {
                const key = `${mapName}_furniture_${src}`
                if (scene.textures.exists(key)) {
                    scene.add
                        .image(x + w / 2, y + h / 2, key)
                        .setOrigin(0.5, 0.5)
                        .setDepth(1)
                }
            })

            const wallGroup = scene.physics.add.staticGroup()
            ;(collisions ?? []).forEach(({ x, y, w, h }) => {
                const rect = scene.add.rectangle(x + w / 2, y + h / 2, w, h)
                scene.physics.add.existing(rect, true)
                wallGroup.add(rect)
            })

            _wallGroups.set(`${scene.sys.settings.key}:${mapName}`, wallGroup)
        }
    },

    getWallGroup(scene, mapName) {
        return _wallGroups.get(`${scene.sys.settings.key}:${mapName}`)
    }
}
