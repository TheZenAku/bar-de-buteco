import * as pc from 'playcanvas';
import { BLACKJACK_SEATS, BLACKJACK_TABLE, COLLIDERS, DEFAULT_SKIN, INTERACTABLES, MAP_COLLIDERS, MAP_SURFACES, PATCH_MS, SKINS, TICK_MS, MALE_CLOTHING, cameraFraction, drunkStage, type Position, type WorldState } from '@bar/shared';
import {DOOR_LEAVES,DOOR_SWING_SECONDS,doorSwing,DRINK_ITEMS,type DoorLeaf,type DrinkItem} from '@bar/shared';
import {DRINK_PROPS,RIG_GRIP,findHand,holdDrink,type HandRig} from './drink-props';
import type { SceneActor, SceneCallbacks, SceneInput, SceneLabel, SceneWorld } from './scene-types';
import {applyCharacter,characterFromJson,disposeCharacter} from './character-materials';
import {TelevisionSurface} from './television-surface';
import {TELEVISIONS,TV_SYSTEMS} from '@bar/shared';
import {EnvironmentLighting} from './environment-lighting';
import {MapEffects,type MapEffectsStatus} from './map-effects';

type Primitive = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane';
type V3 = [number, number, number];
type Limbs = Record<'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'head', pc.Entity>;
const SKIN_BONES = ['head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'hand_l', 'middle_01_l', 'hand_r', 'middle_01_r',
  'upperleg_l', 'lowerleg_l', 'upperleg_r', 'lowerleg_r','foot_l','foot_r'] as const;
type SkinBone = typeof SKIN_BONES[number];
// Skins with a Character Creator / Unreal skeleton name the leg bones differently; Read's rig has
// no middle finger, so the cup is held by the index finger instead.
const BONE_ALIASES: Partial<Record<SkinBone, string>> = { upperleg_l: 'thigh_l', lowerleg_l: 'calf_l', upperleg_r: 'thigh_r', lowerleg_r: 'calf_r',
  middle_01_l: 'index_01_l', middle_01_r: 'index_01_r' };
// Looping clips that sit the hips on a chair (anchored to the 0.56 m seat height).
const SEATED_CLIPS = ['CardsSit', 'AngrySit', 'Sit'];
// Degrees by drunk stage (0-4): body sway of every avatar and camera roll of the local player.
const DRUNK_BODY_SWAY = [0, 0, 3, 6, 6];
const DRUNK_CAMERA_ROLL = [0, 0.6, 1.5, 3, 3];
// NPCs with their own skin, not offered in the selector: Seu Zé is Magrão.
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
  drinks?: Partial<Record<DrinkItem, pc.Entity>>;
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
}
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
const skinUrl = (id: string): string => `${import.meta.env.BASE_URL}${id.startsWith('base-')?'characters':'models'}/${id}.glb${id === 'leandro' ? '?v=accurig-20261021' : ''}`;
const SKIN_IDS = new Set<string>(['custom',...SKINS.map(skin => skin.id)]);
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
  onInteract?: () => void;
  onEmote?: (emote:'dance'|'wave') => void;
  onChat?: () => void;
  onSkins?: () => void;
  onKick?: () => void;
  onMediaFrame?:()=>void;
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
  private readonly keys = new Set<string>();
  private readonly cleanup: (() => void)[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly cameraTarget = new pc.Vec3(0, 1.2, 3.5);
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
  private readonly drinkModels=new Map<DrinkItem,pc.ContainerResource>();
  /** Each map door leaf, turned about its own hinge (the node origin) by its door's synced state. */
  private readonly doorLeaves:Array<{leaf:DoorLeaf;entity?:pc.Entity;openness:number;from:number;target:number;changedAt:number}>=
    DOOR_LEAVES.map(leaf=>({leaf,openness:1,from:1,target:1,changedAt:0}));
  private localId = '';
  private enabled = false;
  private destroyed = false;
  private elapsed = 0;
  private yaw = 0.15;
  private pitch = 0.55;
  private distance = 6.4;
  private dragging = false;
  private lastRotation = Math.PI;
  private eventType = '';
  private frameSeconds = 0;
  private frames = 0;
  private fps = 60;
  private staticBatchId = -1;

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
    this.environment=new EnvironmentLighting(this.app,this.camera);
    this.environment.update(Date.now(),0,'');

    this.staticBatchId = this.app.batcher.addGroup('Static bar furnishings', false, 24).id;
    this.buildBlackjack();
    this.buildJukebox();
    this.buildPartyLighting();
    this.environment.addPartyShadows(this.partyLights);
    this.app.batcher.generate([this.staticBatchId]);
    this.staticBatchId = -1;
    for(const definition of TELEVISIONS.filter(tv=>TV_SYSTEMS.some(system=>system.tvId===tv.id)))this.televisions.set(definition.id,new TelevisionSurface(this.app,definition));
    this.discoBall = this.buildDiscoBall();
    this.ready = this.loadMap();
    this.loadDrinks();
    void this.ready.catch(() => {}); // The UI reports loading failures before admission.
    this.installControls();
    this.loadSkin('base-male');this.loadSkin(DEFAULT_MODEL);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.app.on('update', this.update, this);
    this.app.start();
  }

