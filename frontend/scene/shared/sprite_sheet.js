const ATLAS_PATHS = {
  city_sprites: '/assets/sprites/city_sprites.json',
};

const atlasCache = new Map();

function buildFallback(targetH = 64, fallback = {}) {
  const width = fallback.width ?? Math.max(20, targetH * 0.65);
  const height = fallback.height ?? targetH;
  const color = fallback.color ?? 0x6c7a89;
  const alpha = fallback.alpha ?? 1;
  const rect = new PIXI.Graphics();
  rect.beginFill(color, alpha);
  rect.drawRoundedRect(-width / 2, -height, width, height, 6);
  rect.endFill();
  return rect;
}

async function getAtlas(atlasName) {
  if (atlasCache.has(atlasName)) {
    return atlasCache.get(atlasName);
  }

  const atlasPath = ATLAS_PATHS[atlasName];
  if (!atlasPath) {
    atlasCache.set(atlasName, null);
    return null;
  }

  try {
    const sheet = await PIXI.Assets.load(atlasPath);
    atlasCache.set(atlasName, sheet ?? null);
    return sheet ?? null;
  } catch {
    atlasCache.set(atlasName, null);
    return null;
  }
}

/**
 * Return a Kenney sprite scaled to target height.
 */
export async function kSprite(atlasName, targetH = 64, fallback = {}) {
  const [sheetName, frameName] = atlasName.includes(':') ? atlasName.split(':') : ['city_sprites', atlasName];
  const atlas = await getAtlas(sheetName);
  const texture = atlas?.textures?.[frameName];

  if (!texture) {
    return buildFallback(targetH, fallback);
  }

  const sprite = new PIXI.Sprite(texture);
  const scale = targetH / sprite.height;
  sprite.scale.set(scale);
  sprite.anchor.set(0.5, 1);
  return sprite;
}

/**
 * Pick random sprite key and resolve via kSprite.
 */
export async function kRand(names, targetH = 64, fallback = {}) {
  if (!Array.isArray(names) || names.length === 0) {
    return buildFallback(targetH, fallback);
  }

  const index = Math.floor(Math.random() * names.length);
  return kSprite(names[index], targetH, fallback);
}
