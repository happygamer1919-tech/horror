// Debug helper: crop a region of a PNG and enlarge it. node corridor3d/crop.mjs in.png out.png x y w h [scale]
import sharp from 'sharp';
const [src, dst, x, y, w, h, k = 3] = process.argv.slice(2);
await sharp(src)
  .extract({ left: +x, top: +y, width: +w, height: +h })
  .resize({ width: Math.round(w * k), kernel: 'lanczos3' })
  .png()
  .toFile(dst);
