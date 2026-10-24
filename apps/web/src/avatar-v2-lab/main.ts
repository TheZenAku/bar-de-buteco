import * as pc from 'playcanvas';
import {AvatarAssetCache,AvatarV2Instance,type RuntimeDiagnostics} from './avatar';
import {compatibilityProblems,loadCatalogs,type AvatarSelection,type BodyId,type CatalogBundle,type ColorField,type Slot} from './catalog';
import './style.css';

type Metrics={fps:number;frameMs:number;drawCalls:number;triangles:number;characters:number;samples:number};
type LabDebug={
  ready:boolean;selection:AvatarSelection;catalogSummary:()=>unknown;diagnostics:()=>RuntimeDiagnostics[];
  setSelection:(patch:Partial<AvatarSelection>)=>Promise<RuntimeDiagnostics[]>;setSlot:(slot:Slot,ids:string[])=>Promise<RuntimeDiagnostics[]>;
  setBody:(body:BodyId)=>Promise<RuntimeDiagnostics[]>;play:(name:string)=>void;setCount:(count:number)=>Promise<Metrics>;metrics:()=>Metrics;
  problems:(selection?:AvatarSelection)=>string[];captureReport:()=>unknown;
};
declare global{interface Window{avatarV2Lab?:LabDebug}}

const mount=document.querySelector<HTMLDivElement>('#avatar-v2-lab')!;
mount.innerHTML=`
  <main class="lab-shell">
    <section class="viewport-wrap">
      <canvas id="lab-canvas"></canvas>
      <header class="lab-banner">
        <div><strong>BAR AVATAR V2</strong><span>LABORATÓRIO ISOLADO · PLAYCANVAS ${pc.version}</span></div>
        <span class="license-warning">ANIMAÇÕES: LICENÇA NÃO VERIFICADA · PROIBIDO PRODUÇÃO</span>
      </header>
      <div class="view-tools">
        <button data-view="0">Frente</button><button data-view="90">Perfil</button><button data-view="180">Costas</button>
      </div>
      <div class="metrics" id="metrics">Inicializando WebGL…</div>
    </section>
    <aside class="panel">
      <div class="panel-title"><div><small>EXPERIMENTO</small><h1>Montagem modular</h1></div><span id="status" class="status loading">CARREGANDO</span></div>
      <p class="notice">Este ambiente não participa do login, multiplayer, movimentação ou personalização atuais.</p>
      <div id="controls"></div>
      <section class="card"><h2>Diagnóstico em tempo real</h2><pre id="diagnostics">Aguardando assets…</pre></section>
      <section class="card"><h2>Problemas conhecidos dos assets</h2><ul class="known"><li>Clipping em peças sentadas e combinações “minor”.</li><li>Bordas serrilhadas na máscara e virilha visível sob saia.</li><li>Pés podem penetrar o piso até 2,2 cm em alguns clipes.</li><li>Sem LOD; cabelo longo afastado das costas.</li><li>Props de copo, cartas e bengala não fazem parte do pacote.</li></ul></section>
    </aside>
  </main>`;

const canvas=document.querySelector<HTMLCanvasElement>('#lab-canvas')!;
const diagnosticsNode=document.querySelector<HTMLElement>('#diagnostics')!;
const metricsNode=document.querySelector<HTMLElement>('#metrics')!;
const statusNode=document.querySelector<HTMLElement>('#status')!;
const controlsNode=document.querySelector<HTMLElement>('#controls')!;

const app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'}});
app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio,1.5);app.setCanvasResolution(pc.RESOLUTION_AUTO);app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.scene.ambientLight=new pc.Color(.32,.35,.4);app.scene.exposure=1.15;
const camera=new pc.Entity('Avatar V2 Lab camera');camera.addComponent('camera',{clearColor:new pc.Color(.035,.043,.055),fov:38,nearClip:.05,farClip:80});camera.setPosition(0,1.05,4.4);camera.lookAt(0,.9,0);app.root.addChild(camera);
const key=new pc.Entity('Key');key.addComponent('light',{type:'directional',color:new pc.Color(1,.84,.68),intensity:2.1,castShadows:true,shadowResolution:2048,shadowBias:.25});key.setEulerAngles(48,-35,0);app.root.addChild(key);
const fill=new pc.Entity('Fill');fill.addComponent('light',{type:'directional',color:new pc.Color(.48,.67,1),intensity:.85});fill.setEulerAngles(20,145,0);app.root.addChild(fill);
const ground=new pc.Entity('Ground');ground.addComponent('render',{type:'plane',castShadows:false,receiveShadows:true});ground.setLocalScale(24,1,24);const groundMat=new pc.StandardMaterial();groundMat.diffuse=new pc.Color(.075,.087,.105);groundMat.metalness=.05;groundMat.gloss=.36;groundMat.update();ground.render!.material=groundMat;app.root.addChild(ground);

