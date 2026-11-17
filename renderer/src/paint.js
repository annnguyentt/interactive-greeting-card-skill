// The masks for a card with the paint finish: a picture painted in thick paint (impasto, gouache,
// oils), the way the Christmas cards were made, read by the shader's PAINT path:
//
//   R  gold paint, which shines like foil (whatever the foil settings pick out, if anything)
//   G  wet paint, how glossy: by how worked the stroke is, since thick paint has the most light
//      and dark close together; none on bare paper
//   B  how much relief: all of it in the paint, a little in the paper's tooth
//
// The relief itself the shader takes from the picture: a ridge of paint is lit on one side and
// shaded on the other, so the way its light and dark run stands in for its slope.

import { blur, groundMaskOf } from './studio.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function paintFxOf(cover, foil = null) {
  const { w, h, lum, ground } = cover;
  const bare = ground.plain ? groundMaskOf(cover) : null;
  const sq = new Float32Array(lum.length);
  for (let i = 0; i < lum.length; i++) sq[i] = lum[i] * lum[i];
  const mean = blur(lum, w, h, 3, 2);
  const meanSq = blur(sq, w, h, 3, 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const img = g.createImageData(w, h);
  for (let i = 0; i < lum.length; i++) {
    const paint = bare ? 1 - bare[i] : 1;
    const energy = Math.sqrt(Math.max(meanSq[i] - mean[i] * mean[i], 0));
    const gold = foil ? foil[i] : 0;
    const gloss = paint * (0.5 + 0.5 * smoothstep(0.02, 0.07, energy)) * (1 - gold);
    img.data[i * 4] = gold * 255;
    img.data[i * 4 + 1] = gloss * 255;
    img.data[i * 4 + 2] = (0.4 + 0.6 * paint) * 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvas;
}
