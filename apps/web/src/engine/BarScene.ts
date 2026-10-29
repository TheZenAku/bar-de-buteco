import * as pc from 'playcanvas';
import { BLACKJACK_SEATS, BLACKJACK_TABLE, DEFAULT_SKIN, INTERACTABLES, MAP_COLLIDERS, MAP_SURFACES, PATCH_MS, SKINS, TICK_MS, cameraFraction, drunkStage, type Position, type WorldState } from '@bar/shared';
import {DOOR_LEAVES,DOOR_SWING_SECONDS,doorSwing,HELD_DRINKS,SERVED_PROPS,SERVE_ITEM_MS,SERVE_LEAD_MS,type DoorLeaf,type HeldDrink,type ItemId,type ServedItemState} from '@bar/shared';
import {DRINK_PROPS,RIG_GRIP,findHand,holdDrink,type HandRig} from './drink-props';
import {PLATE_HEIGHT,TRAY_HEIGHT,TRAY_RADIUS,palmUp,reach,smoothstep,trayCentre,traySlots} from './serving-props';
import type { SceneActor, SceneCallbacks, SceneInput, SceneLabel, SceneWorld } from './scene-types';
import {TelevisionSurface} from './television-surface';
import {TELEVISIONS,TV_SYSTEMS} from '@bar/shared';
import {EnvironmentLighting} from './environment-lighting';
import {MapEffects,type MapEffectsStatus} from './map-effects';
import {JukeboxLights,type JukeboxLightsStatus} from './jukebox-lights';
import {StageLights,type StageLightsStatus} from './stage-lights';
import {JUKEBOX_SYSTEMS,STAGE_ENTRY,TV_SPOTS,inStageArea,onStage,type JukeboxState} from '@bar/shared';
import {MUSICIAN_REACH,MUSICIANS,STAGE_PHASES,musicianPhase,stageSpot,type StagePhase,type StageSpot} from '@bar/shared';
import {StageMusicians,musicianState,musicianTime} from './stage-musicians';
import {BarDressing} from './bar-dressing';
import {BAR_ANIMATIONS,CLEANABLE_TABLES,ITEM_CATALOG,URINALS,barClipMs,seatChair,barFrame,barTimeline,cornerSpot,inFrame,nearestCorner,type BarClip,type BarFrame,type BarStep,type Meal} from '@bar/shared';
import {BarAnimations,barEndOffset,barState} from './bar-animations';
import {FOG_SCALE,type GraphicsSettings} from '../graphics';
import {CameraRig,type CameraMode} from './camera-rig';

type Primitive = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane';
type V3 = [number, number, number];
type Limbs = Record<'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'head', pc.Entity>;
const SKIN_BONES = ['head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'hand_l', 'middle_01_l', 'hand_r', 'middle_01_r',
  'upperleg_l', 'lowerleg_l', 'upperleg_r', 'lowerleg_r','foot_l','foot_r'] as const;
type SkinBone = typeof SKIN_BONES[number];
// Read's AccuRig and the Mixamo rigs (two-finger hands) have no middle finger, so the cup is held by the index finger instead.
const BONE_ALIASES: Partial<Record<SkinBone, string>> = { middle_01_l: 'index_01_l', middle_01_r: 'index_01_r' };
// Looping clips that sit the hips on a chair (anchored to the 0.56 m seat height).
const SEATED_CLIPS = ['CardsSit', 'AngrySit', 'Sit'];
// Degrees by drunk stage (0-4): body sway of every avatar and camera roll of the local player.
const DRUNK_BODY_SWAY = [0, 0, 3, 6, 6];
const DRUNK_CAMERA_ROLL = [0, 0.6, 1.5, 3, 3];
// The head joint shrunk to nothing in first person, so the face and hair do not fill the view.
const HIDDEN_HEAD = 1e-3;
// NPCs with their own skin, not offered in the selector: the bartender is Magrão.
const NPC_SKINS: Record<string, string> = { bartender: 'magrao' };
interface SkinnedRig {
  model: pc.Entity;
  bones: Record<SkinBone, pc.Entity>;
  clip: string;
  playbackKey?: string;
  cane?: pc.Entity;
  oldCaneRate?:number;
  tracks: Set<string>;
  /** How far the body lowers to sit: from this skin's hip-joint height to just above a 0.47 m seat. */
  sitDrop: number;
  /** The drinking hand (the Drink clip lifts with the left), found in the bind pose. */
  drinkHand?: HandRig;
  /** The hips, found on first use (the contact shadow follows them during a bar animation). */
  hip?: pc.Entity;
}
interface Avatar {
  root: pc.Entity;
  body: pc.Entity;
  /** Procedural pivots: NPCs, and players while the player model loads. */
  limbs?: Limbs;
  /** Skeletal player model, and which skin it shows. */
  skin?: SkinnedRig;
  skinId?: string;
  cup: pc.Entity;
  /** The bottle or glass in hand, created on first use. */
  drinks?: Partial<Record<HeldDrink, pc.Entity>>;
  /** Tonico's tray and the order on it (`key`: the items it was built for). */
  tray?: { entity: pc.Entity; key: string; items: pc.Entity[] };
  /** The bone that bows the upper body (Tonico putting an order down); null when the rig has none. */
  spine?: pc.Entity | null;
  /** A small fan of real geometry shown between both hands at the blackjack table. */
  cards?:pc.Entity;
  /** How close the drink is to the lips, 0–1 (telemetry). */
  sip?: number;
  ring: pc.Entity;
  actor: SceneActor;
  npc: boolean;
  phase: number;
  seatedBlend?: number;
  /** The drawn position glides from here to actor.x/z, starting at `glideAt` and lasting `glide` seconds. */
  glideFrom: pc.Vec3;
  glideAt: number;
  glide: number;
  /** Drawn heading in degrees. Kept here because Euler angles read back from the engine fold past ±90°. */
  yaw: number;
  /** Seconds of the next glide, instead of the usual: a musician sliding onto a stage spot or stepping off it. */
  glideNext?: number;
  /** The soft shadow at the feet, and whether a roof is above (re-checked after the avatar moves some distance). */
  contact: pc.Entity;
  covered?: { x: number; z: number; value: boolean };
  /** The bar animation playing (bar-animations.ts): its clip, the clip's space, and the slide into a place. */
  bar?: { clip: BarClip; startedAt: number; time: number; space: BarFrame; frame?: BarFrame; slide?: { from: BarFrame; at: number } };
  /** Seconds of the cross-fade from the last bar clip back to the game's own (0 when the avatar was moved to the body). */
  barRelease?: number;
  /** The last bar action played to its end (its last frame is the bar idle's first: no cross-fade into it). */
  barFinished?: boolean;
  /** Horizontal speed as drawn (m/s, smoothed): the bar walk's cadence follows it. */
  speed?: number;
  lastDrawn?: pc.Vec3;
}
/** A bar animation the debug panel plays on an avatar without the room (development only). */
interface BarOverride { animation: string; startedAt: number; interactionState?: string; x?: number; y?: number; z?: number; meal?: Meal }
/** What an avatar does in the bar animations this frame (barAction). */
interface BarAction { step: BarStep; frame?: BarFrame; seat?: string; servedFood: boolean }
// The snacks a seated customer eats with the bar animations' fork (comer).
const FOODS = new Set<string>(ITEM_CATALOG.filter(item => item.category === 'comida').map(item => item.id));
// The bar animations' idle and walks (animacoes_bar.js locomover), in place of the game's Idle, Walk and DrunkWalk.
const BAR_WALKS: Record<string, BarClip> = { '': 'parado_loop', Walk: 'andar_loop', DrunkWalk: 'andar_bebado_loop' };
const BAR_LOCOMOTION = new Set(Object.values(BAR_WALKS).map(clip => barState(clip)));
// Metres a second each walk covers at its authored pace (bar_locomocao.glb): the cadence scales from it, within the
// module's 0.5–2.2 (past that the legs would spin; the feet slide instead).
const WALK_PACE = (BAR_ANIMATIONS.groups.locomocao as { speeds?: Record<string, number> }).speeds ?? {};
// Bar clips that end an action: a debug run of one is over once it has played.
const FINAL_CLIPS = new Set<BarClip>(['levantar', 'urinar', 'vomitar', 'fumar_apagar', 'levantar_chao', 'limpar_mesa', 'magrao_chopp', 'magrao_chopp_escuro', 'magrao_longneck']);
interface Pose {
  t: number;
  walking: boolean;
  running: boolean;
  seated: number;
  dancing: boolean;
  drinking: boolean;
  waving: boolean;
}

/**
 * Player skins are GLBs in public/models, built from assets-bar. The default (Renderpeople "Nathan")
 * also carries the clips: in-place Walk, the Mixamo Idle from Idle.fbx, and a static Pose that the
 * procedural gestures build on. Leandro, Rafael, Read and Magrão carry clips retargeted to their authored rigs.
 */
const DEFAULT_MODEL='nathan';
// Bumped when a skin is reimported: its model, animation bank and cane change together, so no cached file is mixed in.
const SKIN_VERSIONS: Record<string, string> = { leandro: 'mixamo-20261027', rafael: 'mixamo-20261027b', read: 'mixamo-20261027', magrao: 'mixamo-20261027' };
const skinAsset = (folder: string, file: string, id: string): string => `${import.meta.env.BASE_URL}${folder}/${file}.glb${SKIN_VERSIONS[id] ? `?v=${SKIN_VERSIONS[id]}` : ''}`;
const skinUrl = (id: string): string => skinAsset('models', id, id);
const SKIN_IDS = new Set<string>(SKINS.map(skin => skin.id));
// The bar is built in real-world metres around this model at its natural 1.86 m.
const PLAYER_MODEL_SCALE = 1;
// The box avatars (NPCs, and players while the model loads) are drawn about 2 m tall and stocky;
// this brings them to the player model's height and a slimmer build.
const BOX_AVATAR_SCALE: V3 = [0.75, 0.9, 0.75];
// Name labels float just above head height.
const LABEL_HEIGHT = 2.15;
// The clip walks at 1.27 m/s. Matching WALK_SPEED/RUN_SPEED exactly would look frantic,
// so the cadence is raised only part of the way.
const WALK_CLIP_SPEED = 1.9;
// Positions arrive in steps: local predictions every input tick, everyone else with each server patch.
// Gliding a little longer than the interval keeps a constant speed despite timer jitter.
const INPUT_GLIDE = TICK_MS / 1000 * 1.2;
const PATCH_GLIDE = PATCH_MS / 1000 * 1.2;
const SNAP_DISTANCE = 1.5;
// The job objective marker takes the job panel's neon green (--neon-green in nova-ui.css).
const OBJECTIVE_COLOR = '#5fd86c';
// The stage's blips: its entry (the foot of its steps, where the pass is bought) in the stage's magenta (Palco_FX_Luz
// cor_padrao), and the telão's control (the middle of the stage's front edge) in the HUD's neon teal (--neon-teal).
const STAGE_BLIPS = {entry:{at:STAGE_ENTRY,color:'#ff47c2'},telao:{at:TV_SPOTS.telao!,color:'#3adfd7'}} as const;
export type StageBlip = keyof typeof STAGE_BLIPS;
/** A blip: a ring on the floor around its spot, and nothing above it. */
interface Marker {target:Required<Position>;marker:pc.Entity;ring:pc.Entity}

// The soft shadow under each avatar (contactShadow).
const CONTACT_VERTEX = `attribute vec3 aPosition;attribute vec2 aUv0;uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;varying vec2 vUv0;
void main(){vUv0=aUv0;gl_Position=matrix_viewProjection*matrix_model*vec4(aPosition,1.0);}`;
const CONTACT_FRAGMENT = `precision highp float;varying vec2 vUv0;uniform float contactOpacity;
void main(){float r=length(vUv0-.5)*2.0;gl_FragColor=vec4(0.0,0.0,0.0,(1.0-smoothstep(.15,1.0,r))*contactOpacity);}`;
const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;
const color = (hex: string): pc.Color => new pc.Color().fromString(hex);
const lerp = (a: number, b: number, amount: number): number => a + (b - a) * amount;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/**
 * BarBoteco supplies the full environment; shared exported volumes control movement and the camera.
 * The app supplies authoritative snapshots and predicted local positions. This
 * renderer never moves a player on the server or decides whether an action succeeds.
 */