const resize=()=>app.graphicsDevice.resizeCanvas(canvas.clientWidth,canvas.clientHeight);addEventListener('resize',resize);resize();app.start();

let bundle:CatalogBundle;let selection:AvatarSelection;let avatars:AvatarV2Instance[]=[];let yaw=0;let dragging=false;let lastX=0;let lastTime=performance.now();let frameCount=0;let fps=0;let sampleCount=0;let fpsSamples:number[]=[];
const cache=new AvatarAssetCache(app);

function defaultSelection(body:BodyId='male'):AvatarSelection{return {body,brow:'regular',facePreset:'default',pieces:{top:['top_tee'],bottom:['bottom_jeans'],footwear:['footwear_sneakers'],hair:['hair_short'],facialHair:[],accessory:['accessory_glasses']},colors:{skinTone:'#cf936d',outfitColor:'#30343b',eyeColor:'#446a77',hairColor:'#3a251d',topColor:'#8c2626',bottomColor:'#263a58',footwearColor:'#e0ddd2',accessoryColor:'#b9974e'}};}

function metricSnapshot():Metrics{
  const stats=app.stats as unknown as {drawCallCount?:number;primitiveCount?:number};
  const average=fpsSamples.length?fpsSamples.reduce((sum,value)=>sum+value,0)/fpsSamples.length:fps;
  return {fps:Number(average.toFixed(1)),frameMs:Number((average?1000/average:0).toFixed(2)),drawCalls:stats.drawCallCount??0,triangles:stats.primitiveCount??0,characters:avatars.length,samples:sampleCount};
}
app.on('update',()=>{frameCount++;const now=performance.now();if(now-lastTime>=500){fps=frameCount*1000/(now-lastTime);fpsSamples.push(fps);frameCount=0;lastTime=now;sampleCount++;const m=metricSnapshot();metricsNode.textContent=`${m.fps} FPS médio · ${m.frameMs} ms · ${m.drawCalls} draws · ${m.triangles?`${m.triangles.toLocaleString('pt-BR')} prim`:'primitivas n/d (release)'} · ${m.characters} avatar(es)`;}});

function diagnostics(){return avatars.map(avatar=>avatar.diagnostics());}
function refreshDiagnostics(message?:string){
  const first=diagnostics()[0];
  diagnosticsNode.textContent=message??(first?[
    `Corpo: ${first.body} · animação: ${first.animation}`,
    `Peças: ${first.pieceIds.join(', ')||'nenhuma'}`,
    `Máscara: ${first.hiddenRegions.join(', ')||'nenhuma região'}`,
    `Armatures: ${first.armatureCount} · anim components: ${first.animComponents}`,
    `Renders: ${first.renderComponents} · meshes: ${first.meshInstances} · skinned: ${first.skinnedMeshInstances}`,
    `Clones de material: ${first.materialClones}`,
    first.errors.length?`Erros: ${first.errors.join(' | ')}`:'Erros de integração: nenhum',
  ].join('\n'):'Nenhum avatar ativo.');
}

async function rebuild(count=avatars.length||1){
  statusNode.className='status loading';statusNode.textContent='ATUALIZANDO';
  const old=avatars;avatars=[];for(const avatar of old)avatar.destroy();
  const columns=Math.ceil(Math.sqrt(count));
  const rows=Math.ceil(count/columns),distance=count===1?4.4:4.8+Math.max(columns,rows)*1.25;camera.setPosition(0,count===1?1.05:1.45,distance);camera.lookAt(0,.9,0);
  for(let index=0;index<count;index++){
    const avatar=new AvatarV2Instance(app,cache,bundle);avatars.push(avatar);
    const row=Math.floor(index/columns),column=index%columns;avatar.setPosition((column-(columns-1)/2)*1.45,0,(row-(Math.ceil(count/columns)-1)/2)*1.15);avatar.setYaw(yaw);
    await avatar.update(selection);
  }
  frameCount=0;sampleCount=0;fpsSamples=[];lastTime=performance.now();statusNode.className='status ok';statusNode.textContent='ATIVO';refreshDiagnostics();
}
async function applySelection(next:AvatarSelection){
  const problems=compatibilityProblems(bundle,next);
  if(problems.length){refreshDiagnostics(`BLOQUEADO PELO MANIFEST\n${problems.join('\n')}`);throw new Error(problems.join(' '));}
  selection=structuredClone(next);statusNode.className='status loading';statusNode.textContent='TROCANDO';
  await Promise.all(avatars.map(avatar=>avatar.update(selection)));statusNode.className='status ok';statusNode.textContent='ATIVO';refreshDiagnostics();syncForm();return diagnostics();
}

