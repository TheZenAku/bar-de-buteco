import * as pc from 'playcanvas';

const BRAND='#d9172f';
/** The Highland Bar Delivery mark (public/highfood/logo.webp) on a square of the prop's colour, for the bag, the backpack and the stand. Plain colour until the picture arrives. */
function logoTexture(app:pc.Application,background:string):pc.Texture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const g=canvas.getContext('2d')!;
  g.fillStyle=background;g.fillRect(0,0,512,512);
  const texture=new pc.Texture(app.graphicsDevice,{width:512,height:512,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,anisotropy:4});
  texture.setSource(canvas);
  const logo=new Image();
  logo.onload=()=>{g.drawImage(logo,14,14,484,484);texture.setSource(canvas);};
  logo.src=`${import.meta.env.BASE_URL}highfood/logo.webp`;
  return texture;
}

/** What delivery work is drawn with and the game has no model of: the paper bag, the courier's backpack and the sign at the base. Plain boxes with the brand on them, sharing one mesh. */
export class HighfoodProps {
  private readonly box:pc.Mesh;
  private readonly materials=new Map<string,pc.StandardMaterial>();
  constructor(private app:pc.Application,private owned:pc.Material[]){
    this.box=pc.Mesh.fromGeometry(app.graphicsDevice,new pc.BoxGeometry({halfExtents:new pc.Vec3(.5,.5,.5)}));
  }
  private material(key:string,hex:string,logo?:string,gloss=.25):pc.StandardMaterial {
    let material=this.materials.get(key);
    if(material)return material;
    material=new pc.StandardMaterial();
    material.diffuse=new pc.Color().fromString(hex);material.gloss=gloss;material.useMetalness=false;
    if(logo){material.diffuseMap=logoTexture(this.app,logo);material.diffuse=new pc.Color(1,1,1);}
    material.update();this.materials.set(key,material);this.owned.push(material);
    return material;
  }
  private part(parent:pc.Entity,material:pc.Material,position:[number,number,number],size:[number,number,number]):pc.Entity {
    const entity=new pc.Entity('Highfood part');
    entity.addComponent('render',{meshInstances:[new pc.MeshInstance(this.box,material)],castShadows:true,receiveShadows:true});
    entity.setLocalPosition(...position);entity.setLocalScale(...size);parent.addChild(entity);
    return entity;
  }
  /** A kraft paper bag with a handle, its origin where the hand holds it. */
  bag():pc.Entity {
    const root=new pc.Entity('Highfood bag'),paper=this.material('paper','#c79a63'),front=this.material('bag-front','#c79a63','#d1a56c'),handle=this.material('handle','#8a6a3e');
    this.part(root,paper,[0,-.2,0],[.22,.26,.14]);
    this.part(root,front,[0,-.2,.0705],[.215,.25,.002]);
    this.part(root,front,[0,-.2,-.0705],[.215,.25,.002]);
    this.part(root,paper,[0,-.058,0],[.225,.024,.15]);
    this.part(root,handle,[-.05,-.02,0],[.012,.06,.012]);
    this.part(root,handle,[.05,-.02,0],[.012,.06,.012]);
    this.part(root,handle,[0,.008,0],[.112,.012,.012]);
    return root;
  }
  /** The square backpack couriers wear, its origin against the body. */
  backpack():pc.Entity {
    const root=new pc.Entity('Highfood backpack'),shell=this.material('pack','#c9162c',undefined,.45),side=this.material('pack-logo',BRAND,'#2a0a10',.45),strap=this.material('strap','#2a1a22');
    this.part(root,shell,[0,0,-.17],[.42,.46,.3]);
    this.part(root,side,[0,0,-.3215],[.38,.38,.002]);
    this.part(root,shell,[0,.24,-.17],[.44,.03,.32]);
    this.part(root,strap,[-.12,.08,-.01],[.05,.3,.025]);
    this.part(root,strap,[.12,.08,-.01],[.05,.3,.025]);
    return root;
  }
  /** A phone, screen lit, for whoever is looking at one. */
  phone():pc.Entity {
    const root=new pc.Entity('Phone in hand'),body=this.material('phone-body','#16161a',undefined,.7),screen=this.material('phone-screen','#9fc4ff',undefined,.8);
    this.part(root,body,[0,0,0],[.07,.145,.009]);
    this.part(root,screen,[0,0,.0052],[.062,.133,.001]);
    return root;
  }
  /** The sign at the base: a post with the mark on both faces and a shelf of bags waiting. Facing +Z. */
  stand():pc.Entity {
    const root=new pc.Entity('Highfood stand'),metal=this.material('stand-metal','#3b3f48',undefined,.55),face=this.material('stand-face',BRAND,'#14060a',.5),panel=this.material('stand-panel','#ffffff',undefined,.4),wood=this.material('stand-wood','#54463c');
    this.part(root,metal,[0,.92,0],[.09,1.84,.09]);
    this.part(root,panel,[0,2.25,0],[.9,.9,.07]);
    this.part(root,face,[0,2.25,.037],[.84,.84,.002]);
    this.part(root,face,[0,2.25,-.037],[.84,.84,.002]);
    this.part(root,wood,[0,.42,.04],[.8,.05,.4]);
    this.part(root,metal,[-.37,.2,.04],[.04,.4,.38]);
    this.part(root,metal,[.37,.2,.04],[.04,.4,.38]);
    for(const [x,z] of [[-.22,.08],[.04,-.03],[.26,.1]] as const){const bag=this.bag();bag.setLocalPosition(x,.76,.04+z);root.addChild(bag);}
    return root;
  }
}
