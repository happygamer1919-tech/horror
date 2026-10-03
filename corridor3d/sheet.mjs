// Debug helper: a contact sheet of PNGs. node corridor3d/sheet.mjs out.png cols cellW cellH a.png b.png ...
import sharp from 'sharp';
const [dst, cols, cw, ch, ...files] = process.argv.slice(2);
const C = +cols, W = +cw, H = +ch;
const rows = Math.ceil(files.length / C);
const ims = await Promise.all(files.map((f) => sharp(f).resize(W, H, { fit: 'fill' }).toBuffer()));
await sharp({ create: { width: C * W, height: rows * H, channels: 3, background: '#000' } })
  .composite(ims.map((b, k) => ({ input: b, left: (k % C) * W, top: Math.floor(k / C) * H })))
  .png().toFile(dst);