function field(label:string,control:string){return `<label class="field"><span>${label}</span>${control}</label>`;}
function options(values:Array<{id:string;name:string}>,selected:string|undefined,none=true){return `${none?'<option value="">Nenhum</option>':''}${values.map(value=>`<option value="${value.id}" ${value.id===selected?'selected':''}>${value.name}</option>`).join('')}`;}
function buildControls(){
  const slotNames:Record<Exclude<Slot,'accessory'>,string>={top:'Parte de cima',bottom:'Parte de baixo',footwear:'Calçado',hair:'Cabelo',facialHair:'Barba'};
  const body=bundle.avatar.bodies.find(entry=>entry.id===selection.body)!;
  const pieces=(slot:Slot)=>bundle.avatar.pieces.filter(piece=>piece.slot===slot&&piece.bodies[selection.body]);
  controlsNode.innerHTML=`
    <section class="card grid two">
      ${field('Corpo',`<select data-field="body"><option value="male" ${selection.body==='male'?'selected':''}>Masculino</option><option value="female" ${selection.body==='female'?'selected':''}>Feminino</option></select>`)}
      ${field('Sobrancelha',`<select data-field="brow">${['regular','thin','thick'].map(id=>`<option ${selection.brow===id?'selected':''}>${id}</option>`).join('')}</select>`)}
      ${field('Rosto',`<select data-field="facePreset">${Object.keys(body.facePresets).map(id=>`<option ${selection.facePreset===id?'selected':''}>${id}</option>`).join('')}</select>`)}
      ${field('Animação',`<select data-field="animation">${bundle.animations.clips.map(clip=>`<option value="${clip.name}">${clip.name}${clip.loop?' ↻':' · one-shot'}</option>`).join('')}</select>`)}
    </section>
    <section class="card grid two pieces">
      ${(Object.keys(slotNames) as Array<Exclude<Slot,'accessory'>>).map(slot=>field(slotNames[slot],`<select data-slot="${slot}">${options(pieces(slot),selection.pieces[slot]?.[0])}</select>`)).join('')}
    </section>
    <section class="card"><h2>Acessórios por socket</h2><div class="checks">${pieces('accessory').map(piece=>`<label><input type="checkbox" data-accessory="${piece.id}" ${selection.pieces.accessory?.includes(piece.id)?'checked':''}>${piece.name}<small>${piece.socket}</small></label>`).join('')}</div></section>
    <section class="card"><h2>Materiais e cores</h2><div class="grid colors">${([
      ['skinTone','Pele'],['outfitColor','Roupa-base'],['eyeColor','Olhos'],['hairColor','Cabelo'],['topColor','Top'],['bottomColor','Bottom'],['footwearColor','Calçado'],['accessoryColor','Acessório'],
    ] as Array<[ColorField,string]>).map(([id,label])=>field(label,`<input type="color" data-color="${id}" value="${selection.colors[id]}">`)).join('')}</div></section>
    <section class="card grid two">${field('Quantidade',`<select data-field="count"><option>1</option><option>4</option><option>8</option><option>16</option></select>`)}<button id="download-report" class="primary">Baixar relatório JSON</button></section>`;
  bindControls();
}
function syncForm(){buildControls();}
function bindControls(){
  controlsNode.querySelector<HTMLSelectElement>('[data-field="body"]')?.addEventListener('change',event=>{const body=(event.target as HTMLSelectElement).value as BodyId;const next=defaultSelection(body);void applySelection(next).catch(()=>syncForm());});
  controlsNode.querySelector<HTMLSelectElement>('[data-field="brow"]')?.addEventListener('change',event=>{const next=structuredClone(selection);next.brow=(event.target as HTMLSelectElement).value;void applySelection(next).catch(()=>syncForm());});
  controlsNode.querySelector<HTMLSelectElement>('[data-field="facePreset"]')?.addEventListener('change',event=>{const next=structuredClone(selection);next.facePreset=(event.target as HTMLSelectElement).value;void applySelection(next).catch(()=>syncForm());});
  controlsNode.querySelector<HTMLSelectElement>('[data-field="animation"]')?.addEventListener('change',event=>{for(const avatar of avatars)avatar.play((event.target as HTMLSelectElement).value);refreshDiagnostics();});
  for(const select of controlsNode.querySelectorAll<HTMLSelectElement>('[data-slot]'))select.addEventListener('change',()=>{const next=structuredClone(selection);next.pieces[select.dataset.slot as Slot]=select.value?[select.value]:[];void applySelection(next).catch(()=>syncForm());});
  for(const input of controlsNode.querySelectorAll<HTMLInputElement>('[data-accessory]'))input.addEventListener('change',()=>{const next=structuredClone(selection);next.pieces.accessory=[...controlsNode.querySelectorAll<HTMLInputElement>('[data-accessory]:checked')].map(box=>box.dataset.accessory!);void applySelection(next).catch(()=>syncForm());});
  for(const input of controlsNode.querySelectorAll<HTMLInputElement>('[data-color]'))input.addEventListener('input',()=>{const next=structuredClone(selection);next.colors[input.dataset.color as ColorField]=input.value;void applySelection(next);});
  controlsNode.querySelector<HTMLSelectElement>('[data-field="count"]')?.addEventListener('change',event=>void rebuild(Number((event.target as HTMLSelectElement).value)));
  controlsNode.querySelector('#download-report')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify(captureReport(),null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='avatar-v2-playcanvas-runtime-report.json';link.click();URL.revokeObjectURL(link.href);});
}

