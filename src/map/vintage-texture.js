const TILE_SIZE = 128;

function makeTile(documentRef, draw) {
  const canvas = documentRef.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  draw(context);
  return canvas;
}

/**
 * Build subtle, repeatable engraving textures for the antique map preset.
 * The tiles contain only low-opacity marks; geographic paths remain the
 * authoritative shapes and all projection/measurement code stays untouched.
 */
export function createVintageTextureTiles(documentRef) {
  if (!documentRef || typeof documentRef.createElement !== 'function') return null;

  const paper = makeTile(documentRef, context => {
    for (let index = 0; index < 230; index++) {
      const x = (index * 53 + 11) % TILE_SIZE;
      const y = (index * 47 + 29) % TILE_SIZE;
      const alpha = 0.035 + (index % 5) * 0.009;
      context.fillStyle = `rgba(91, 66, 37, ${alpha})`;
      context.fillRect(x, y, index % 9 === 0 ? 1.35 : 0.7, 0.7);
    }
    context.lineWidth = 0.45;
    for (let index = 0; index < 28; index++) {
      const x = (index * 41 + 7) % TILE_SIZE;
      const y = (index * 61 + 17) % TILE_SIZE;
      context.strokeStyle = 'rgba(105, 79, 47, 0.075)';
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 2 + index % 4, y + (index % 3) - 1);
      context.stroke();
    }
  });

  const water = makeTile(documentRef, context => {
    context.strokeStyle = 'rgba(35, 75, 79, 0.16)';
    context.lineWidth = 0.55;
    for (let row = 0; row < 9; row++) {
      const y = row * 16 + 4;
      context.beginPath();
      context.moveTo(0, y);
      context.quadraticCurveTo(28, y - 3, 64, y);
      context.quadraticCurveTo(96, y + 3, TILE_SIZE, y - 1);
      context.stroke();
    }
    for (let index = 0; index < 56; index++) {
      const x = (index * 37 + 13) % TILE_SIZE;
      const y = (index * 71 + 23) % TILE_SIZE;
      context.fillStyle = 'rgba(245, 239, 219, 0.18)';
      context.fillRect(x, y, 0.8, 0.8);
    }
  });

  const land = makeTile(documentRef, context => {
    context.strokeStyle = 'rgba(76, 55, 31, 0.13)';
    context.lineWidth = 0.42;
    for (let offset = -TILE_SIZE; offset <= TILE_SIZE; offset += 11) {
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset + TILE_SIZE, TILE_SIZE);
      context.stroke();
    }
    for (let index = 0; index < 82; index++) {
      const x = (index * 43 + 19) % TILE_SIZE;
      const y = (index * 67 + 31) % TILE_SIZE;
      context.fillStyle = 'rgba(70, 49, 28, 0.16)';
      context.fillRect(x, y, 0.75, 0.75);
    }
  });

  if (!paper || !water || !land) return null;
  return Object.freeze({ paper, water, land });
}

/** Create repeat patterns for a specific 2D context from shared texture tiles. */
export function createVintageTexturePatterns(context, tiles) {
  if (!context || typeof context.createPattern !== 'function' || !tiles) return null;
  const patterns = {
    paper: context.createPattern(tiles.paper, 'repeat'),
    water: context.createPattern(tiles.water, 'repeat'),
    land: context.createPattern(tiles.land, 'repeat')
  };
  return Object.values(patterns).every(Boolean) ? Object.freeze(patterns) : null;
}