/** The bottle and the glass (tools/import-drinks.mjs). Without them, the old procedural cup stays in use. */
  private loadDrinks(): void {
    for(const item of DRINK_ITEMS)this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}${DRINK_PROPS[item].url}`,'container',(error,asset)=>{
      if(this.destroyed)return;
      if(error||!asset){console.warn(`Objeto de bebida "${item}" indisponível; usando o copo simples.`,error);return;}
      this.drinkModels.set(item,asset.resource as pc.ContainerResource);
    });
  }

  /** The avatar's bottle or glass, created once and reused; undefined until the model has loaded. */
  private drink(avatar:Avatar,item:DrinkItem):pc.Entity|undefined {
    const existing=avatar.drinks?.[item];if(existing)return existing;
    const model=this.drinkModels.get(item);if(!model)return;
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
        resolve();
      });
    });
  }

  private buildPartyLighting(): void {
    // Party washes: the ground-floor hall, the upstairs games hall and the backyard stage.
    for (const [x,y,z,hex] of [[6.5,2.7,-7.6,'#cf5275'],[12.5,2.7,-7.6,'#41afaa'],[10.3,5.8,-7.6,'#af75e5'],[26.6,3.6,-23.4,'#cf5275']] as const) {
      const light = new pc.Entity('Party wash');
      light.addComponent('light',{type:'spot',enabled:false,color:color(hex),intensity:0,range:8,innerConeAngle:35,outerConeAngle:75,
        castShadows:true,shadowResolution:512,shadowType:pc.SHADOW_PCF3_32F,shadowBias:.3,normalOffsetBias:.04});
      light.setPosition(x,y,z);this.app.root.addChild(light);this.partyLights.push(light);
    }
  }

  getMapStatus(): {loaded:boolean;colliders:number;surfaces:number;doors:number;doorOpenness:Record<string,number>;renders:number;cartRenders:number;lights:number;effects?:MapEffectsStatus} {
    const cart=this.mapEntity?.findByName('Carrinho_Espeto') as pc.Entity|undefined;
    return {loaded:!!this.mapEntity,colliders:MAP_COLLIDERS.length,surfaces:MAP_SURFACES.length,doors:this.doorLeaves.filter(d=>d.entity).length,doorOpenness:Object.fromEntries(this.doorLeaves.map(d=>[d.leaf.id,+d.openness.toFixed(3)])),
      renders:this.mapEntity?.findComponents('render').length??0,cartRenders:cart?.findComponents('render').length??0,lights:this.warmLights.length,effects:this.mapEffects?.telemetry()};
  }
  getEnvironmentStatus(){return this.environment.telemetry();}

  /** Where the local player hears from: the avatar's position and the camera's heading (radians). */
  getListener(): (Position & { yaw: number }) | undefined {
    const avatar = this.actors.get(this.localId);
    if (!avatar) return undefined;
    const p = avatar.root.getPosition();
    return { x: p.x, y: p.y, z: p.z, yaw: this.yaw };
  }

  getInput(): SceneInput {
    if (!this.enabled || this.inputHasFocus() || document.hidden) {
      return { dx: 0, dz: 0, running: false, rotation: this.lastRotation };
    }
    const horizontal = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
      Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const vertical = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
      Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    const length = Math.hypot(horizontal, vertical) || 1;
    const dx = (Math.cos(this.yaw) * horizontal - Math.sin(this.yaw) * vertical) / length;
    const dz = (-Math.sin(this.yaw) * horizontal - Math.cos(this.yaw) * vertical) / length;
    if (dx || dz) this.lastRotation = Math.atan2(dx, dz);
    return { dx, dz, running: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), rotation: this.lastRotation };
  }

  setWorld(world: WorldState, localId: string): void {
    // The empty snapshot used when leaving the bar has serverTime=0; keep the clock running.
    if(Number.isFinite(world.serverTime)&&world.serverTime>0)this.serverClockOffset = world.serverTime - Date.now();
    for(const door of this.doorLeaves){
      const state=world.doors?.[door.leaf.group];if(!state)continue;
      const target=state.open?1:0;
      if(target!==door.target||state.changedAt!==door.changedAt){door.from=door.openness;door.target=target;door.changedAt=state.changedAt;}
    }
    this.updateState({
      players: Object.values(world.players).map(player => {
        const seat=world.tables[player.currentTableId]?.seats.find(seat => seat.playerId === player.id);
        return { ...player, animation: player.animationState,cardResult:seat?.result,cardCount:seat?.cards.length??0 };
      }),
      npcs: Object.values(world.npcs).map(npc => ({ ...npc, animation: npc.animationState, role: npc.behavior })),
      event: world.event,
    }, localId);
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
    return tv.project(this.camera.camera,this.canvas.clientWidth,this.canvas.clientHeight);
  }
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
          // The local position comes from prediction (updateLocal), not from the server snapshot.
          existing.actor = local ? { ...actor, x: existing.actor.x, y: existing.actor.y, z: existing.actor.z } : { ...actor };
          if (moved && !local) this.glideTo(existing, PATCH_GLIDE);
          existing.ring.enabled = local;
          if (this.usesSkin(existing.actor, npc) && this.skinFor(existing.actor, npc) !== existing.skinId) this.replaceAvatar(actor.id, existing);
          else if(existing.skin&&existing.skinId?.startsWith('base-'))applyCharacter(existing.skin.model,characterFromJson(existing.actor.character));
        } else {
          this.actors.set(actor.id, this.makeAvatar(actor, npc));
          if (local) this.lastRotation = actor.rotation ?? this.lastRotation;
        }
      }
    }
    for (const [id, avatar] of this.actors) {
      if (!seen.has(id)) {
        disposeCharacter(avatar.skin?.model);avatar.root.destroy();
        this.actors.delete(id);
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
    if (Math.hypot(actor.x - drawn.x,(actor.y??0)-drawn.y,actor.z-drawn.z)>SNAP_DISTANCE)root.setPosition(actor.x,actor.y??0,actor.z);
    avatar.glideFrom.copy(root.getPosition());
    avatar.glideAt = this.elapsed;
    avatar.glide = seconds;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.app.autoRender = enabled;
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

  getAnimations(): Array<{ id: string; skin?: string; clip?: string; time?: number; height?: number; speed?:number; drink?:{item:string;sip:number}; cards?:number; cane?:{enabled:boolean;parent?:string;renders:number}; tracks: string[]; clothing?:Record<string,{enabled:boolean;skinned:boolean;color?:string}> }> {
    return [...this.actors].map(([id, avatar]) => ({ id, skin: avatar.skinId, clip: avatar.skin?.clip,
      height: avatar.skin ? avatar.skin.bones.head.getPosition().y - avatar.root.getPosition().y : undefined,
      time: avatar.skin?.model.anim?.baseLayer?.activeStateCurrentTime, tracks: [...(avatar.skin?.tracks ?? [])],
      speed:avatar.skin?.model.anim?.speed,drink:Object.entries(avatar.drinks??{}).filter(([,e])=>e.enabled).map(([item])=>({item,sip:+(avatar.sip??0).toFixed(3)}))[0],cards:avatar.cards?.enabled?avatar.cards.children.filter(card=>card.enabled).length:undefined,cane:avatar.skin?.cane?{enabled:avatar.skin.cane.enabled,parent:avatar.skin.cane.parent?.name,renders:avatar.skin.cane.findComponents('render').length}:undefined,
      clothing:avatar.skinId==='base-male'?Object.fromEntries(MALE_CLOTHING.map(({id:name})=>{
        const part=avatar.skin?.model.findByName(`part-${name}`) as pc.Entity|undefined;
        const instances=(part?.findComponents('render') as pc.RenderComponent[]|undefined)?.flatMap(r=>r.meshInstances)??[];
        return [name,{enabled:!!part?.enabled,skinned:instances.length>0&&instances.every(i=>!!i.skinInstance),color:(instances[0]?.material as pc.StandardMaterial|undefined)?.diffuse?.toString(false)}];
      })):undefined }));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.televisions.forEach(tv=>tv.destroy());this.televisions.clear();
    this.mapEffects?.destroy();this.mapEffects=undefined;
    this.environment.destroy();
    this.resizeObserver.disconnect();
    this.cleanup.forEach(cleanup => cleanup());
    this.app.off('update', this.update, this);
    for(const avatar of this.actors.values())disposeCharacter(avatar.skin?.model);
    this.materials.forEach(material => material.destroy());
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

  private sign(name: string, position: V3, size: [number, number], lines: string[],
    options: { background?: string; foreground?: string; accent?: string; rotation?: V3; glow?: boolean } = {}): pc.Entity {
    const art = this.textured((ctx, width, height) => {
      ctx.fillStyle = options.background ?? '#203a32';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = options.accent ?? '#cfac64';
      ctx.lineWidth = 6;
      ctx.strokeRect(16, 16, width - 32, height - 32);
      ctx.lineWidth = 1;
      ctx.strokeRect(24, 24, width - 48, height - 48);
      ctx.fillStyle = options.foreground ?? '#f7e9bc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lineHeight = (height - 58) / lines.length;
      lines.forEach((line, index) => {
        ctx.font = `${index === 0 ? '900' : '500'} ${Math.min(lineHeight * 0.7, width / (line.length * 0.59))}px ${index === 0 ? 'Georgia' : 'sans-serif'}`;
        ctx.fillText(line, width / 2, 30 + lineHeight * (index + 0.5), width - 70);
      });
    }, 1024, Math.round(1024 * size[1] / size[0]), options.glow ?? false);
    return this.shape(name, 'plane', position, [size[0], 1, size[1]], art, undefined, options.rotation ?? [90, 0, 0]);
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

  private buildJukebox(): void {
    const collider = COLLIDERS.find(collider => collider.id === 'jukebox')!;
    const juke = this.group('Jukebox', [collider.x, collider.minY??0, collider.z]);
    // Modelled at 1.8 × 2.44 × 1.15 and scaled to a 1.55 m cabinet on the collider footprint.
    juke.setLocalScale(collider.hx * 2 / 1.8, 1.55 / 2.44, collider.hz * 2 / 1.15);
    const shell = this.material('#774430');
    const dark = this.material('#202a27');
    const brass = this.material('#dba85a');
    const teal = this.material('#5cb6ab', '#398a7c');
    this.box('Jukebox housing', [0, 1.22, 0], [1.8, 2.44, 1.15], shell, juke);
    this.box('Jukebox speaker face', [0, 0.85, 0.59], [1.35, 1.3, 0.06], dark, juke);
    this.box('Jukebox selection face', [0, 1.95, 0.6], [1.4, 0.7, 0.08], this.material('#d0bd80', '#50451e'), juke);
    for (const xx of [-0.79, 0.79]) {
      this.box('Jukebox illuminated edge', [xx, 1.35, 0.64], [0.08, 2.25, 0.09], teal, juke);
      this.box('Jukebox gold trim', [xx * 0.87, 0.84, 0.65], [0.06, 1.34, 0.08], brass, juke);
    }
    this.box('Jukebox illuminated cap', [0, 2.48, 0.62], [1.63, 0.1, 0.12], teal, juke);
    for (let i = 0; i < 8; i++) this.box('Speaker gold grille', [-0.52 + i * 0.15, 0.85, 0.66], [0.03, 1.2, 0.04], brass, juke);
    for (let i = 0; i < 6; i++) this.box('Jukebox track button', [-0.5 + i * 0.2, 1.76, 0.67], [0.12, 0.08, 0.06], dark, juke);
    this.sign('Jukebox marquee', [collider.x, (collider.minY ?? 0) + 1.24, collider.z + collider.hz + 0.05], [0.46, 0.18], ['RÁDIO BOTECO'], { background: '#bba871', foreground: '#373e30' });
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
    this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}animations/${id}.glb`, 'container', (error, asset) => {
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
    this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}props/old-cane-${id}.glb`,'container',(error,asset)=>{
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
    const selection=(npc ? NPC_SKINS[actor.id]??DEFAULT_MODEL : actor.skin && SKIN_IDS.has(actor.skin) ? actor.skin : 'custom');
    const wanted=selection==='custom'?`base-${characterFromJson(actor.character).body}`:selection;
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
    disposeCharacter(avatar.skin?.model);avatar.root.destroy();
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
    const isBartender = actor.role === 'bartender' || (actor.displayName ?? actor.name)?.toLowerCase().includes('zé');
    const hash = [...actor.id].reduce((value, letter) => value + letter.charCodeAt(0), 0);
    const ring = this.shape('Local player marker', 'cylinder', [0, 0.027, 0], [0.83, 0.018, 0.83], this.material('#b1a067', '#514322'), root);
    ring.enabled = actor.id === this.localId;
    const motion = { glideFrom: new pc.Vec3(actor.x,actor.y??0,actor.z), glideAt: 0, glide: PATCH_GLIDE, yaw: (actor.rotation ?? 0) * RAD_TO_DEG };
    root.setEulerAngles(0, motion.yaw, 0);
    if (skinId) {
      const cup = this.makeCup(0, 0, 0, root);
      cup.enabled = false;
      const skin=this.makeSkin(body,this.skinModels.get(skinId)!);
      if(skinId.startsWith('base-'))applyCharacter(skin.model,characterFromJson(actor.character));
      return { root, body, skin, skinId, cup, ring, actor: { ...actor }, npc, phase: hash % 12, ...motion };
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
    return { root, body, limbs: { leftArm, rightArm, leftLeg, rightLeg, head }, cup, ring,
      actor: { ...actor }, npc, phase: hash % 12, ...motion };
  }

  private animateAvatar(avatar: Avatar, dt: number): void {
    const { actor, root, glideFrom } = avatar;
    const local = actor.id === this.localId;
    const current = root.getPosition();
    const moving = Math.hypot(actor.x - current.x, actor.z - current.z) > 0.025;
    const progress = clamp((this.elapsed - avatar.glideAt) / avatar.glide, 0, 1);
    root.setPosition(lerp(glideFrom.x,actor.x,progress),lerp(glideFrom.y,actor.y??0,progress),lerp(glideFrom.z,actor.z,progress));
    let animation = (actor.animation ?? actor.state ?? 'idle').toLowerCase();
    if (moving && animation === 'idle') animation = 'walk';
    const seated = animation.includes('sit') || animation.includes('seat') || animation.includes('blackjack');
    // The local player faces the predicted travel direction; the server's lags behind it.
    // Seats set the facing on the server, so seated players keep that one.
    if (local && seated) this.lastRotation = actor.rotation ?? this.lastRotation;
    const rotation = (local ? this.lastRotation : actor.rotation ?? 0) * RAD_TO_DEG;
    const turn = ((rotation - avatar.yaw + 540) % 360) - 180;
    avatar.yaw = ((avatar.yaw + turn * (1 - Math.exp(-16 * dt)) + 540) % 360) - 180;
    // Skinned avatars have dedicated drunk clips; the procedural sway remains as fallback for box avatars.
    const stage=drunkStage(actor.drunk??0),dedicatedDrunk=!!avatar.skin?.tracks.has('DrunkIdle')&&stage>=2;
    const sway = ['fallen','recover','stumble'].includes(actor.animation??'') || seated || dedicatedDrunk ? 0 : DRUNK_BODY_SWAY[stage]!;
    root.setEulerAngles(sway * Math.sin((this.elapsed + avatar.phase) * 1.3), avatar.yaw, sway * Math.sin((this.elapsed + avatar.phase) * 0.9 + 1));
    const pose: Pose = {
      t: this.elapsed + avatar.phase,
      walking: animation.includes('walk') || animation.includes('run') || animation.includes('wander'),
      running: animation.includes('run'),
      seated: avatar.seatedBlend = lerp(avatar.seatedBlend ?? 0, seated ? 1 : 0, 1 - Math.exp(-12 * dt)),
      dancing: animation.includes('dance') || (avatar.npc && this.eventType === 'PARTY'),
      drinking: animation.includes('drink') || (avatar.npc && animation.includes('drunk')),
      waving: animation.includes('wave'),
    };
    avatar.cup.enabled = pose.drinking;
    if (!pose.drinking) for (const entity of Object.values(avatar.drinks ?? {})) entity.enabled = false;
    if(avatar.cards)avatar.cards.enabled=false;
    if (avatar.skin) this.poseSkin(avatar, avatar.skin, pose);
    else if (avatar.limbs) this.poseLimbs(avatar, avatar.limbs, pose);
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
  private poseSkin(avatar: Avatar, skin: SkinnedRig, pose: Pose): void {
    const { body, cup, actor, skinId } = avatar;
    const { t, seated, dancing, drinking, waving } = pose;
    const { bones } = skin;
    const anim = skin.model.anim!;
    // Gestures are built on the static Pose; plain standing uses the animated Idle.
    const gesture = seated > 0.01 || dancing || drinking || waving;
    const action = actor.animation;
    const stage=drunkStage(actor.drunk??0);
    const requested = action === 'kick' ? 'Kick' : action === 'fallen' ? 'Fallen' : action === 'stumble' ? 'DrunkIdle'
      : action === 'recover' ? 'Recover' : action === 'wave' ? 'Wave' : action === 'use' ? 'Use'
      : action === 'wait'||action === 'toilet' ? 'Wait' : action === 'deal' ? 'Deal' : action === 'shuffle' ? 'Shuffle'
      : action === 'bartend' ? 'Bartend' : drinking ? 'Drink' : seated > 0.5 ? (actor.currentTableId ? (actor.cardResult === 'loss' ? 'AngrySit' : 'CardsSit') : 'Sit')
      : dancing ? 'Dance' : !actor.oldWalk&&pose.walking ? (stage>=3?'DrunkWalk':pose.running?'Run':'Walk') : !actor.oldWalk&&stage>=2?'DrunkIdle':'';
    const actionImported = !!requested && skin.tracks.has(requested);
    const oldGait=!!actor.oldWalk&&!gesture&&skin.tracks.has('OldCaneWalk')&&skin.tracks.has('OldCaneHold');
    const imported=actionImported||oldGait;
    const clip = actionImported ? requested : oldGait ? (pose.walking?'OldCaneWalk':'OldCaneHold') : pose.walking && seated < 0.5 ? 'Walk' : gesture ? 'Pose' : 'Idle';
    if(skin.cane)skin.cane.enabled=oldGait&&!actionImported;
    const playbackKey = `${clip}:${actionImported ? actor.animationStartedAt ?? 0 : 0}`;
    if (skin.clip !== clip || skin.playbackKey !== playbackKey) {
      anim.baseLayer?.transition(clip, skin.clip ? (clip.startsWith('OldCane')||skin.clip.startsWith('OldCane')?.35:.25) : 0);
      skin.clip = clip; skin.playbackKey = playbackKey;
      if (actionImported && actor.animationStartedAt && anim.baseLayer) {
        const age = Math.max(0, (Date.now() + this.serverClockOffset - actor.animationStartedAt) / 1000);
        const duration = anim.baseLayer.activeStateDuration;
        anim.baseLayer.activeStateCurrentTime = ['Deal', 'Dance', 'Wait', 'DrunkIdle', 'DrunkWalk', ...SEATED_CLIPS].includes(clip) ? age % duration : Math.min(age, duration);
      }
    }
    anim.speed = clip==='OldCaneWalk'?(skin.oldCaneRate??1):clip==='Walk'?WALK_CLIP_SPEED:clip==='Run'?1.15:1;
    if (imported) {
      body.setLocalPosition(0, 0, 0); body.setLocalEulerAngles(0, 0, 0);
      if (SEATED_CLIPS.includes(clip)) {
        // The skins have different pelvis-to-thigh offsets; anchor the actual hip joints to the chair.
        const hipY = (bones.upperleg_l.getPosition().y + bones.upperleg_r.getPosition().y) / 2;
        body.setLocalPosition(0,(actor.y??0)+0.56-hipY,0);
      }
      if(clip==='CardsSit'&&(actor.cardCount??0)>0)this.holdCards(avatar,skin,actor.cardCount!);
      // The drinking clip raises the drink with the left hand: the ordered bottle or glass (NPCs: a bottle).
      const item:DrinkItem|undefined=drinking?(actor.drinkItem==='copo'?'copo':'garrafa'):undefined;
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

  /** Rotates a bone by `degrees` about a world-space axis, on top of its current pose. */
  private turn(bone: pc.Entity, axis: pc.Vec3, degrees: number): void {
    if (Math.abs(degrees) < 0.01) return;
    bone.setRotation(this.tempTurn.setFromAxisAngle(axis, degrees).mul(bone.getRotation()));
  }

  private update(dt: number): void {
    this.frameSeconds += dt;
    this.swingDoors();
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;
    this.frames++;
    if (this.frameSeconds >= 1) {
      this.fps = Math.round(this.frames / this.frameSeconds);
      this.frameSeconds = 0;
      this.frames = 0;
    }
    for (const avatar of this.actors.values()) this.animateAvatar(avatar, dt);
    const bartender=this.actors.get('bartender');
    this.mapEffects?.update(this.elapsed,bartender?.actor.animation==='bartend'||bartender?.skin?.clip==='Bartend');
    const player = this.actors.get(this.localId);
    const television=TELEVISIONS.find(t=>t.id===this.watchingTv);
    if(television){
      const angle=television.yaw*Math.PI/180;
      this.camera.setPosition(television.x+Math.sin(angle+this.tvYaw)*1.15*Math.cos(this.tvPitch),television.y+Math.sin(this.tvPitch)*1.15,television.z+Math.cos(angle+this.tvYaw)*1.15*Math.cos(this.tvPitch));
      this.camera.lookAt(television.x,television.y,television.z);
    } else if (player && this.enabled) {
      const p = player.root.getPosition();
      const smooth = 1 - Math.exp(-10 * dt);
      this.cameraTarget.set(lerp(this.cameraTarget.x,p.x,smooth),lerp(this.cameraTarget.y,p.y+1.25,smooth),
        lerp(this.cameraTarget.z, p.z, smooth));
      const horizontal = Math.cos(this.pitch) * this.distance;
      let dx = Math.sin(this.yaw) * horizontal;
      let dz = Math.cos(this.yaw) * horizontal;
      let dy = Math.sin(this.pitch) * this.distance;
      const ratio=cameraFraction(this.cameraTarget,{x:this.cameraTarget.x+dx,y:this.cameraTarget.y+dy,z:this.cameraTarget.z+dz});
      dx *= ratio; dz *= ratio; dy *= ratio;
      this.camera.setPosition(this.cameraTarget.x + dx, this.cameraTarget.y + dy, this.cameraTarget.z + dz);
      this.camera.lookAt(this.cameraTarget);
      // Drunk view: the camera rolls slowly (more with each stage).
      const roll = DRUNK_CAMERA_ROLL[drunkStage(player.actor.drunk ?? 0)]!;
      if (roll) this.camera.rotateLocal(Math.sin(this.elapsed * 0.7) * roll * 0.3, 0, Math.sin(this.elapsed * 0.45) * roll);
    } else if (!player) {
      // Waiting at the door: a slow drift in front of the facade.
      this.camera.setPosition(18+Math.sin(this.elapsed*.035)*2,9,16);
      this.camera.lookAt(14,1.8,-6);
    }
    this.environment.update(Date.now()+this.serverClockOffset,dt,this.eventType);
    const party = this.environment.partyStrength;
    for (let i = 0; i < this.partyLights.length; i++) {
      const light = this.partyLights[i]!.light;
      if (light){light.intensity = party * (2 + Math.sin(this.elapsed * 3 + i * Math.PI));light.enabled=light.intensity>.015;}
    }
    this.discoBall.rotate(0, dt * (8+party*62), 0);
    this.onMediaFrame?.();
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
      if (!event.repeat && event.code === 'KeyE') { event.preventDefault(); this.callbacks.onInteract?.(); this.onInteract?.(); }
      if (!event.repeat && event.code === 'KeyG') { this.callbacks.onEmote?.('dance'); this.onEmote?.('dance'); }
      if (!event.repeat && event.code === 'KeyV') { event.preventDefault(); this.callbacks.onEmote?.('wave'); this.onEmote?.('wave'); }
      if (!event.repeat && event.code === 'KeyC') { event.preventDefault(); this.onSkins?.(); }
      if (!event.repeat && event.code === 'KeyX') { event.preventDefault(); this.onKick?.(); }
      if (!event.repeat && (event.code === 'Enter' || event.code === 'KeyT')) { event.preventDefault(); this.onChat?.(); }
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
      this.yaw -= event.movementX * 0.006;
      this.pitch = clamp(this.pitch + event.movementY * 0.004, 0.2, 1.06);
    });
    listen(window, 'pointerup', () => { this.dragging = false; });
    listen(this.canvas, 'pointercancel', () => { this.dragging = false; });
    listen(this.canvas, 'contextmenu', event => event.preventDefault());
    listen(this.canvas, 'wheel', event => {
      if (!this.enabled) return;
      event.preventDefault();
      this.distance = clamp(this.distance + event.deltaY * 0.008, 2.5, 9);
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
