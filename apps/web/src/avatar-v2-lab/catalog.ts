export type BodyId='male'|'female';
export type Slot='top'|'bottom'|'footwear'|'hair'|'facialHair'|'accessory';
export type ColorField='skinTone'|'outfitColor'|'eyeColor'|'hairColor'|'topColor'|'bottomColor'|'footwearColor'|'accessoryColor';

export interface BodyEntry{
  id:BodyId;name:string;path:string;animations:string;armatureNode:string;
  meshes:{body:string;eyes:string;brows:Record<string,string>};
  morphTargets:string[];facePresets:Record<string,Record<string,number>>;
}
export interface PieceBody{path:string;textureOverride?:{material:string;baseColorTexture:string}}
export interface PieceMaterial{name:string;role:string;configurable:boolean;colorField?:ColorField;texture?:string}
export interface PieceEntry{
  id:string;name:string;category:string;slot:Slot;attachment:'skinned'|'socket';meshNode:string;socket:string|null;
  hidesRegions:string[];bodies:Partial<Record<BodyId,PieceBody>>;configurableMaterials:PieceMaterial[];
}
export interface AvatarCatalog{schema:string;catalogVersion:string;rigId:string;boneContractVersion:string;bodies:BodyEntry[];pieces:PieceEntry[];regionRules:Array<{region:string;hideWhen:{allOf:string[]}}>}
export interface RigContract{schema:string;rigId:string;contractVersion:string;jointCount:number;rootJoint:string;regions:Array<{id:number;name:string;u:number}>}
export interface AnimationCatalog{schema:string;catalogVersion:string;banks:Record<BodyId,string>;clips:Array<{name:string;loop:boolean;gltfAnimation:string}>}
export interface Compatibility{schema:string;catalogVersion:string;rules:Array<Record<string,unknown>>;pairs:Record<BodyId,Record<string,{status:string;worstStanding:number;seated:number}>>}
export interface CatalogBundle{avatar:AvatarCatalog;rig:RigContract;animations:AnimationCatalog;compatibility:Compatibility}

const base='/avatars-v2/manifests/';
async function json<T>(name:string):Promise<T>{
  const response=await fetch(base+name,{cache:'no-store'});
  if(!response.ok)throw new Error(`Manifest ${name}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
export async function loadCatalogs():Promise<CatalogBundle>{
  const [avatar,rig,animations,compatibility]=await Promise.all([
    json<AvatarCatalog>('avatar-catalog.json'),json<RigContract>('rig-contract.json'),
    json<AnimationCatalog>('animation-catalog.json'),json<Compatibility>('compatibility.json'),
  ]);
  const errors:string[]=[];
  if(avatar.schema!=='bar-avatar-v2/avatar-catalog')errors.push('schema do catálogo');
  if(rig.schema!=='bar-avatar-v2/rig-contract')errors.push('schema do rig');
  if(animations.schema!=='bar-avatar-v2/animation-catalog')errors.push('schema de animação');
  if(compatibility.schema!=='bar-avatar-v2/compatibility')errors.push('schema de compatibilidade');
  if(new Set([avatar.catalogVersion,animations.catalogVersion,compatibility.catalogVersion]).size!==1)errors.push('catalogVersion divergente');
  if(avatar.rigId!==rig.rigId||avatar.boneContractVersion!==rig.contractVersion)errors.push('contrato de rig divergente');
  if(rig.jointCount!==53)errors.push(`jointCount inesperado: ${rig.jointCount}`);
  if(errors.length)throw new Error(`Contrato V2 inválido: ${errors.join(', ')}`);
  return {avatar,rig,animations,compatibility};
}

export interface AvatarSelection{
  body:BodyId;brow:string;facePreset:string;pieces:Partial<Record<Slot,string[]>>;colors:Record<ColorField,string>;
}

function canonical(id:string){return id==='top_tee_print'?'top_tee':id==='bottom_pants'?'bottom_jeans':id;}
export function compatibilityProblems(bundle:CatalogBundle,selection:AvatarSelection):string[]{
  const selected=Object.values(selection.pieces).flatMap(value=>value??[]).filter(Boolean);
  const problems:string[]=[];
  for(const slot of ['top','bottom','footwear','hair','facialHair'] as Slot[]){
    if((selection.pieces[slot]?.length??0)>1)problems.push(`Apenas uma peça é permitida no slot ${slot}.`);
  }
  const pieces=selected.map(id=>bundle.avatar.pieces.find(piece=>piece.id===id)).filter((piece):piece is PieceEntry=>Boolean(piece));
  for(const piece of pieces)if(!piece.bodies[selection.body])problems.push(`${piece.name} não existe para o corpo ${selection.body}.`);
  const sockets=new Map<string,string>();
  for(const piece of pieces){if(!piece.socket)continue;const previous=sockets.get(piece.socket);if(previous)problems.push(`${previous} e ${piece.name} ocupam o mesmo socket ${piece.socket}.`);else sockets.set(piece.socket,piece.name);}
  if(selected.includes('bottom_skirt')&&!pieces.some(piece=>piece.category==='TOP'))problems.push('A saia requer uma peça TOP para ocultar corretamente a cintura.');
  for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
    const key=[canonical(selected[i]),canonical(selected[j])].sort().join('|');
    const pair=bundle.compatibility.pairs[selection.body]?.[key];
    if(pair?.status==='blocked')problems.push(`Combinação bloqueada pelo manifest: ${selected[i]} + ${selected[j]} (${pair.worstStanding} interseções).`);
  }
  return [...new Set(problems)];
}

export function hiddenRegions(bundle:CatalogBundle,selection:AvatarSelection):string[]{
  const ids=Object.values(selection.pieces).flatMap(value=>value??[]);
  const pieces=ids.map(id=>bundle.avatar.pieces.find(piece=>piece.id===id)).filter((piece):piece is PieceEntry=>Boolean(piece));
  const result=new Set(pieces.flatMap(piece=>piece.hidesRegions));
  const categories=new Set(pieces.map(piece=>piece.category));
  for(const rule of bundle.avatar.regionRules)if(rule.hideWhen.allOf.every(category=>categories.has(category)))result.add(rule.region);
  return [...result];
}