export class BarScene {
  readonly app: pc.Application;
  readonly ready: Promise<void>;
  private televisions=new Map<string,TelevisionSurface>();
  private watchingTv='';
  private tvYaw=0;
  private tvPitch=0;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: pc.Entity;
  private readonly callbacks: SceneCallbacks;
  private readonly actors = new Map<string, Avatar>();
  private readonly materials: pc.StandardMaterial[] = [];
  private readonly materialCache = new Map<string, pc.StandardMaterial>();
  private readonly textures: pc.Texture[] = [];
  private readonly warmLights: pc.Entity[] = [];
  private readonly partyLights: pc.Entity[] = [];
  private readonly environment:EnvironmentLighting;
  private mapEffects?:MapEffects;
  /** Fridges, warmer and counter dressed with the real props (bar-dressing.ts). */
  private dressing?:BarDressing;
  private jukeboxLights?:JukeboxLights;
  private jukeboxState?:JukeboxState;
  private jukeboxDuration=0;
  /** Every light of the stage (lenses, LED strip, backlight, truss spots, washes), coloured by the video on the telão. */
  private stageLights?:StageLights;
  private stageState?:JukeboxState;
  /** The musicians' clips on the stage and the instruments they pick up (stage-musicians.ts). */
  private musicians?:StageMusicians;
  /** The bar animations (bar-animations.ts): props, the pulled chairs, particles and what is left on the map. */
  private barAnimations?:BarAnimations;
  private readonly barOverrides=new Map<string,BarOverride>();
  /** Avatars that played a bar clip this frame. */
  private readonly barPlayed=new Set<string>();
  private stageDuration=0;
  /** The local worker's current job station: a marker only this browser draws (the task is sent to the worker alone). */
  private objective?:Marker;
  /** The stage's blips (STAGE_BLIPS), shown while the player is in the stage's area and below the deck. */
  private readonly stageBlips = new Map<StageBlip, Marker>();
  private readonly keys = new Set<string>();
  private readonly cleanup: (() => void)[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly tempScreen = new pc.Vec3();
  private readonly tempPosition = new pc.Vec3();
  private readonly tempTurn = new pc.Quat();
  private readonly axisRight = new pc.Vec3();
  private readonly axisUp = new pc.Vec3();
  private readonly axisFront = new pc.Vec3();
  private readonly skinModels = new Map<string, pc.ContainerResource>();
  private readonly animationBanks = new Map<string, pc.ContainerResource>();
  private readonly animationRequests = new Set<string>();
  private readonly caneModels=new Map<string,pc.ContainerResource>();
  private readonly caneRequests=new Set<string>();
  private serverClockOffset = 0;
  /** Skins already requested, including failed ones, so a missing file is not fetched again. */
  private readonly skinRequests = new Set<string>();
  private readonly discoBall: pc.Entity;
  private mapEntity?: pc.Entity;
  private contactMaterial?: pc.ShaderMaterial;
  /** What the bar serves, by item (tools/assets/import-drinks.mjs): held while drinking, carried on the tray, left on tables. */
  private readonly propModels=new Map<string,pc.ContainerResource>();
  /** What was served on the tables (synced by the room). `moved`: the frame in which a serving hand last carried it. */
  private readonly servedItems=new Map<string,{state:ServedItemState;entity?:pc.Entity;settled:boolean;moved:number}>();
  /** The order on Tonico's tray in the frame `trayFrame`: its items still on the tray are his to draw. */
  private trayOrder='';
  private trayFrame=-1;
  private frameId=0;
  /** Each map door leaf, turned about its own hinge (the node origin) by its door's synced state. */
  private readonly doorLeaves:Array<{leaf:DoorLeaf;entity?:pc.Entity;openness:number;from:number;target:number;changedAt:number}>=
    DOOR_LEAVES.map(leaf=>({leaf,openness:1,from:1,target:1,changedAt:0}));
  private localId = '';
  private enabled = false;
  private destroyed = false;
  private elapsed = 0;
  /** The local player's camera: its views, smoothing and x-ray (camera-rig.ts). */
  private readonly rig: CameraRig;
  /** The local avatar's head joint first person hid, and its own scale to give back. */
  private hiddenHead?: pc.Entity;
  private readonly headScale = new pc.Vec3(1, 1, 1);
  private dragging = false;
  private lastRotation = Math.PI;
  private eventType = '';
  private frameSeconds = 0;
  private frames = 0;
  private fps = 60;
  private staticBatchId = -1;
  private graphics?: GraphicsSettings;
  /** Current render scale (dynamic resolution moves it between 0.5 and the chosen scale). */
  private scale = 1;
  private goodSeconds = 0;
  private drawClock = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: SceneCallbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: { alpha: true, premultipliedAlpha:false, antialias: true, powerPreference: 'high-performance' },
    });
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);

    this.camera = new pc.Entity('Third-person camera');
    this.camera.addComponent('camera', {
      // BarBoteco's expanded neighbourhood includes distant buildings, hills and a panorama. The Blender
      // source declares camera_far_minimo_m=1100; the previous 150 m plane clipped most of that scenery.
      clearColor: color('#9dafbd'), fov: 57, nearClip: 0.08, farClip: 1100,
    });
    this.app.root.addChild(this.camera);
    this.camera.setPosition(18, 9, 16);
    this.camera.lookAt(14, 1.8, -6);
    // Before any material is drawn: the x-ray goes into every shader.
    this.rig = new CameraRig(this.camera, this.app.graphicsDevice);
    this.environment=new EnvironmentLighting(this.app,this.camera);
    this.environment.setDynamicCasters(()=>this.dynamicCasters());
    this.environment.update(Date.now(),0,'');

    this.staticBatchId = this.app.batcher.addGroup('Static bar furnishings', false, 24).id;
    this.buildBlackjack();
    this.buildPartyLighting();
    this.environment.addPartyShadows(this.partyLights);
    this.app.batcher.generate([this.staticBatchId]);
    this.staticBatchId = -1;
    for(const definition of TELEVISIONS.filter(tv=>TV_SYSTEMS.some(system=>system.screens.includes(tv.id))))this.televisions.set(definition.id,new TelevisionSurface(this.app,definition));
    this.discoBall = this.buildDiscoBall();
    this.ready = this.loadMap();
    this.loadProps();
    void this.ready.catch(() => {}); // The UI reports loading failures before admission.
    this.installControls();
    this.loadSkin(DEFAULT_MODEL);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.app.on('update', this.update, this);
    this.app.start();
  }

