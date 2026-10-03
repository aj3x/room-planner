/* ---- blueprint: image ---- */
function bpLoadImage(file){
  return new Promise((res,rej)=>{
    if(!file || !/^image\//.test(file.type||'')) return rej(new Error('type'));
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>res({img,url,file});
    img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src=url;
  });
}
/* never upscale for tracing — it invents nothing and costs everything */
function bpFitCanvas(img,max){
  const s=Math.min(1, max/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(img.naturalWidth*s));
  c.height=Math.max(1,Math.round(img.naturalHeight*s));
  const x=c.getContext('2d');
  x.imageSmoothingEnabled=true; x.imageSmoothingQuality='high';
  x.drawImage(img,0,0,c.width,c.height);
  return c;
}
function bpCropCanvas(src,r){
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(r.w)); c.height=Math.max(1,Math.round(r.h));
  c.getContext('2d').drawImage(src, Math.round(r.x), Math.round(r.y), c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

export {bpLoadImage, bpFitCanvas, bpCropCanvas};
