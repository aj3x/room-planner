// @ts-check
/* ---- blueprint: image ---- */
/** @param {File|null|undefined} file @returns {Promise<{img: HTMLImageElement, url: string, file: File}>} */
function bpLoadImage(file){
  return new Promise((res,rej)=>{
    if(!file || !/^image\//.test(file.type||'')) return rej(new Error('type'));
    const f=file, url=URL.createObjectURL(f), img=new Image();
    img.onload=()=>res({img,url,file:f});
    img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src=url;
  });
}
/* never upscale for tracing — it invents nothing and costs everything */
/** @param {HTMLImageElement} img @param {number} max */
function bpFitCanvas(img,max){
  const s=Math.min(1, max/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(img.naturalWidth*s));
  c.height=Math.max(1,Math.round(img.naturalHeight*s));
  const x=/** @type {CanvasRenderingContext2D} */(c.getContext('2d'));   // a 2D context is always available
  x.imageSmoothingEnabled=true; x.imageSmoothingQuality='high';
  x.drawImage(img,0,0,c.width,c.height);
  return c;
}
/** @param {CanvasImageSource} src @param {{x: number, y: number, w: number, h: number}} r */
function bpCropCanvas(src,r){
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(r.w)); c.height=Math.max(1,Math.round(r.h));
  /** @type {CanvasRenderingContext2D} */(c.getContext('2d')).drawImage(src, Math.round(r.x), Math.round(r.y), c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

export {bpLoadImage, bpFitCanvas, bpCropCanvas};