function captureReport(){const device=app.graphicsDevice as pc.GraphicsDevice&{gl?:WebGLRenderingContext};const gl=device.gl;return {generatedAt:new Date().toISOString(),playcanvas:pc.version,environment:{userAgent:navigator.userAgent,renderer:gl?.getParameter(gl.RENDERER)??'unknown',vendor:gl?.getParameter(gl.VENDOR)??'unknown'},isolation:{url:location.href,productionBuildModified:false,animationLicense:'NOT VERIFIED — laboratório somente'},catalog:{version:bundle.avatar.catalogVersion,bodies:bundle.avatar.bodies.length,pieces:bundle.avatar.pieces.length,regions:bundle.rig.regions.length,clips:bundle.animations.clips.length},selection,diagnostics:diagnostics(),performance:metricSnapshot(),classification:{assetKnown:['clipping sentado','minor clipping conforme compatibility.json','bordas serrilhadas das regiões','penetração dos pés até 2,2 cm','ausência de LOD e props'],integrationRuntime:diagnostics().flatMap(value=>value.errors)}};}

canvas.addEventListener('pointerdown',event=>{dragging=true;lastX=event.clientX;canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{if(!dragging)return;yaw+=(event.clientX-lastX)*.45;lastX=event.clientX;for(const avatar of avatars)avatar.setYaw(yaw);});
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-view]'))button.addEventListener('click',()=>{yaw=Number(button.dataset.view);for(const avatar of avatars)avatar.setYaw(yaw);});

async function boot(){
  try{
    const isolation=await fetch('/avatars-v2/manifests/avatar-catalog.json',{cache:'no-store'});if(isolation.headers.get('X-Avatar-V2-Lab')!=='isolated')throw new Error('Assets não estão sendo servidos pelo servidor isolado. Use npm run lab:avatar-v2.');
    bundle=await loadCatalogs();selection=defaultSelection();buildControls();await rebuild(1);
    window.avatarV2Lab={ready:true,get selection(){return structuredClone(selection);},catalogSummary:()=>({version:bundle.avatar.catalogVersion,bodies:bundle.avatar.bodies.length,pieces:bundle.avatar.pieces.length,regions:bundle.rig.regions.length,clips:bundle.animations.clips.length}),diagnostics,
      setSelection:patch=>applySelection({...structuredClone(selection),...patch,pieces:patch.pieces??structuredClone(selection.pieces),colors:patch.colors??structuredClone(selection.colors)}),
      setSlot:(slot,ids)=>{const next=structuredClone(selection);next.pieces[slot]=ids;return applySelection(next);},setBody:body=>applySelection(defaultSelection(body)),
      play:name=>{for(const avatar of avatars)avatar.play(name);refreshDiagnostics();},setCount:async count=>{await rebuild(count);await new Promise(resolve=>setTimeout(resolve,3200));return metricSnapshot();},metrics:metricSnapshot,
      problems:value=>compatibilityProblems(bundle,value??selection),captureReport};
    document.body.dataset.labReady='true';
  }catch(error){statusNode.className='status error';statusNode.textContent='FALHOU';refreshDiagnostics(error instanceof Error?error.stack??error.message:String(error));console.error(error);}
}
void boot();

