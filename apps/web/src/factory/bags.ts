import * as pc from 'playcanvas';

/**
 * The plant's sacks as the user modelled them in Blender (public/fabrica/empresa_brasil_estoque.glb): one mesh per kind
 * (EB_Saco_Malte/Mix/Produto, lying flat with its base at y = 0 and the middle at x = z = 0) and the pallet's arrangement,
 * EB_Palete_Arranjo → EB_Arranjo_01..18 (3 sacks per layer, 6 layers; the arrangement's origin is the pallet's base,
 * the first layer rests on the pallet's 0.144 m boards). Both the shelves (visuals.ts) and the sack in somebody's arms
 * (carry.ts) draw these meshes, so a sack looks the same everywhere. Loaded once per application.
 */
const BASE=import.meta.env.BASE_URL;
export type BagMaterial='MALTE'|'MIX'|'PRODUTO';
export interface BagKind {mesh:pc.Mesh;material:pc.Material}
export interface BagPlace {position:pc.Vec3;rotation:pc.Quat}
export interface BagKit {kinds:Record<BagMaterial,BagKind>;arrangement:BagPlace[];/** Height of the pallet's boards: the arrangement's first layer stands on them. */palletH:number}

const NODE:Record<BagMaterial,string>={MALTE:'EB_Saco_Malte',MIX:'EB_Saco_Mix',PRODUTO:'EB_Saco_Produto'};
const kits=new WeakMap<pc.AppBase,Promise<BagKit|null>>();

export function loadBagKit(app:pc.AppBase):Promise<BagKit|null> {
  let promise=kits.get(app);if(promise)return promise;
  promise=(async()=>{
    const asset=new pc.Asset('EB estoque','container',{url:`${BASE}fabrica/empresa_brasil_estoque.glb`});
    app.assets.add(asset);
    await new Promise<void>(resolve=>{asset.ready(()=>resolve());asset.once('error',()=>resolve());app.assets.load(asset);});
    if(!asset.resource){console.warn('[fábrica] empresa_brasil_estoque.glb não carregou: sem sacos nas prateleiras.');return null;}
    const model=(asset.resource as pc.ContainerResource).instantiateRenderEntity({castShadows:false});
    const find=(prefix:string)=>model.find((node:pc.GraphNode)=>node.name.startsWith(prefix))[0] as pc.Entity|undefined;
    const kinds={} as Record<BagMaterial,BagKind>;
    for(const key of Object.keys(NODE) as BagMaterial[]){
      const instance=find(NODE[key])?.render?.meshInstances[0];
      if(!instance||!instance.mesh||!instance.material){console.warn(`[fábrica] ${NODE[key]} não achado no GLB.`);return null;}
      kinds[key]={mesh:instance.mesh,material:instance.material};
    }
    const arrangement:BagPlace[]=[];
    for(let i=1;i<=18;i++){
      const node=find(`EB_Arranjo_${String(i).padStart(2,'0')}`);
      if(!node)return null;
      arrangement.push({position:node.getLocalPosition().clone(),rotation:node.getLocalRotation().clone()});
    }
    // The templates were only a way to reach the meshes; the scene never draws them.
    model.destroy();
    console.info('[fábrica] sacos do Blender carregados (EB_Saco_*, 18 posições por palete).');
    return {kinds,arrangement,palletH:.144};
  })().catch(error=>{console.warn('[fábrica] falha ao montar os sacos do Blender',error);return null;});
  kits.set(app,promise);return promise;
}
