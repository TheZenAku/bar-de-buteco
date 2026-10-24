import * as pc from 'playcanvas';

export interface MapEffectsStatus {
  fire: boolean;
  smoke: boolean;
  embers: boolean;
  taps: number;
  pouring: boolean;
  activeTap: number | null;
  particles: number;
}

/**
 * Turns Blender's lightweight FX anchors into runtime effects. The deliberately small, soft
 * sprites suit the map's PS2-era visual language and keep both overdraw and particle simulation
 * cheap. The ember texture itself remains the one embedded in the authored GLB.
 */
export class MapEffects {
  private readonly root = new pc.Entity('Map authored effects');
  private readonly textures: pc.Texture[] = [];
  private readonly materials: pc.StandardMaterial[] = [];
  private readonly emberInstances: pc.MeshInstance[] = [];
  private readonly streams: pc.Entity[] = [];
  private fire?: pc.Entity;
  private smoke?: pc.Entity;
  private fireLight?: pc.Entity;
  private activeTap: number | null = null;
  private pouring = false;
  private materialStep = -1;

  constructor(private readonly app: pc.Application, map: pc.Entity) {
    app.root.addChild(this.root);
    this.createEmbers(map.findByName('Carrinho_Espeto_FX_Brasas') as pc.Entity|null);
    this.createFire(map.findByName('Carrinho_Espeto_FX_Fogo') as pc.Entity|null);
    this.createSmoke(map.findByName('Carrinho_Espeto_FX_Fumaca') as pc.Entity|null);
    for (const name of ['Chopeira_FX_Torneira_1','Chopeira_FX_Torneira_2']) {
      this.createTap(map.findByName(name) as pc.Entity|null);
    }
    const missing = [!this.emberInstances.length&&'brasas',!this.fire&&'fogo',!this.smoke&&'fumaça',this.streams.length!==2&&'torneiras'].filter(Boolean);
    if (missing.length) console.warn(`FX do mapa ausentes: ${missing.join(', ')}`);
  }