/**
   * Drinks and food (tools/assets/import-drinks.mjs). Without them a drink falls back to the old procedural cup,
   * and what Tonico serves only appears once its model arrives.
   */
  private loadProps(): void {
    for(const item of new Set<string>([...HELD_DRINKS,...Object.keys(SERVED_PROPS)]))this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}props/${item}.glb`,'container',(error,asset)=>{
      if(this.destroyed)return;
      if(error||!asset){console.warn(`Objeto "${item}" indisponível.`,error);return;}
      this.propModels.set(item,asset.resource as pc.ContainerResource);
    });
  }

  /** A new copy of an item's prop, origin at the centre of its base; snacks come on a small plate. Undefined until loaded. */
  private makeProp(item:string):pc.Entity|undefined {
    const model=this.propModels.get(item);if(!model)return;
    const prop=new pc.Entity(`Served ${item}`),body=model.instantiateRenderEntity({castShadows:true,receiveShadows:true}),plate=SERVED_PROPS[item as ItemId]?.plate;
    body.name='Served food';prop.addChild(body);
    if(plate){this.shape('Small plate','cylinder',[0,PLATE_HEIGHT/2,0],[plate*2,PLATE_HEIGHT,plate*2],this.material('#f1ede4',undefined,.3),prop);body.setLocalPosition(0,PLATE_HEIGHT,0);}
    return prop;
  }

  /** The avatar's bottle or glass, created once and reused; undefined until the model has loaded. */
  private drink(avatar:Avatar,item:HeldDrink):pc.Entity|undefined {
    const existing=avatar.drinks?.[item];if(existing)return existing;
    const model=this.propModels.get(item);if(!model)return;
    const prop=model.instantiateRenderEntity({castShadows:true,receiveShadows:true});
    prop.name=`Drink ${item}`;prop.enabled=false;avatar.root.addChild(prop);
    (avatar.drinks??={})[item]=prop;
    return prop;
  }

  /** The seated card pose expects cards in both hands; build them once instead of pantomiming an invisible prop. */
  private cardFan(avatar:Avatar):pc.Entity {
    if(avatar.cards)return avatar.cards;
    const fan=this.group('Blackjack hand',[0,0,0],avatar.root),paper=this.material('#f4ead6'),back=this.material('#7b2525');
    for(const [x,yaw] of [[-.06,-16],[-.03,-8],[0,0],[.03,8],[.06,16]] as const){
      const card=this.group('Held card',[x,0,0],fan);card.setLocalEulerAngles(0,yaw,0);
      this.box('Playing card',[0,0,0],[.068,.002,.096],paper,card);
      this.box('Card back',[0,-.0015,0],[.058,.001,.086],back,card);
    }
    fan.enabled=false;avatar.cards=fan;return fan;
  }

  private holdCards(avatar:Avatar,skin:SkinnedRig,count:number):void {
    const fan=this.cardFan(avatar),left=skin.bones.hand_l.getPosition(),right=skin.bones.hand_r.getPosition();
    fan.children.forEach((card,index)=>card.enabled=index<Math.min(5,count));
    const across=this.axisRight.sub2(right,left).normalize(),up=this.axisUp.copy(avatar.body.up).normalize();
    const front=this.axisFront.copy(avatar.body.forward).mulScalar(-1).normalize();
    const centre=this.tempPosition.lerp(left,right,.5).add(up.clone().mulScalar(.035)).add(front.clone().mulScalar(.055));
    const m=new pc.Mat4(),d=m.data;d[0]=across.x;d[1]=across.y;d[2]=across.z;d[4]=up.x;d[5]=up.y;d[6]=up.z;d[8]=front.x;d[9]=front.y;d[10]=front.z;
    fan.setPosition(centre);fan.setRotation(new pc.Quat().setFromMat4(m));fan.enabled=true;
  }

  private loadMap(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}maps/bar_boteco.glb`, 'container', (error, asset) => {
        if (this.destroyed) { resolve(); return; }
        if (error || !asset) { reject(new Error('Não foi possível carregar o mapa do bar. Recarregue para tentar novamente.')); return; }
        const resource = asset.resource as pc.ContainerResource;
        const map = resource.instantiateRenderEntity({castShadows:true,receiveShadows:true});
        map.name = 'BarBoteco imported map';
        this.app.root.addChild(map); this.mapEntity = map;
        for(const door of this.doorLeaves){
          door.entity=(map.findByName(door.leaf.id) as pc.Entity|null)??undefined;
          if(!door.entity)console.warn(`Folha de porta "${door.leaf.id}" ausente no mapa; ela não será animada.`);
        }
        const lights = map.findComponents('light') as pc.LightComponent[];
        this.warmLights.push(...lights.map(light=>light.entity));
        this.environment.configureMap(map);
        this.mapEffects=new MapEffects(this.app,map);
        this.jukeboxLights=new JukeboxLights(map);
        this.stageLights=new StageLights(map,this.partyLights.filter(light=>light.name==='Stage party wash').map(light=>light.light!));
        this.musicians=new StageMusicians(this.app,map);
        // A chair pulled and put back is drawn again in the lamps' cached shadows once it stops.
        this.barAnimations=new BarAnimations(this.app,map,()=>this.environment.refreshLampShadows());
        this.barAnimations.preload('parado_loop');
        // Once in place, the lamps draw their shadows again with it.
        this.dressing=new BarDressing(this.app,map,()=>this.environment.refreshLampShadows());
        // The stage screen is the map's (15_palco.py): its standby art shows while no video plays on it.
        const standby=(map.findByName('Telao_Tela') as pc.Entity|null)??undefined;
        if(!standby)console.warn('Tela do telão (Telao_Tela) ausente no mapa.');
        this.televisions.get('telao')?.setStandby(standby);
        resolve();
      });
    });
  }

  private buildPartyLighting(): void {
    // Party washes: the ground-floor hall, the upstairs games hall and the backyard stage.
    // The stage's takes the telão's colours while it shows a video (StageLights).
    for (const [x,y,z,hex,name] of [[6.5,2.7,-7.6,'#cf5275','Party wash'],[12.5,2.7,-7.6,'#41afaa','Party wash'],[10.3,5.8,-7.6,'#af75e5','Party wash'],[26.6,3.6,-23.4,'#cf5275','Stage party wash']] as const) {
      const light = new pc.Entity(name);
      light.addComponent('light',{type:'spot',enabled:false,color:color(hex),intensity:0,range:8,innerConeAngle:35,outerConeAngle:75,
        castShadows:true,shadowResolution:512,shadowType:pc.SHADOW_PCF3_32F,shadowBias:.3,normalOffsetBias:.04});
      light.setPosition(x,y,z);this.app.root.addChild(light);this.partyLights.push(light);
    }
  }

  getMapStatus(): {loaded:boolean;colliders:number;surfaces:number;doors:number;doorOpenness:Record<string,number>;renders:number;cartRenders:number;lights:number;effects?:MapEffectsStatus;jukebox?:JukeboxLightsStatus;stage?:StageLightsStatus;musicians?:ReturnType<StageMusicians['telemetry']>;barAnimations?:ReturnType<BarAnimations['telemetry']>;objective?:{x:number;y:number;z:number;visible:boolean};stageBlips:Partial<Record<StageBlip,{x:number;y:number;z:number;visible:boolean}>>} {
    const cart=this.mapEntity?.findByName('Carrinho_Espeto') as pc.Entity|undefined;
    return {loaded:!!this.mapEntity,colliders:MAP_COLLIDERS.length,surfaces:MAP_SURFACES.length,doors:this.doorLeaves.filter(d=>d.entity).length,doorOpenness:Object.fromEntries(this.doorLeaves.map(d=>[d.leaf.id,+d.openness.toFixed(3)])),
      renders:this.mapEntity?.findComponents('render').length??0,cartRenders:cart?.findComponents('render').length??0,lights:this.warmLights.length,effects:this.mapEffects?.telemetry(),
      jukebox:this.jukeboxLights?.telemetry(),stage:this.stageLights?.telemetry(),musicians:this.musicians?.telemetry(),barAnimations:this.barAnimations?.telemetry(),objective:this.objective?{...this.objective.target,visible:this.objective.marker.enabled}:undefined,
      stageBlips:Object.fromEntries([...this.stageBlips].map(([id,blip])=>[id,{...blip.target,visible:blip.marker.enabled}]))};
  }

  /** Where a prop of a bar animation is now, and where a map chair is drawn (tests and debugging). */
  barProp(actorId:string,name:string):number[]|undefined {return this.barAnimations?.propPosition(actorId,name);}
  barChair(seatId:string):number[]|undefined {const index=seatChair(seatId);return index===undefined?undefined:this.barAnimations?.chairPosition(index);}
  /** Seconds of the jukebox's video, known by the local YouTube player (0 while loading): paces its colours. */
  setJukeboxDuration(seconds:number):void {this.jukeboxDuration=Number.isFinite(seconds)&&seconds>0?seconds:0;}
  /** Seconds of the telão's video, known by the local YouTube player (0 while loading): paces the stage's colours. */
  setStageDuration(seconds:number):void {this.stageDuration=Number.isFinite(seconds)&&seconds>0?seconds:0;}
  /** The local player is near a musician's spot: fetch its clips now, so taking it starts at once. */
  preloadMusician(spot:string):void {this.musicians?.preload(spot);}

  /**
   * The job objective ("blip") of the local worker: a ring on the floor around the station (faintly seen through
   * furniture and walls). Drawn only by the worker's browser; null hides it.
   * One marker is built and then moved from task to task. Destroying it also freed its ring mesh (PlayCanvas frees a
   * mesh with its last instance), and the next task's marker drew the freed mesh: every frame threw and the view froze.
   */
  setObjective(target:Required<Position>|null):void {
    if(!target){if(this.objective)this.objective.marker.enabled=false;return;}
    const objective=this.objective??=this.buildMarker('Job objective',OBJECTIVE_COLOR);
    objective.target={x:target.x,y:target.y,z:target.z};objective.marker.setPosition(target.x,target.y,target.z);objective.marker.enabled=true;
    this.animateMarker(objective);
  }

  private buildMarker(name:string,hex:string):Marker {
    const marker=this.group(name,[0,0,0]);
    const glow=(depthTest:boolean)=>{
      const material=new pc.StandardMaterial();material.useLighting=false;material.useFog=false;material.diffuse.set(0,0,0);
      material.emissive=color(hex);material.opacity=depthTest ? .85 : .3;material.blendType=pc.BLEND_NORMAL;
      material.depthTest=depthTest;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();this.materials.push(material);return material;
    };
    // Solid on the floor where it shows, and a faint copy drawn over whatever stands in front of it, like a map blip.
    const ring=new pc.Entity(`${name} ring`);
    const torus=pc.Mesh.fromGeometry(this.app.graphicsDevice,new pc.TorusGeometry({tubeRadius:.03,ringRadius:.62,segments:48}));
    ring.addComponent('render',{meshInstances:[new pc.MeshInstance(torus,glow(true)),new pc.MeshInstance(torus,glow(false))],castShadows:false,receiveShadows:false});
    ring.setLocalPosition(0,.03,0);marker.addChild(ring);
    return {target:{x:0,y:0,z:0},marker,ring};
  }

  /** Where the objective is on screen (also when off it or behind the camera), and how far it is from the player. */
  projectObjective():{x:number;y:number;onScreen:boolean;behind:boolean;distance:number;above:number}|null {return this.projectMarker(this.objective);}
  /** Where one of the stage's blips is on screen, while it is shown (see updateStageBlips). */
  projectStageBlip(id:StageBlip='entry'):{x:number;y:number;onScreen:boolean;behind:boolean;distance:number;above:number}|null {return this.projectMarker(this.stageBlips.get(id));}

  /**
   * The stage's blips: its entry, where the pass is bought, and the telão's control. Shown only in the stage's area (the
   * backyard, inStageArea), so they never show all over the map, and never while the player is up on the stage or
   * watching a screen; built on first use.
   */
  private updateStageBlips():void {
    const player=this.actors.get(this.localId),p=player?.root.getPosition(),at=p&&{x:p.x,y:p.y,z:p.z};
    const show=!!at&&this.enabled&&!this.watchingTv&&inStageArea(at)&&!onStage(at);
    for(const [id,{at:spot,color:hex}] of Object.entries(STAGE_BLIPS) as [StageBlip,typeof STAGE_BLIPS[StageBlip]][]){
      let blip=this.stageBlips.get(id);
      if(!show){if(blip)blip.marker.enabled=false;continue;}
      if(!blip){
        blip=this.buildMarker(`Stage blip ${id}`,hex);this.stageBlips.set(id,blip);
        blip.target={x:spot.x,y:spot.y,z:spot.z};blip.marker.setPosition(spot.x,spot.y,spot.z);
      }
      blip.marker.enabled=true;this.animateMarker(blip);
    }
  }

  private projectMarker(blip:Marker|undefined):{x:number;y:number;onScreen:boolean;behind:boolean;distance:number;above:number}|null {
    const player=this.actors.get(this.localId);
    if(!blip?.marker.enabled||!this.camera.camera||!player)return null;
    const point=blip.ring.getPosition(),eye=this.camera.getPosition(),forward=this.camera.forward;
    this.tempPosition.set(point.x-eye.x,point.y-eye.y,point.z-eye.z);
    const behind=this.tempPosition.dot(forward)<=0;
    // Mirrored in front of the camera when behind it, so the direction on screen still points the right way.
    if(behind)this.tempPosition.sub(this.axisFront.copy(forward).mulScalar(2*this.tempPosition.dot(forward)-.1));
    this.camera.camera.worldToScreen(this.tempPosition.add(eye),this.tempScreen);
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight,p=player.root.getPosition();
    const onScreen=!behind&&this.tempScreen.x>=0&&this.tempScreen.x<=width&&this.tempScreen.y>=0&&this.tempScreen.y<=height;
    return {x:this.tempScreen.x,y:this.tempScreen.y,onScreen,behind,distance:Math.hypot(blip.target.x-p.x,blip.target.z-p.z),above:blip.target.y-p.y};
  }

  private animateMarker(blip:Marker|undefined):void {
    if(!blip?.marker.enabled)return;
    // A slow breath, so it reads as something to go to.
    const breath=1+Math.sin(this.elapsed*3)*.05;
    blip.ring.setLocalScale(breath,1,breath);
  }
  getEnvironmentStatus(){return this.environment.telemetry();}

  /** The bar animations' debug actions (debugBarAnimation). */
  static readonly BAR_DEBUG_ACTIONS = ['fumar','parar-fumar','vomitar','cair','levantar-chao','sentar','comer','parar-comer','levantar','limpar-mesa','urinar','chopp','chopp-escuro','longneck','parar'] as const;
  /**
   * Development only: plays a bar animation on the local player, or on Magrão (chopp, chopp-escuro, longneck), without
   * the room, as the debug panel asks; the room's state takes over again once the action is over (or with 'parar').
   * The player is held still meanwhile. Returns what happened.
   */
  debugBarAnimation(action:typeof BarScene.BAR_DEBUG_ACTIONS[number]):string {
    const now=Date.now()+this.serverClockOffset,player=this.actors.get(this.localId),id=this.localId,current=this.barOverrides.get(id);
    const serve=({chopp:'serve-chopp','chopp-escuro':'serve-chopp-dark',longneck:'serve-longneck'} as Record<string,string>)[action];
    if(serve){
      if(!this.actors.has('bartender'))return 'O Magrão não está à vista: chegue perto do balcão.';
      this.barOverrides.set('bartender',{animation:serve,startedAt:now});return `Magrão: ${action}.`;
    }
    if(!player)return 'Entre no bar primeiro.';
    const p=player.root.getPosition(),floor=(y?:number)=>Math.abs((y??p.y)-p.y)<.5;
    const play=(override:BarOverride,message:string)=>{this.barOverrides.set(id,override);return message;};
    switch(action){
      case 'parar':this.barOverrides.delete(id);this.barOverrides.delete('bartender');return 'De volta ao estado do servidor.';
      case 'fumar':return play({animation:'smoke',startedAt:now},'Acendendo um cigarro.');
      case 'parar-fumar':return current?.animation==='smoke'?play({animation:'smoke-stop',startedAt:Math.max(now,current.startedAt+barClipMs('fumar_acender'))},'Apagando o cigarro.'):'Fume primeiro.';
      case 'vomitar':return play({animation:'vomit',startedAt:now},'Passando mal.');
      case 'cair':return play({animation:'fallen',startedAt:now},'Caiu.');
      case 'levantar-chao':return current?.animation==='fallen'?play({animation:'recover',startedAt:now},'Levantando do chão.'):'Caia primeiro.';
      case 'sentar':{
        const seat=INTERACTABLES.filter(i=>i.type==='seat'&&floor(i.y)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
        if(!seat||Math.hypot(seat.x-p.x,seat.z-p.z)>2.5)return 'Chegue perto de uma cadeira de mesa.';
        return play({animation:'sit',interactionState:seat.id,startedAt:now},`Sentando: ${seat.label}.`);
      }
      case 'comer':return current?.animation==='sit'?play({...current,meal:{startedAt:now,endedAt:0}},'Comendo.'):'Sente-se primeiro.';
      case 'parar-comer':return current?.meal&&!current.meal.endedAt?play({...current,meal:{...current.meal,endedAt:now}},'Parando de comer.'):'Coma primeiro.';
      case 'levantar':return current?.animation==='sit'?play({...current,animation:'stand-up',startedAt:Math.max(now,current.startedAt+barClipMs('sentar'))},'Levantando da cadeira.'):'Sente-se primeiro.';
      case 'limpar-mesa':{
        const table=CLEANABLE_TABLES.filter(t=>floor(t.y)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
        if(!table||Math.hypot(table.x-p.x,table.z-p.z)>2.5)return 'Chegue perto de uma mesa de quatro lugares.';
        const spot=cornerSpot(nearestCorner(table,{x:p.x,z:p.z}));
        return play({animation:'clean',startedAt:now,x:spot.x,y:spot.y,z:spot.z},`Limpando a mesa ${table.number}.`);
      }
      case 'urinar':{
        const urinal=URINALS.filter(u=>floor(u.y)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
        if(!urinal||Math.hypot(urinal.x-p.x,urinal.z-p.z)>3)return 'Chegue perto de um mictório (banheiro masculino).';
        return play({animation:'urinate',interactionState:urinal.id,startedAt:now},'No mictório.');
      }
    }
    return 'Ação desconhecida.';
  }


  /** The camera view chosen in the settings (or restored from them); Q and the mouse wheel change it in the game. */
  setCameraMode(mode: CameraMode): void { this.rig.setMode(mode); }
  getCamera() { return this.rig.telemetry(); }

  /**
   * First person shrinks the local avatar's head joint each frame (after the clips posed it), so the face and hair do not
   * fill the view; the body, the hands and what they hold stay. Any other avatar, or a later view, gets it back.
   */
  private showOwnHead(player: Avatar | undefined): void {
    const head = this.rig.firstPerson && this.enabled && !this.watchingTv ? player?.skin?.bones.head : undefined;
    // (A head left by a skin change is gone with its model; scaling it back is harmless.)
    if (this.hiddenHead && this.hiddenHead !== head) this.hiddenHead.setLocalScale(this.headScale);
    if (head && head !== this.hiddenHead) this.headScale.copy(head.getLocalScale());
    this.hiddenHead = head;
    head?.setLocalScale(HIDDEN_HEAD, HIDDEN_HEAD, HIDDEN_HEAD);
    // The ring at the feet is for finding yourself from behind.
    if (player) player.ring.enabled = !head;
  }

  /** Where the local player hears from: the avatar's position and the camera's heading (radians). */
  getListener(): (Position & { yaw: number }) | undefined {
    const avatar = this.actors.get(this.localId);
    if (!avatar) return undefined;
    const p = avatar.root.getPosition();
    return { x: p.x, y: p.y, z: p.z, yaw: this.rig.yaw };
  }

  getInput(): SceneInput {
    // A debug run of a bar animation holds the player, as the room would.
    if (!this.enabled || this.inputHasFocus() || document.hidden || this.barOverrides.has(this.localId)) {
      return { dx: 0, dz: 0, running: false, rotation: this.lastRotation };
    }
    const horizontal = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
      Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const vertical = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
      Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    const length = Math.hypot(horizontal, vertical) || 1;
    const yaw = this.rig.yaw;
    const dx = (Math.cos(yaw) * horizontal - Math.sin(yaw) * vertical) / length;
    const dz = (-Math.sin(yaw) * horizontal - Math.cos(yaw) * vertical) / length;
    if (dx || dz) this.lastRotation = Math.atan2(dx, dz);
    // In first person, standing still, the body turns with the view (no shoulder in front of the eyes).
    else if (this.rig.mode === 'first') this.lastRotation = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
    return { dx, dz, running: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), rotation: this.lastRotation };
  }

  setWorld(world: WorldState, localId: string): void {
    // The empty snapshot used when leaving the bar has serverTime=0; keep the clock running.
    if(Number.isFinite(world.serverTime)&&world.serverTime>0)this.serverClockOffset = world.serverTime - Date.now();
    this.jukeboxState=world.jukeboxes?.[JUKEBOX_SYSTEMS[0]!.id];
    this.stageState=world.televisions?.telao;
    for(const door of this.doorLeaves){
      const state=world.doors?.[door.leaf.group];if(!state)continue;
      const target=state.open?1:0;
      if(target!==door.target||state.changedAt!==door.changedAt){door.from=door.openness;door.target=target;door.changedAt=state.changedAt;}
    }
    const musicians=new Map(Object.values(world.musicians??{}).filter(spot=>spot.playerId).map(spot=>[spot.playerId,spot]));
    this.updateState({
      players: Object.values(world.players).map(player => {
        const seat=world.tables[player.currentTableId]?.seats.find(seat => seat.playerId === player.id);
        return { ...player, animation: player.animationState,cardResult:seat?.result,cardCount:seat?.cards.length??0,musician:musicians.get(player.id) };
      }),
      npcs: Object.values(world.npcs).map(npc => ({ ...npc, animation: npc.animationState, role: npc.behavior })),
      event: world.event,
    }, localId);
    this.syncServed(world.served??{});
  }

  /** Follows what the room has on the tables; the entities are made (and placed) by placeServed. */
  private syncServed(served:Record<string,ServedItemState>):void {
    for(const [id,entry] of this.servedItems)if(!served[id]){entry.entity?.destroy();this.servedItems.delete(id);}
    for(const state of Object.values(served)){
      const entry=this.servedItems.get(state.id);
      if(entry)entry.state=state;else this.servedItems.set(state.id,{state,settled:false,moved:-1});
    }
  }

  /**
   * Each item stands on its spot once it has touched the table. Before that it is on Tonico's tray or in his hand
   * (carryTray draws it); with Tonico out of sight it simply appears there when he would have taken it.
   */
  private placeServed(now:number):void {
    const carried=this.trayFrame===this.frameId?this.trayOrder:'';
    for(const entry of this.servedItems.values()){
      if(entry.moved===this.frameId)continue;
      const {state}=entry,entity=entry.entity??=this.makeProp(state.item);
      if(!entity)continue;
      if(!entity.parent)this.app.root.addChild(entity);
      const show=now>=state.placedAt||(state.orderId!==carried&&now>=state.placedAt-SERVE_ITEM_MS);
      if(show&&!entry.settled){entity.setPosition(state.x,state.y,state.z);entity.setEulerAngles(0,state.rotation*RAD_TO_DEG,0);entry.settled=now>=state.placedAt;}
      entity.enabled=show;
      // A snack eaten up leaves its empty plate until someone collects it.
      if(SERVED_PROPS[state.item as ItemId]?.plate){const food=entity.findByName('Served food') as pc.Entity|null;if(food)food.enabled=!state.doneAt;}
    }
  }

  /** What stands on the tables, as drawn (telemetry and tests). */
  getServed():Array<{id:string;item:string;table:number;visible:boolean;settled:boolean;x:number;y:number;z:number}> {
    return [...this.servedItems.values()].map(({state,entity,settled})=>{const p=entity?.getPosition();
      return {id:state.id,item:state.item,table:state.table,visible:!!entity?.enabled,settled,x:+(p?.x??state.x).toFixed(3),y:+(p?.y??state.y).toFixed(3),z:+(p?.z??state.z).toFixed(3)};});
  }

  /** Smooth swing toward each door's state; a late arrival sees doors already where they are. */
  private swingDoors():void {
    const now=Date.now()+this.serverClockOffset;
    for(const door of this.doorLeaves){
      if(door.openness===door.target||!door.entity)continue;
      const t=door.changedAt?Math.min(1,Math.max(0,(now-door.changedAt)/(DOOR_SWING_SECONDS*1000))):1,eased=t*t*(3-2*t);
      door.openness=t>=1?door.target:door.from+(door.target-door.from)*eased;
      door.entity.setLocalEulerAngles(0,door.leaf.closedYaw+doorSwing(door.leaf)*door.openness,0);
    }
  }

  setLocal(position: Position & { rotation?: number; animation?: string }): void {
    this.updateLocal(position);
  }

  projectLabels(): SceneLabel[] { return this.getLabels(); }

  televisionProjection(id:string):{x:number;y:number}[]|null {
    let tv=this.televisions.get(id);const definition=TELEVISIONS.find(t=>t.id===id);
    if(!definition||!this.camera.camera)return null;
    if(!tv){tv=new TelevisionSurface(this.app,definition);this.televisions.set(id,tv);}
    return tv.project(this.camera.camera);
  }
  televisionClear(id:string):boolean {const tv=this.televisions.get(id);return !!tv&&!!this.camera.camera&&tv.clearFrom(this.camera.camera);}
  showTelevision(id:string,visible:boolean):void {this.televisions.get(id)?.show(visible);}
  watchTelevision(id=''):void {
    this.watchingTv=id;this.keys.clear();this.dragging=false;
    this.tvYaw=0;this.tvPitch=0;
    if(id){this.enabled=false;this.app.autoRender=true;}
    this.app.renderNextFrame=true;
  }

  dispose(): void { this.destroy(); }

  updateState(world: SceneWorld, localId: string): void {
    this.localId = localId;
    this.eventType = world.event?.type ?? '';
    const seen = new Set<string>();
    for (const [list, npc] of [[world.players, false], [world.npcs, true]] as const) {
      for (const actor of list ?? []) {
        if (!Number.isFinite(actor.x) || !Number.isFinite(actor.z)) continue;
        seen.add(actor.id);
        const existing = this.actors.get(actor.id);
        const local = actor.id === localId;
        if (existing) {
          const moved = actor.x !== existing.actor.x || actor.y !== existing.actor.y || actor.z !== existing.actor.z;
          // Onto a stage spot in the time the body blends into the take clip; off the drums' spot at a walk.
          if (!!existing.actor.musician !== !!actor.musician) existing.glideNext = actor.musician ? MUSICIANS.blendSeconds : .6;
          // The local position comes from prediction (updateLocal), not from the server snapshot.
          existing.actor = local ? { ...actor, x: existing.actor.x, y: existing.actor.y, z: existing.actor.z } : { ...actor };
          if (moved && !local) this.glideTo(existing, PATCH_GLIDE);
          existing.ring.enabled = local;
          if (this.usesSkin(existing.actor, npc) && this.skinFor(existing.actor, npc) !== existing.skinId) this.replaceAvatar(actor.id, existing);
        } else {
          const avatar=this.makeAvatar(actor,npc);this.actors.set(actor.id,avatar);
          if (local) this.lastRotation = actor.rotation ?? this.lastRotation;
        }
      }
    }
    for (const [id, avatar] of this.actors) {
      if (!seen.has(id)) {
        avatar.root.destroy();
        this.actors.delete(id);
        this.barAnimations?.forget(id);this.barOverrides.delete(id);
      }
    }
  }

  updateLocal(position: Position & {rotation?:number;animation?:string}): void {
    const avatar = this.actors.get(this.localId);
    if (!avatar || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    const moved = position.x !== avatar.actor.x || position.y !== avatar.actor.y || position.z !== avatar.actor.z;
    avatar.actor = { ...avatar.actor, ...position };
    if (moved) this.glideTo(avatar, INPUT_GLIDE);
    if (position.rotation !== undefined) this.lastRotation = position.rotation;
  }

  /** Glides at constant speed from where the avatar is drawn to its new position; long jumps snap. */
  private glideTo(avatar: Avatar, seconds: number): void {
    const { root, actor } = avatar;
    const drawn = root.getPosition();
    // A musician's spot is taken from up to MUSICIAN_REACH away: that slide never snaps.
    const snap = avatar.glideNext ? SNAP_DISTANCE + MUSICIAN_REACH : SNAP_DISTANCE;
    if (Math.hypot(actor.x - drawn.x,(actor.y??0)-drawn.y,actor.z-drawn.z)>snap)root.setPosition(actor.x,actor.y??0,actor.z);
    avatar.glideFrom.copy(root.getPosition());
    avatar.glideAt = this.elapsed;
    avatar.glide = avatar.glideNext ?? seconds;
    avatar.glideNext = undefined;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.app.autoRender = enabled && !this.graphics?.fpsCap;
    this.app.renderNextFrame = true;
    if (!enabled) {
      this.keys.clear();
      this.dragging = false;
    }
  }

  getLabels(): SceneLabel[] {
    const labels: SceneLabel[] = [];
    if (!this.camera.camera) return labels;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const eye = this.camera.getPosition();
    const forward = this.camera.forward;
    for (const [id, avatar] of this.actors) {
      // In first person, your own name would float just over your eyes.
      if (id === this.localId && this.hiddenHead) continue;
      const p = avatar.root.getPosition();
      this.tempPosition.set(p.x-eye.x,p.y+LABEL_HEIGHT-eye.y,p.z-eye.z);
      if (this.tempPosition.dot(forward) <= 0 || this.tempPosition.lengthSq() > 400) continue;
      this.tempPosition.set(p.x,p.y+LABEL_HEIGHT,p.z);
      this.camera.camera.worldToScreen(this.tempPosition, this.tempScreen);
      const x = this.tempScreen.x;
      const y = this.tempScreen.y;
      if (x < -50 || x > width + 50 || y < 0 || y > height) continue;
      const name = avatar.actor.displayName ?? avatar.actor.name ?? 'Visitante';
      labels.push({ id, name: avatar.actor.connected === false ? `${name} · ausente` : name, x, y,
        local: id === this.localId, npc: avatar.npc });
    }
    return labels;
  }

  getPerformance(): { fps: number; actors: number } {
    return { fps: this.fps, actors: this.actors.size };
  }

  getAnimations(): Array<{ id: string; skin?: string; clip?: string; time?: number; height?: number; speed?:number; bar?:{clip:string;time:number;placed:boolean;root:number[]}; drink?:{item:string;sip:number}; cards?:number; tray?:{items:number;onTray:number}; cane?:{enabled:boolean;parent?:string;renders:number}; musician?:{spot:string;phase?:string;root:number[];hip?:number[]}; tracks: string[] }> {
    const now=Date.now()+this.serverClockOffset,point=(p:pc.Vec3)=>[+p.x.toFixed(3),+p.y.toFixed(3),+p.z.toFixed(3)];
    return [...this.actors].map(([id, avatar]) => ({ id, skin: avatar.skinId, clip: avatar.skin?.clip,
      bar:avatar.bar?{clip:avatar.bar.clip,time:+avatar.bar.time.toFixed(3),placed:!!avatar.bar.frame,root:point(avatar.root.getPosition())}:undefined,
      musician:avatar.actor.musician?{spot:avatar.actor.musician.id,phase:musicianPhase(avatar.actor.musician,now)?.phase,root:point(avatar.root.getPosition()),
        hip:avatar.skin?point((avatar.skin.model.findByName('hip') as pc.Entity|null)?.getPosition()??avatar.root.getPosition()):undefined}:undefined,
      height: avatar.skin ? avatar.skin.bones.head.getPosition().y - avatar.root.getPosition().y : undefined,
      time: avatar.skin?.model.anim?.baseLayer?.activeStateCurrentTime, tracks: [...(avatar.skin?.tracks ?? [])],
      speed:avatar.skin?.model.anim?.speed,drink:Object.entries(avatar.drinks??{}).filter(([,e])=>e.enabled).map(([item])=>({item,sip:+(avatar.sip??0).toFixed(3)}))[0],cards:avatar.cards?.enabled?avatar.cards.children.filter(card=>card.enabled).length:undefined,tray:avatar.tray?.entity.enabled?{items:avatar.tray.items.length,onTray:avatar.tray.items.filter(item=>item.enabled).length}:undefined,cane:avatar.skin?.cane?{enabled:avatar.skin.cane.enabled,parent:avatar.skin.cane.parent?.name,renders:avatar.skin.cane.findComponents('render').length}:undefined }));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.televisions.forEach(tv=>tv.destroy());this.televisions.clear();
    this.mapEffects?.destroy();this.mapEffects=undefined;
    this.objective?.marker.destroy();this.objective=undefined;
    this.stageBlips.forEach(blip=>blip.marker.destroy());this.stageBlips.clear();
    this.musicians?.destroy();this.musicians=undefined;
    this.barAnimations?.destroy();this.barAnimations=undefined;
    this.environment.destroy();
    this.resizeObserver.disconnect();
    this.cleanup.forEach(cleanup => cleanup());
    this.app.off('update', this.update, this);
    this.materials.forEach(material => material.destroy());
    this.contactMaterial?.destroy();
    this.dressing?.destroy();
    this.textures.forEach(texture => texture.destroy());
    this.app.destroy();
    this.actors.clear();
  }

  private material(hex: string, emissive?: string, roughness = 0.85): pc.StandardMaterial {
    const key = `${hex}:${emissive ?? ''}:${roughness}`;
    const existing = this.materialCache.get(key);
    if (existing) return existing;
    const material = new pc.StandardMaterial();
    material.diffuse = color(hex);
    material.gloss = 1 - roughness;
    if (emissive) material.emissive = color(emissive);
    material.update();
    this.materials.push(material);
    this.materialCache.set(key, material);
    return material;
  }

  private textured(paint: (context: CanvasRenderingContext2D, width: number, height: number) => void,
    width = 512, height = 512, unlit = false): pc.StandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return this.material('#c2a078');
    paint(context, width, height);
    const texture = new pc.Texture(this.app.graphicsDevice, {
      name: 'Procedural bar artwork', width, height, mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
    });
    texture.setSource(canvas);
    this.textures.push(texture);
    const material = new pc.StandardMaterial();
    material.diffuse = new pc.Color(1, 1, 1);
    material.gloss = 0.15;
    this.materials.push(material);
    material.diffuseMap = texture;
    if (unlit) {
      material.emissiveMap = texture;
      material.emissive = new pc.Color(0.7, 0.7, 0.7);
    }
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
  }

  private shape(name: string, primitive: Primitive, position: V3, scale: V3,
    material: pc.StandardMaterial, parent: pc.Entity = this.app.root, rotation?: V3): pc.Entity {
    const entity = new pc.Entity(name);
    entity.addComponent('render', { type: primitive, material, castShadows: true, receiveShadows: true,
      batchGroupId: this.staticBatchId });
    entity.setLocalPosition(...position);
    entity.setLocalScale(...scale);
    if (rotation) entity.setLocalEulerAngles(...rotation);
    parent.addChild(entity);
    return entity;
  }

  private box(name: string, position: V3, scale: V3, material: pc.StandardMaterial,
    parent?: pc.Entity, rotation?: V3): pc.Entity {
    return this.shape(name, 'box', position, scale, material, parent, rotation);
  }

  private group(name: string, position: V3, parent = this.app.root): pc.Entity {
    const entity = new pc.Entity(name);
    entity.setLocalPosition(...position);
    parent.addChild(entity);
    return entity;
  }

  private makeCup(x: number, y: number, z: number, parent?: pc.Entity): pc.Entity {
    const cup = this.group('Drink', [x, y, z], parent);
    this.shape('Glass', 'cylinder', [0, 0.06, 0], [0.08, 0.12, 0.08], this.material('#d59c3c'), cup);
    this.shape('Foam', 'cylinder', [0, 0.125, 0], [0.082, 0.015, 0.082], this.material('#f5e7bf'), cup);
    return cup;
  }

  private buildBlackjack(): void {
    const { x, y, z, rx, rz } = BLACKJACK_TABLE;
    const table = this.group('Blackjack table', [x, y, z]);
    const wood = this.material('#533c2a');
    this.shape('Table pedestal', 'cylinder', [0, 0.36, 0], [0.24, 0.72, 0.24], wood, table);
    this.shape('Table pedestal base', 'cylinder', [0, 0.03, 0], [rx, 0.06, rz], wood, table);
    this.shape('Padded oval rail', 'cylinder', [0, 0.75, 0], [rx * 2, 0.07, rz * 2], this.material('#4e2f27'), table);
    const felt = this.textured((ctx, width, height) => {
      ctx.fillStyle = '#235846'; ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#d2b76c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(width / 2, height / 2, width * 0.44, height * 0.4, 0, 0, TAU); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e4cf93';
      ctx.font = 'bold 46px Georgia'; ctx.fillText('BLACKJACK', width / 2, height * 0.4);
      ctx.font = '17px sans-serif'; ctx.fillText('A SORTE PUXA UMA CADEIRA', width / 2, height * 0.49);
      ctx.font = '52px Georgia'; ctx.fillText('♠   ♥   ♣   ♦', width / 2, height * 0.63);
      for (const x of [0.22, 0.4, 0.6, 0.78]) ctx.strokeRect(width * x - 26, height * 0.76, 52, 68);
    }, 1024, 768);
    const feltRx = rx - 0.07, feltRz = rz - 0.07;
    this.shape('Green felt playing surface', 'cylinder', [0, 0.787, 0], [feltRx * 2, 0.01, feltRz * 2], this.material('#245c47'), table);
    // The printed rectangle is inscribed in the felt ellipse.
    this.shape('Printed blackjack felt', 'plane', [0, 0.7935, 0], [feltRx * Math.SQRT2, 1, feltRz * Math.SQRT2], felt, table);
    const card = this.material('#f2e7cd');
    for (let i = 0; i < 2; i++) this.box('Dealt card', [-0.05 + i * 0.08, 0.796, -0.24], [0.064, 0.003, 0.09], card, table, [0, i * 12 - 6, 0]);
    for (let i = 0; i < 4; i++) {
      const chip = this.material(['#b94e38', '#e3c879', '#405e76', '#b94e38'][i]!);
      for (let j = 0; j < 3; j++) this.shape('House chip', 'cylinder', [0.2 + i * 0.05, 0.797 + j * 0.008, -0.3], [0.04, 0.008, 0.04], chip, table);
    }
    for (const seat of BLACKJACK_SEATS) this.makeChair(seat.x, seat.z, seat.rotation * RAD_TO_DEG, seat.y);
  }

  /** Seat top at 0.47 m; the chair faces `rotation` (degrees, zero = +Z) with its back behind the sitter. */
  private makeChair(x: number, z: number, rotation: number, y=0): void {
    const chair = this.group('Wooden chair', [x, y, z]);
    chair.setLocalEulerAngles(0, rotation, 0);
    const wood = this.material('#825a34');
    const seat = this.material('#a2733c');
    this.box('Chair seat', [0, 0.45, 0], [0.44, 0.04, 0.42], seat, chair);
    for (const xx of [-0.19, 0.19]) for (const zz of [-0.18, 0.18]) this.box('Chair leg', [xx, 0.215, zz], [0.035, 0.43, 0.035], wood, chair);
    for (const xx of [-0.19, 0.19]) this.box('Chair back upright', [xx, 0.7, -0.19], [0.035, 0.46, 0.035], wood, chair);
    for (const yy of [0.66, 0.84]) this.box('Chair back slat', [0, yy, -0.195], [0.38, 0.08, 0.02], seat, chair);
  }

  private buildDiscoBall(): pc.Entity {
    // Over the ground-floor hall, between its two ceiling lights (slab underside at 3.2 m).
    const disco = this.group('Disco ball', [9.75, 2.85, -7.6]);
    this.shape('Mirror ball', 'sphere', [0, 0, 0], [0.32, 0.32, 0.32], this.material('#9cb2a6', '#193c39', 0.2), disco);
    const tile = this.material('#d3dfcb', '#384f41');
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * TAU;
      this.box('Disco mirror', [Math.cos(angle) * 0.16, 0, Math.sin(angle) * 0.16], [0.06, 0.06, 0.012], tile, disco, [0, -i * 36 + 90, 0]);
    }
    return disco;
  }

  private loadSkin(id: string): void {
    this.loadAnimations(id);
    this.loadCane(id);
    if (this.skinRequests.has(id)) return;
    this.skinRequests.add(id);
    this.app.assets.loadFromUrl(skinUrl(id), 'container', (error, asset) => {
      if (this.destroyed) return;
      if (error || !asset) { console.warn(`Skin "${id}" indisponível; usando outro visual.`, error); return; }
      this.skinModels.set(id, asset.resource as pc.ContainerResource);
      // Players waiting for this skin (or for any model, on the box avatar) switch to it in place.
      for (const [actorId, avatar] of this.actors) {
        if (this.usesSkin(avatar.actor, avatar.npc) && this.skinFor(avatar.actor, avatar.npc) !== avatar.skinId) this.replaceAvatar(actorId, avatar);
      }
    });
  }

  private usesSkin(actor: SceneActor, npc: boolean): boolean {
    return !npc || actor.id === 'tonico' || actor.id === 'dealer' || !!NPC_SKINS[actor.id];
  }

  private loadAnimations(id: string): void {
    if (this.animationRequests.has(id)) return;
    this.animationRequests.add(id);
    this.app.assets.loadFromUrl(skinAsset('animations', id, id), 'container', (error, asset) => {
      if (this.destroyed) return;
      if (error || !asset) { console.warn(`Animações de ${id} indisponíveis.`, error); return; }
      const bank = asset.resource as pc.ContainerResource;
      this.animationBanks.set(id, bank);
      for (const avatar of this.actors.values()) {
        if (avatar.skin && avatar.skinId === id) this.assignClips(avatar.skin, bank);
      }
    });
  }

  private assignClips(skin: SkinnedRig, bank: pc.ContainerResource): void {
    for (const asset of bank.animations) {
      const track = asset.resource as pc.AnimTrack;
      const loop = !['Kick', 'Drink', 'Fallen', 'Shuffle', 'Bartend', 'Wave', 'Use', 'Recover'].includes(track.name);
      skin.model.anim!.assignAnimation(track.name, track, undefined, 1, loop);
      skin.tracks.add(track.name);
    }
  }

  private loadCane(id:string):void{
    if(this.caneRequests.has(id))return;this.caneRequests.add(id);
    this.app.assets.loadFromUrl(skinAsset('props', `old-cane-${id}`, id),'container',(error,asset)=>{
      if(this.destroyed)return;
      if(error||!asset){console.warn(`Bengala de ${id} indisponível.`,error);return;}
      this.caneModels.set(id,asset.resource as pc.ContainerResource);
      for(const avatar of this.actors.values())if(avatar.skin&&avatar.skinId===id)this.attachCane(avatar.skin,id);
    });
  }
  private attachCane(skin:SkinnedRig,id:string):void{
    const model=this.caneModels.get(id);if(skin.cane||!model)return;
    const cane=model.instantiateRenderEntity({castShadows:true,receiveShadows:true});cane.enabled=false;
    skin.bones.hand_r.addChild(cane);skin.cane=cane;
  }

  /**
   * The skin to draw for a player (or an NPC with its own): the chosen one once loaded, meanwhile the
   * default one, and the box avatar until the default (which carries the animations) has arrived.
   * Asks for missing skins.
   */
  private skinFor(actor: SceneActor, npc: boolean): string | undefined {
    const wanted=npc ? NPC_SKINS[actor.id]??DEFAULT_MODEL : actor.skin && SKIN_IDS.has(actor.skin) ? actor.skin : DEFAULT_SKIN;
    if (!this.skinModels.has(wanted)) this.loadSkin(wanted);
    return this.skinModels.has(wanted)?wanted:undefined;
  }

  /** Rebuilds an avatar (e.g. with another skin) where the old one stood, keeping its motion and pose. */
  private replaceAvatar(id: string, avatar: Avatar): void {
    const replacement = this.makeAvatar(avatar.actor, avatar.npc);
    replacement.root.setPosition(avatar.root.getPosition());
    replacement.root.setEulerAngles(0, avatar.yaw, 0);
    replacement.yaw = avatar.yaw;
    replacement.glideFrom.copy(avatar.glideFrom);
    replacement.glideAt = avatar.glideAt;
    replacement.glide = avatar.glide;
    replacement.seatedBlend = avatar.seatedBlend;
    avatar.root.destroy();
    this.actors.set(id, replacement);
  }

  private makeSkin(body: pc.Entity, model: pc.ContainerResource): SkinnedRig {
    const entity = model.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    entity.setLocalScale(PLAYER_MODEL_SCALE, PLAYER_MODEL_SCALE, PLAYER_MODEL_SCALE);
    body.addChild(entity);
    entity.addComponent('anim', { activate: true });
    // Every model carries clips adapted to its own authored skeleton.
    const tracks = model.animations.map(asset => asset.resource as pc.AnimTrack);
    // The first clip assigned becomes the default state.
    for (const name of ['Idle', 'Walk', 'Pose']) {
      const track = tracks.find(candidate => candidate.name === name);
      if (track) entity.anim!.assignAnimation(name, track);
    }
    const bones = Object.fromEntries(SKIN_BONES.map(name => [name, entity.findByName(name) ?? entity.findByName(BONE_ALIASES[name] ?? name)])) as Record<SkinBone, pc.Entity>;
    // Measured in the bind pose, before any clip runs; the thighs are level at about 0.56 m when seated.
    const hipHeight = bones.upperleg_l.getPosition().y - entity.getPosition().y;
    // No clip yet: the first pose is applied without a cross-fade (e.g. a skin swap while seated).
    const skin: SkinnedRig = { model: entity, bones, clip: '', tracks: new Set(tracks.map(track => track.name)), sitDrop: hipHeight - 0.56 };
    const legLength=bones.upperleg_l.getPosition().distance(bones.lowerleg_l.getPosition())+bones.lowerleg_l.getPosition().distance(bones.foot_l.getPosition());
    // The cane gait plays at 1× on 0.8876 m legs (the body it was fitted to); other legs scale its rate.
    skin.oldCaneRate=.88758844/legLength;
    const id = [...this.skinModels].find(([, resource]) => resource === model)?.[0];
    const bank = this.animationBanks.get(id ?? DEFAULT_MODEL);
    if (bank) this.assignClips(skin, bank);
    if(id)this.attachCane(skin,id);
    skin.drinkHand=findHand(entity,'l');
    return skin;
  }

  private makeAvatar(actor: SceneActor, npc: boolean): Avatar {
    const root = this.group(`Avatar ${actor.id}`, [actor.x,actor.y??0,actor.z]);
    const body = this.group('Animated rig', [0, 0, 0], root);
    const skinId = this.usesSkin(actor, npc) ? this.skinFor(actor, npc) : undefined;
    if (!skinId) body.setLocalScale(...BOX_AVATAR_SCALE);
    const isBartender = actor.role === 'bartender' || actor.id === 'bartender';
    const hash = [...actor.id].reduce((value, letter) => value + letter.charCodeAt(0), 0);
    const ring = this.shape('Local player marker', 'cylinder', [0, 0.027, 0], [0.83, 0.018, 0.83], this.material('#b1a067', '#514322'), root);
    ring.enabled = actor.id === this.localId;
    const contact = this.contactShadow(root);
    const motion = { glideFrom: new pc.Vec3(actor.x,actor.y??0,actor.z), glideAt: 0, glide: PATCH_GLIDE, yaw: (actor.rotation ?? 0) * RAD_TO_DEG };
    root.setEulerAngles(0, motion.yaw, 0);
    if (skinId) {
      const cup = this.makeCup(0, 0, 0, root);
      cup.enabled = false;
      const skin=this.makeSkin(body,this.skinModels.get(skinId)!);
      return { root, body, skin, skinId, cup, ring, contact, actor: { ...actor }, npc, phase: hash % 12, ...motion };
    }
    const skin = this.material(['#b98059', '#dcac7c', '#86583e', '#c48d66'][hash % 4]!);
    const palette = ['#49756b', '#ba7545', '#7a6b8d', '#a95a4b', '#bc9a58', '#53758b'];
    const clothing = this.material(actor.avatarColor ?? actor.color ?? (isBartender ? '#e6d8b9' : palette[hash % palette.length]!));
    const trousers = this.material('#333e40');
    const shoes = this.material('#292b29');
    const hair = this.material(hash % 3 ? '#373126' : '#62503a');
    const white = this.material('#f4e8d0');
    this.box('Torso', [0, 1.12, 0], [0.6, 0.72, 0.36], clothing, body);
    this.box('Shirt collar', [0, 1.46, 0.19], [0.2, 0.14, 0.025], white, body);
    this.box('Shirt button placket', [0, 1.14, 0.19], [0.035, 0.46, 0.025], white, body);
    this.box('Belt', [0, 0.79, 0], [0.61, 0.08, 0.37], shoes, body);
    this.box('Belt buckle', [0, 0.79, 0.2], [0.1, 0.065, 0.025], this.material('#c7a463'), body);
    if (isBartender) this.box('Bartender apron', [0, 0.97, 0.22], [0.49, 0.7, 0.035], this.material('#304b3c'), body);
    const head = this.group('Head pivot', [0, 1.55, 0], body);
    this.box('Head', [0, 0.15, 0], [0.43, 0.45, 0.39], skin, head);
    this.box('Hair top', [0, 0.39, -0.015], [0.46, 0.12, 0.43], hair, head);
    this.box('Hair back', [0, 0.2, -0.2], [0.44, 0.35, 0.08], hair, head);
    for (const x of [-0.23, 0.23]) this.box('Ear', [x, 0.13, 0], [0.07, 0.12, 0.12], skin, head);
    for (const x of [-0.105, 0.105]) {
      this.box('Eye', [x, 0.19, 0.201], [0.052, 0.043, 0.015], shoes, head);
      this.box('Eyebrow', [x, 0.25, 0.205], [0.08, 0.021, 0.015], hair, head);
    }
    this.box('Nose', [0, 0.12, 0.23], [0.08, 0.1, 0.1], skin, head);
    this.box('Smile', [0, 0.025, 0.205], [0.13, 0.02, 0.018], hair, head);
    if (isBartender) this.box('Moustache', [0, 0.06, 0.25], [0.2, 0.05, 0.03], hair, head);
    const leftArm = this.group('Left shoulder', [-0.4, 1.4, 0], body);
    const rightArm = this.group('Right shoulder', [0.4, 1.4, 0], body);
    for (const arm of [leftArm, rightArm]) {
      this.box('Sleeve', [0, -0.15, 0], [0.22, 0.35, 0.26], clothing, arm);
      this.box('Forearm', [0, -0.43, 0], [0.18, 0.3, 0.2], skin, arm);
      this.box('Hand', [0, -0.6, 0.015], [0.19, 0.15, 0.2], skin, arm);
    }
    const leftLeg = this.group('Left hip', [-0.17, 0.76, 0], body);
    const rightLeg = this.group('Right hip', [0.17, 0.76, 0], body);
    for (const leg of [leftLeg, rightLeg]) {
      this.box('Trouser leg', [0, -0.32, 0], [0.25, 0.62, 0.28], trousers, leg);
      this.box('Shoe', [0, -0.68, 0.07], [0.28, 0.16, 0.43], shoes, leg);
    }
    const cup = this.makeCup(0, -0.65, 0.06, rightArm);
    cup.enabled = false;
    return { root, body, limbs: { leftArm, rightArm, leftLeg, rightLeg, head }, cup, ring, contact,
      actor: { ...actor }, npc, phase: hash % 12, ...motion };
  }

  private animateAvatar(avatar: Avatar, dt: number): void {
    const { actor, root, glideFrom } = avatar;
    const local = actor.id === this.localId;
    const current = root.getPosition();
    const moving = Math.hypot(actor.x - current.x, actor.z - current.z) > 0.025;
    const progress = clamp((this.elapsed - avatar.glideAt) / avatar.glide, 0, 1);
    root.setPosition(lerp(glideFrom.x,actor.x,progress),lerp(glideFrom.y,actor.y??0,progress),lerp(glideFrom.z,actor.z,progress));
    const drawn = root.getPosition(), last = avatar.lastDrawn ??= drawn.clone();
    avatar.speed = lerp(avatar.speed ?? 0, Math.min(8, Math.hypot(drawn.x - last.x, drawn.z - last.z) / Math.max(dt, 1e-3)), 1 - Math.exp(-dt / .15));
    last.copy(drawn);
    // A bar animation (sitting at a table, the urinal, a cigarette, Magrão at the counter...): undefined while its clip loads.
    const bar = avatar.skin ? this.barAction(avatar, Date.now() + this.serverClockOffset) : undefined;
    if (avatar.bar && !bar) this.leaveBarAction(avatar);
    let animation = (actor.animation ?? actor.state ?? 'idle').toLowerCase();
    if (moving && animation === 'idle') animation = 'walk';
    const seated = animation.includes('sit') || animation.includes('seat') || animation.includes('blackjack');
    // The local player faces the predicted travel direction; the server's lags behind it.
    // Seats, stage spots and the bar animations set the facing on the server, so the player keeps that one meanwhile.
    if (local && (seated || actor.musician || (bar && actor.interactionState))) this.lastRotation = actor.rotation ?? this.lastRotation;
    const rotation = (local ? this.lastRotation : actor.rotation ?? 0) * RAD_TO_DEG;
    const turn = ((rotation - avatar.yaw + 540) % 360) - 180;
    avatar.yaw = ((avatar.yaw + turn * (1 - Math.exp(-16 * dt)) + 540) % 360) - 180;
    // At the urinal, between walls, the camera swings to where the action shows.
    if (local && bar?.frame && bar.step.clip === 'urinar' && avatar.bar?.startedAt !== bar.step.startedAt) this.frameAction(bar.frame);
    if (bar) this.enterBarAction(avatar, bar);
    // Skinned avatars have dedicated drunk clips; the procedural sway remains as fallback for box avatars.
    const stage=drunkStage(actor.drunk??0),dedicatedDrunk=!!avatar.skin?.tracks.has('DrunkIdle')&&stage>=2;
    const sway = ['fallen','recover','stumble'].includes(actor.animation??'') || seated || actor.musician || bar || dedicatedDrunk ? 0 : DRUNK_BODY_SWAY[stage]!;
    root.setEulerAngles(sway * Math.sin((this.elapsed + avatar.phase) * 1.3), avatar.yaw, sway * Math.sin((this.elapsed + avatar.phase) * 0.9 + 1));
    this.shadeFeet(avatar);
    const pose: Pose = {
      t: this.elapsed + avatar.phase,
      walking: animation.includes('walk') || animation.includes('run') || animation.includes('wander'),
      running: animation.includes('run'),
      seated: avatar.seatedBlend = lerp(avatar.seatedBlend ?? 0, seated ? 1 : 0, 1 - Math.exp(-12 * dt)),
      dancing: !bar && (animation.includes('dance') || (avatar.npc && this.eventType === 'PARTY')),
      drinking: !bar && (animation.includes('drink') || (avatar.npc && animation.includes('drunk'))),
      waving: animation.includes('wave'),
    };
    avatar.cup.enabled = pose.drinking;
    if (!pose.drinking) for (const entity of Object.values(avatar.drinks ?? {})) entity.enabled = false;
    if(avatar.cards)avatar.cards.enabled=false;
    if (avatar.skin) this.poseSkin(avatar, avatar.skin, pose, bar);
    else if (avatar.limbs) this.poseLimbs(avatar, avatar.limbs, pose);
    if (bar && avatar.skin && avatar.bar) {
      this.barAnimations!.play(actor.id, bar.step, { space: avatar.bar.space, model: avatar.skin.model, servedFood: bar.servedFood, seat: bar.seat }, dt);
      this.barPlayed.add(actor.id);
      // The contact shadow stays under the body, which the clip may take away from the place's origin.
      const hip = avatar.skin.hip ??= (avatar.skin.model.findByName('hip') as pc.Entity | null) ?? undefined, p = hip?.getPosition();
      if (p) avatar.contact.setPosition(p.x, root.getPosition().y + .012, p.z);
    } else avatar.contact.setLocalPosition(0, .012, 0);
    // Tonico serving or clearing, and a player working the bar with an order on the tray (Magrão's hands are in his clips).
    if (avatar.skin && !bar && (avatar.npc ? actor.role === 'serving' && actor.id !== 'bartender' : !!actor.carrying)) this.carryTray(avatar, avatar.skin, Date.now() + this.serverClockOffset);
    else if (avatar.tray) avatar.tray.entity.enabled = false;
  }

  /**
   * The bar clip an avatar plays now (barTimeline, from the room's state or a debug run), converted for its skin and
   * added to its anim states; undefined when none applies or while the clip's file loads.
   */
  private barAction(avatar: Avatar, now: number): BarAction | undefined {
    const skin = avatar.skin!, model = avatar.skinId ? this.skinModels.get(avatar.skinId) : undefined;
    if (!this.barAnimations || !model) return;
    const override = this.barOverrides.get(avatar.actor.id);
    const actor = override ? { ...avatar.actor, animation: override.animation, animationStartedAt: override.startedAt, interactionState: override.interactionState ?? '', currentTableId: '',
      x: override.x ?? avatar.actor.x, y: override.y ?? avatar.actor.y, z: override.z ?? avatar.actor.z } : avatar.actor;
    const npcId = avatar.npc ? actor.id : '', meal = override ? override.meal : this.meal(actor.interactionState ?? '', now);
    const step = barTimeline(actor, now, npcId, meal);
    if (!step) return;
    // A debug run that has played its last clip gives the avatar back to the room.
    if (override && FINAL_CLIPS.has(step.clip) && now - step.startedAt > barClipMs(step.clip) + 150) { this.barOverrides.delete(actor.id); return; }
    const track = this.barAnimations.bodyTrack(step.clip, avatar.skinId!, skin.model, model.animations.map(asset => asset.resource as pc.AnimTrack));
    if (!track) return;
    if (!skin.tracks.has(track.name)) { skin.model.anim!.assignAnimation(track.name, track, undefined, 1, BAR_ANIMATIONS.clips[step.clip].loop); skin.tracks.add(track.name); }
    const place = actor.interactionState ?? '';
    return { step, frame: barFrame(actor, npcId), seat: place.startsWith('seat-') ? place : undefined, servedFood: !override && !!meal };
  }

  /** A bar animations' idle or walk for this skin (added to its anim states); undefined while its file loads. */
  private barLocomotion(avatar: Avatar, skin: SkinnedRig, clip: BarClip): string | undefined {
    const model = avatar.skinId ? this.skinModels.get(avatar.skinId) : undefined;
    const track = model && this.barAnimations?.bodyTrack(clip, avatar.skinId!, skin.model, model.animations.map(asset => asset.resource as pc.AnimTrack));
    if (!track) return;
    if (!skin.tracks.has(track.name)) { skin.model.anim!.assignAnimation(track.name, track, undefined, 1, true); skin.tracks.add(track.name); }
    return track.name;
  }

  /** What a seated customer eats: the snacks served from their seat, from the first touching the table until the last is finished. */
  private meal(seat: string, now: number): Meal | undefined {
    if (!seat.startsWith('seat-')) return;
    const food = [...this.servedItems.values()].map(entry => entry.state).filter(state => state.seat === seat && FOODS.has(state.item) && state.placedAt <= now);
    if (!food.length) return;
    const eating = food.filter(state => !state.doneAt);
    return { startedAt: Math.min(...(eating.length ? eating : food).map(state => state.placedAt)), endedAt: eating.length ? 0 : Math.max(...food.map(state => state.doneAt ?? 0)) };
  }

  /**
   * The local player starts an action in a tight place (the urinal, in a 3.5 m restroom): behind them the boom hits the
   * wall and the body hides the urinal and the stream, so the camera turns to the side with the most room, three quarters
   * from behind first. The player can still turn it with the mouse.
   */
  private frameAction(frame: BarFrame): void {
    if (this.rig.mode === 'first') return;
    const { pitch, reach: length } = this.rig;
    const target = { x: frame.x, y: frame.y + 1.25, z: frame.z }, behind = frame.yaw + Math.PI, reach = Math.cos(pitch) * length;
    let best = this.rig.yaw, room = -1;
    for (const turn of [-Math.PI / 4, Math.PI / 4, -Math.PI / 3, Math.PI / 3, -Math.PI / 2, Math.PI / 2, 0]) {
      const yaw = behind + turn, end = { x: target.x + Math.sin(yaw) * reach, y: target.y + Math.sin(pitch) * length, z: target.z + Math.cos(yaw) * reach };
      const free = cameraFraction(target, end, true) * length;
      if (free > room + .05) { room = free; best = yaw; }
    }
    this.rig.turnTo(best);
  }

  /**
   * In a place (a chair, the urinal, a table corner, Magrão's spot) the avatar stands in the place's space, sliding there
   * in 0.3 s from where its body was (animacoes_bar.js posicionar); elsewhere the clip plays at the avatar's feet.
   */
  private enterBarAction(avatar: Avatar, bar: BarAction): void {
    const { root } = avatar, p = root.getPosition(), yaw = avatar.yaw / RAD_TO_DEG;
    if (!bar.frame) {
      avatar.bar = { clip: bar.step.clip, startedAt: bar.step.startedAt, time: bar.step.time, space: { x: p.x, y: p.y, z: p.z, yaw } };
      return;
    }
    const known = avatar.bar?.frame, same = !!known && Math.hypot(known.x - bar.frame.x, known.z - bar.frame.z) < .01 && Math.abs(known.yaw - bar.frame.yaw) < .01;
    let slide = same ? avatar.bar!.slide : undefined;
    if (!same) {
      // From where the body stands now: the place, less where the clip starts the body in it.
      const at = inFrame(bar.frame, BAR_ANIMATIONS.clips[bar.step.clip].start);
      slide = { from: { x: p.x - (at.x - bar.frame.x), y: p.y, z: p.z - (at.z - bar.frame.z), yaw: yaw - (at.rotation - bar.frame.yaw) }, at: this.elapsed };
    }
    const s = smoothstep(clamp((this.elapsed - (slide?.at ?? 0)) / .3, 0, 1)), from = slide?.from ?? bar.frame;
    const turn = Math.atan2(Math.sin(bar.frame.yaw - from.yaw), Math.cos(bar.frame.yaw - from.yaw));
    const space = { x: lerp(from.x, bar.frame.x, s), y: lerp(from.y, bar.frame.y, s), z: lerp(from.z, bar.frame.z, s), yaw: from.yaw + turn * s };
    root.setPosition(space.x, space.y, space.z); avatar.yaw = space.yaw * RAD_TO_DEG;
    avatar.bar = { clip: bar.step.clip, startedAt: bar.step.startedAt, time: bar.step.time, space, frame: bar.frame, slide };
  }

  /**
   * The bar clip is over: a clip that leaves the body away from where it began (getting up beside the chair) puts the
   * avatar where the body is, with no cross-fade (animacoes_bar.js reenraizar); the avatar then walks on to the room's
   * position, if that is elsewhere. An action cut short blends back from the place.
   */
  private leaveBarAction(avatar: Avatar): void {
    const last = avatar.bar!, info = BAR_ANIMATIONS.clips[last.clip], { root, actor } = avatar;
    avatar.bar = undefined; avatar.barRelease = .3; avatar.barFinished = !info.loop && last.time >= info.duration - .05;
    if (avatar.barFinished && barEndOffset(last.clip) > .05) {
      const end = inFrame(last.space, info.end);
      root.setPosition(end.x, end.y, end.z); avatar.yaw = end.rotation * RAD_TO_DEG; avatar.barRelease = 0;
    }
    const p = root.getPosition();
    avatar.glideFrom.copy(p); avatar.glideAt = this.elapsed;
    avatar.glide = Math.max(.3, Math.hypot(actor.x - p.x, actor.z - p.z) / 1.2);
  }

  /**
   * Moving things kept out of the lamps' cached shadow maps (EnvironmentLighting.redrawLampShadows): avatars with what
   * they hold and carry, and what is served on the tables (it comes and goes).
   */
  private *dynamicCasters(): Iterable<pc.MeshInstance> {
    for (const avatar of this.actors.values()) for (const render of avatar.root.findComponents('render') as pc.RenderComponent[]) yield* render.meshInstances;
    for (const entry of this.servedItems.values()) if (entry.entity) for (const render of entry.entity.findComponents('render') as pc.RenderComponent[]) yield* render.meshInstances;
    if (this.barAnimations) yield* this.barAnimations.casters();
  }

  /** A soft dark disc on the floor under an avatar (the lamps' shadow maps leave people out). */
  private contactShadow(root: pc.Entity): pc.Entity {
    // Black, fading out from the middle; drawn on top of the floor without writing depth. Unlit: nothing tints it.
    this.contactMaterial ??= (() => {
      const material = new pc.ShaderMaterial({ uniqueName: 'Boteco contact shadow', attributes: { aPosition: pc.SEMANTIC_POSITION, aUv0: pc.SEMANTIC_TEXCOORD0 },
        vertexGLSL: CONTACT_VERTEX, fragmentGLSL: CONTACT_FRAGMENT });
      // Darkens the colour only: the canvas is transparent (alpha) and a lowered alpha would let the page show through.
      material.blendState = new pc.BlendState(true, pc.BLENDEQUATION_ADD, pc.BLENDMODE_SRC_ALPHA, pc.BLENDMODE_ONE_MINUS_SRC_ALPHA, pc.BLENDEQUATION_ADD, pc.BLENDMODE_ZERO, pc.BLENDMODE_ONE);
      material.depthWrite = false; material.setParameter('contactOpacity', .5); material.update();
      return material;
    })();
    const entity = new pc.Entity('Contact shadow');
    entity.addComponent('render', { type: 'plane', material: this.contactMaterial, castShadows: false, receiveShadows: false });
    entity.setLocalPosition(0, .012, 0); entity.setLocalScale(.9, 1, .9); root.addChild(entity);
    return entity;
  }
  /**
   * How dark the contact shadow is: full under a roof (inside, the veranda) and at night; in daylight in the open the
   * sun's own shadow of the avatar does the job, so only a hint stays.
   */
  private shadeFeet(avatar: Avatar): void {
    const p = avatar.root.getPosition(), last = avatar.covered;
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > .5) avatar.covered = { x: p.x, z: p.z, value: cameraFraction({ x: p.x, y: p.y + 1.7, z: p.z }, { x: p.x, y: p.y + 30, z: p.z }) < 1 };
    const opacity = avatar.covered!.value ? .55 : .12 + .43 * (1 - this.environment.daylight);
    avatar.contact.render?.meshInstances[0]?.setParameter('contactOpacity', opacity);
  }

  /** A round aluminium tray with a rolled rim; carryTray puts the order on top. */
  private buildTray(avatar: Avatar): NonNullable<Avatar['tray']> {
    const entity = this.group('Serving tray', [0, 0, 0], avatar.root), metal = this.trayMaterial();
    this.shape('Tray', 'cylinder', [0, TRAY_HEIGHT / 2, 0], [TRAY_RADIUS * 2, TRAY_HEIGHT, TRAY_RADIUS * 2], metal, entity);
    const rim = new pc.Entity('Tray rim');
    rim.addComponent('render', { meshInstances: [new pc.MeshInstance(pc.Mesh.fromGeometry(this.app.graphicsDevice, new pc.TorusGeometry({ tubeRadius: .007, ringRadius: TRAY_RADIUS, segments: 40 })), metal)], castShadows: true });
    rim.setLocalPosition(0, TRAY_HEIGHT, 0); entity.addChild(rim);
    entity.enabled = false;
    return avatar.tray = { entity, key: '', items: [] };
  }

  private trayMaterial(): pc.StandardMaterial {
    const key = 'serving-tray', existing = this.materialCache.get(key);
    if (existing) return existing;
    const material = new pc.StandardMaterial();
    // Brushed aluminium, as a light grey with a broad highlight: a metalness setup turns black without an environment map.
    material.diffuse = color('#b9bec4'); material.specular = color('#8f959c'); material.gloss = .55; material.update();
    this.materials.push(material); this.materialCache.set(key, material);
    return material;
  }

  /**
   * Tonico (or a player working the bar) while serving: the tray level on the left hand with the order on it. At the table
   * the right hand takes each item off the tray and sets it on its spot, bowing a little, as the room timed it
   * (ServedItemState.placedAt). Clearing a table, the tray fills with what he takes off it.
   */
  private carryTray(avatar: Avatar, skin: SkinnedRig, now: number): void {
    const { actor, body, root } = avatar, bones = skin.bones, hand = skin.drinkHand;
    const tray = avatar.tray ?? this.buildTray(avatar);
    if (!hand) { tray.entity.enabled = false; return; }
    const up = pc.Vec3.UP, front = body.forward.clone().mulScalar(-1), side = body.right.clone();
    front.y = 0; front.normalize(); side.y = 0; side.normalize();
    // The order on the tray, rebuilt when it changes (or once its models have loaded).
    const items = (actor.carrying ?? '').split(',').filter(Boolean), key = items.join(',');
    if (tray.key !== key) {
      const made = items.map(item => this.makeProp(item));
      if (made.every(Boolean)) {
        tray.items.forEach(item => item.destroy());
        const slots = traySlots(items);
        tray.items = made.map((prop, i) => { tray.entity.addChild(prop!); prop!.setLocalPosition(slots[i]!.x, TRAY_HEIGHT, slots[i]!.z); return prop!; });
        tray.key = key;
      } else made.forEach(prop => prop?.destroy());
    }
    // The item being put down now (or the last one, while the hand comes back).
    const placing = key ? [...this.servedItems.values()].filter(e => e.state.orderId === actor.carryingOrder).sort((a, b) => a.state.slot - b.state.slot) : [];
    const current = placing.find(e => now >= e.state.placedAt - SERVE_ITEM_MS && now < e.state.placedAt);
    const last = placing.at(-1), t = current ? (now - current.state.placedAt + SERVE_ITEM_MS) / SERVE_ITEM_MS : 1;
    const weight = current ? (current.state.slot === 0 ? smoothstep(t / .3) : 1) : last && now >= last.state.placedAt ? 1 - smoothstep((now - last.state.placedAt) / SERVE_LEAD_MS) : 0;
    if (weight > 0) {
      avatar.spine ??= (skin.model.findByName('spine_02') as pc.Entity | null) ?? null;
      if (avatar.spine) this.turn(avatar.spine, body.right, 22 * weight);
    }
    // Left hand under the middle of the tray, forearm level in front of the body.
    const shoulder = bones.upperarm_l.getPosition();
    const wrist = shoulder.clone().add(front.clone().mulScalar(.3)).sub(up.clone().mulScalar(.27)).sub(side.clone().mulScalar(.03));
    reach(bones.upperarm_l, bones.lowerarm_l, bones.hand_l, wrist, new pc.Vec3().sub(up).sub(front.clone().mulScalar(.4)).add(side.clone().mulScalar(.6)));
    palmUp(hand, up, front);
    tray.entity.setPosition(trayCentre(hand, up)); tray.entity.setEulerAngles(0, avatar.yaw, 0); tray.entity.enabled = true;
    this.trayOrder = actor.carryingOrder ?? ''; this.trayFrame = this.frameId;
    // An item leaves the tray when the right hand takes it.
    tray.items.forEach((item, i) => { const entry = placing[i]; item.enabled = !entry || now < entry.state.placedAt - SERVE_ITEM_MS * .7; });
    type Entry = typeof placing[number];
    const slot = (entry: Entry) => tray.items[entry.state.slot]?.getPosition().clone() ?? root.getPosition().clone();
    const spot = (entry: Entry) => new pc.Vec3(entry.state.x, entry.state.y, entry.state.z);
    // The hand closes over the top of what it carries.
    const grip = (entry: Entry) => up.clone().mulScalar(Math.min(.12, SERVED_PROPS[entry.state.item as ItemId]?.height ?? .1) * .7 + .05);
    const pole = new pc.Vec3().sub(up).sub(side.clone().mulScalar(.6)).sub(front.clone().mulScalar(.3));
    if (current) {
      const from = slot(current), to = spot(current), previous = placing[current.state.slot - 1];
      if (t < .3) {
        // Reaching for it on the tray (from the item set down before, if any).
        const target = from.clone().add(grip(current));
        if (previous) target.lerp(spot(previous).add(grip(previous)), target, smoothstep(t / .3));
        reach(bones.upperarm_r, bones.lowerarm_r, bones.hand_r, target, pole, weight);
      } else {
        // Over to its spot in a low arc; in the hand on the way, set down at the end even if the arm falls short.
        const s = (t - .3) / .7, path = new pc.Vec3().lerp(from, to, smoothstep(s)).add(up.clone().mulScalar(Math.sin(Math.PI * s) * .1));
        reach(bones.upperarm_r, bones.lowerarm_r, bones.hand_r, path.add(grip(current)), pole, weight);
        const held = bones.hand_r.getPosition().clone().sub(grip(current));
        const position = s < .2 ? from.lerp(from, held, smoothstep(s / .2)) : s < .8 ? held : held.lerp(held, to, smoothstep((s - .8) / .2));
        const entity = current.entity ??= this.makeProp(current.state.item);
        if (entity) {
          if (!entity.parent) this.app.root.addChild(entity);
          const yaw = avatar.yaw / RAD_TO_DEG, turn = Math.atan2(Math.sin(current.state.rotation - yaw), Math.cos(current.state.rotation - yaw));
          entity.setPosition(position); entity.setEulerAngles(0, (yaw + turn * smoothstep(s)) * RAD_TO_DEG, 0);
          entity.enabled = true; current.moved = this.frameId; current.settled = false;
        }
      }
    } else if (last && weight > 0) reach(bones.upperarm_r, bones.lowerarm_r, bones.hand_r, spot(last).add(grip(last)), pole, weight);
  }

  private poseLimbs({ actor, body, npc }: Avatar, limbs: Limbs, pose: Pose): void {
    const { leftArm, rightArm, leftLeg, rightLeg, head } = limbs;
    const { t, walking, running, dancing, drinking, seated: seatedBlend } = pose;
    const stride = walking ? Math.sin(t * (running ? 13 : 8)) * (running ? 45 : 30) : 0;
    body.setLocalPosition(0, -0.18 * seatedBlend + (1 - seatedBlend) * (walking ? Math.abs(Math.sin(t * 8)) * 0.045 : Math.sin(t * 2) * 0.015), 0);
    body.setLocalEulerAngles(running ? 8 : 0, 0, 0);
    leftArm.setLocalEulerAngles(stride * 0.8, 0, 3);
    rightArm.setLocalEulerAngles(-stride * 0.8, 0, -3);
    leftLeg.setLocalEulerAngles(-stride, 0, 0);
    rightLeg.setLocalEulerAngles(stride, 0, 0);
    head.setLocalEulerAngles(0, Math.sin(t * 0.65) * 3, 0);
    if (seatedBlend > 0.01) {
      leftLeg.setLocalEulerAngles(-75 * seatedBlend - stride * (1 - seatedBlend), 0, -4 * seatedBlend);
      rightLeg.setLocalEulerAngles(-75 * seatedBlend + stride * (1 - seatedBlend), 0, 4 * seatedBlend);
      leftArm.setLocalEulerAngles(-25 * seatedBlend, 0, 3);
      rightArm.setLocalEulerAngles(-25 * seatedBlend, 0, -3);
    }
    if (dancing) {
      body.setLocalPosition(0, Math.abs(Math.sin(t * 6)) * 0.14, 0);
      body.setLocalEulerAngles(0, Math.sin(t * 3) * 15, Math.sin(t * 6) * 8);
      leftArm.setLocalEulerAngles(Math.sin(t * 6) * 45, 0, -85);
      rightArm.setLocalEulerAngles(Math.sin(t * 6 + 1) * 45, 0, 85);
      leftLeg.setLocalEulerAngles(Math.sin(t * 6) * 15, 0, -5);
      rightLeg.setLocalEulerAngles(-Math.sin(t * 6) * 15, 0, 5);
    }
    if (drinking) {
      const raise = Math.max(0, Math.sin(t * 1.7));
      rightArm.setLocalEulerAngles(-95 - raise * 30, 0, -10);
      head.setLocalEulerAngles(-raise * 14, 0, Math.sin(t * 1.4) * 5);
    }
    if (npc && this.eventType === 'DRUNK_NPC' && actor.id === 'tonico') {
      body.setLocalEulerAngles(Math.sin(t * 2) * 7, 0, Math.sin(t * 2.7) * 11);
    }
    if (pose.waving) rightArm.setLocalEulerAngles(0, Math.sin(t * 12) * 20, 155);
    // Box avatars have no Fallen clip: lie down.
    if (actor.animation === 'fallen') { body.setLocalPosition(0, 0.22, 0); body.setLocalEulerAngles(-88, 0, 0); }
  }

  /**
   * The clip sets the base pose; gestures are extra joint turns about the body's own axes,
   * which keeps them independent of each bone's local frame. The model faces +Z, its left on +X.
   */
  private poseSkin(avatar: Avatar, skin: SkinnedRig, pose: Pose, bar?: BarAction): void {
    const { body, cup, actor, skinId } = avatar;
    const { t, seated, dancing, drinking, waving } = pose;
    const { bones } = skin;
    const anim = skin.model.anim!;
    // Gestures are built on the static Pose; plain standing uses the animated Idle.
    const gesture = seated > 0.01 || dancing || drinking || waving;
    const action = actor.animation;
    const stage=drunkStage(actor.drunk??0);
    // On a stage spot: the musician's clip of the phase, once converted for this skin (meanwhile the avatar idles there).
    const show=bar?undefined:this.musicianClip(avatar,skin);
    // A bar animation (bar-animations.ts) comes before the game's own clips.
    let requested = bar ? barState(bar.step.clip) : show ? show.state : action === 'kick' ? 'Kick' : action === 'fallen' ? 'Fallen' : action === 'stumble' ? 'DrunkIdle'
      : action === 'recover' ? 'Recover' : action === 'wave' ? 'Wave' : action === 'use' ? 'Use'
      : action === 'wait'||action === 'toilet' ? 'Wait' : action === 'deal' ? 'Deal' : action === 'shuffle' ? 'Shuffle'
      : action === 'bartend' ? 'Bartend' : drinking ? 'Drink' : seated > 0.5 ? (actor.currentTableId ? (actor.cardResult === 'loss' ? 'AngrySit' : 'CardsSit') : 'Sit')
      : dancing ? 'Dance' : !actor.oldWalk&&pose.walking ? (stage>=3?'DrunkWalk':pose.running?'Run':'Walk') : !actor.oldWalk&&stage>=2?'DrunkIdle':'';
    // Standing and walking are the bar animations' own, once converted for this skin; running, the cane, the gestures and
    // a drunk idle keep the game's clips (the module has none of them).
    const walk = !bar && !show && !actor.oldWalk && !gesture && seated < .5 ? BAR_WALKS[requested] : undefined;
    const locomotion = walk ? this.barLocomotion(avatar, skin, walk) : undefined;
    if (locomotion) requested = locomotion;
    const actionImported = !!requested && skin.tracks.has(requested);
    const oldGait=!!actor.oldWalk&&!gesture&&skin.tracks.has('OldCaneWalk')&&skin.tracks.has('OldCaneHold');
    const imported=actionImported||oldGait;
    const clip = actionImported ? requested : oldGait ? (pose.walking?'OldCaneWalk':'OldCaneHold') : pose.walking && seated < 0.5 ? 'Walk' : gesture ? 'Pose' : 'Idle';
    if(skin.cane)skin.cane.enabled=oldGait&&!actionImported;
    const playbackKey = bar ? `${clip}:${bar.step.startedAt}` : show ? `${clip}:${show.startedAt}` : locomotion ? clip : `${clip}:${actionImported ? actor.animationStartedAt ?? 0 : 0}`;
    if (skin.clip !== clip || skin.playbackKey !== playbackKey) {
      // The take, start and loop clips follow each other frame to frame; the take and stop clips blend in, as palco_musicos.js does.
      // Bar clips follow each other as barTimeline says (0 from a clip's last frame into the next), enter in 0.3 s and
      // leave as leaveBarAction decided.
      // An action's last frame is the bar idle's first (animacoes_bar.js: parado at full weight at once).
      const fromAction = skin.clip.startsWith('Bar ') && !BAR_LOCOMOTION.has(skin.clip);
      const blend = bar ? (fromAction ? bar.step.blend : bar.step.blend || .3) : show ? show.blend
        : fromAction ? (avatar.barRelease === 0 || (avatar.barFinished && clip === barState('parado_loop')) ? 0 : avatar.barRelease ?? .3) : skin.clip.startsWith('Palco ') ? MUSICIANS.releaseSeconds : clip.startsWith('OldCane')||skin.clip.startsWith('OldCane')?.35:.25;
      anim.baseLayer?.transition(clip, skin.clip ? blend : 0);
      skin.clip = clip; skin.playbackKey = playbackKey;
      if (bar && anim.baseLayer) anim.baseLayer.activeStateCurrentTime = bar.step.time;
      else if (show && anim.baseLayer) anim.baseLayer.activeStateCurrentTime = musicianTime(show.spot,show.phase,show.startedAt,show.now);
      else if (actionImported && !locomotion && actor.animationStartedAt && anim.baseLayer) {
        const age = Math.max(0, (Date.now() + this.serverClockOffset - actor.animationStartedAt) / 1000);
        const duration = anim.baseLayer.activeStateDuration;
        anim.baseLayer.activeStateCurrentTime = ['Deal', 'Dance', 'Wait', 'DrunkIdle', 'DrunkWalk', ...SEATED_CLIPS].includes(clip) ? age % duration : Math.min(age, duration);
      }
    }
    const cadence = (walked: BarClip) => clamp((avatar.speed ?? 0) / (WALK_PACE[walked] ?? .85), .5, 2.2);
    anim.speed = clip===barState('andar_loop')?cadence('andar_loop'):clip===barState('andar_bebado_loop')?cadence('andar_bebado_loop')
      :clip==='OldCaneWalk'?(skin.oldCaneRate??1):clip==='Walk'?WALK_CLIP_SPEED:clip==='Run'?1.15:1;
    if (show) this.musicians!.play(show.spot.id,show.phase,show.startedAt,show.now,show.blend);
    // The body keeps to the room's clock (a hidden tab, a slow frame): props and chair are drawn at that time too.
    else if (bar && anim.baseLayer?.activeState === clip) {
      const duration = BAR_ANIMATIONS.clips[bar.step.clip].duration, drift = Math.abs(anim.baseLayer.activeStateCurrentTime - bar.step.time);
      if (Math.min(drift, duration - drift) > .2) anim.baseLayer.activeStateCurrentTime = bar.step.time;
    }
    if (imported) {
      body.setLocalPosition(0, 0, 0); body.setLocalEulerAngles(0, 0, 0);
      if (SEATED_CLIPS.includes(clip)) {
        // The skins have different pelvis-to-thigh offsets; anchor the actual hip joints to the chair.
        const hipY = (bones.upperleg_l.getPosition().y + bones.upperleg_r.getPosition().y) / 2;
        body.setLocalPosition(0,(actor.y??0)+0.56-hipY,0);
      }
      if(clip==='CardsSit'&&(actor.cardCount??0)>0)this.holdCards(avatar,skin,actor.cardCount!);
      // The drinking clip raises the drink with the left hand: the one ordered or taken from the backpack (NPCs: a bottle).
      const item:HeldDrink|undefined=drinking?(HELD_DRINKS.find(id=>id===actor.drinkItem)??'garrafa'):undefined;
      const prop=item&&clip==='Drink'&&skin.drinkHand?this.drink(avatar,item):undefined;
      for(const [name,entity] of Object.entries(avatar.drinks??{}))entity.enabled=!!prop&&name===item;
      avatar.sip=0;
      if (prop&&item) {
        cup.enabled = false;
        const up=this.axisUp.copy(body.up),front=this.axisFront.copy(body.forward).mulScalar(-1);
        avatar.sip=holdDrink(skin.drinkHand!,prop,DRINK_PROPS[item],bones.head,up,front,RIG_GRIP[skinId??'']);
      } else if (drinking) {
        const grip = this.tempPosition.lerp(bones.hand_l.getPosition(), bones.middle_01_l.getPosition(), 0.6);
        cup.setPosition(grip.x, grip.y - 0.05, grip.z); cup.setRotation(body.getRotation());
      }
      return;
    }
    // Only Nathan's original clips omit its root. Native rigs restore their own root
    // through their tracks, including any authored coordinate conversion.
    if (skinId === 'nathan' && (clip === 'Walk' || clip === 'Pose')) {
      const root = skin.model.findByName('root'); root?.setLocalPosition(0, 0, 0); root?.setLocalEulerAngles(0, 0, 0);
    }
    // Walk and Idle carry their own motion; the static Pose gets a little breathing. Sitting lowers the hips.
    body.setLocalPosition(0, -skin.sitDrop * seated + (clip === 'Pose' ? Math.sin(t * 2) * 0.008 : 0), 0);
    body.setLocalEulerAngles(pose.running ? 8 : 0, 0, 0);
    if (dancing) {
      body.setLocalPosition(0, Math.abs(Math.sin(t * 6)) * 0.1, 0);
      body.setLocalEulerAngles(0, Math.sin(t * 3) * 15, Math.sin(t * 6) * 6);
    }
    const right = this.axisRight.copy(body.right);
    const up = this.axisUp.copy(body.up);
    const front = this.axisFront.copy(body.forward).mulScalar(-1);
    if (clip === 'Pose') this.turn(bones.head, up, Math.sin(t * 0.65) * 4);
    if (seated > 0.01) {
      for (const side of ['l', 'r'] as const) {
        this.turn(bones[`upperleg_${side}`], right, -88 * seated);
        this.turn(bones[`lowerleg_${side}`], right, 88 * seated);
        this.turn(bones[`upperarm_${side}`], right, -25 * seated);
        this.turn(bones[`lowerarm_${side}`], right, -40 * seated);
      }
    }
    const rightArmBusy = drinking || waving;
    if (dancing) {
      const beat = Math.sin(t * 6);
      this.turn(bones.upperarm_l, front, 65 + beat * 20);
      this.turn(bones.upperarm_l, right, beat * 30);
      this.turn(bones.lowerarm_l, front, 55);
      if (!rightArmBusy) {
        this.turn(bones.upperarm_r, front, -65 + Math.sin(t * 6 + 1) * 20);
        this.turn(bones.upperarm_r, right, -beat * 30);
        this.turn(bones.lowerarm_r, front, -55);
      }
      this.turn(bones.upperleg_l, right, beat * 12);
      this.turn(bones.upperleg_r, right, -beat * 12);
    }
    if (drinking) {
      const raise = Math.max(0, Math.sin(t * 1.7));
      this.turn(bones.upperarm_r, right, -20 - raise * 15);
      this.turn(bones.lowerarm_r, right, -100 - raise * 30);
      this.turn(bones.head, right, -raise * 14);
      const grip = this.tempPosition.lerp(bones.hand_r.getPosition(), bones.middle_01_r.getPosition(), 0.6);
      cup.setPosition(grip.x - up.x * 0.05, grip.y - up.y * 0.05, grip.z - up.z * 0.05);
      cup.setRotation(body.getRotation());
    }
    if (waving) {
      this.turn(bones.upperarm_r, front, -150);
      this.turn(bones.lowerarm_r, front, Math.sin(t * 12) * 25);
    }
  }

  /**
   * The stage clip an avatar plays now: its spot's phase (musicianPhase runs the take and start clips into the next
   * phase without waiting for the room) and how long it blends in. Undefined off the stage, or until the spot's clips
   * have loaded and been converted for this skin (they are then added to its anim states).
   */
  private musicianClip(avatar:Avatar,skin:SkinnedRig):{state:string;spot:StageSpot;phase:StagePhase;startedAt:number;now:number;blend:number}|undefined {
    const playing=avatar.actor.musician,spot=playing?stageSpot(playing.id):undefined,model=avatar.skinId?this.skinModels.get(avatar.skinId):undefined;
    if(!playing||!spot||!model||!this.musicians)return;
    const now=Date.now()+this.serverClockOffset,current=musicianPhase(playing,now);
    if(!current||current.phase==='fim')return;
    const tracks=this.musicians.bodyTracks(spot.id,avatar.skinId!,skin.model,model.animations.map(asset=>asset.resource as pc.AnimTrack));
    if(!tracks)return;
    if(!skin.tracks.has(tracks[0]!.name))tracks.forEach((track,i)=>{skin.model.anim!.assignAnimation(track.name,track,undefined,1,STAGE_PHASES[i]==='loop');skin.tracks.add(track.name);});
    const blend=(current.phase==='entrando'||current.phase==='saindo')&&now-current.startedAt<MUSICIANS.blendSeconds*1000?MUSICIANS.blendSeconds:0;
    return {state:musicianState(spot.id,current.phase),spot,...current,now,blend};
  }

  /** Rotates a bone by `degrees` about a world-space axis, on top of its current pose. */
  private turn(bone: pc.Entity, axis: pc.Vec3, degrees: number): void {
    if (Math.abs(degrees) < 0.01) return;
    bone.setRotation(this.tempTurn.setFromAxisAngle(axis, degrees).mul(bone.getRotation()));
  }

  /** Configurações → Gráficos (apps/web/src/graphics.ts). */
  setGraphics(graphics: GraphicsSettings): void {
    this.graphics = graphics; this.scale = graphics.renderScale; this.goodSeconds = 0;
    this.applyResolution();
    this.environment.setQuality(graphics.shadows, FOG_SCALE[graphics.fog]);
    this.app.autoRender = this.enabled && !graphics.fpsCap;
    this.app.renderNextFrame = true;
  }
  getGraphics() { return { ...this.graphics, currentScale: this.scale, fps: this.fps, pixelRatio: this.app.graphicsDevice.maxPixelRatio }; }
  private applyResolution(): void {
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, this.graphics?.pixelRatioCap ?? 1.5) * this.scale;
    this.resize();
  }
  /** With a frame cap the scene still updates every display frame but draws only at the chosen rate. */
  private shouldDraw(dt: number): boolean {
    const cap = this.graphics?.fpsCap;
    if (!cap || !this.enabled) return true;
    this.drawClock += dt;
    if (this.drawClock < 1 / cap - 0.002) return false;
    this.drawClock = Math.min(this.drawClock - 1 / cap, 1 / cap);
    this.app.renderNextFrame = true;
    return true;
  }
  /** Dynamic resolution: below 80% of the target for a second, draw fewer pixels; give them back after 3 s of headroom. */
  private adaptResolution(): void {
    const graphics = this.graphics;
    if (!graphics?.dynamicResolution || !this.enabled) return;
    const target = graphics.fpsCap || 60;
    if (this.fps < target * 0.8 && this.scale > 0.5) { this.scale = Math.max(0.5, +(this.scale - 0.1).toFixed(2)); this.goodSeconds = 0; this.applyResolution(); }
    else if (this.fps >= target * 0.95 && this.scale < graphics.renderScale && ++this.goodSeconds >= 3) { this.scale = Math.min(graphics.renderScale, +(this.scale + 0.05).toFixed(2)); this.goodSeconds = 0; this.applyResolution(); }
  }

  private update(dt: number): void {
    this.frameSeconds += dt;
    this.swingDoors();
    if (this.shouldDraw(dt)) this.frames++;
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;
    if (this.frameSeconds >= 1) {
      this.fps = Math.round(this.frames / this.frameSeconds);
      this.frameSeconds = 0;
      this.frames = 0;
      this.adaptResolution();
    }
    this.frameId++;
    this.barPlayed.clear();
    for (const avatar of this.actors.values()) this.animateAvatar(avatar, dt);
    // Instruments nobody was drawn playing this frame go back on their stands.
    this.musicians?.frame();
    // Props nobody plays go away, pulled chairs go back, the cup and the freezer lid show again; particles and leftovers.
    this.barAnimations?.frame(dt,this.camera.camera,this.app.graphicsDevice.height,this.barPlayed);
    this.placeServed(Date.now()+this.serverClockOffset);
    const bartender=this.actors.get('bartender');
    // The tap runs while the chopp pours (Prop_Jato in Magrão's clip).
    this.mapEffects?.update(this.elapsed,!!this.barAnimations?.pouring()||bartender?.skin?.clip==='Bartend');
    const player = this.actors.get(this.localId);
    const television=TELEVISIONS.find(t=>t.id===this.watchingTv);
    if(television){
      // Far enough back for the screen to fill the view: 1.15 m from a TV, about 6 m from the stage screen.
      const angle=television.yaw*Math.PI/180,back=Math.max(1.15,television.width*1.1);
      this.camera.setPosition(television.x+Math.sin(angle+this.tvYaw)*back*Math.cos(this.tvPitch),television.y+Math.sin(this.tvPitch)*back,television.z+Math.cos(angle+this.tvYaw)*back*Math.cos(this.tvPitch));
      this.camera.lookAt(television.x,television.y,television.z);
      this.rig.idle();
    } else if (player && this.enabled) {
      // Drunk view: the camera rolls slowly (more with each stage).
      this.rig.follow(dt, { feet: player.root.getPosition(), head: player.skin?.bones.head.getPosition(), facing: player.yaw / RAD_TO_DEG,
        roll: DRUNK_CAMERA_ROLL[drunkStage(player.actor.drunk ?? 0)]!, elapsed: this.elapsed });
    } else if (!player) {
      // Waiting at the door: a slow drift in front of the facade.
      this.camera.setPosition(18+Math.sin(this.elapsed*.035)*2,9,16);
      this.camera.lookAt(14,1.8,-6);
      this.rig.idle();
    }
    this.showOwnHead(player);
    this.environment.update(Date.now()+this.serverClockOffset,dt,this.eventType);
    this.jukeboxLights?.update(dt,this.jukeboxState,Date.now()+this.serverClockOffset,this.jukeboxDuration,this.app.scene.exposure);
    this.stageLights?.update(dt,this.stageState,Date.now()+this.serverClockOffset,this.stageDuration,this.app.scene.exposure);
    this.animateMarker(this.objective);
    this.updateStageBlips();
    const party = this.environment.partyStrength;
    for (let i = 0; i < this.partyLights.length; i++) {
      const light = this.partyLights[i]!.light;
      if (light){light.intensity = party * (2 + Math.sin(this.elapsed * 3 + i * Math.PI));light.enabled=light.intensity>.015;}
    }
    this.discoBall.rotate(0, dt * (8+party*62), 0);
    this.callbacks.onMediaFrame?.();
  }

  private inputHasFocus(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLElement &&
      (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || Boolean(active.closest('[data-capture-input]')));
  }

  private installControls(): void {
    const listen = <K extends keyof WindowEventMap>(target: Window | HTMLCanvasElement, event: K,
      handler: (event: WindowEventMap[K]) => void, options?: AddEventListenerOptions): void => {
      target.addEventListener(event, handler as EventListener, options);
      this.cleanup.push(() => target.removeEventListener(event, handler as EventListener, options));
    };
    listen(window, 'keydown', event => {
      if (!this.enabled || this.inputHasFocus()) return;
      // Let a focused interface button receive its native keyboard activation.
      if ((event.code === 'Enter' || event.code === 'Space') && document.activeElement?.tagName === 'BUTTON') return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        event.preventDefault(); this.keys.add(event.code);
      }
      if (!event.repeat && event.code === 'KeyE') { event.preventDefault(); this.callbacks.onInteract?.(); }
      if (!event.repeat && event.code === 'KeyG') this.callbacks.onEmote?.('dance');
      if (!event.repeat && event.code === 'KeyV') { event.preventDefault(); this.callbacks.onEmote?.('wave'); }
      if (!event.repeat && event.code === 'KeyF') { event.preventDefault(); this.callbacks.onEmote?.('smoke'); }
      if (!event.repeat && event.code === 'KeyC') { event.preventDefault(); this.callbacks.onSkins?.(); }
      if (!event.repeat && event.code === 'KeyX') { event.preventDefault(); this.callbacks.onKick?.(); }
      if (!event.repeat && event.code === 'KeyQ') { event.preventDefault(); this.callbacks.onCameraMode?.(this.rig.cycle()); }
      if (!event.repeat && (event.code === 'Enter' || event.code === 'KeyT')) { event.preventDefault(); this.callbacks.onChat?.(); }
    });
    listen(window, 'keyup', event => this.keys.delete(event.code));
    listen(window, 'blur', () => { this.keys.clear(); this.dragging = false; });
    listen(this.canvas, 'pointerdown', event => {
      if ((!this.enabled&&!this.watchingTv) || (event.button !== 0 && event.button !== 2)) return;
      this.dragging = true;
      this.canvas.setPointerCapture(event.pointerId);
    });
    listen(this.canvas, 'pointermove', event => {
      if ((!this.enabled&&!this.watchingTv) || !this.dragging) return;
      if(this.watchingTv){this.tvYaw=clamp(this.tvYaw-event.movementX*.006,-.8,.8);this.tvPitch=clamp(this.tvPitch+event.movementY*.004,-.25,.25);return;}
      this.rig.drag(event.movementX, event.movementY);
    });
    listen(window, 'pointerup', () => { this.dragging = false; });
    listen(this.canvas, 'pointercancel', () => { this.dragging = false; });
    listen(this.canvas, 'contextmenu', event => event.preventDefault());
    listen(this.canvas, 'wheel', event => {
      if (!this.enabled) return;
      event.preventDefault();
      // Pages and lines scroll by other units than pixels.
      const mode = this.rig.wheel(event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1));
      if (mode) this.callbacks.onCameraMode?.(mode);
    }, { passive: false });
  }

  private resize(): void {
    if (this.destroyed) return;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.app.resizeCanvas(width, height);
  }
}

export type { SceneActor, SceneCallbacks, SceneInput, SceneLabel, SceneWorld } from './scene-types';
