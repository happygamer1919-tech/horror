const sharp=require('sharp');
// Evens out sharpness along the walk: the keyframes come out of the video model much crisper
// than the frames in motion. Crisp frames are softened a touch, soft ones get an unsharp mask.
// Measured as the variance of a Laplacian at 800 px wide. Returns a new raw RGB buffer.
const lapVar=async(buf,w,h)=>{const {data,info}=await sharp(buf,{raw:{width:w,height:h,channels:3}}).resize(800).greyscale().raw().toBuffer({resolveWithObject:true});const W2=info.width,H2=info.height;let s=0,s2=0,n=0;for(let y=1;y<H2-1;y++)for(let x=1;x<W2-1;x++){const i=y*W2+x;const v=4*data[i]-data[i-1]-data[i+1]-data[i-W2]-data[i+W2];s+=v;s2+=v*v;n++;}return s2/n-(s/n)**2;};
async function evenSharpness(buf,w,h){const v=await lapVar(buf,w,h); let img=sharp(buf,{raw:{width:w,height:h,channels:3}});
  if(v>300) img=img.blur(0.35+0.5*Math.min(1,(v-300)/400));   // keyframes come out crisper than the frames beside them
  else if(v<260) img=img.sharpen({sigma:1.1,m1:0.5+0.9*Math.min(1,(260-v)/200),m2:1.0+1.2*Math.min(1,(260-v)/200)});
  else return buf;
  return img.raw().toBuffer();}
module.exports={evenSharpness,lapVar};