  private sprite(name:string,smoke=false):pc.Texture {
    const size=32,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const context=canvas.getContext('2d')!;
    const pixels=context.createImageData(size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const dx=(x+.5-size/2)/(size/2),dy=(y+.5-size/2)/(size/2);
      const distance=Math.sqrt(dx*dx+dy*dy),noise=((x*17+y*31+x*y*3)%23)/23;
      const edge=Math.max(0,Math.min(1,(1-distance)*4));
      const alpha=edge*(smoke ? .56+.24*noise : .82+.18*noise);
      const offset=(y*size+x)*4;
      pixels.data[offset]=255;pixels.data[offset+1]=255;pixels.data[offset+2]=255;
      pixels.data[offset+3]=Math.round(alpha*255);
    }
    context.putImageData(pixels,0,0);
    const texture=new pc.Texture(this.app.graphicsDevice,{name,width:size,height:size,format:pc.PIXELFORMAT_SRGBA8,mipmaps:true,
      minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
    texture.setSource(canvas);this.textures.push(texture);return texture;
  }

  private createEmbers(marker:pc.Entity|null):void {
    if(!marker)return;
    for(const render of marker.findComponents('render') as pc.RenderComponent[])this.emberInstances.push(...render.meshInstances);
  }

  private createFire(marker:pc.Entity|null):void {
    if(!marker)return;
    const entity=new pc.Entity('FX fire particles');entity.setPosition(marker.getPosition());this.root.addChild(entity);
    entity.addComponent('particlesystem',{numParticles:10,lifetime:.72,rate:.055,rate2:.09,loop:true,preWarm:true,
      emitterShape:pc.EMITTERSHAPE_BOX,emitterExtents:[.11,.025,.11],initialVelocity:0,localSpace:true,
      colorMap:this.sprite('PS2 fire sprite'),lighting:false,intensity:1.2,depthWrite:false,useFog:true,useTonemap:true,
      blendType:pc.BLEND_ADDITIVE,sort:pc.PARTICLESORT_NONE,
      localVelocityGraph:{type:pc.CURVE_LINEAR,keys:[[0,0,1,.04],[0,.42,1,.92],[0,0,1,.03]]},
      localVelocityGraph2:{type:pc.CURVE_LINEAR,keys:[[0,0,1,-.04],[0,.62,1,1.18],[0,0,1,-.03]]},
      scaleGraph:{type:pc.CURVE_LINEAR,keys:[0,.2,.18,.34,.7,.18,1,.02]},
      scaleGraph2:{type:pc.CURVE_LINEAR,keys:[0,.28,.2,.42,.72,.23,1,.03]},
      alphaGraph:{type:pc.CURVE_LINEAR,keys:[0,0,.08,1,.65,.72,1,0]},
      colorGraph:{type:pc.CURVE_LINEAR,keys:[[0,1,1,.95],[0,.36,.45,.06],[0,.03,1,0]]},
      rotationSpeedGraph:{type:pc.CURVE_LINEAR,keys:[0,-38,1,22]},rotationSpeedGraph2:{type:pc.CURVE_LINEAR,keys:[0,42,1,-18]}});
    const light=new pc.Entity('FX fire glow');light.setPosition(marker.getPosition());light.addComponent('light',{type:'omni',color:new pc.Color(1,.23,.045),
      intensity:3.2,range:3.4,castShadows:false,falloffMode:pc.LIGHTFALLOFF_LINEAR});this.root.addChild(light);
    this.fire=entity;this.fireLight=light;
  }

  private createSmoke(marker:pc.Entity|null):void {
    if(!marker)return;
    const entity=new pc.Entity('FX smoke particles');entity.setPosition(marker.getPosition());this.root.addChild(entity);
    entity.addComponent('particlesystem',{numParticles:9,lifetime:3.8,rate:.34,rate2:.52,loop:true,preWarm:true,
      emitterShape:pc.EMITTERSHAPE_BOX,emitterExtents:[.09,.025,.09],initialVelocity:0,localSpace:true,
      colorMap:this.sprite('PS2 smoke sprite',true),lighting:false,intensity:.72,depthWrite:false,useFog:true,useTonemap:true,
      blendType:pc.BLEND_NORMAL,sort:pc.PARTICLESORT_NONE,
      localVelocityGraph:{type:pc.CURVE_LINEAR,keys:[[0,-.03,1,.08],[0,.18,1,.48],[0,0,1,.11]]},
      localVelocityGraph2:{type:pc.CURVE_LINEAR,keys:[[0,.04,1,-.1],[0,.27,1,.62],[0,0,1,-.08]]},
      scaleGraph:{type:pc.CURVE_LINEAR,keys:[0,.12,.4,.32,1,.68]},scaleGraph2:{type:pc.CURVE_LINEAR,keys:[0,.18,.4,.42,1,.82]},
      alphaGraph:{type:pc.CURVE_LINEAR,keys:[0,0,.16,.28,.56,.2,1,0]},
      colorGraph:{type:pc.CURVE_LINEAR,keys:[[0,.24,1,.42],[0,.22,1,.39],[0,.2,1,.36]]},
      rotationSpeedGraph:{type:pc.CURVE_LINEAR,keys:[0,-10,1,4]},rotationSpeedGraph2:{type:pc.CURVE_LINEAR,keys:[0,12,1,-3]}});
    this.smoke=entity;
  }

  private createTap(marker:pc.Entity|null):void {
    if(!marker)return;
    const root=new pc.Entity(`FX beer stream ${this.streams.length+1}`),position=marker.getPosition();
    root.setPosition(position.x,position.y-.13,position.z);this.root.addChild(root);
    const material=new pc.StandardMaterial();material.name='Beer stream';material.diffuse=new pc.Color(.58,.22,.025);
    material.emissive=new pc.Color(.12,.025,.002);material.emissiveIntensity=.3;material.opacity=.72;
    material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.gloss=.25;material.update();
    this.materials.push(material);
    const stream=new pc.Entity('Beer liquid');stream.addComponent('render',{type:'cylinder',material,castShadows:false,receiveShadows:false});
    stream.setLocalScale(.012,.26,.012);root.addChild(stream);
    const foamMaterial=new pc.StandardMaterial();foamMaterial.name='Beer foam';foamMaterial.diffuse=new pc.Color(.82,.68,.42);
    foamMaterial.emissive=new pc.Color(.06,.04,.02);foamMaterial.opacity=.68;foamMaterial.blendType=pc.BLEND_NORMAL;
    foamMaterial.depthWrite=false;foamMaterial.update();this.materials.push(foamMaterial);
    const foam=new pc.Entity('Beer foam');foam.addComponent('render',{type:'sphere',material:foamMaterial,castShadows:false,receiveShadows:false});
    foam.setLocalPosition(0,-.13,0);foam.setLocalScale(.045,.009,.045);root.addChild(foam);
    root.enabled=false;this.streams.push(root);
  }

  update(time:number,pouring:boolean):void {
    const flicker=.83+Math.sin(time*18)*.08+Math.sin(time*31.7)*.055+Math.sin(time*47.3)*.035;
    if(this.fireLight?.light)this.fireLight.light.intensity=3.2*flicker;
    // A deliberately stepped 12 Hz cadence evokes the target console era. The per-instance
    // uniform leaves the shared authored material untouched and avoids rebuilding it every frame.
    const materialStep=Math.floor(time*12),updateMaterials=materialStep!==this.materialStep;
    if(updateMaterials){this.materialStep=materialStep;
      for(const instance of this.emberInstances)instance.setParameter('material_emissiveIntensity',3.7+flicker*1.25);}
    this.pouring=pouring&&this.streams.length>0;
    this.activeTap=this.pouring?Math.floor(time/1.6)%this.streams.length:null;
    this.streams.forEach((root,index)=>{
      root.enabled=index===this.activeTap;
      if(root.enabled){const pulse=.97+Math.sin(time*36)*.025;root.setLocalScale(1,pulse,1);}
    });
  }

  telemetry():MapEffectsStatus {
    return {fire:!!this.fire,smoke:!!this.smoke,embers:this.emberInstances.length>0,taps:this.streams.length,pouring:this.pouring,
      activeTap:this.activeTap===null?null:this.activeTap+1,particles:(this.fire?10:0)+(this.smoke?9:0)};
  }

  destroy():void {
    this.root.destroy();this.materials.forEach(material=>material.destroy());this.textures.forEach(texture=>texture.destroy());
  }
}
