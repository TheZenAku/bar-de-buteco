import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PHOTO_FILTERS,applyFilter,type PhotoFilter} from '../../apps/web/src/phone/filters';

// ImageData without a browser: the filter only reads width, height and the RGBA bytes.
const image=(width:number,height:number,rgb:[number,number,number])=>{
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4){data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;}
  return {width,height,data,colorSpace:'srgb'} as ImageData;
};
const filter=(id:string)=>PHOTO_FILTERS.find(item=>item.id===id)!;
const pixel=(picture:ImageData,x=0,y=0)=>[...picture.data.slice((y*picture.width+x)*4,(y*picture.width+x)*4+4)];

test('Highgram filters: Normal and zero strength leave the photo alone, ids are unique',()=>{
  assert.equal(new Set(PHOTO_FILTERS.map(item=>item.id)).size,PHOTO_FILTERS.length);
  const picture=image(4,4,[120,80,40]);
  applyFilter(picture,filter('normal'));assert.deepEqual(pixel(picture),[120,80,40,255]);
  applyFilter(picture,filter('juno'),0);assert.deepEqual(pixel(picture),[120,80,40,255]);
});

test('Highgram filters: black and white is grey, warmth warms, sepia browns, alpha untouched',()=>{
  const mono=image(2,2,[200,40,40]);applyFilter(mono,filter('moon'));
  const [r,g,b,a]=pixel(mono);assert.equal(r,g);assert.equal(g,b);assert.equal(a,255);
  const warm=image(2,2,[128,128,128]);applyFilter(warm,{id:'warm',name:'Quente',warmth:1} satisfies PhotoFilter);
  assert.ok(pixel(warm)[0]!>pixel(warm)[2]!,'red over blue');
  const sepia=image(2,2,[128,128,128]);applyFilter(sepia,filter('sepia'));
  const [sr,sg,sb]=pixel(sepia);assert.ok(sr!>sg!&&sg!>sb!,'sepia: red, then green, then blue');
});

test('Highgram filters: half strength lands between the photo and the full filter; the vignette darkens the corners only',()=>{
  const full=image(2,2,[60,140,200]),half=image(2,2,[60,140,200]);
  applyFilter(full,filter('clarendon'));applyFilter(half,filter('clarendon'),.5);
  for(let channel=0;channel<3;channel++){
    const original=[60,140,200][channel]!,low=Math.min(original,pixel(full)[channel]!),high=Math.max(original,pixel(full)[channel]!);
    assert.ok(pixel(half)[channel]!>=low-1&&pixel(half)[channel]!<=high+1);
  }
  const framed=image(41,41,[200,200,200]);applyFilter(framed,{id:'vignette',name:'Vinheta',vignette:.5});
  assert.deepEqual(pixel(framed,20,20),[200,200,200,255],'the middle keeps its light');
  assert.ok(pixel(framed,0,0)[0]!<130,'a corner is darker');
});
