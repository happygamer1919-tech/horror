// Round 3 scare grade (clip scarec.mp4, frames fsc/): puts the face in the door gap into deep, warm shadow.
// Only pixels that changed against the clip's first frame, inside the window where the gap
// opens (the handle edge of door 308), are touched. The face goes to about a quarter of its
// level, the clothes below it almost to black, the hand on the door edge stays readable, and
// a soft spot keeps the one visible eye catching the torch.
// grade(frame, first, width, height) -> Promise<Buffer>: frame and first are raw RGB buffers
// (the clip frame and the clip's first frame); the result is a new raw RGB buffer.
// This is the lead's scare-grade.cjs of review round 3 with its constants and its per-pixel
// code unchanged; only the reading and writing of files around it was taken out.
// Coordinates are in the 2560x1440 source frame.
const sharp=require('sharp');
const X0=1790, X1=1968, FE=16;            // window: door edge with the hand, and the gap
const FACE_K=0.27, BODY_K=0.10, HAND_K=0.48; // darkening factors
const FACE_Y1=645, HAND_Y0=830, HAND_Y1=1010; // face above FACE_Y1, hand between HAND_Y0 and HAND_Y1
const EYE={x:1933,y:513,r:34,k:0.62};      // the eye keeps more light
const WARM=[1.0,0.85,0.66];                // towards the torch's amber
const ss=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
async function grade(frame,first,w,h){
  const a={data:frame}, b=first;
  const d=Buffer.alloc(w*h);
  for(let i=0,p=0;i<w*h;i++,p+=3){const la=(a.data[p]*3+a.data[p+1]*6+a.data[p+2])/10, lb=(b[p]*3+b[p+1]*6+b[p+2])/10; d[i]=Math.min(255,Math.abs(la-lb)*6);}
  const mm=await sharp(d,{raw:{width:w,height:h,channels:1}}).blur(6).toColourspace('b-w').raw().toBuffer({resolveWithObject:true});
  if(mm.info.channels!==1) throw new Error('mask has '+mm.info.channels+' channels');
  const m=mm.data, o=Buffer.from(a.data);
  const XF=1893;                       // left edge of the gap itself: face and clothes are only darkened to the right of it
  for(let y=0;y<h;y++)for(let x=X0-FE;x<X1+FE;x++){
    const i=y*w+x, p=i*3; let wx=1; if(x<X0)wx=(x-(X0-FE))/FE; else if(x>X1)wx=1-(x-X1)/FE;
    let t=ss(30,100,m[i])*wx; if(t<=0) continue;
    const hand=ss(HAND_Y0-20,HAND_Y0+10,y)*(1-ss(HAND_Y1-20,HAND_Y1,y));
    // left of the gap only skin is touched (the hand on the door edge), never the moving wood or the brass
    const R=a.data[p],G=a.data[p+1],B=a.data[p+2], lum=(R*3+G*6+B)/10;
    const skin=ss(105,150,lum)*(1-ss(2.3,2.9,R/Math.max(1,B)));
    const inGap=ss(XF-10,XF+6,x);
    t*=Math.max(inGap,hand*skin); if(t<=0) continue;
    const body=ss(FACE_Y1-30,FACE_Y1+40,y)*(1-hand);
    let k=FACE_K*(1-body)+BODY_K*body; k=k*(1-hand)+HAND_K*hand;
    const de=Math.hypot(x-EYE.x,y-EYE.y); const e=1-ss(EYE.r*0.4,EYE.r,de); k=k*(1-e)+Math.max(k,EYE.k)*e;
    const g=1-t*(1-k); const wt=t;
    o[p]=o[p]*g*(1-wt+wt*WARM[0]); o[p+1]=o[p+1]*g*(1-wt+wt*WARM[1]); o[p+2]=o[p+2]*g*(1-wt+wt*WARM[2]);
  }
  return o;
}
module.exports={grade};
