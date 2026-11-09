import {vehicleSpeed as groundVehicleSpeed} from '@bar/shared';
import * as pc from 'playcanvas';
import {FIREWORK,fireworkOrigin,solidRayFraction,type FireworkShot} from '@bar/shared';
import {Fireworks} from './fireworks';
import {FuelProps} from './fuel-props';
import {FLY,HORSE,isRidingHorse,normalizeHeading} from '@bar/shared';
import {HorseMount} from './horse-mount';
import {HorseSounds} from './horse-sound';
import {FootstepSounds} from './footstep-sound';
import type {RenderPerformance} from '../performance/monitor';
import {UpdateProfiler} from '../performance/recording';
import {collectSceneInventory} from '../performance/inventory';
import {CITY_FAR_CLIP, CITY_FOG, SHOP_SPOT, DEFAULT_SKIN, INTERACTABLES, MAP_COLLIDERS, MAP_SURFACES, PATCH_MS, SKINS, TICK_MS, cameraFraction, drunkStage, type Position, type WorldState } from '@bar/shared';
import {DOOR_LEAVES,DOOR_SWING_SECONDS,doorSwing,HELD_DRINKS,SERVED_PROPS,SERVE_ITEM_MS,SERVE_LEAD_MS,type DoorLeaf,type HeldDrink,type ItemId,type ServedItemState} from '@bar/shared';
import {DRINK_PROPS,RIG_GRIP,findHand,handFrame,holdDrink,closeHand,type HandRig} from './drink-props';
import {PLATE_HEIGHT,TRAY_HEIGHT,TRAY_RADIUS,aim,openHand,palmUp,reach,smoothstep,trayCentre,traySlots} from './serving-props';
import {decodeVrArms,vrArmsMessage,type VrArms,type VrHand} from '@bar/shared';
import type { MapView, SceneActor, SceneCallbacks, SceneInput, SceneLabel, SceneWorld } from './scene-types';
import {TelevisionSurface} from './television-surface';
import {TELEVISIONS,TV_SYSTEMS} from '@bar/shared';
import {EnvironmentLighting} from './environment-lighting';
import {ServerClock} from '../server-clock';
import type {EnvironmentState} from '@bar/shared';
import {CarRig,seatCar} from './car-rig';
import {isCar,isHatch,vehicleSeat,vehiclePhysics,vehiclePowered} from '@bar/shared';
import {BarSurfaces} from './bar-surfaces';
import {CityStreaming} from './city-streaming';
import {Showcase,type ShowcasePose} from './showcase';
import {MapEffects,type MapEffectsStatus} from './map-effects';
import {JukeboxLights,type JukeboxLightsStatus} from './jukebox-lights';
import {StageLights,type StageLightsStatus} from './stage-lights';
import {StageShow,type StageShowStatus} from './stage-show';
import {type FoosballFrame,type PoolShotView,type PoolTableView} from '@bar/shared';
import {JUKEBOX_SYSTEMS,LIGHT_DESK,STAGE,STAGE_ENTRY,TV_SPOTS,inStageArea,onStage,type JukeboxState,type StageShowState} from '@bar/shared';
import {MUSICIAN_REACH,MUSICIANS,STAGE_PHASES,musicianPhase,stageSpot,type MusicianState,type StagePhase,type StageSpot} from '@bar/shared';
import {StageMusicians,musicianState,musicianTime} from './stage-musicians';
import {BarDressing} from './bar-dressing';
import {BAR_ANIMATIONS,CLEANABLE_TABLES,ITEM_CATALOG,URINALS,barClipMs,seatChair,barFrame,barTimeline,cornerSpot,inFrame,nearestCorner,type BarClip,type BarFrame,type BarStep,type Meal} from '@bar/shared';
import {BarAnimations,barEndOffset,barState} from './bar-animations';
import {FOG_SCALE,GRAPHICS_PRESETS,textureLimit,type GraphicsSettings} from '../graphics';
import {limitTextures,loadSharedContainer} from './gltf-textures';
import {CameraRig,type CameraFeel,type CameraMode} from './camera-rig';
import {VrSession,type VrAnchor} from '../vr/vr-session';
import {vrLog,type VrSettings} from '../vr/vr-mode';
import {HeadLookPose} from './head-look';
import {FlyPose} from './fly-pose';
import {IdlePosture} from './idle-posture';
import {FlySounds} from './fly-sound';
import {headLookAt,type HeadLook} from '@bar/shared';
import {Motos,MotoRig,seatRider,type Bike} from './moto-delivery';
import {MotoBag} from './moto-bag';
import {HighfoodProps} from './highfood-props';
import {GARAGES,HIGHFOOD} from '@bar/shared';
import {SpeedBlur} from './speed-blur';
import {LATE_MS,lifterPose,RagdollPuppet,type RagdollRig} from './moto-ragdoll';
import {BlowSounds} from './blow-sound';
import {BlowEffects} from './blow-fx';
import {SmokeBurst} from './smoke-burst';
import {Cigarettes,counterRequest} from './cigarettes';
import {CrossedArms} from './crossed-arms';
import {smokingTimeline} from '@bar/shared';
import {CrowdSprites} from './crowd';
import {MOTO,MOTO_ENGINE,MOTO_LIGHT,NO_MOTO_INTENT,type MotoBody,type MotoIntent,type RagdollStart} from '@bar/shared';
import {FoosballBalls} from './foosball-balls';
import {PoolBalls} from './pool-balls';
import {assignAnimationClips,completeBasePose} from './animation-tracks';
import {walkPlaybackRate,walkTransitionSeconds} from './walk-playback';
import {CLIP_PACES} from './clip-paces';
import {shootPortrait} from './skin-portrait';
import {KICKS,kickClip,kickRoot} from '@bar/shared';
import {FIGHT_MOVES,HIT_REACTIONS,PUNCH_IDS,fistPath,punchById,punchContact,type FightHit,type FightTarget} from '@bar/shared';
import {FlinchPose} from './fight-flinch';
import {DamageNumbers} from '../fight/damage-numbers';
import {MorteScene} from './morte-scene';
import type {DeathAudio} from '../death/death-audio';
import {DEATH_GONE_STATE,DEATH_STATE,type DeathPlan} from '@bar/shared';

type Primitive = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane';
type V3 = [number, number, number];
type Limbs = Record<'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'head', pc.Entity>;
const SKIN_BONES = ['head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'hand_l', 'middle_01_l', 'hand_r', 'middle_01_r',
  'upperleg_l', 'lowerleg_l', 'upperleg_r', 'lowerleg_r','foot_l','foot_r'] as const;
type SkinBone = typeof SKIN_BONES[number];
// Read's AccuRig and the Mixamo rigs (two-finger hands) have no middle finger, so the cup is held by the index finger instead.
const BONE_ALIASES: Partial<Record<SkinBone, string>> = { middle_01_l: 'index_01_l', middle_01_r: 'index_01_r' };
// A drink in hand (Player.holding) is raised and sipped by the Drink clip on its own layer, masked to the left arm and the
// neck, over whatever the body plays: walking, standing, a quick use. Other clips keep the hand (seated, dancing...).
const HAND_LAYER = 'Hand';
const HAND_FREE_CLIPS = new Set(['Idle', 'Walk', 'Jog', 'Run', 'DrunkIdle', 'DrunkWalk', 'Use', 'Wait', 'OldCaneWalk', 'OldCaneHold']);
// Looping clips that sit the hips on a chair (anchored to the 0.56 m seat height).
const SEATED_CLIPS = ['CardsSit', 'AngrySit', 'Sit'];
/** How far the bike must have turned (radians) with a blinker on, for it to go off as the bars straighten. */
const SIGNAL_CANCEL_TURN = .7;
// Degrees by drunk stage (0-4): body sway of every avatar and camera roll of the local player.
const DRUNK_BODY_SWAY = [0, 0, 3, 6, 6];
const DRUNK_CAMERA_ROLL = [0, 0.6, 1.5, 3, 3];
// The head joint shrunk to nothing in first person, so the face and hair do not fill the view.
const HIDDEN_HEAD = 1e-3;
// NPCs with their own skin, not offered in the selector: the bartender is Magrão, the waiter is Tonico.
const NPC_SKINS: Record<string, string> = { bartender: 'magrao', tonico: 'tonico' };
const NPC_MODEL_IDS=new Set([...Object.values(NPC_SKINS),'frentista']);
interface SkinnedRig {
  model: pc.Entity;
  bones: Record<SkinBone, pc.Entity>;
  clip: string;
  playbackKey?: string;
  walkRate?:number;
  cane?: pc.Entity;
  oldCaneRate?:number;
  tracks: Set<string>;
  /** How far the body lowers to sit: from this skin's hip-joint height to just above a 0.47 m seat. */
  sitDrop: number;
  /** The drinking hand (the Drink clip lifts with the left), found in the bind pose. */
  drinkHand?: HandRig;
  /** The other hand, on a bike's right grip. */
  rightHand?: HandRig;
  /** The Drink clip on the left arm and the neck only (HAND_LAYER), over the body's clip, for a drink in hand. */
  handLayer?: pc.AnimComponentLayer;
  orderLayer?:pc.AnimComponentLayer;
  /** The fist fight's guard: FightIdle on both arms only (GUARD_LAYER), over the legs' steps while moving with the guard up. */
  guardLayer?:pc.AnimComponentLayer;
  guardGone?:number;
  headBind?:pc.Quat;
  /** The hips, found on first use (the contact shadow follows them during a bar animation). */
  hip?: pc.Entity;
}
interface Avatar {
  firework?:pc.Entity;
  /** A VR player's hands as the room sent them (vrArms), and as drawn now (eased towards them). */
  vrArmsRaw?: string;
  vrArmsGoal?: VrArms | null;
  vrArmsShown?: VrArms | null;
  /** The room says this body was taken by the Morte: it is not drawn until it comes back. */
  deathHidden?: boolean;
  horse?:HorseMount;
  headLook?:HeadLookPose;
  /** An administrator in flight: lean, hover and limbs (fly-pose.ts). */
  fly?:FlyPose;
  /** Shoulders back over the shared Mixamo idle (idle-posture.ts). */
  posture?:IdlePosture;
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
  /** The Highfood bag in hand and backpack, while someone has them (dressCourier). They live in the scene, not under the body. */
  parcelProp?: pc.Entity;
  packProp?: pc.Entity;
  phoneProp?: pc.Entity;
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
  /** In flight: the velocity (m/s) measured from the room's positions, and when the last one came (scene seconds). */
  flyV?: pc.Vec3;
  flyAt?: number;
  /** Seated on a delivery bike this frame: its own shadow takes the place of the one at the feet. */
  riding?: boolean;
  carScale?:pc.Vec3;
  /** The offscreen animation is paused until the avatar is near or visible again. */
  resting?: boolean;
  /** Thrown from a bike or by a kick (moto-ragdoll.ts): the body as it flies and lies, until the getting-up clip has taken over. */
  ragdoll?: RagdollPuppet;
  /** The kick whose leg was last heard cutting the air (its animationStartedAt). */
  swungAt?: number;
  /** A kick has just landed: the clip holds until then (performance.now), so it has weight. */
  hitStopUntil?: number;
  /**
   * The fist fight (docs/sistemas/luta.md): the jolt of a blow on the upper body; the velocity as drawn (the guard's steps go by the way the body
   * moves against where it faces) and the step clip chosen; the punch whose swing was last heard.
   */
  flinch?: FlinchPose;
  velocity?: pc.Vec3;
  guardStep?: string;
  guardCand?: string;
  guardCandAt?: number;
  fightBusyAt?: number;
  swungKey?: string;
  /** The soft shadow at the feet, and whether a roof is above (re-checked after the avatar moves some distance). */
  contact: pc.Entity;
  covered?: { x: number; z: number; value: boolean };
  /** The bar animation playing (bar-animations.ts): its clip, the clip's space, and the slide into a place. */
  bar?: { clip: BarClip; startedAt: number; time: number; space: BarFrame; frame?: BarFrame; slide?: { from: BarFrame; at: number } };
  /** Seconds of the cross-fade from the last bar clip back to the game's own (0 when the avatar was moved to the body). */
  barRelease?: number;
  /** The last bar action played to its end (its authored displacement can be applied to the avatar). */
  barFinished?: boolean;
  /** Smoothed horizontal speed as drawn (m/s), used to match the Mixamo steps to the avatar's movement. */
  speed?: number;
  lastDrawn?: pc.Vec3;
}
/** A bar animation the debug panel plays on an avatar without the room (development only). */
/** The bike reaches behind the body, and a lamp post crossing the view at speed is not worth opening a window. */
const MOTO_XRAY = { clearance: MOTO.HALF_LENGTH, xrayAfter: .25 };
interface BarOverride { animation: string; startedAt: number; interactionState?: string; x?: number; y?: number; z?: number; meal?: Meal }
/** What an avatar does in the bar animations this frame (barAction). */
interface BarAction { step: BarStep; body?: string; frame?: BarFrame; seat?: string; servedFood: boolean }
// The snacks a seated customer eats with the bar animations' fork (comer).
/**
 * The feeling of speed, riding: from this share of top speed on, up to full at the other, the view pulls back and widens by this many degrees
 * and the edges of the screen blur (speed-blur.ts). How fast it comes in and goes away, per second: a crash should not leave it hanging.
 */
const RUSH_FROM = .5, RUSH_FULL = .95, RUSH_FOV = 4, RUSH_IN = 1.8, RUSH_OUT = 3.5;
const FOODS = new Set<string>(ITEM_CATALOG.filter(item => item.category === 'comida').map(item => item.id));
// Bar clips that end an action: a debug run of one is over once it has played.
const FINAL_CLIPS = new Set<BarClip>(['levantar', 'urinar', 'vomitar', 'fumar_apagar', 'fumar_mixamo', 'levantar_chao', 'limpar_mesa', 'magrao_chopp', 'magrao_chopp_escuro', 'magrao_longneck']);
interface Pose {
  t: number;
  /** Seconds since the last frame. */
  dt: number;
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
// Models and canes follow their rig version; regenerated animation banks have a separate cache version.
const MOUSE_JUMP = 500;
// Touch on the view: pixels of finger travel before it counts as a look (not a tap), a tap's limits, and a pinch's wheel steps per pixel.
const TOUCH_SLOP = 5, TAP_SLOP = 12, TAP_MS = 450, TOUCH_LOOK = 1.25, TOUCH_PINCH = 1.6;
const SKIN_VERSIONS: Record<string, string> = { frentista: 'mixamo-20261106', nathan: 'rig-20261029', leandro: 'tripo-20261101', 'rafael-rose': 'tripo-20261101', rafael: 'tripo-20261031', read: 'mixamo-20261027', magrao: 'mixamo-20261027', tonico: 'tripo-20261101', tiao: 'tripo-20261103-v2', primo: 'tripo-20261105' };
const skinAsset = (folder: string, file: string, id: string): string => {
  const version = folder === 'animations' ? 'bar-fight-20261108' : `${SKIN_VERSIONS[id]??'mixamo'}-head-weights-20261106`;
  return `${import.meta.env.BASE_URL}${folder}/${file}.glb${version ? `?v=${version}` : ''}`;
};
const skinUrl = (id: string): string => skinAsset('models', id, id);
const SKIN_IDS = new Set<string>(SKINS.map(skin => skin.id));
// The bar is built in real-world metres around this model at its natural 1.86 m.
const PLAYER_MODEL_SCALE = 1;
// The box avatars (NPCs, and players while the model loads) are drawn about 2 m tall and stocky;
// this brings them to the player model's height and a slimmer build.
const BOX_AVATAR_SCALE: V3 = [0.75, 0.9, 0.75];
// Name labels float just above head height.
const LABEL_HEIGHT = 2.15;
// Keep nearby bodies and actions with moving props or physics animated even outside the view.
/** Avatars beyond this distance from the camera (metres) cast no shadow; back on inside the margin (updateAvatarShadows). */
const AVATAR_SHADOW_RANGE = 12;
const AVATAR_SHADOW_MARGIN = 1.5;
const OFFSTAGE_NEAR = 8;
const OFFSTAGE_MARGIN = 2;
const OFFSTAGE_BUSY = new Set(['ride', 'moto-lift', 'ragdoll', 'kick', 'fallen', 'recover', 'stumble', 'punch', 'hit']);
// Ground pace at 1× (metres/second): how fast a planted foot goes back in each skin's own step clips (clip-paces.ts, npm run assets:paces). These
// single numbers are only for a skin not measured yet; they were Nathan's before the walk was stretched 20%, and slid on the shorter skins.
// Walk keeps a walking cadence at the normal movement speed; running is selected by the actor's run state.
const MIXAMO_PACE: Readonly<Record<string, number>> = { Walk: 1.38, Jog: 1.61, Run: 4, DrunkWalk: .74, FightBack: 1.15, FightLeft: 1.61, FightRight: 1.6 };
/**
 * The fist fight (docs/sistemas/luta.md). The clips of the guard (FightIdle, then the steps by direction, forward being Walk); the arms' layer that
 * keeps the guard up over the steps; how long a landed punch holds its clip (ms, light and heavy); how hard a blow jolts the upper body (degrees);
 * how far ahead of the room's clock a late punch seen by others starts (s, so its wind-up shows) and how fast it catches up.
 */
const GUARD_CLIPS = new Set(['FightIdle', 'Walk', 'Run', 'FightBack', 'FightLeft', 'FightRight']);
const GUARD_LAYER = 'Guard';
const PUNCH_HIT_STOP_MS = { light: 55, heavy: 90 };
const FLINCH_DEGREES: Readonly<Record<string, number>> = { jab: 8, cross: 12, hook: 14, heavy: 20 };
const FIGHT_CATCH_UP_S = .12, FIGHT_CATCH_UP_RATE = 1.8;
// Positions arrive in steps: local predictions every input tick, everyone else with each server patch.
// Gliding a little longer than the interval keeps a constant speed despite timer jitter.
const INPUT_GLIDE = TICK_MS / 1000 * 1.2;
const PATCH_GLIDE = PATCH_MS / 1000 * 1.2;
const SNAP_DISTANCE = 1.5;
// The job objective marker's neon green; its HUD badge reads the same colour (--blip-job in neon-ui.css).
const OBJECTIVE_COLOR = '#5fd86c';
// The backyard's blips: the stage's entry (the foot of its steps, where the pass is bought) in the stage's magenta
// (Palco_FX_Luz cor_padrao), the telão's control (the middle of the stage's front edge) in neon teal, and the house's
// shop (SHOP_SPOT) in the logo's gold, and the light desk (LIGHT_DESK, up on the deck) in the logo's violet. Their HUD badges
// read the same colours (--blip-stage, --blip-telao, --blip-shop and --blip-desk in neon-ui.css).
// A musician plays (and the stage show runs) from the start of the playing, through the loop, until putting it away.
const LIVE_PHASES = new Set<StagePhase>(['comecando','loop']);
/** Highfood's base: the ring's colour, how far it shows from, and where its sign stands. */
const FOOD_COLOR='#ff3d5a',FOOD_BASE_RANGE=70;
/** The garages' rings, in the colour of everything about vehicles. */
const GARAGE_COLOR='#17d4f4';
const STAGE_BLIPS = {entry:{at:STAGE_ENTRY,color:'#ff47c2'},telao:{at:TV_SPOTS.telao!,color:'#3adfd7'},shop:{at:SHOP_SPOT,color:'#fac416'},desk:{at:LIGHT_DESK,color:'#a77bff'}} as const;
export type StageBlip = keyof typeof STAGE_BLIPS;
/** The radius of a blip's floor ring, in metres: standing within it is standing on the blip. */
export const BLIP_RADIUS = .62;
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

/** A kick: how late the leg may still be heard (ms), how far from the body a foot can be and still mark the blow (m), how long the clip holds when it lands (ms). */
const SWING_LATE_MS = 700, KICK_STAR_NEAR = 1.1, HIT_STOP_MS = 70;
/** How far a kick's clip may stray from the room's clock (s) before it is put back. */
const KICK_DRIFT = .1;
/** A body raises dust from the floor from this hard (m/s). */
const DUST_FROM = 2.5;
/**
 * BarBoteco supplies the full environment; shared exported volumes control movement and the camera.
 * The app supplies authoritative snapshots and predicted local positions. This
 * renderer never moves a player on the server or decides whether an action succeeds.
 */
export class BarScene {
  readonly app: pc.Application;
  readonly fuelProps:FuelProps;
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
  private readonly warmLights: pc.Entity[] = [];
  private readonly partyLights: pc.Entity[] = [];
  private readonly environment:EnvironmentLighting;
  private mapEffects?:MapEffects;
  /** The bar's baked occlusion and the room's reflections (bar-surfaces.ts). */
  private surfaces?:BarSurfaces;
  /** Fridges, warmer and counter dressed with the real props (bar-dressing.ts). */
  private dressing?:BarDressing;
  private jukeboxLights?:JukeboxLights;
  private jukeboxState?:JukeboxState;
  private jukeboxDuration=0;
  /** Every light of the stage (lenses, LED strip, backlight, truss spots, washes), coloured by the video on the telão. */
  private stageLights?:StageLights;
  private stageState?:JukeboxState;
  /** Lasers, moving heads and the strobe while something plays on the stage (stage-show.ts), and the spots it watches. */
  private readonly stageShow:StageShow;
  /** The balls of the pebolim matches on the games hall's tables (foosball-balls.ts). */
  private readonly foosballBalls:FoosballBalls;
  /** The balls on the games hall's pool tables (pool-balls.ts): the rack and every stroke, for whoever is near. */
  private readonly poolBalls:PoolBalls;
  /** The delivery bikes (moto-delivery.ts), and whether the camera is following the local player on one. */
  private readonly motos:Motos;
  private readonly speedBlur:SpeedBlur;
  private readonly tempUp = new pc.Vec3();
  /** How much of the feeling of speed applies now, 0 to 1, and the lens it adds to (the phone's zoom sets that). */
  private rush = 0;
  private lensFov = 57;
  /** The Morte's scene (docs/sistemas/morte.md), made when a death first needs it or the bar preloads it; and the lens punch of her laugh. */
  private morte?: MorteScene;
  private deathAudio?: DeathAudio;
  private deathPull?: { victim: string; k: number; x: number; z: number };
  private deathPulled = false;
  private fovPunch = 0;
  private fovPunchGoal = 0;
  /** The thrown bodies the room is running. */
  private ragdollStarts:Record<string,RagdollStart&{startedAt:number}>={};
  private readonly blowSounds:BlowSounds;
  private readonly horseSounds:HorseSounds;
  private readonly footstepSounds:FootstepSounds;
  private readonly blowEffects:BlowEffects;
  /** The fist fight: the damage numbers over the scene, the landed punches already drawn (puncher:count), how far each local punch was followed (ms). */
  private readonly damageNumbers:DamageNumbers;
  private readonly fightShown=new Set<string>();
  private readonly predictedFrom=new Map<number,number>();
  private readonly flySounds:FlySounds;
  /** The local flier: how far into the dash (0 to 1), whether the barrier may break again, and when it last did (scene seconds). */
  private flyShare = 0; private boomArmed = true; private boomAt = -99;
  /** The room's time of the newest state (carriedOffset). */
  private stateAt = 0;
  /** The local flier's velocity from the keys, as of the last input the room was sent (getInput), and when. */
  private readonly localFlyV = new pc.Vec3(); private localFlyAt = -99;
  private readonly smokeBurst:SmokeBurst;
  private readonly cigarettes:Cigarettes;
  private readonly crossedArms:CrossedArms;
  private readonly fireworks:Fireworks;
  private fireworkPressedAt=-Infinity;
  /** The people beyond the avatars, as sprites (crowd.ts); the slots of the avatars drawn now keep theirs hidden. */
  private readonly crowd:CrowdSprites;
  private modelSlots=new Set<number>();
  /** The rider's switches (Z, X, C, H), and how far the bike has turned with the blinker on. */
  private motoSwitches=0;
  private signalYaw?:number;
  private lastFrameAt=performance.now();
  private chasing=false;
  private stageSpots:MusicianState[]=[];
  /** The light desk's settings for the show (BarState.stageShow), and whether its panel has the camera on the stage. */
  private showDesk?:StageShowState;
  private watchingStage?:()=>number;
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
  /** The stage's blips (STAGE_BLIPS), shown while the player is in the stage's area (below the deck, but the light desk's also on it). */
  private readonly stageBlips = new Map<StageBlip, Marker>();
  /** Highfood's base: its ring and its sign, near the bar. */
  private foodBase?: Marker;
  private garageRings?: Marker[];
  private highfoodProps?: HighfoodProps;
  private readonly keys = new Set<string>();
  private readonly cleanup: (() => void)[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly tempScreen = new pc.Vec3();
  private readonly tempPosition = new pc.Vec3();
  private readonly tempPoint = new pc.Vec3();
  private readonly tempPole = new pc.Vec3();
  private readonly vrHandPose = { wrist: new pc.Vec3(), fingers: new pc.Vec3(), palm: new pc.Vec3() };
  /** The local body moved under the headset this frame (vrBody), and by how much. */
  private vrShifted?: Avatar;
  private readonly vrShift = new pc.Vec3();
  private vrArmsSentAt = 0;
  private vrArmsSent = '';
  private readonly tempTurn = new pc.Quat();
  private readonly axisRight = new pc.Vec3();
  private readonly axisUp = new pc.Vec3();
  private readonly axisFront = new pc.Vec3();
  private readonly skinModels = new Map<string, pc.ContainerResource>();
  private readonly animationBanks = new Map<string, pc.ContainerResource>();
  /** Each skin's dances (<id>-dances.glb), fetched once its action bank has arrived. */
  private readonly danceBanks = new Map<string, pc.ContainerResource>();
  /** The dance clips' names, sorted: the same in every skin's bank, so `dance` picks the same one on every client. */
  private dances: string[] = [];
  private readonly animationRequests = new Set<string>();
  private horseModel?:pc.ContainerResource;
  private horseRequested=false;

  private loadHorse():void {
    if(this.horseRequested)return;this.horseRequested=true;
    this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}mounts/tiao-horse.glb?v=20261103-3`,'container',(error,asset)=>{
      if(this.destroyed)return;
      if(error||!asset){this.horseRequested=false;console.warn('Cavalo do Tião indisponível.',error);return;}
      this.horseModel=asset.resource as pc.ContainerResource;
    });
  }

  private placeHorseRiders():void {
    for(const avatar of this.actors.values()){
      if(!isRidingHorse(avatar.actor.interactionState)){
        if(avatar.horse){avatar.horse.entity.destroy();avatar.horse=undefined;avatar.contact.setLocalScale(.9,1,.9);}
        continue;
      }
      this.loadHorse();
      if(!this.horseModel||!avatar.skin)continue;
      if(!avatar.horse){
        // The horse appears in a puff of smoke, a new random colour every time.
        const ground=avatar.root.getPosition();
        this.smokeBurst.burst(ground.x,ground.y,ground.z,1.8);
      }
      const horse=avatar.horse??=new HorseMount(this.horseModel,avatar.root);
      horse.update(avatar.speed??0,avatar.actor.animation,avatar.resting,avatar.actor.horseRearAt??0,this.serverNow());
      const skin=avatar.skin,hip=skin.hip??=(skin.model.findByName('hip') as pc.Entity|null)??undefined;
      avatar.spine??=(skin.model.findByName('spine_02') as pc.Entity|null)??null;
      if(hip&&!avatar.resting)horse.seat({root:avatar.body,hip,spine:avatar.spine,...skin.bones,handRigL:skin.drinkHand,handRigR:skin.rightHand});
      // The backpack follows the seated spine, after the horse has positioned the rider.
      this.dressCourier(avatar,skin,!!avatar.resting);
      avatar.contact.setLocalScale(1.1,1,2.3);
    }
  }
  private readonly caneModels=new Map<string,pc.ContainerResource>();
  private readonly caneRequests=new Set<string>();
  private readonly clock=new ServerClock();
  private readonly serverNow=()=>this.callbacks.serverNow?.()??this.clock.now();
  /** Skins already requested, including failed ones, so a missing file is not fetched again. */
  private readonly skinRequests = new Set<string>();
  private readonly discoBall: pc.Entity;
  private mapEntity?: pc.Entity;
  private city?: CityStreaming;
  /** Tests and fixtures: stream around this point instead of the player or the camera. */
  cityFocus?: {x:number;z:number};
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
  /** The entry's backdrop: the empty bar from fixed angles while no one is in the room (setShowcase). */
  private showcaseOn = false;
  private readonly showcase = new Showcase();
  private showcaseSlow = 0;
  private showcaseCut = 0;
  private debugPose?: ShowcasePose;
  private destroyed = false;
  private elapsed = 0;
  /** The local player's camera: its views, smoothing and x-ray (camera-rig.ts). */
  private readonly rig: CameraRig;
  /** Playing in a headset (vr/vr-session.ts), the view the player had before it, and where the eyes were last placed. */
  private readonly vr: VrSession;
  private beforeVr?: { mode: CameraMode };
  private graphicsBeforeVr?: GraphicsSettings;
  private vrLogTimer = 0;
  private readonly vrAnchor: VrAnchor = { x: 0, y: 0, z: 0, special: false };
  private vrAnchored = false;
  /** The local avatar's head joint first person hid, and its own scale to give back. */
  private hiddenHead?: pc.Entity;
  private readonly hiddenCarFace=new Map<pc.GraphNode,pc.Vec3>();
  private readonly headScale = new pc.Vec3(1, 1, 1);
  private dragging = false;
  /** The touch stick (touch-controls.ts): x right and y down, -1 to 1, and whether it runs. Added to what the keys say. */
  private touchAxis = { x: 0, y: 0 };
  private touchSprint = false;
  /** Fingers on the view: one looks around, two pinch to zoom. */
  private fingers = new Map<number, { x: number; y: number; x0: number; y0: number; at: number; moved: number }>();
  private pinch = 0;
  /** Where a press began: the right button released close by and quickly is a click on whoever is under it (onWorldMenu). */
  private press?: { x: number; y: number; at: number; button: number; travel:number };
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
  private badSeconds = 0;
  /** The largest texture side loads keep (graphics.ts textureLimit); none until the settings arrive. */
  private textureMax = Infinity;
  /** Draws skipped last frame because their shader was still being built (see compileShadersInBackground). */
  private compiling = 0;
  private compilingLastFrame = 0;
  /** The same for shadow maps: while any is skipped, the lamps' cached maps are drawn again once they are all built. */
  private compilingShadows = 0;
  private shadowsPending = false;
  /** The phone's front camera (setSelfie): the view turns to the player's face. */
  private selfie = false;
  /** Head joint minus the feet, eased: the selfie frames the face without the walk's bob shaking the picture. */
  private readonly selfieHead = new pc.Vec3();
  private selfieHeadSet = false;
  /** Canvases the phone's camera draws into, one per size (a video call targets up to 24 frames a second). */
  private captureCanvases = new Map<string, HTMLCanvasElement>();

  constructor(canvas: HTMLCanvasElement, callbacks: SceneCallbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: { alpha: true, premultipliedAlpha:false, antialias: true, powerPreference: 'high-performance' },
    });
    this.app.on('frameend',()=>{
      if(!this.performanceObserver)return;
      if(!this.enabled||document.hidden){this.performanceObserver(null);return;}
      const stats=this.app.stats,device=this.app.graphicsDevice;
      this.performanceObserver({updateMs:stats.cpuUpdateTime,renderMs:stats.cpuRenderTime,gpuMs:stats.gpuFrameTime??null,
        drawCalls:stats.drawCallCount,primitives:stats.primitiveCount??null,vram:stats.vramTotalBytes,
        width:device.width,height:device.height,scale:this.scale,actors:this.actors.size,resting:this.getPerformance().resting,compiling:this.compilingLastFrame,
        animationMs:stats.cpuAnimationTime,physicsMs:stats.cpuPhysicsTime,systemUpdateMs:stats.cpuSystemUpdateTime,systemPostUpdateMs:stats.cpuSystemPostUpdateTime,phases:{...this.updateProfiler.timings}});
    });
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    // The canvas fills its box (resize): PlayCanvas's default keeps the first size's aspect, which left a band under the
    // scene once the window grew taller (F11, full screen).
    this.app.setCanvasFillMode(pc.FILLMODE_NONE);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    // The sky's panorama wraps all around the view: it keeps twice the detail of the rest.
    limitTextures(this.app,asset=>/panorama/i.test(asset?.name??'')?this.textureMax*2:this.textureMax);
    this.compileShadersInBackground();
    this.capFrameRate();

    this.camera = new pc.Entity('Third-person camera');
    this.camera.addComponent('camera', {
      // The city's far hills and panorama, as its scene's camera_far_minimo_m asks. What is detailed does not depend on this
      // distance: that is the sectors' streaming (city-streaming.ts), and the fog hides everything well before it.
      clearColor: color('#9dafbd'), fov: 57, nearClip: 0.08, farClip: CITY_FAR_CLIP,
      // A soft shoulder instead of clipping: the lamps' hot spots on the walls keep their colour. What glows skips it (environment-lighting.ts).
      toneMapping: pc.TONEMAP_NEUTRAL,
    });
    this.app.root.addChild(this.camera);
    this.camera.setPosition(18, 9, 16);
    this.camera.lookAt(14, 1.8, -6);
    // Before any material is drawn: the x-ray goes into every shader.
    this.rig = new CameraRig(this.camera, this.app.graphicsDevice);
    this.vr = new VrSession(this.app, this.camera, {
      windowOpen: () => !!this.callbacks.vrWindowOpen?.(),
      context: () => this.touchContext(),
      key: (code, down) => document.body.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code.startsWith('Shift') ? 'Shift' : code, shiftKey: code.startsWith('Shift'), bubbles: true, cancelable: true })),
      move: (x, y) => this.setTouchAxis(x, y),
      sprint: on => this.setTouchSprint(on),
      pick: (origin, direction, reach) => this.pickRay(origin, direction, reach),
      menu: (id, x, y, vehicle) => this.callbacks.onWorldMenu?.(x, y, vehicle ? { moto: id } : { player: id }),
      notice: text => this.callbacks.onVrNotice?.(text),
      names: max => this.vrNames(max),
    });
    this.vr.onEnd = reason => this.leftVr(reason);
    this.environment=new EnvironmentLighting(this.app,this.camera,()=>this.callbacks.motoVolume?.()??1);
    this.environment.setDynamicCasters(()=>this.dynamicCasters());
    this.environment.update(this.serverNow(),0,'');

    this.staticBatchId = this.app.batcher.addGroup('Static bar furnishings', false, 24).id;
    // The blackjack and truco tables and their chairs are the map's (46_mesa_blackjack.py: BJ_* at BLACKJACK_TABLE and BLACKJACK_SEATS;
    // 48_mesa_truco.py: TR_* at TRUCO_TABLE and TRUCO_SEATS).
    this.buildPartyLighting();
    this.environment.addPartyShadows(this.partyLights);
    this.stageShow=new StageShow(this.app);
    this.foosballBalls=new FoosballBalls(this.app,this.material('#f4f1e8',undefined,.35));
    this.poolBalls=new PoolBalls(this.app);
    this.motos=new Motos(this.app,root=>this.contactShadow(root),()=>this.callbacks.motoVolume?.()??1);
    this.fuelProps=new FuelProps(this.app);
    this.horseSounds=new HorseSounds(()=>this.callbacks.motoVolume?.()??1,import.meta.env.BASE_URL);
    this.footstepSounds=new FootstepSounds(()=>this.callbacks.motoVolume?.()??1,import.meta.env.BASE_URL);
    this.blowSounds=new BlowSounds(()=>this.callbacks.motoVolume?.()??1,import.meta.env.BASE_URL,()=>{
      const ear=this.camera.getPosition();
      return {x:ear.x,y:ear.y,z:ear.z,forward:this.camera.forward,up:this.camera.up};
    });
    this.blowEffects=new BlowEffects(this.app);
    this.damageNumbers=new DamageNumbers(canvas.parentElement??document.body);
    this.flySounds=new FlySounds(()=>this.callbacks.motoVolume?.()??1,import.meta.env.BASE_URL);
    this.smokeBurst=new SmokeBurst(this.app);
    this.cigarettes=new Cigarettes(this.app);
    this.crossedArms=new CrossedArms();
    this.fireworks=new Fireworks(this.app,()=>this.callbacks.motoVolume?.()??1);
    this.crowd=new CrowdSprites(this.app);
    this.speedBlur=new SpeedBlur(this.app);
    this.app.batcher.generate([this.staticBatchId]);
    this.staticBatchId = -1;
    for(const definition of TELEVISIONS.filter(tv=>TV_SYSTEMS.some(system=>system.screens.includes(tv.id))))this.televisions.set(definition.id,new TelevisionSurface(this.app,definition));
    this.discoBall = this.buildDiscoBall();
    // Ready once the room's reflections are made and every shader the bar needs is built: the first frames in show it whole.
    this.ready = this.loadMap().then(() => this.surfaces?.ready).then(() => this.shadersSettled());
    this.loadProps();
    void this.ready.catch(() => {}); // The UI reports loading failures before admission.
    this.installControls();
    this.loadSkin(DEFAULT_MODEL);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    // Once sized, the canvas keeps its pixel size (resize): the window's own resize (F11, full screen, a dragged
    // window) is what tells it to fill its box again.
    const onWindowResize = () => this.resize();
    window.addEventListener('resize', onWindowResize);
    this.cleanup.push(() => window.removeEventListener('resize', onWindowResize));
    this.resize();
    this.app.on('update', this.update, this);
    this.app.on('frameupdate',this.restoreHeadLooks,this);
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
      loadSharedContainer(this.app, `${import.meta.env.BASE_URL}maps/bar_boteco.glb`, (error, asset) => {
        if (this.destroyed) { resolve(); return; }
        if (error || !asset) { reject(new Error('Não foi possível carregar o mapa do bar. Recarregue para tentar novamente.')); return; }
        const resource = asset.resource as pc.ContainerResource;
        const map = resource.instantiateRenderEntity({castShadows:true,receiveShadows:true});
        map.name = 'BarBoteco imported map';
        // Older exports still carry the backdrop from before the city: its buildings and hills would stand inside it.
        (map.findByName('Fundo_Distante') as pc.Entity | null)?.destroy();
        this.app.root.addChild(map); this.mapEntity = map;
        // The pool tables' decorative rack and cue give way to the game's balls.
        this.poolBalls.hideMapDecor(map);
        for(const door of this.doorLeaves){
          door.entity=(map.findByName(door.leaf.id) as pc.Entity|null)??undefined;
          if(!door.entity)console.warn(`Folha de porta "${door.leaf.id}" ausente no mapa; ela não será animada.`);
        }
        const lights = map.findComponents('light') as pc.LightComponent[];
        this.warmLights.push(...lights.map(light=>light.entity));
        this.environment.configureMap(map);
        this.surfaces=new BarSurfaces(this.app,map,import.meta.env.BASE_URL,this.textureMax,()=>this.shadersSettled());
        // The city streams around the bar on its own time, and never holds the game back (city-streaming.ts).
        this.city=new CityStreaming(this.app,this.environment);
        this.applyCityQuality();
        this.mapEffects=new MapEffects(this.app,map);
        this.jukeboxLights=new JukeboxLights(map);
        this.stageLights=new StageLights(map,this.partyLights.filter(light=>light.name==='Stage party wash').map(light=>light.light!));
        this.musicians=new StageMusicians(this.app,map);
        // A chair pulled and put back is drawn again in the lamps' cached shadows once it stops.
        this.barAnimations=new BarAnimations(this.app,map,()=>this.environment.refreshLampShadows());
        this.barAnimations.preload('cair');
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

  getMapStatus(): {city?:ReturnType<CityStreaming['telemetry']>;loaded:boolean;colliders:number;surfaces:number;doors:number;doorOpenness:Record<string,number>;renders:number;cartRenders:number;lights:number;effects?:MapEffectsStatus;jukebox?:JukeboxLightsStatus;stage?:StageLightsStatus;show:StageShowStatus;musicians?:ReturnType<StageMusicians['telemetry']>;barAnimations?:ReturnType<BarAnimations['telemetry']>;objective?:{x:number;y:number;z:number;visible:boolean};stageBlips:Partial<Record<StageBlip,{x:number;y:number;z:number;visible:boolean}>>} {
    const cart=this.mapEntity?.findByName('Carrinho_Espeto') as pc.Entity|undefined;
    return {city:this.city?.telemetry(),loaded:!!this.mapEntity,colliders:MAP_COLLIDERS.length,surfaces:MAP_SURFACES.length,doors:this.doorLeaves.filter(d=>d.entity).length,doorOpenness:Object.fromEntries(this.doorLeaves.map(d=>[d.leaf.id,+d.openness.toFixed(3)])),
      renders:this.mapEntity?.findComponents('render').length??0,cartRenders:cart?.findComponents('render').length??0,lights:this.warmLights.length,effects:this.mapEffects?.telemetry(),
      jukebox:this.jukeboxLights?.telemetry(),stage:this.stageLights?.telemetry(),show:this.stageShow.telemetry(),musicians:this.musicians?.telemetry(),barAnimations:this.barAnimations?.telemetry(),objective:this.objective?{...this.objective.target,visible:this.objective.marker.enabled}:undefined,
      stageBlips:Object.fromEntries([...this.stageBlips].map(([id,blip])=>[id,{...blip.target,visible:blip.marker.enabled}]))};
  }

  /** Where a prop of a bar animation is now, and where a map chair is drawn (tests and debugging). */
  barProp(actorId:string,name:string):number[]|undefined {return this.barAnimations?.propPosition(actorId,name);}
  barChair(seatId:string):number[]|undefined {const index=seatChair(seatId);return index===undefined?undefined:this.barAnimations?.chairPosition(index);}
  /** Seconds of the jukebox's video, known by the local player (0 while loading): paces its colours. */
  setJukeboxDuration(seconds:number):void {this.jukeboxDuration=Number.isFinite(seconds)&&seconds>0?seconds:0;}
  /** Seconds of the telão's video, known by the local player (0 while loading): paces the stage's colours. */
  setStageDuration(seconds:number):void {this.stageDuration=Number.isFinite(seconds)&&seconds>0?seconds:0;}
  /** The local player is near a musician's spot: fetch its clips now, so taking it starts at once. */
  preloadMusician(spot:string):void {this.musicians?.preload(spot);}

  /**
   * The local player's objective ("blip"): a ring on the floor around the worker's station, the customer or the mark.
   * `through`: faintly seen through furniture and walls (a worker's station, up and down the bar). Drawn only by this
   * browser; null hides it.
   * One marker is built and then moved from task to task. Destroying it also freed its ring mesh (PlayCanvas frees a
   * mesh with its last instance), and the next task's marker drew the freed mesh: every frame threw and the view froze.
   */
  setObjective(target:Required<Position>|null,through=false):void {
    if(!target){if(this.objective)this.objective.marker.enabled=false;return;}
    const objective=this.objective??=this.buildMarker('Job objective',OBJECTIVE_COLOR,true);
    objective.ring.render!.meshInstances[1]!.visible=through;
    objective.target={x:target.x,y:target.y,z:target.z};objective.marker.setPosition(target.x,target.y,target.z);objective.marker.enabled=true;
    this.animateMarker(objective);
  }

  /** `through`: with a faint copy drawn over whatever stands in front of it. Without it, a wall hides the ring like anything else. */
  private buildMarker(name:string,hex:string,through=false):Marker {
    const marker=this.group(name,[0,0,0]);
    const glow=(depthTest:boolean)=>{
      const material=new pc.StandardMaterial();material.useLighting=false;material.useFog=false;material.diffuse.set(0,0,0);
      material.emissive=color(hex);material.opacity=depthTest ? .85 : .3;material.blendType=pc.BLEND_NORMAL;
      material.depthTest=depthTest;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();this.materials.push(material);return material;
    };
    const ring=new pc.Entity(`${name} ring`);
    const torus=pc.Mesh.fromGeometry(this.app.graphicsDevice,new pc.TorusGeometry({tubeRadius:.03,ringRadius:BLIP_RADIUS,segments:48}));
    ring.addComponent('render',{meshInstances:[new pc.MeshInstance(torus,glow(true)),...(through?[new pc.MeshInstance(torus,glow(false))]:[])],castShadows:false,receiveShadows:false});
    ring.setLocalPosition(0,.03,0);marker.addChild(ring);
    return {target:{x:0,y:0,z:0},marker,ring};
  }

  /** Where the objective is on screen (also when off it or behind the camera), and how far it is from the player. */
  projectObjective():{x:number;y:number;onScreen:boolean;behind:boolean;distance:number;above:number}|null {return this.projectMarker(this.objective);}
  /** Where one of the stage's blips is on screen, while it is shown (see updateStageBlips). */
  projectStageBlip(id:StageBlip='entry'):{x:number;y:number;onScreen:boolean;behind:boolean;distance:number;above:number}|null {return this.projectMarker(this.stageBlips.get(id));}

  /**
   * The stage's blips: its entry, where the pass is bought, the telão's control, the shop and the light desk. Shown only
   * in the stage's area (the backyard, inStageArea), so they never show all over the map, never while watching a screen,
   * and up on the stage only the light desk's; built on first use.
   */
  private updateStageBlips():void {
    const player=this.actors.get(this.localId),p=player?.root.getPosition(),at=p&&{x:p.x,y:p.y,z:p.z};
    const area=!!at&&this.enabled&&!this.watchingTv&&inStageArea(at),up=!!at&&onStage(at);
    for(const [id,{at:spot,color:hex}] of Object.entries(STAGE_BLIPS) as [StageBlip,typeof STAGE_BLIPS[StageBlip]][]){
      let blip=this.stageBlips.get(id);
      if(!area||up&&id!=='desk'){if(blip)blip.marker.enabled=false;continue;}
      if(!blip){
        blip=this.buildMarker(`Stage blip ${id}`,hex,true);this.stageBlips.set(id,blip);
        blip.target={x:spot.x,y:spot.y,z:spot.z};blip.marker.setPosition(spot.x,spot.y,spot.z);
      }
      blip.marker.enabled=true;this.animateMarker(blip);
    }
  }

  /** Where the nearest garage is on screen, while its ring shows. */
  projectGarage():{x:number;y:number;onScreen:boolean;behind:boolean;distance:number;above:number}|null {
    const p=this.actors.get(this.localId)?.root.getPosition();
    if(!p||!this.garageRings)return null;
    const near=[...this.garageRings].sort((a,b)=>Math.hypot(a.target.x-p.x,a.target.z-p.z)-Math.hypot(b.target.x-p.x,b.target.z-p.z))[0];
    return near?.marker.enabled?this.projectMarker(near):null;
  }
  private updateGarages():void {
    const p=this.actors.get(this.localId)?.root.getPosition();
    this.garageRings??=GARAGES.map(garage=>{
      const ring=this.buildMarker(`Garagem ${garage.id}`,GARAGE_COLOR);
      ring.target={x:garage.x,y:garage.y,z:garage.z};ring.marker.setPosition(garage.x,garage.y,garage.z);ring.marker.enabled=false;
      return ring;
    });
    for(const ring of this.garageRings){
      const shown=!!p&&this.enabled&&!this.watchingTv&&Math.hypot(p.x-ring.target.x,p.z-ring.target.z)<FOOD_BASE_RANGE&&Math.abs(p.y-ring.target.y)<2.5;
      ring.marker.enabled=shown;
      if(shown)this.animateMarker(ring);
    }
  }
  /** Where the Highfood base is on screen, while its ring shows. */
  projectFoodBase():{x:number;y:number;onScreen:boolean;behind:boolean;distance:number;above:number}|null {return this.projectMarker(this.foodBase);}
  /** The ring shows up to a street or two away, in the base's colour, for anyone (the base is where the job starts). */
  private updateFoodBase():void {
    const player=this.actors.get(this.localId),p=player?.root.getPosition(),{x,y,z}=HIGHFOOD.BASE;
    const near=!!p&&this.enabled&&!this.watchingTv&&Math.hypot(p.x-x,p.z-z)<FOOD_BASE_RANGE&&Math.abs(p.y-y)<2.5;
    if(!near){if(this.foodBase)this.foodBase.marker.enabled=false;return;}
    if(!this.foodBase){
      this.foodBase=this.buildMarker('Highfood base',FOOD_COLOR);this.foodBase.target={x,y,z};this.foodBase.marker.setPosition(x,y,z);
    }
    this.foodBase.marker.enabled=true;this.animateMarker(this.foodBase);
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
  setEnvironment(state?:EnvironmentState):void {if(state)this.environment.setState(state);}

  /** The bar animations' debug actions (debugBarAnimation). */
  static readonly BAR_DEBUG_ACTIONS = ['fumar','parar-fumar','cigarro','vomitar','cair','levantar-chao','sentar','comer','parar-comer','levantar','limpar-mesa','urinar','chopp','chopp-escuro','longneck','parar'] as const;
  /**
   * Development only: plays a bar animation on the local player, or on Magrão (chopp, chopp-escuro, longneck), without
   * the room, as the debug panel asks; the room's state takes over again once the action is over (or with 'parar').
   * The player is held still meanwhile. Returns what happened.
   */
  debugBarAnimation(action:typeof BarScene.BAR_DEBUG_ACTIONS[number]):string {
    const now=this.serverNow(),player=this.actors.get(this.localId),id=this.localId,current=this.barOverrides.get(id);
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
      case 'cigarro':return play({animation:'cigarette',startedAt:now},'Fumando um cigarro inteiro.');
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


  /** Switch views without changing the player's last third-person distance. */
  setCameraMode(mode: CameraMode): void { this.rig.setMode(mode); }
  setCameraDistance(distance: number): void { this.rig.setDistance(distance); }
  /** Restore both preferences together, retaining the third-person zoom while in first person. */
  setCamera(mode: CameraMode, distance: number): void { this.rig.setDistance(distance); this.rig.setMode(mode); }
  /** Height, sensitivity and smoothing of the view, from Configurações. */
  setCameraFeel(feel: CameraFeel): void { this.rig.setFeel(feel); }

  /** Whether the player is in a headset right now. */
  get vrActive(): boolean { return this.vr.active; }
  /**
   * Puts the player in the headset (WebXR needs this to run from a click). The view becomes first person, the 3D resolution is
   * the headset's own to choose (settings.resolution), and the browser's pixel cap and the dynamic resolution step aside.
   */
  async enterVr(settings: VrSettings): Promise<void> {
    if (this.vr.active) return;
    this.beforeVr = { mode: this.rig.mode };
    this.app.graphicsDevice.maxPixelRatio = window.devicePixelRatio || 1;
    try {
      await this.vr.start(settings);
    } catch (error) {
      this.beforeVr = undefined;
      this.applyResolution();
      throw error;
    }
    this.rig.enterFirst();
    this.vrAnchored = false;
    vrLog(`VR ligado; gráficos leves=${settings.lightGraphics}; resolução ${settings.resolution}`);
    window.clearInterval(this.vrLogTimer);
    this.vrLogTimer = window.setInterval(() => vrLog(JSON.stringify(this.getVr())), 2000);
    // Light graphics for the headset (given back on leaving): shadows off, the near city only.
    if (settings.lightGraphics && this.graphics) { this.graphicsBeforeVr = this.graphics; this.setGraphics({ preset: 'low', ...GRAPHICS_PRESETS.low, renderScale: 1, dynamicResolution: false, fpsCap: 0 }); }
    this.app.autoRender = true;
    this.app.renderNextFrame = true;
  }
  /** Fixtures and tests: the VR session without a headset; `pose` (the vr session's) is the head. */
  simulateVr(settings: VrSettings): { pose: { x: number; y: number; z: number; yaw: number; pitch: number } } {
    this.beforeVr = { mode: this.rig.mode };
    this.vr.simulate(settings);
    this.rig.enterFirst();
    this.vrAnchored = false;
    return this.vr;
  }
  exitVr(): void { this.vr.stop(); }
  /** An avatar's own frame: its feet, its right and where it faces (zero yaw faces +Z). */
  private bodyFrame(avatar: Avatar): { feet: pc.Vec3; rx: number; rz: number; fx: number; fz: number } {
    const a = avatar.yaw / RAD_TO_DEG;
    return { feet: avatar.root.getPosition(), fx: Math.sin(a), fz: Math.cos(a), rx: -Math.cos(a), rz: Math.sin(a) };
  }
  /**
   * In a headset the body stands under the head: on foot, the drawn body (not the room's position, which the eyes follow) slides
   * under the eyes as the player leans or steps in the room, with the eyes a little in front of the face, so looking down
   * never shows the inside of the chest. Standing still, the body turns to where the head looks once it is turned well away.
   * Only drawn here: the room is told nothing but the turn (the heading the player walks by).
   */
  private vrBody(player: Avatar | undefined, viewYaw: number, onFoot: boolean): void {
    if (!player?.skin || !onFoot || player.ragdoll || player.deathHidden) return;
    const facing = normalizeHeading(viewYaw + Math.PI);
    if ((player.speed ?? 0) < .3 && Math.abs(Math.atan2(Math.sin(facing - this.lastRotation), Math.cos(facing - this.lastRotation))) > .75) this.lastRotation = facing;
    const { feet, fx, fz } = this.bodyFrame(player), eye = this.camera.getPosition();
    let x = eye.x - fx * .14 - feet.x, z = eye.z - fz * .14 - feet.z;
    const length = Math.hypot(x, z);
    if (length > .7) { x *= .7 / length; z *= .7 / length; }
    this.vrShift.set(x, 0, z);
    player.root.setPosition(feet.x + x, feet.y, feet.z + z);
    this.vrShifted = player;
  }
  /**
   * Arms over the clip's pose: the wrist reaches the hand's target (two-bone IK, the elbow down, out and back), then the hand
   * turns so its fingers point and its palm faces as the controller does (measured from the hand's own joints, so any rig works).
   */
  private poseArm(avatar: Avatar, skin: SkinnedRig, side: 'l' | 'r', wrist: pc.Vec3, fingers: pc.Vec3, palm: pc.Vec3): void {
    const { rx, rz, fx, fz } = this.bodyFrame(avatar), out = side === 'l' ? -1 : 1, b = skin.bones;
    this.tempPole.set(rx * .55 * out - fx * .35, -.8, rz * .55 * out - fz * .35);
    if (side === 'l') reach(b.upperarm_l, b.lowerarm_l, b.hand_l, wrist, this.tempPole);
    else reach(b.upperarm_r, b.lowerarm_r, b.hand_r, wrist, this.tempPole);
    const rig = side === 'l' ? skin.drinkHand : skin.rightHand;
    if (!rig || fingers.lengthSq() < 1e-6) return;
    aim(rig.hand, handFrame(rig).fingers, fingers.clone().normalize());
    const axis = fingers.clone().normalize(), flat = (v: pc.Vec3) => v.clone().sub(axis.clone().mulScalar(v.dot(axis)));
    const from = flat(handFrame(rig).palm), to = flat(palm);
    if (from.lengthSq() > 1e-6 && to.lengthSq() > 1e-6) aim(rig.hand, from, to);
  }
  /** A world pose of a hand in an avatar's frame, and back. */
  private toBody(avatar: Avatar, wrist: pc.Vec3, fingers: pc.Vec3, palm: pc.Vec3): VrHand {
    const { feet, rx, rz, fx, fz } = this.bodyFrame(avatar), r = (n: number) => Math.round(n * 1000) / 1000;
    const local = (x: number, y: number, z: number): [number, number, number] => [r(x * rx + z * rz), r(y), r(x * fx + z * fz)];
    return { wrist: local(wrist.x - feet.x, wrist.y - feet.y, wrist.z - feet.z), fingers: local(fingers.x, fingers.y, fingers.z), palm: local(palm.x, palm.y, palm.z) };
  }
  private fromBody(avatar: Avatar, hand: VrHand, wrist: pc.Vec3, fingers: pc.Vec3, palm: pc.Vec3): void {
    const { feet, rx, rz, fx, fz } = this.bodyFrame(avatar);
    const world = (v: readonly number[], out: pc.Vec3, origin?: pc.Vec3) => out.set(v[0]! * rx + v[2]! * fx + (origin?.x ?? 0), v[1]! + (origin?.y ?? 0), v[0]! * rz + v[2]! * fz + (origin?.z ?? 0));
    world(hand.wrist, wrist, feet); world(hand.fingers, fingers); world(hand.palm, palm);
  }
  /**
   * VR arms. The local player's follow the controllers, and are sent to the room (about 12 times a second, when they move) so
   * everyone else draws them; other VR players' arms are drawn from what the room relays, eased between updates.
   */
  private vrArms(player: Avatar | undefined, dt: number): void {
    const pose = this.vrHandPose;
    if (this.vr.active && player?.skin && !player.ragdoll && !player.deathHidden) {
      const arms: VrArms = { l: null, r: null };
      for (const side of ['l', 'r'] as const) {
        if (!this.vr.handPose(side === 'l' ? 'left' : 'right', pose.wrist, pose.fingers, pose.palm)) continue;
        this.poseArm(player, player.skin, side, pose.wrist, pose.fingers, pose.palm);
        arms[side] = this.toBody(player, pose.wrist, pose.fingers, pose.palm);
      }
      this.sendVrArms(arms);
    } else if (this.vrArmsSent) this.sendVrArms({ l: null, r: null });
    const k = 1 - Math.exp(-14 * dt);
    for (const [id, avatar] of this.actors) {
      if (id === this.localId || !avatar.skin || avatar.ragdoll || avatar.deathHidden) continue;
      const raw = avatar.actor.vrArms ?? '';
      if (raw !== avatar.vrArmsRaw) { avatar.vrArmsRaw = raw; avatar.vrArmsGoal = decodeVrArms(raw); if (!avatar.vrArmsGoal) avatar.vrArmsShown = null; }
      const goal = avatar.vrArmsGoal;
      if (!goal) continue;
      const shown = avatar.vrArmsShown ??= { l: goal.l && structuredClone(goal.l), r: goal.r && structuredClone(goal.r) };
      for (const side of ['l', 'r'] as const) {
        const want = goal[side];
        if (!want) { shown[side] = null; continue; }
        const have = shown[side] ??= structuredClone(want);
        for (const key of ['wrist', 'fingers', 'palm'] as const) for (let i = 0; i < 3; i++) have[key][i] = have[key][i]! + (want[key][i]! - have[key][i]!) * k;
        this.fromBody(avatar, have, pose.wrist, pose.fingers, pose.palm);
        this.poseArm(avatar, avatar.skin, side, pose.wrist, pose.fingers, pose.palm);
      }
    }
  }
  private sendVrArms(arms: VrArms): void {
    const message = vrArmsMessage(arms), text = JSON.stringify(message), now = performance.now();
    if (text === this.vrArmsSent || now - this.vrArmsSentAt < 80) return;
    // Below about a centimetre of change there is nothing for anyone to see.
    if (this.vrArmsSent && message.l && message.r) {
      const before = JSON.parse(this.vrArmsSent) as typeof message;
      if (before.l && before.r && [...before.l, ...before.r].every((v, i) => Math.abs(v - [...message.l!, ...message.r!][i]!) < .012)) return;
    }
    this.vrArmsSent = message.l || message.r ? text : '';
    this.vrArmsSentAt = now;
    this.callbacks.onVrArms?.(message);
  }
  /** An error inside the headset's frame would leave it on a frozen loading screen: say what it was, and leave VR. */
  private vrFailed(error: unknown): void {
    console.error('[vr]', error);
    vrLog(`ERRO no quadro: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    this.callbacks.onVrNotice?.(`Erro no VR: ${error instanceof Error ? error.message : String(error)}`);
    this.vr.stop();
  }
  recentreVr(): void { if (this.vr.active) this.vr.recentre(); }
  getVr() {
    const feet = this.actors.get(this.localId)?.root.getPosition(), a = this.vrAnchor, eye = this.camera.getPosition();
    const r = (n: number) => +n.toFixed(2);
    return { ...this.vr.telemetry(), enabled: this.enabled, anchored: this.vrAnchored, anchor: [r(a.x), r(a.y), r(a.z)], special: a.special, feet: feet && [r(feet.x), r(feet.y), r(feet.z)], eye: [r(eye.x), r(eye.y), r(eye.z)], windowOpen: !!this.callbacks.vrWindowOpen?.(), fps: this.fps };
  }
  private leftVr(reason: string): void {
    this.touchAxis = { x: 0, y: 0 }; this.touchSprint = false;
    if (this.beforeVr) { this.rig.setMode(this.beforeVr.mode); this.beforeVr = undefined; }
    window.clearInterval(this.vrLogTimer);
    vrLog(`saiu do VR: ${reason}`);
    if (this.graphicsBeforeVr) { this.setGraphics(this.graphicsBeforeVr); this.graphicsBeforeVr = undefined; }
    this.fovPunch = 0; this.fovPunchGoal = 0;
    if (this.camera.camera) this.camera.camera.fov = this.lensFov;
    this.applyResolution();
    this.app.autoRender = this.enabled || this.showcaseOn;
    this.app.renderNextFrame = true;
    this.callbacks.onVrEnd?.(reason);
  }
  /** The people near the eyes, with where their names go (a little over the head), nearest first. */
  private vrNames(max: number): { id: string; name: string; x: number; y: number; z: number; npc: boolean }[] {
    const eye = this.camera.getPosition(), found: { id: string; name: string; x: number; y: number; z: number; npc: boolean; d: number }[] = [];
    for (const [id, avatar] of this.actors) {
      if (id === this.localId || avatar.deathHidden) continue;
      const name = avatar.actor.displayName ?? avatar.actor.name;
      if (!name) continue;
      const at = avatar.root.getPosition(), d = Math.hypot(at.x - eye.x, at.z - eye.z);
      if (d < 18) found.push({ id, name, x: at.x, y: at.y + 1.98, z: at.z, npc: !!avatar.npc, d });
    }
    return found.sort((a, b) => a.d - b.d).slice(0, max).map(({ d: _d, ...tag }) => tag);
  }
  /** The nearest other player a ray from a controller passes close to, within `reach` metres. */
  /** What a controller's ray points at, within `reach` metres: a person or a vehicle, whichever is nearer (the menu is the same as a right click on it). */
  private pickRay(origin: pc.Vec3, direction: pc.Vec3, reach: number): { id: string; distance: number; vehicle?: true } | undefined {
    const person = this.pickPlayerRay(origin, direction, reach);
    const hit = this.motos.pickRay(origin, this.tempPoint.copy(direction).mulScalar(reach).add(origin));
    if (!hit || (person && person.distance <= hit.at * reach)) return person;
    return { id: hit.id, distance: hit.at * reach, vehicle: true };
  }
  private pickPlayerRay(origin: pc.Vec3, direction: pc.Vec3, reach: number): { id: string; distance: number } | undefined {
    let best: { id: string; distance: number } | undefined;
    for (const [id, avatar] of this.actors) {
      if (avatar.npc || id === this.localId) continue;
      const feet = avatar.root.getPosition();
      this.tempPosition.set(feet.x - origin.x, feet.y + 1 - origin.y, feet.z - origin.z);
      const along = this.tempPosition.dot(direction);
      if (along < .2 || along > reach) continue;
      const off = this.tempPosition.sub(this.tempPoint.copy(direction).mulScalar(along)).length();
      if (off < .6 && (!best || along < best.distance)) best = { id, distance: along };
    }
    return best;
  }

  /** Before PlayCanvas evaluates any clip, remove last frame's additive head rotation. */
  private restoreHeadLooks():void {
    this.cigarettes.restore();
    this.crossedArms.restore();
    for(const [node,scale] of this.hiddenCarFace)node.setLocalScale(scale);this.hiddenCarFace.clear();
    for(const avatar of this.actors.values()){avatar.headLook?.restore();avatar.fly?.restore();avatar.flinch?.restore();avatar.posture?.restore();}
  }

  /** The animation has already posed the skeleton; distribute the camera offset through neck and head. */
  private applyHeadLooks(dt:number):void {
    for(const [id,avatar] of this.actors){
      if(avatar.resting)continue;
      if(avatar.skin)(avatar.posture??=new IdlePosture()).apply(avatar.skin.model,avatar.body,avatar.skin.clip==='Idle'&&!avatar.bar,dt);
      if(avatar.npc)continue;
      if(avatar.skin)avatar.fly?.apply(avatar.skin.bones,avatar.body,this.elapsed+avatar.phase,avatar.spine??=(avatar.skin.model.findByName('spine_02') as pc.Entity|null)??null);
      const head=avatar.skin?.bones.head??avatar.limbs?.head;
      if(!head)continue;
      const actor=avatar.actor,local=id===this.localId,bodyYaw=avatar.yaw/RAD_TO_DEG;
      // Mouth/phone props and physical falls retain their authored head pose.
      const free=this.enabled&&!actor.musician&&!actor.holding&&!avatar.riding&&!avatar.ragdoll&&
        !['drink','text','kick','fallen','recover','stumble','ragdoll','ride','punch','hit'].includes(actor.animation??'')&&
        (!avatar.bar||avatar.bar.clip==='sentado_loop')&&!(local&&(this.watchingTv||this.watchingStage));
      // In the selfie the eyes go to the lens, wherever the mouse has carried the phone.
      const lens=local&&this.selfie?this.camera.getPosition().clone().sub(head.getPosition()):undefined;
      const look:HeadLook=!free?{headYaw:0,headPitch:0}:lens?headLookAt(Math.atan2(-lens.x,-lens.z),-Math.atan2(lens.y,Math.hypot(lens.x,lens.z)),bodyYaw):
        local?headLookAt(this.rig.yaw,this.rig.pitch,bodyYaw):
        {headYaw:actor.headYaw??0,headPitch:actor.headPitch??0};
      (avatar.headLook??=new HeadLookPose()).apply(head,bodyYaw,look,dt);
      if(avatar.flinch?.active&&avatar.skin){
        const skin=avatar.skin,spine=avatar.spine??=(skin.model.findByName('spine_02') as pc.Entity|null)??null;
        avatar.flinch.apply([spine,skin.model.findByName('spine_03'),skin.bones.head.parent,skin.bones.head],this.elapsed);
      }
    }
  }
  getCamera() { return { ...this.rig.telemetry(), fov: +(this.camera.camera?.fov ?? 0).toFixed(2), rush: +this.rush.toFixed(3), blur: this.speedBlur.drawn }; }

  /**
   * First person shrinks the local avatar's head joint each frame (after the clips posed it), so the face and hair do not
   * fill the view; the body, the hands and what they hold stay. Any other avatar, or a later view, gets it back.
   */
  private showOwnHead(player: Avatar | undefined): void {
    // In a headset the eyes are always inside the head, also with a window open (when the scene is not enabled).
    const head = (this.vr.active && !this.vrAnchor.special || this.rig.headHidden && this.enabled && !this.watchingTv) && !this.selfie ? player?.skin?.bones.head : undefined;
    const carHead=!!head&&!!player&&this.motos.ridden(player.actor.id)?.rig instanceof CarRig;
    if(!carHead||head!==this.hiddenHead){for(const [node,scale] of this.hiddenCarFace)node.setLocalScale(scale);this.hiddenCarFace.clear();}
    if(carHead&&head){
      const neck=head.parent;
      if(neck&&/neck/i.test(neck.name)){this.hiddenCarFace.set(neck,neck.getLocalScale().clone());neck.setLocalScale(HIDDEN_HEAD,HIDDEN_HEAD,HIDDEN_HEAD);}
      // Facial joints can compensate their parent's scale; hide their subtree too, while preserving the hands and body.
      const hide=(node:pc.GraphNode)=>{for(const child of node.children){if(!this.hiddenCarFace.has(child))this.hiddenCarFace.set(child,child.getLocalScale().clone());child.setLocalScale(HIDDEN_HEAD,HIDDEN_HEAD,HIDDEN_HEAD);hide(child);}};
      hide(head);
    }
    // (A head left by a skin change is gone with its model; scaling it back is harmless.)
    if (this.hiddenHead && this.hiddenHead !== head) this.hiddenHead.setLocalScale(this.headScale);
    if (head && head !== this.hiddenHead) this.headScale.copy(head.getLocalScale());
    this.hiddenHead = head;
    head?.setLocalScale(HIDDEN_HEAD, HIDDEN_HEAD, HIDDEN_HEAD);
    if (player) player.ring.enabled = false;
  }

  private morteScene(): MorteScene {
    if (!this.morte) {
      this.morte = new MorteScene({
        app: this.app, camera: this.camera, serverNow: () => this.serverNow(), localId: () => this.localId,
        shake: metres => this.rig.shake(metres), faceCamera: heading => this.rig.face(heading), punchFov: degrees => { this.fovPunchGoal = degrees; },
        dust: (x, y, z, radius, colour) => { this.smokeBurst.burst(x, y, z, radius, colour); },
        lowQuality: () => this.graphics?.preset === 'low' || (this.graphics?.renderScale ?? 1) < .7,
      });
      this.morte.audio = this.deathAudio;
      this.morte.onPull = (victim, k, towards) => { this.deathPull = { victim, k, x: towards.x, z: towards.z }; };
    }
    return this.morte;
  }
  /** On entering the bar, once idle: the five GLBs of the Morte, so the first death does not stall. */
  preloadDeath(): void { this.morteScene().preload(); }
  playDeath(plan: DeathPlan): void { this.morteScene().start(plan); }
  stopDeath(): void { this.morte?.stop(); this.deathPull = undefined; }
  setDeathAudio(audio: DeathAudio): void { this.deathAudio = audio; if (this.morte) this.morte.audio = audio; }
  getDeath() { return { playing: !!this.morte?.current, loaded: this.morte?.ready ?? false, victim: this.morte?.current?.victim ?? '', pull: this.deathPull?.k ?? 0 }; }
  /** The victim's body is drawn into the cloud as the Morte leaves: it moves to where she stood and sinks, smaller, until the room hides it. */
  private applyDeathPull(): void {
    const pull = this.deathPull, avatar = pull && this.actors.get(pull.victim);
    if (!pull || !avatar) return;
    const body = avatar.body;
    if (avatar.actor.interactionState !== DEATH_STATE) {
      if (this.deathPulled) { body.setLocalPosition(0, 0, 0); body.setLocalScale(1, 1, 1); this.deathPulled = false; }
      return;
    }
    if (pull.k <= 0) { if (this.deathPulled) { body.setLocalPosition(0, 0, 0); body.setLocalScale(1, 1, 1); this.deathPulled = false; } return; }
    const here = avatar.root.getPosition(), k = pull.k, target = new pc.Vec3(here.x + (pull.x - here.x) * .85 * k, here.y - 1.15 * k, here.z + (pull.z - here.z) * .85 * k);
    const local = new pc.Mat4().copy(avatar.root.getWorldTransform()).invert().transformPoint(target);
    body.setLocalPosition(local); body.setLocalScale(1 - .35 * k, 1 - .35 * k, 1 - .35 * k); this.deathPulled = true;
  }
  /** The phone's front camera: at arm's length in front of the face, looking back at it, until switched off. */
  setSelfie(on: boolean): void {
    // The phone comes up in front of the face, wherever the view was turned.
    const player = this.actors.get(this.localId);
    if (on && !this.selfie && player) { this.rig.face(player.yaw / RAD_TO_DEG); this.selfieHeadSet = false; }
    this.selfie = on;
  }
  /** The local player holds the phone up for its front camera (selfie or a video call), not looking down at it. */
  private selfieOf(avatar: Avatar): boolean { return this.selfie && this.enabled && avatar.actor.id === this.localId; }
  /** The phone camera's zoom: the lens narrows (1× is the game's own 57° view). */
  setZoom(factor: number): void {
    const zoom = Math.max(1, Math.min(8, factor || 1));
    this.lensFov = zoom === 1 ? 57 : 2 * Math.atan(Math.tan(57 / 2 / RAD_TO_DEG) / zoom) * RAD_TO_DEG;
    if (this.camera.camera) this.camera.camera.fov = this.lensFov + this.rush * RUSH_FOV - this.fovPunch;
  }
  /** Going fast on the local rider's own bike: the view and the edges of the screen, eased on the frames' time. */
  private feelSpeed(bike: Bike | undefined, dt: number): void {
    const share = bike?.predicted ? groundVehicleSpeed(bike.predicted) / vehiclePhysics(bike.state.model).TOP_SPEED : 0;
    const wanted = Math.max(clamp((share - RUSH_FROM) / (RUSH_FULL - RUSH_FROM), 0, 1), this.flyShare), goal = wanted * wanted * (3 - 2 * wanted);
    // The barrier breaking: the view stretches and the edges streak at once, then settle.
    const boom = Math.exp(-(this.elapsed - this.boomAt) * 3.2);
    this.rush += (goal - this.rush) * (1 - Math.exp(-(goal > this.rush ? RUSH_IN : RUSH_OUT) * dt));
    if (boom > .02) this.rush = Math.max(this.rush, boom);
    if (this.rush < .002) this.rush = goal ? this.rush : 0;
    this.rig.rush(this.rush);
    // A headset's field of view is its own, and a screen blur would be drawn on one eye's glass only.
    if (this.vr.active) { this.speedBlur.set(0); return; }
    if (this.camera.camera) this.camera.camera.fov = this.lensFov + this.rush * RUSH_FOV + (boom > .02 ? boom * 12 : 0) - this.fovPunch;
    this.speedBlur.set(this.rush);
  }
  /** A skin standing still, as an image (the profile window); undefined when it could not be drawn. */
  async portrait(skin: string): Promise<string | undefined> {
    const id = SKIN_IDS.has(skin) ? skin : DEFAULT_SKIN;
    if (!this.skinModels.has(id)) this.loadSkin(id);
    for (let waited = 0; !this.skinModels.has(id) && waited < 20000; waited += 100) await new Promise(resolve => setTimeout(resolve, 100));
    const model = this.skinModels.get(id);
    // A blank frame (the GPU had not uploaded the model yet) comes back undefined: try again before giving up.
    for (let attempt = 0; model && attempt < 3 && !this.destroyed && this.camera.camera; attempt++) {
      const picture = await shootPortrait(this.app, model, this.camera.camera);
      if (picture) return picture;
    }
    return undefined;
  }
  /** The bike under a point of the view (CSS pixels of the canvas). */
  pickMoto(x: number, y: number): string | undefined { return this.camera.camera ? this.motos.pick(this.camera.camera, x, y) : undefined; }
  /** The player drawn under a point of the view (CSS pixels of the canvas), the nearest one first; the local one too with `self`, unless in first person. */
  pickPlayer(x: number, y: number, self = false): string | undefined {
    const camera = this.camera.camera;
    if (!camera) return undefined;
    const eye = this.camera.getPosition(), forward = this.camera.forward;
    let best: { id: string; distance: number } | undefined;
    for (const [id, avatar] of this.actors) {
      if (avatar.npc || (id === this.localId && (!self || this.rig.headHidden))) continue;
      const feet = avatar.root.getPosition();
      this.tempPosition.set(feet.x - eye.x, feet.y + 1 - eye.y, feet.z - eye.z);
      const distance = this.tempPosition.length();
      if (this.tempPosition.dot(forward) <= 0 || distance > 40) continue;
      camera.worldToScreen(feet, this.tempScreen);
      const bottom = this.tempScreen.y, centre = this.tempScreen.x;
      this.tempPosition.set(feet.x, feet.y + 1.8, feet.z);
      camera.worldToScreen(this.tempPosition, this.tempScreen);
      const top = this.tempScreen.y, half = Math.max(12, (bottom - top) * .22);
      if (y < top - 6 || y > bottom + 4 || Math.abs(x - (centre + this.tempScreen.x) / 2) > half) continue;
      if (!best || distance < best.distance) best = { id, distance };
    }
    return best?.id;
  }

  /**
   * The phone's camera: the next rendered frame, cropped from the middle of the view to `width`×`height`, as a JPEG.
   * Read in the same frame it is drawn (frameend), so the canvas needs no preserved drawing buffer. Null if the page
   * draws nothing for two seconds (a hidden tab).
   */
  capture(width: number, height: number, quality = .82): Promise<Blob | null> {
    return new Promise(resolve => {
      let done = false;
      const grab = () => {
        if (done) return; done = true;
        const source = this.canvas, aspect = width / height, sw = Math.min(source.width, source.height * aspect), sh = sw / aspect;
        const key = `${width}x${height}`;
        // toBlob copies the pixels when it is called, so the next capture can draw into the same canvas.
        const out = this.captureCanvases.get(key) ?? document.createElement('canvas'); out.width = width; out.height = height;
        this.captureCanvases.set(key, out);
        const context = out.getContext('2d');
        if (!context) { resolve(null); return; }
        context.fillStyle = '#000'; context.fillRect(0, 0, width, height);
        context.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, 0, 0, width, height);
        out.toBlob(resolve, 'image/jpeg', quality);
      };
      this.app.once('frameend', grab);
      this.app.renderNextFrame = true;
      setTimeout(() => { if (!done) { done = true; this.app.off('frameend', grab); resolve(null); } }, 2000);
    });
  }

  /**
   * The same cut as capture(), for a video call: a bitmap of `width`×`height` made in the frame it is drawn (the GPU does the
   * scaling; no page-thread readback, no JPEG here: the phone encodes it in a worker). Null if nothing is drawn for two seconds.
   */
  captureBitmap(width: number, height: number): Promise<ImageBitmap | null> {
    return new Promise(resolve => {
      let done = false;
      const grab = () => {
        if (done) return; done = true;
        const source = this.canvas, aspect = width / height, sw = Math.min(source.width, source.height * aspect), sh = sw / aspect;
        createImageBitmap(source, Math.round((source.width - sw) / 2), Math.round((source.height - sh) / 2), Math.round(sw), Math.round(sh),
          { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }).then(resolve, () => resolve(null));
      };
      this.app.once('frameend', grab);
      this.app.renderNextFrame = true;
      setTimeout(() => { if (!done) { done = true; this.app.off('frameend', grab); resolve(null); } }, 2000);
    });
  }

  /** Where the local player hears from: the avatar's position and the camera's heading (radians). */
  getListener(): (Position & { yaw: number }) | undefined {
    const avatar = this.actors.get(this.localId);
    if (!avatar) return undefined;
    const p = avatar.root.getPosition();
    return { x: p.x, y: p.y, z: p.z, yaw: this.rig.yaw };
  }

  /**
   * The minimap (minimap.ts): everyone where they are drawn (smoother than the room's 10 Hz positions), the local avatar's
   * heading and the camera's, in radians.
   */
  mapView(): MapView | undefined {
    const self = this.actors.get(this.localId);
    if (!self) return undefined;
    const p = self.root.getPosition(), others: MapView['others'] = [];
    for (const [id, avatar] of this.actors) {
      if (id === this.localId) continue;
      const q = avatar.root.getPosition();
      others.push({ id, x: q.x, y: q.y, z: q.z, npc: avatar.npc });
    }
    return { x: p.x, y: p.y, z: p.z, yaw: this.rig.yaw, facing: self.yaw / RAD_TO_DEG, others, riding: !!this.motos.ridden(this.localId) || isRidingHorse(self.actor.interactionState) };
  }

  /** The bike the local player rides, as predicted (networking.ts). */
  predictMoto(id: string, body: MotoBody | undefined): void { this.motos.predict(id, body); }
  /** The touch stick: x right, y down (-1 to 1). It walks, or steers and gives gas on a vehicle, like the keys it adds to. */
  setTouchAxis(x: number, y: number): void { this.touchAxis = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }; }
  setTouchSprint(on: boolean): void { this.touchSprint = on; }
  /** What the player's hands are doing, which decides the touch buttons: on foot, driving a bike or a car, or on the horse. */
  touchContext(): 'walk' | 'bike' | 'car' | 'horse' {
    const vehicle = this.motos.ridden(this.localId);
    if (vehicle && vehicle.state.riderId === this.localId) return isCar(vehicle.state) ? 'car' : 'bike';
    return isRidingHorse(this.actors.get(this.localId)?.actor.interactionState) ? 'horse' : 'walk';
  }
  /** W/S: throttle, brake and reverse; A/D: +1 is right; Space: the handbrake. */
  getMotoInput(): MotoIntent {
    const vehicle=this.motos.ridden(this.localId);
    if(!vehicle||!vehiclePowered(vehicle.state))this.motoSwitches=0;
    else this.motoSwitches=(this.motoSwitches&~MOTO_LIGHT.HIGH)|(vehicle.state.headlights===2?MOTO_LIGHT.HIGH:0);
    // The switches stay as they are while the chat is open or the tab hidden.
    if (!this.enabled || this.inputHasFocus() || document.hidden) {
      const riding = this.motos.ridden(this.localId);
      if (riding) {this.motos.gas(riding.state.id, false);this.motos.brake(riding.state.id,false);}
      return { ...NO_MOTO_INTENT, lights: this.motoSwitches };
    }
    const held = (...codes: string[]) => Number(codes.some(code => this.keys.has(code)));
    const input = { throttle: clamp(held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown') - this.touchAxis.y, -1, 1), steer: clamp(held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft') + this.touchAxis.x, -1, 1), brake: this.keys.has('Space'), lights: this.motoSwitches,horn:this.keys.has('KeyF'),wheelie:!isCar(vehicle?.state)&&(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')) };
    const bike = this.motos.ridden(this.localId), speed = bike?.predicted?.speed ?? 0;
    const braking = input.brake || (input.throttle < 0 && speed > .1) || (input.throttle > 0 && speed < -.1);
    if (bike) { this.motos.lamps(bike.state.id, this.motoSwitches | (braking ? MOTO_LIGHT.BRAKE : 0)); this.motos.gas(bike.state.id, input.throttle > 0 && bike.state.engine === MOTO_ENGINE.ON); this.motos.brake(bike.state.id,input.brake); }
    return input;
  }
  /** Z and C: the blinkers, X: both (hazard), H: the high beam. A blinker cancels itself once the turn is over, as on a real bike. */
  private motoSwitch(code: string): void {
    const vehicle=this.motos.ridden(this.localId);
    if(!vehicle||vehicle.state.riderId!==this.localId||!vehiclePowered(vehicle.state))return;
    const { LEFT, RIGHT, HIGH } = MOTO_LIGHT, signals = LEFT | RIGHT, now = this.motoSwitches & signals;
    if (code === 'KeyH') { this.motoSwitches ^= HIGH; return; }
    const wanted = code === 'KeyZ' ? LEFT : code === 'KeyC' ? RIGHT : signals;
    this.motoSwitches = (this.motoSwitches & ~signals) | (now === wanted ? 0 : wanted);
    this.signalYaw = undefined;
  }
  /** The dashboard and keyboard share the same switches and input prediction. */
  vehicleSignal(signal:'left'|'right'|'hazard'):void {this.motoSwitch(signal==='left'?'KeyZ':signal==='right'?'KeyC':'KeyX');}
  vehicleCamera():void {this.callbacks.onCameraChange?.(this.rig.cycle(),this.rig.reach);}
  vehicleSpeed():Pick<MotoBody,'speed'|'lateralSpeed'>|undefined {const bike=this.motos.ridden(this.localId);const body=bike?.predicted??bike?.state;return body?{speed:body.speed,lateralSpeed:body.lateralSpeed??0}:undefined;}
  private cancelSignal(bike: Bike): void {
    const { LEFT, RIGHT } = MOTO_LIGHT, signal = this.motoSwitches & (LEFT | RIGHT);
    if (!signal || signal === (LEFT | RIGHT)) { this.signalYaw = undefined; return; }
    this.signalYaw ??= bike.drawn.yaw;
    const turned = Math.abs(Math.atan2(Math.sin(bike.drawn.yaw - this.signalYaw), Math.cos(bike.drawn.yaw - this.signalYaw)));
    if (turned > SIGNAL_CANCEL_TURN && Math.abs(bike.predicted?.steer ?? 0) < .1) { this.motoSwitches &= ~(LEFT | RIGHT); this.signalYaw = undefined; }
  }
  getMotos() {
    return [...this.motos.all()].map(({ state, drawn, rig, entity, predicted, lights }) => ({ id: state.id,model:state.model,color:state.color,passengers:state.passengers, riderId: state.riderId, phase: state.phase, engine: state.engine, crank: state.crank, gas: state.gas, parts: state.parts, sound: this.motos.soundTelemetry(state.id), lights: lights.telemetry(), screen: this.bikeOnScreen(entity), up: +entity.up.y.toFixed(3), speed: predicted?.speed ?? state.speed, steer: predicted?.steer ?? state.steer, lateralSpeed:predicted?.lateralSpeed??state.lateralSpeed??0,yawRate:predicted?.yawRate??state.yawRate??0,
      position: [entity.getPosition().x, entity.getPosition().y, entity.getPosition().z], yaw: drawn.yaw, front: [-entity.forward.x, -entity.forward.y, -entity.forward.z], rig: rig.telemetry(),
      rider: this.motoRiderPose(state.riderId), points: Object.fromEntries(['ponto_mao_E', 'ponto_mao_D', 'ponto_farol', 'ponto_lanterna', ...(rig instanceof MotoRig?['ponto_piloto','ponto_pe_E','ponto_pe_D','ponto_bau']:[])].map(point => { const p = rig.ponto(point).getPosition(); return [point, [p.x, p.y, p.z]]; })) }));
  }

  private motoRiderPose(id:string) {
    const skin=this.actors.get(id)?.skin;if(!skin)return undefined;
    return Object.fromEntries(['hand_l','hand_r','foot_l','foot_r'].map(name=>{
      const p=skin.bones[name as 'hand_l'|'hand_r'|'foot_l'|'foot_r'].getPosition();return [name,[p.x,p.y,p.z]];
    }));
  }
  /** Development inspection of the standalone item; uses the same creation/attachment API as gameplay items. */
  async debugMotoBag(action:'attach'|'remove'|'open'|'close',id?:string):Promise<void> {
    const bike=[...this.motos.all()].find(b=>!id||b.state.id===id);
    if(!(bike?.rig instanceof MotoRig))throw new Error('Moto não encontrada');
    const point=bike.rig.ponto('ponto_bau');
    const bag=point.children.find(child=>child.name==='Bag_Rig') as pc.Entity|undefined;
    if(action==='remove'){bag?.destroy();return;}
    if(action==='attach'){if(!bag)bike.rig.encaixarBag(await this.motos.criarBag());return;}
    if(!bag)throw new Error('Bag não encaixada');
    bag.script!.get(MotoBag)!.aberta=action==='open';
  }

  /** Where a bike's middle is on the view, in CSS pixels (tests and telemetry). */
  private bikeOnScreen(entity: pc.Entity): [number, number] {
    this.tempPosition.copy(entity.getPosition()).add(this.tempUp.copy(entity.up).mulScalar(.6));
    this.camera.camera?.worldToScreen(this.tempPosition, this.tempScreen);
    return [this.tempScreen.x, this.tempScreen.y];
  }
  /** The thrown bodies as drawn (tests and telemetry). */
  /** Kicks and falls: what was heard and what is showing (tests). */
  getBlows() { return { ...this.blowSounds.telemetry(), effects: this.blowEffects.showing }; }
  getSmokeBurst() { return { showing: this.smokeBurst.showing, color: this.smokeBurst.lastColor }; }
  getSmoking(){return this.cigarettes.telemetry();}
  getCrossedArms(){return this.crossedArms.telemetry();}
  getFireworks() {return {showing:this.fireworks.showing,equipped:!!this.actors.get(this.localId)?.firework?.enabled};}
  fireworkShot(shot:FireworkShot):void {this.fireworks.shot(shot,this.serverNow());}
  fireworkFire():void {this.shootFirework();}
  private fireworkDirection():pc.Vec3 {
    const actor=this.actors.get(this.localId)?.actor;
    if(!actor)return this.camera.forward.clone();
    const eye=this.camera.getPosition(),forward=this.camera.forward;
    const end=eye.clone().add(forward.clone().mulScalar(80));
    const fraction=solidRayFraction(eye,end);
    const target=eye.clone().lerp(eye,end,fraction),origin=fireworkOrigin(actor,this.lastRotation);
    return target.sub(new pc.Vec3(origin.x,origin.y,origin.z)).normalize();
  }
  private shootFirework():boolean {
    if(!this.enabled||this.inputHasFocus()||!this.actors.get(this.localId)?.actor.fireworkEquipped)return false;
    if(performance.now()-this.fireworkPressedAt<FIREWORK.cooldownMs)return true;
    this.fireworkPressedAt=performance.now();
    const direction=this.fireworkDirection();
    this.callbacks.onFirework?.({x:direction.x,y:direction.y,z:direction.z});return true;
  }
  getRagdolls() {
    return [...this.actors].filter(([, avatar]) => avatar.ragdoll).map(([id, avatar]) => {
      const [x, y, z] = avatar.ragdoll!.pelvis(), head = avatar.skin?.bones.head.getPosition(), foot = avatar.skin?.bones.foot_l.getPosition(), hip = avatar.skin?.hip?.getPosition();
      return { id, pelvis: [x, y, z], time: avatar.ragdoll!.time, asleep: avatar.ragdoll!.asleep, rotation: avatar.actor.rotation, hip: hip && [hip.x, hip.y, hip.z], head: head && [head.x, head.y, head.z], foot: foot && [foot.x, foot.y, foot.z] };
    });
  }

  private flying(): boolean { return !!this.actors.get(this.localId)?.actor.animation?.startsWith('fly'); }

  getInput(): SceneInput {
    this.lastRotation=normalizeHeading(this.lastRotation);
    // A debug run of a bar animation holds the player, as the room would.
    if (!this.enabled || this.inputHasFocus() || document.hidden || this.barOverrides.has(this.localId)) {
      return { dx: 0, dz: 0, running: false, rotation: this.lastRotation };
    }
    const horizontal = clamp(Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
      Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) + this.touchAxis.x, -1, 1);
    const vertical = clamp(Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
      Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - this.touchAxis.y, -1, 1);
    const length = Math.hypot(horizontal, vertical) || 1;
    const yaw = this.rig.yaw;
    let dx = (Math.cos(yaw) * horizontal - Math.sin(yaw) * vertical) / length;
    let dz = (-Math.sin(yaw) * horizontal - Math.cos(yaw) * vertical) / length;
    const flying = this.flying();
    // Flying goes where the camera looks: forward is the view, pitch included, right stays level. `aim` is its vertical part.
    let aim = 0;
    if (flying) {
      const cos = Math.cos(this.rig.pitch);
      dx = (Math.cos(yaw) * horizontal - Math.sin(yaw) * cos * vertical) / length;
      dz = (-Math.sin(yaw) * horizontal - Math.cos(yaw) * cos * vertical) / length;
      aim = -Math.sin(this.rig.pitch) * vertical / length;
    }
    // The body keeps following travel; looking around at rest only turns the head.
    const actor=this.actors.get(this.localId)?.actor;
    if((dx||dz)&&(!actor?.interactionState||isRidingHorse(actor.interactionState))&&!actor?.currentTableId)this.lastRotation=Math.atan2(dx,dz);
    // With the guard up the body faces where the camera looks, and the keys step that way or aside (the guard's steps).
    if(this.callbacks.fight?.()?.guard&&!actor?.interactionState&&!actor?.currentTableId)this.lastRotation=this.fightView();
    if(actor?.fireworkEquipped)this.lastRotation=normalizeHeading(this.rig.yaw+Math.PI);
    // Standing for a selfie, the body turns to the phone once the head alone could not reach it (past ~40°).
    else if(this.selfie&&!dx&&!dz&&!actor?.interactionState&&!actor?.currentTableId&&Math.abs(normalizeHeading(yaw+Math.PI-this.lastRotation))>.7)this.lastRotation=normalizeHeading(yaw+Math.PI);
    const dy = flying ? Number(this.keys.has('Space')) - Number(this.keys.has('ControlLeft')) : 0;
    if (flying) {
      // dx, aim and dz are a unit direction at most (flyPlayer), so the speed is the pace itself.
      const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint, pace = boost ? FLY.boost : FLY.speed;
      this.localFlyV.set(dx * pace, aim * pace + dy * FLY.climb * (boost ? 2 : 1), dz * pace); this.localFlyAt = this.elapsed;
    }
    return { dx, dz, dy: dy || undefined, aim: flying ? aim : undefined, running: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint,rear:isRidingHorse(actor?.interactionState)&&(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||this.touchSprint), rotation: this.lastRotation,
      ...headLookAt(yaw,this.rig.pitch,this.lastRotation) };
  }

  setWorld(world: WorldState, localId: string): void {
    if(world.environment)this.environment.setState(world.environment);
    // Empty departure snapshots preserve the shared clock and climate in the entry.
    if(!this.callbacks.serverNow)this.clock.sync(world.serverTime);
    this.stateAt=world.serverTime;
    this.jukeboxState=world.jukeboxes?.[JUKEBOX_SYSTEMS[0]!.id];
    this.stageState=world.televisions?.telao;
    this.stageSpots=Object.values(world.musicians??{});
    this.motos.sync(world.motos);
    this.fuelProps.sync(world.fuelServices??{});
    this.motos.couriers(Object.values(world.players).filter(player=>player.courier).map(player=>player.id));
    this.ragdollStarts=world.ragdolls??{};
    this.showDesk=world.stageShow;
    for(const door of this.doorLeaves){
      const state=world.doors?.[door.leaf.group];if(!state)continue;
      const target=state.open?1:0;
      if(target!==door.target||state.changedAt!==door.changedAt){door.from=door.openness;door.target=target;door.changedAt=state.changedAt;}
    }
    const musicians=new Map(Object.values(world.musicians??{}).filter(spot=>spot.playerId).map(spot=>[spot.playerId,spot]));
    this.updateState({
      players: Object.values(world.players).map(player => {
        const seat=world.tables[player.currentTableId]?.seats.find(seat => seat.playerId === player.id);
        return { ...player, animation: player.animationState,cardResult:seat?.result,cardCount:seat?.hands.reduce((most,hand)=>Math.max(most,hand.cards.length),0)??0,musician:musicians.get(player.id) };
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
    const now=this.serverNow();
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

  /** A frame of a pebolim match (foosball.frame): its ball runs on the 3D table for whoever is near. */
  foosballFrame(frame:FoosballFrame):void {this.foosballBalls.frame(frame);}
  /** A pool table's view (pool.view) and a stroke's recorded paths (pool.shot): the balls on the 3D table follow them. */
  poolView(view:PoolTableView):void {this.poolBalls.view(view);}
  poolShot(shot:PoolShotView,serverNow:number):void {this.poolBalls.shot(shot,serverNow);}

  /**
   * The light desk's view: the camera out in the backyard looking at the stage, so its panel's changes show; dragging turns
   * it. `covered`: the share of the canvas's width the panel covers on the right, so the stage centres in what is left.
   * Without it, back to the player.
   */
  watchStage(covered?:()=>number):void {
    this.watchingStage=covered;this.keys.clear();this.dragging=false;
    this.tvYaw=0;this.tvPitch=0;
    if(covered){this.enabled=false;this.app.autoRender=true;}
    this.app.renderNextFrame=true;
  }

  dispose(): void { this.destroy(); }

  /** A message of the crowd's records (packages/shared/src/crowd.ts): who is out there beyond the avatars. */
  setCrowd(bytes: ArrayBuffer | Uint8Array): void { this.crowd.setRecords(bytes); }

  updateState(world: SceneWorld, localId: string): void {
    this.localId = localId;
    this.modelSlots = new Set((world.players ?? []).map(player => player.slot ?? 0).filter(Boolean));
    if (!world.players?.length) {this.crowd.clear();this.fireworks.clear();}
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
          const previous = existing.actor;
          // The local position comes from prediction (updateLocal), not from the server snapshot.
          existing.actor = local ? { ...actor, x: existing.actor.x, y: existing.actor.y, z: existing.actor.z } : { ...actor };
          if (!local && (actor.animation ?? '').startsWith('fly')) {
            // A speed only from one flying patch to the next: the take-off's jump is not one, and a patch that did not move is a flier holding
            // still (the last speed kept being carried forward, drawing a hovering flier up to 1.8 m off).
            if (moved && (previous.animation ?? '').startsWith('fly')) this.trackFlight(existing, actor, previous);
            else { existing.flyV?.set(0, 0, 0); existing.flyAt = this.elapsed; }
          } else if (moved && !local) this.glideTo(existing, PATCH_GLIDE);
          existing.ring.enabled = false;
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
    const before = avatar.actor;
    avatar.actor = { ...avatar.actor, ...position };
    // In flight the drawn body is moved every frame (animateAvatar), not glided from tick to tick.
    if ((avatar.actor.animation ?? '').startsWith('fly')) { if (moved && avatar.actor.animation === 'fly-fall') this.trackFlight(avatar, avatar.actor, before); }
    else if (moved) this.glideTo(avatar, INPUT_GLIDE);
    if (position.rotation !== undefined) this.lastRotation = position.rotation;
  }

  /** A flier's velocity from the position that just arrived against the last one (`from`: the avatar's own, unless given). */
  private trackFlight(avatar: Avatar, to: Position, from: Position = avatar.actor): void {
    const dt = clamp(this.elapsed - (avatar.flyAt ?? this.elapsed - .1), .03, .3);
    (avatar.flyV ??= new pc.Vec3()).set((to.x - from.x) / dt, ((to.y ?? 0) - (from.y ?? 0)) / dt, (to.z - from.z) / dt);
    avatar.flyAt = this.elapsed;
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

  /** The entry's backdrop on or off: the bar drawn from the showcase angles (engine/showcase.ts) while the room is empty. */
  setShowcase(on: boolean): void {
    this.showcaseOn = on;
    this.showcaseSlow = 0;
    this.app.autoRender = this.enabled || on;
    this.app.renderNextFrame = true;
    if (!on && this.showcaseCut) { this.showcaseCut = 0; this.callbacks.onShowcaseCut?.(0); }
  }

  /** Dev only: holds the backdrop on a pose (for choosing the angles); undefined goes back to the shots. */
  debugShowcase(pose?: { position: [number, number, number]; target: [number, number, number]; fov: number }): void {
    this.debugPose = pose && { ...pose, cut: 0 };
  }

  private showcaseCamera(dt: number, realDt: number): void {
    const pose = this.debugPose ?? this.showcase.advance(dt);
    this.camera.setPosition(pose.position[0], pose.position[1], pose.position[2]);
    this.camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
    if (this.camera.camera) this.camera.camera.fov = pose.fov;
    const cut = Math.round(pose.cut * 50) / 50;
    if (cut !== this.showcaseCut) { this.showcaseCut = cut; this.callbacks.onShowcaseCut?.(cut); }
    // A backdrop is not worth a stutter: below about 15 FPS for five seconds it switches itself off.
    this.showcaseSlow = realDt > .067 ? this.showcaseSlow + realDt : Math.max(0, this.showcaseSlow - realDt);
    if (this.showcaseSlow > 5) { this.setShowcase(false); this.callbacks.onShowcaseSlow?.(); }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.footstepSounds.setActive(enabled);
    this.environment.setActive(enabled);
    // A headset needs a frame every time it asks, windows open or not.
    this.app.autoRender = enabled || this.showcaseOn || this.vr.active;
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
      const labelY=isRidingHorse(avatar.actor.interactionState)&&avatar.skin?avatar.skin.bones.head.getPosition().y+.35:p.y+LABEL_HEIGHT;
      this.tempPosition.set(p.x-eye.x,labelY-eye.y,p.z-eye.z);
      if (this.tempPosition.dot(forward) <= 0 || this.tempPosition.lengthSq() > 400) continue;
      this.tempPosition.set(p.x,labelY,p.z);
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

  private performanceObserver:((frame:RenderPerformance|null)=>void)|undefined;
  private updateProfiler=new UpdateProfiler();
  private previousGpuProfiling=false;
  setPerformanceObserver(observer:((frame:RenderPerformance|null)=>void)|undefined):void {
    const profiler=this.app.graphicsDevice.gpuProfiler;
    if(observer&&!this.performanceObserver){this.previousGpuProfiling=profiler?.enabled??false;if(profiler)profiler.enabled=true;}
    if(!observer&&this.performanceObserver&&profiler)profiler.enabled=this.previousGpuProfiling;
    this.performanceObserver=observer;
    this.updateProfiler.enabled=!!observer;
  }
  getDiagnosticInventory(){
    return collectSceneInventory(this.app,[...this.actors.values()].map(a=>({root:a.root,model:a.skin?.model,skin:a.skinId,clip:a.skin?.clip,resting:!!a.resting,npc:a.npc,local:a.actor.id===this.localId})));
  }
  getDiagnosticContext(){
    const eye=this.camera.getPosition(),focus=this.actors.get(this.localId)?.root.getPosition();
    return {actors:this.getPerformance(),camera:{mode:this.rig.mode,position:[eye.x,eye.y,eye.z],fov:this.camera.camera?.fov,farClip:this.camera.camera?.farClip},
      position:focus?[focus.x,focus.y,focus.z]:null,scale:this.scale,width:this.app.graphicsDevice.width,height:this.app.graphicsDevice.height,
      streaming:this.city?.telemetry()??null,compiling:this.compilingLastFrame,graphics:this.getGraphics(),
      resources:{assets:this.app.assets.list().length,textures:this.app.graphicsDevice.textures.size,vram:this.app.stats.vramTotalBytes,textureVram:this.app.stats.vramTextureBytes,
        skinModels:this.skinModels.size,animationBanks:this.animationBanks.size,danceBanks:this.danceBanks.size,propModels:this.propModels.size,televisions:this.televisions.size}};
  }
  getPerformance(): { fps: number; actors: number; resting: number } {
    let resting = 0;for (const avatar of this.actors.values()) if (avatar.resting) resting++;
    return { fps: this.fps, actors: this.actors.size, resting };
  }

  getAnimations(): Array<{ id: string; facing:number; look?:{yaw:number;pitch:number;bone:number[]}; skin?: string; clip?: string; time?: number; height?: number; speed?:number; bar?:{clip:string;time:number;placed:boolean;root:number[]}; drink?:{item:string;sip:number}; cards?:number; tray?:{items:number;onTray:number}; cane?:{enabled:boolean;parent?:string;renders:number}; musician?:{spot:string;phase?:string;root:number[];hip?:number[]}; tracks: string[] }> {
    const now=this.serverNow(),point=(p:pc.Vec3)=>[+p.x.toFixed(3),+p.y.toFixed(3),+p.z.toFixed(3)];
    return [...this.actors].map(([id, avatar]) => ({ id, facing:avatar.yaw/RAD_TO_DEG, skin: avatar.skinId, clip: avatar.skin?.clip,
      look:avatar.headLook?{yaw:avatar.headLook.yaw,pitch:avatar.headLook.pitch,bone:(()=>{const q=(avatar.skin?.bones.head??avatar.limbs!.head).getLocalRotation();return [q.x,q.y,q.z,q.w];})()}:undefined,
      bar:avatar.bar?{clip:avatar.bar.clip,time:+avatar.bar.time.toFixed(3),placed:!!avatar.bar.frame,root:point(avatar.root.getPosition())}:undefined,
      musician:avatar.actor.musician?{spot:avatar.actor.musician.id,phase:musicianPhase(avatar.actor.musician,now)?.phase,root:point(avatar.root.getPosition()),
        hip:avatar.skin?point((avatar.skin.model.findByName('hip') as pc.Entity|null)?.getPosition()??avatar.root.getPosition()):undefined}:undefined,
      height: avatar.skin ? avatar.skin.bones.head.getPosition().y - avatar.root.getPosition().y : undefined,
      time: avatar.skin?.model.anim?.baseLayer?.activeStateCurrentTime, tracks: [...(avatar.skin?.tracks ?? [])],
      speed:avatar.skin?.model.anim?.speed,drink:Object.entries(avatar.drinks??{}).filter(([,e])=>e.enabled).map(([item])=>({item,sip:+(avatar.sip??0).toFixed(3)}))[0],cards:avatar.cards?.enabled?avatar.cards.children.filter(card=>card.enabled).length:undefined,tray:avatar.tray?.entity.enabled?{items:avatar.tray.items.length,onTray:avatar.tray.items.filter(item=>item.enabled).length}:undefined,cane:avatar.skin?.cane?{enabled:avatar.skin.cane.enabled,parent:avatar.skin.cane.parent?.name,renders:avatar.skin.cane.findComponents('render').length}:undefined }));
  }

  destroy(): void {
    this.fireworks.destroy();
    this.footstepSounds.destroy();
    if (this.destroyed) return;
    this.destroyed = true;
    this.televisions.forEach(tv=>tv.destroy());this.televisions.clear();
    this.morte?.destroy();this.morte=undefined;
    this.damageNumbers.destroy();
    this.fuelProps.destroy();this.motos.destroy();this.speedBlur.destroy();this.blowSounds.destroy();this.flySounds.destroy();this.blowEffects.destroy();this.smokeBurst.destroy();this.cigarettes.destroy();this.crossedArms.destroy();this.crowd.destroy();this.horseSounds.destroy();
    this.mapEffects?.destroy();this.mapEffects=undefined;
    this.surfaces?.destroy();this.surfaces=undefined;
    this.objective?.marker.destroy();this.objective=undefined;
    this.stageBlips.forEach(blip=>blip.marker.destroy());this.stageBlips.clear();
    this.foodBase?.marker.destroy();this.foodBase=undefined;
    for(const ring of this.garageRings??[])ring.marker.destroy();this.garageRings=undefined;
    this.musicians?.destroy();this.musicians=undefined;
    this.barAnimations?.destroy();this.barAnimations=undefined;
    this.foosballBalls.destroy();
    this.poolBalls.destroy();
    this.city?.destroy();
    this.environment.destroy();
    this.resizeObserver.disconnect();
    this.cleanup.forEach(cleanup => cleanup());
    this.app.off('update', this.update, this);
    this.app.off('frameupdate',this.restoreHeadLooks,this);
    this.materials.forEach(material => material.destroy());
    this.contactMaterial?.destroy();
    this.dressing?.destroy();
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
    // The attendant uses its embedded Idle/Walk/Pose; FuelProps poses the nozzle and both arms.
    if(id!=='frentista'){this.loadAnimations(id);this.loadCane(id);}
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
    return !npc || actor.id === 'dealer' || !!NPC_SKINS[actor.id] || !!actor.skin;
  }

  private loadAnimations(id: string): void {
    if(id==='tiao')this.loadHorse();
    if (this.animationRequests.has(id)) return;
    this.animationRequests.add(id);
    // The dances (several MB) follow the actions, so they never hold up the avatar's walk and idle.
    this.loadBank(id, id, this.animationBanks, () => this.loadBank(id, `${id}-dances`, this.danceBanks, bank => {
      this.dances = bank.animations.map(asset => (asset.resource as pc.AnimTrack).name).sort();
    }));
  }

  private loadBank(id: string, file: string, banks: Map<string, pc.ContainerResource>, loaded?: (bank: pc.ContainerResource) => void): void {
    this.app.assets.loadFromUrl(skinAsset('animations', file, id), 'container', (error, asset) => {
      if (this.destroyed) return;
      if (error || !asset) { console.warn(`Animações ${file} indisponíveis.`, error); return; }
      const bank = asset.resource as pc.ContainerResource;
      banks.set(id, bank);
      for (const avatar of this.actors.values()) {
        if (avatar.skin && avatar.skinId === id) this.assignClips(avatar.skin, bank);
      }
      loaded?.(bank);
    });
  }

  private assignClips(skin: SkinnedRig, bank: pc.ContainerResource): void {
    const tracks=bank.animations.map(asset=>asset.resource as pc.AnimTrack);
    assignAnimationClips(skin.model.anim!,tracks.map(track=>({name:track.name,track,
      loop:!['Kick', 'Drink', 'Fallen', 'Shuffle', 'Bartend', 'Wave', 'Use', 'Recover', 'Thank', 'Pick','Order', 'Jab', 'Cross', 'Hook', 'Heavy', ...Object.keys(HIT_REACTIONS)].includes(track.name)})));
    for (const track of tracks) {
      skin.tracks.add(track.name);
      if (track.name === 'Drink') this.addHandLayer(skin, track);
      if (track.name === 'Order') this.addOrderLayer(skin,track);
      if (track.name === 'FightIdle') this.addGuardLayer(skin,track);
    }
  }

  /**
   * The hand layer: the Drink clip, looping, on the left arm (from the shoulder) and the neck only. The mask names those
   * joints by the paths the clip's own curves use, since each skin keeps its own rig.
   */
  private addHandLayer(skin: SkinnedRig, track: pc.AnimTrack): void {
    const anim = skin.model.anim!;
    if (skin.handLayer || anim.findAnimationLayer(HAND_LAYER)) return;
    const paths = track.curves.flatMap(curve => curve.paths.map(path => path.entityPath));
    const pathOf = (...nodes: (pc.GraphNode | null | undefined)[]) => nodes.map(node => node && paths.find(path => path.at(-1) === node.name)).find(path => !!path);
    const mask: Record<string, { children: boolean }> = {};
    for (const path of [pathOf(skin.bones.upperarm_l.parent, skin.bones.upperarm_l), pathOf(skin.bones.head.parent, skin.bones.head)])
      if (path) mask[path.join('/')] = { children: true };
    if (!Object.keys(mask).length) return;
    // The typings declare an array; the binder reads an object keyed by path.
    skin.handLayer = anim.addLayer(HAND_LAYER, 0, mask as unknown as object[], pc.ANIM_LAYER_OVERWRITE);
    assignAnimationClips(anim,[{name:'Drink',track,layer:HAND_LAYER}]);
  }

  /**
   * The guard over the steps (docs/sistemas/luta.md): FightIdle, looping, on both arms from the collarbones down. The legs' clips (strafes, walking
   * back) were taken with the arms anywhere; this keeps the fists up whichever way the fighter steps.
   */
  private addGuardLayer(skin:SkinnedRig,track:pc.AnimTrack):void {
    const anim=skin.model.anim!;if(skin.guardLayer||anim.findAnimationLayer(GUARD_LAYER))return;
    const paths=track.curves.flatMap(c=>c.paths.map(p=>p.entityPath)),mask:Record<string,{children:boolean}>={};
    for(const node of [skin.bones.upperarm_l.parent,skin.bones.upperarm_r.parent]){
      const path=paths.find(p=>p.at(-1)===node?.name);if(path)mask[path.join('/')]={children:true};
    }
    if(!Object.keys(mask).length)return;
    skin.guardLayer=anim.addLayer(GUARD_LAYER,0,mask as unknown as object[],pc.ANIM_LAYER_OVERWRITE);
    assignAnimationClips(anim,[{name:'FightIdle',track,layer:GUARD_LAYER}]);
  }

  /** Acknowledging once, masked above the shoulders, over the normal planted idle. */
  private addOrderLayer(skin:SkinnedRig,track:pc.AnimTrack):void {
    const anim=skin.model.anim!;if(skin.orderLayer)return;
    const paths=track.curves.flatMap(c=>c.paths.map(p=>p.entityPath)),mask:Record<string,{children:boolean}>={};
    for(const node of [skin.bones.head.parent,skin.bones.upperarm_r.parent]){
      const path=paths.find(p=>p.at(-1)===node?.name);if(path)mask[path.join('/') ]={children:true};
    }
    if(!Object.keys(mask).length)return;
    skin.orderLayer=anim.addLayer('Order',0,mask as unknown as object[],pc.ANIM_LAYER_OVERWRITE);
    assignAnimationClips(anim,[{name:'Order',track,layer:'Order',loop:false}]);
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
    const wanted=npc ? NPC_SKINS[actor.id]??(actor.skin && (SKIN_IDS.has(actor.skin)||NPC_MODEL_IDS.has(actor.skin)) ? actor.skin : DEFAULT_MODEL) : actor.skin && SKIN_IDS.has(actor.skin) ? actor.skin : DEFAULT_SKIN;
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
    const tracks = model.animations.map(asset => completeBasePose(asset.resource as pc.AnimTrack,entity));
    // The first clip assigned becomes the default state.
    assignAnimationClips(entity.anim!,['Idle', 'Walk', 'Pose'].flatMap(name=>{
      const track = tracks.find(candidate => candidate.name === name);
      return track?[{name,track}]:[];
    }));
    const bones = Object.fromEntries(SKIN_BONES.map(name => [name, entity.findByName(name) ?? entity.findByName(BONE_ALIASES[name] ?? name)])) as Record<SkinBone, pc.Entity>;
    // Measured in the bind pose, before any clip runs; the thighs are level at about 0.56 m when seated.
    const hipHeight = bones.upperleg_l.getPosition().y - entity.getPosition().y;
    // No clip yet: the first pose is applied without a cross-fade (e.g. a skin swap while seated).
    const skin: SkinnedRig = { model: entity, bones, clip: '', tracks: new Set(tracks.map(track => track.name)), sitDrop: hipHeight - 0.56 };
    const legLength=bones.upperleg_l.getPosition().distance(bones.lowerleg_l.getPosition())+bones.lowerleg_l.getPosition().distance(bones.foot_l.getPosition());
    // The cane gait plays at 1× on 0.8876 m legs (the body it was fitted to); other legs scale its rate.
    skin.oldCaneRate=.88758844/legLength;
    const id = [...this.skinModels].find(([, resource]) => resource === model)?.[0];
    for (const banks of [this.animationBanks, this.danceBanks]) {
      const bank = banks.get(id ?? DEFAULT_MODEL);
      if (bank) this.assignClips(skin, bank);
    }
    if(id)this.attachCane(skin,id);
    skin.headBind=entity.getRotation().clone().invert().mul(bones.head.getRotation());
    skin.drinkHand=findHand(entity,'l');
    skin.rightHand=findHand(entity,'r');
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
      if(actor.id.startsWith('attendant-')){
        const elbow=this.group('Fuel elbow',[0,-.32,0],arm);
        this.box('Forearm',[0,-.14,0],[.18,.28,.2],skin,elbow);
        this.box('Hand',[0,-.28,.015],[.19,.15,.2],skin,elbow);continue;
      }
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
    // Taken by the Morte: not drawn while the room says so, and it comes back without gliding across the map.
    if (actor.interactionState === DEATH_GONE_STATE) {
      if (!avatar.deathHidden) { avatar.deathHidden = true; root.enabled = false; }
      avatar.ragdoll = undefined; avatar.body.setLocalPosition(0, 0, 0); avatar.body.setLocalScale(1, 1, 1);
      root.setPosition(actor.x, actor.y ?? 0, actor.z); glideFrom.set(actor.x, actor.y ?? 0, actor.z); avatar.glideAt = this.elapsed; return;
    }
    if (avatar.deathHidden) { avatar.deathHidden = false; root.enabled = true; glideFrom.set(actor.x, actor.y ?? 0, actor.z); avatar.glideAt = this.elapsed; }
    const local = actor.id === this.localId;
    const current = root.getPosition();
    const moving = Math.hypot(actor.x - current.x, actor.z - current.z) > 0.025;
    const progress = clamp((this.elapsed - avatar.glideAt) / avatar.glide, 0, 1);
    if ((actor.animation ?? '').startsWith('fly')) {
      // A flier moves at speeds the ticks and patches (20 and 10 a second) would draw in jumps: from the last position it
      // carries on at its velocity, for at most a tick or a patch, and the body eases towards that point on the frame's time.
      const ownKeys = local && actor.animation !== 'fly-fall', v = ownKeys ? this.localFlyV : avatar.flyV, age = clamp(this.elapsed - (ownKeys ? this.localFlyAt : avatar.flyAt ?? -99), 0, ownKeys ? .06 : .12);
      // Taking off (fly-pose.ts): the feet push from where they stand and the body rises with the push, not with the room's jump.
      const fly = avatar.fly ??= new FlyPose(true);
      fly.takeoff(current.y);
      const tx = actor.x + (v ? v.x * age : 0), tz = actor.z + (v ? v.z * age : 0), ty = fly.liftY((actor.y ?? 0) + (v ? (v.y > 0 ? v.y * age : Math.max(v.y * age, -.15)) : 0));
      if (Math.hypot(tx - current.x, ty - current.y, tz - current.z) > 12) root.setPosition(tx, ty, tz);
      else { const k = 1 - Math.exp(-dt / .05); root.setPosition(current.x + (tx - current.x) * k, current.y + (ty - current.y) * k, current.z + (tz - current.z) * k); }
      glideFrom.copy(root.getPosition()); avatar.glideAt = this.elapsed;
    } else {
      // A punch's or kick's own step (root motion) goes on the clip's clock, from where the newest state put the body: gliding a patch behind slid the feet.
      const carried = this.carriedOffset(avatar, local);
      if (carried) { root.setPosition(actor.x + carried.x, actor.y ?? 0, actor.z + carried.z); glideFrom.copy(root.getPosition()); avatar.glideAt = this.elapsed; }
      else root.setPosition(lerp(glideFrom.x,actor.x,progress),lerp(glideFrom.y,actor.y??0,progress),lerp(glideFrom.z,actor.z,progress));
    }
    const drawn = root.getPosition(), last = avatar.lastDrawn ??= drawn.clone();
    // The way the body moves, smoothed: the guard's steps are chosen against where it faces (guardStep).
    const velocity = avatar.velocity ??= new pc.Vec3(), smoothing = 1 - Math.exp(-dt / .1), frame = Math.max(dt, 1e-3);
    velocity.x += ((drawn.x - last.x) / frame - velocity.x) * smoothing; velocity.z += ((drawn.z - last.z) / frame - velocity.z) * smoothing;
    // Up and down too: how hard a flier lands (fly-pose.ts).
    velocity.y += ((drawn.y - last.y) / frame - velocity.y) * smoothing;
    avatar.speed = lerp(avatar.speed ?? 0, Math.min(isRidingHorse(actor.interactionState)?HORSE.fastSpeed:(actor.animation??'').startsWith('fly')?FLY.boost+4:8, Math.hypot(drawn.x - last.x, drawn.z - last.z) / Math.max(dt, 1e-3)), 1 - Math.exp(-dt / .15));
    last.copy(drawn);
    // A bar animation (sitting at a table, the urinal, a cigarette, Magrão at the counter...): undefined while its clip loads.
    const bar = avatar.skin ? this.barAction(avatar, this.serverNow()) : undefined;
    if (avatar.bar && !bar) this.leaveBarAction(avatar);
    let animation = (actor.animation ?? actor.state ?? 'idle').toLowerCase();
    if (moving && animation === 'idle') animation = 'walk';
    const seated = animation.includes('sit') || animation.includes('seat') || animation.includes('blackjack');
    // The local player faces the predicted travel direction; the server's lags behind it.
    // Seats, stage spots and the bar animations set the facing on the server, so the player keeps that one meanwhile.
    if (local && (seated || actor.musician || animation === 'kick' || (bar && actor.interactionState))) this.lastRotation = actor.rotation ?? this.lastRotation;
    const rotation = (local ? this.lastRotation : actor.rotation ?? 0) * RAD_TO_DEG;
    const turn = ((rotation - avatar.yaw + 540) % 360) - 180;
    avatar.yaw = ((avatar.yaw + turn * (1 - Math.exp(-16 * dt)) + 540) % 360) - 180;
    if (bar) this.enterBarAction(avatar, bar);
    // Skinned avatars have dedicated drunk clips; the procedural sway remains as fallback for box avatars.
    const stage=drunkStage(actor.drunk??0),dedicatedDrunk=!!avatar.skin?.tracks.has('DrunkIdle')&&stage>=2;
    const sway = ['fallen','recover','stumble'].includes(actor.animation??'') || seated || actor.musician || bar || dedicatedDrunk ? 0 : DRUNK_BODY_SWAY[stage]!;
    root.setEulerAngles(sway * Math.sin((this.elapsed + avatar.phase) * 1.3), avatar.yaw, sway * Math.sin((this.elapsed + avatar.phase) * 0.9 + 1));
    this.shadeFeet(avatar);
    // Out of sight and away from the camera, the body holds its pose: its clips are neither evaluated nor posed (offstage).
    const resting = !local && !bar && !!avatar.skin && this.offstage(avatar);
    const anim = avatar.skin?.model.anim;
    if (anim && anim.playing === resting) anim.playing = !resting;
    avatar.resting = resting;
    if(avatar.firework&&!actor.fireworkEquipped)avatar.firework.enabled=false;
    if (resting) return;
    const pose: Pose = {
      t: this.elapsed + avatar.phase, dt,
      walking: animation.includes('walk') || animation.includes('run') || animation.includes('wander'),
      running: animation.includes('run'),
      seated: avatar.seatedBlend = lerp(avatar.seatedBlend ?? 0, seated ? 1 : 0, 1 - Math.exp(-12 * dt)),
      dancing: !bar && (animation.includes('dance') || (avatar.npc && actor.role!=='fuel-service' && this.eventType === 'PARTY')),
      drinking: !bar && (animation.includes('drink') || (avatar.npc && animation.includes('drunk'))),
      waving: animation.includes('wave'),
    };
    avatar.cup.enabled = pose.drinking;
    if (!pose.drinking) for (const entity of Object.values(avatar.drinks ?? {})) entity.enabled = false;
    if(avatar.cards)avatar.cards.enabled=false;
    if (avatar.skin) this.poseSkin(avatar, avatar.skin, pose, bar);
    else if (avatar.limbs) this.poseLimbs(avatar, avatar.limbs, pose);
    // Flight: the whole body leans about the hips and floats; the limbs follow after the clip (applyHeadLooks).
    const fly = avatar.fly ??= new FlyPose();
    fly.update(animation.startsWith('fly'), avatar.speed ?? 0, dt, animation === 'fly-fall', -velocity.y);
    if (local) {
      this.flyShare = fly.dash; this.flySounds.update(fly.air, fly.dash);
      // The barrier: once per dash, when the speed passes what walking in the air reaches; it re-arms when the flier slows down.
      const pace = avatar.speed ?? 0;
      if (pace < FLY.speed + 1) this.boomArmed = true;
      else if (this.boomArmed && pace > FLY.speed + 6 && fly.air > .9) {
        this.boomArmed = false; this.boomAt = this.elapsed; this.flySounds.boom();
        const at = root.getPosition(); this.blowEffects.shock({ x: at.x, y: at.y + 1, z: at.z }, 11);
      }
    }
    if (fly.posed) {
      const lean = fly.lean * Math.PI / 180, hips = .95, bob = Math.sin((this.elapsed + avatar.phase) * 2.2) * .05 * fly.air * (1 - fly.dash);
      // A slow roll and nod, bigger the faster it goes: the body rides the air instead of being carried.
      const sway = (this.elapsed + avatar.phase) * 1.3, roll = Math.sin(sway) * (1.2 + 2.6 * fly.dash) * fly.air, nod = Math.sin(sway * .73 + 1) * (.8 + 1.4 * fly.dash) * fly.air;
      avatar.body.setLocalEulerAngles(fly.lean + nod, 0, roll);
      avatar.body.setLocalPosition(0, hips * (1 - Math.cos(lean)) + bob - fly.drop, -hips * Math.sin(lean));
    }
    if (bar && avatar.skin && avatar.bar) {
      this.barAnimations!.play(actor.id, bar.step, { space: avatar.bar.space, model: avatar.skin.model, skin: avatar.skinId!, servedFood: bar.servedFood, seat: bar.seat }, dt);
      this.barPlayed.add(actor.id);
      // The contact shadow stays under the body, which the clip may take away from the place's origin.
      const hip = avatar.skin.hip ??= (avatar.skin.model.findByName('hip') as pc.Entity | null) ?? undefined, p = hip?.getPosition();
      if (p) avatar.contact.setPosition(p.x, root.getPosition().y + .012, p.z);
    } else avatar.contact.setLocalPosition(0, .012, 0);
    // Tonico serving or clearing, and a player working the bar with an order on the tray (Magrão's hands are in his clips).
    if (avatar.skin && !bar && (avatar.npc ? actor.role === 'serving' && actor.id !== 'bartender' : !!actor.carrying)) this.carryTray(avatar, avatar.skin, this.serverNow());
    else if (avatar.tray) avatar.tray.entity.enabled = false;
    if (avatar.skin) this.dressCourier(avatar, avatar.skin, !!bar); else if (avatar.parcelProp || avatar.packProp) this.dressCourier(avatar, undefined, true);
    this.dressFirework(avatar);
    if(actor.id.startsWith('attendant-')){
      const bones=avatar.skin?.bones,hand=bones?.hand_r??avatar.limbs?.rightArm.findByName('Hand') as pc.Entity|undefined;
      const upper=bones?.upperarm_r??avatar.limbs?.rightArm;
      const lower=bones?.lowerarm_r??avatar.limbs?.rightArm.findByName('Fuel elbow') as pc.Entity|undefined;
      const torso=avatar.skin?.model.findByName('spine_01') as pc.Entity|undefined;
      const legs=bones?[{upper:bones.upperleg_l,lower:bones.lowerleg_l,foot:bones.foot_l},{upper:bones.upperleg_r,lower:bones.lowerleg_r,foot:bones.foot_r}]:undefined;
      if(hand&&upper)this.fuelProps.pose(actor.id,{upper,lower,hand,grip:avatar.skin?.rightHand,root,body:avatar.body,torso,legs},this.serverNow());
    }
  }

  /** The bag in hand (a courier's on the way to the door, a customer's once it is theirs) and the backpack on a courier on foot. */
  private dressCourier(avatar: Avatar, skin: SkinnedRig | undefined, busy: boolean): void {
    const { actor, body } = avatar, moving = actor.animation === 'ragdoll' || actor.animation === 'ride' || actor.animation === 'sit';
    const holding = !!skin && !busy && !moving && actor.parcel === 'bag', wearing = !!skin && !busy && !moving && !!actor.courier;
    const texting = !!skin && !busy && (actor.animation === 'text' || (actor.animation === 'idle' && !!actor.looking)) && !this.selfieOf(avatar);
    if (avatar.phoneProp) avatar.phoneProp.enabled = texting;
    if (!holding && !wearing && !texting) { if (avatar.parcelProp) avatar.parcelProp.enabled = false; if (avatar.packProp) avatar.packProp.enabled = false; return; }
    this.highfoodProps ??= new HighfoodProps(this.app, this.materials);
    const front = body.forward.clone().mulScalar(-1), side = body.right.clone(), up = pc.Vec3.UP; front.y = 0; front.normalize(); side.y = 0; side.normalize();
    if (texting) {
      const hand = skin!.bones.hand_r, phone = avatar.phoneProp ??= (() => { const made = this.highfoodProps!.phone(); this.app.root.addChild(made); return made; })();
      // Flat in the palm, its screen up towards the face (the skins' hand bones do not share axes, so it follows the body).
      phone.setPosition(hand.getPosition().clone().add(front.clone().mulScalar(.03)).add(up.clone().mulScalar(.02))); phone.setEulerAngles(-52, avatar.yaw, 0); phone.enabled = true;
    }
    if (avatar.parcelProp) avatar.parcelProp.enabled = holding;
    if (holding) {
      const bones = skin!.bones, bag = avatar.parcelProp ??= (() => { const made = this.highfoodProps!.bag(); this.app.root.addChild(made); return made; })();
      // A customer waves with the other hand; the arm hangs a little forward, away from the leg.
      const right = !avatar.npc, upper = right ? bones.upperarm_r : bones.upperarm_l, lower = right ? bones.lowerarm_r : bones.lowerarm_l, hand = right ? bones.hand_r : bones.hand_l, out = right ? 1 : -1;
      const wrist = upper.getPosition().clone().add(front.clone().mulScalar(.2)).sub(up.clone().mulScalar(.5)).add(side.clone().mulScalar(out * .06));
      reach(upper, lower, hand, wrist, new pc.Vec3().sub(front).add(side.clone().mulScalar(out * .5)));
      bag.setPosition(hand.getPosition().clone().sub(up.clone().mulScalar(.06))); bag.setEulerAngles(0, avatar.yaw, 0); bag.enabled = true;
    }
    if (avatar.packProp) avatar.packProp.enabled = wearing;
    if (wearing) {
      const pack = avatar.packProp ??= (() => { const made = this.highfoodProps!.backpack(); this.app.root.addChild(made); return made; })();
      avatar.spine ??= (skin!.model.findByName('spine_02') as pc.Entity | null) ?? null;
      const at = (avatar.spine ?? skin!.bones.upperarm_r).getPosition().clone().sub(front.clone().mulScalar(.12)).add(up.clone().mulScalar(.08));
      pack.setPosition(at); pack.setEulerAngles(0, avatar.yaw, 0); pack.enabled = true;
    }
  }

  private dressFirework(avatar:Avatar):void {
    const actor=avatar.actor,bones=avatar.skin?.bones;
    const visible=!!actor.fireworkEquipped&&!actor.interactionState&&!actor.currentTableId&&!avatar.ragdoll&&!avatar.bar;
    if(!visible){if(avatar.firework)avatar.firework.enabled=false;return;}
    const prop=avatar.firework??=this.fireworks.makeProp(avatar.root);prop.enabled=true;
    if(avatar.skin?.cane)avatar.skin.cane.enabled=false;
    const yaw=(actor.rotation??0)+(actor.headYaw??0),pitch=actor.headPitch??0;
    const direction=actor.id===this.localId?this.fireworkDirection():new pc.Vec3(Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    const origin=fireworkOrigin(avatar.root.getPosition(),actor.id===this.localId?this.lastRotation:actor.rotation??0);
    const target=new pc.Vec3(origin.x,origin.y,origin.z);
    if(bones){
      reach(bones.upperarm_r,bones.lowerarm_r,bones.hand_r,target,new pc.Vec3(0,-1,0));
      const hand=avatar.skin?.rightHand;
      if(hand){
        aim(hand.hand,handFrame(hand).across,direction);
        closeHand(hand,[42,55,28]);
        const frame=handFrame(hand),grip=frame.origin.clone().add(frame.fingers.clone().mulScalar(frame.length*.55)).add(frame.palm.clone().mulScalar(.04));
        prop.setPosition(grip.sub(direction.clone().mulScalar(.06)));
      }else prop.setPosition(bones.hand_r.getPosition());
    }else prop.setPosition(target);
    prop.setRotation(new pc.Quat().setFromDirections(pc.Vec3.UP,direction));
  }

  /**
   * The bar clip an avatar plays now (barTimeline, from the room's state or a debug run), converted for its skin and
   * added to its anim states; undefined when none applies or while the clip's file loads.
   */
  private barAction(avatar: Avatar, now: number): BarAction | undefined {
    const skin = avatar.skin!, model = avatar.skinId ? this.skinModels.get(avatar.skinId) : undefined;
    if (!this.barAnimations || !model) return;
    const override = this.barOverrides.get(avatar.actor.id);
    // The room's own animationState comes along with the actor and barTimeline reads it first: the debug run replaces both.
    const actor = override ? { ...avatar.actor, animation: override.animation, animationState: override.animation, animationStartedAt: override.startedAt, interactionState: override.interactionState ?? '', currentTableId: '',
      x: override.x ?? avatar.actor.x, y: override.y ?? avatar.actor.y, z: override.z ?? avatar.actor.z } : avatar.actor;
    const npcId = avatar.npc ? actor.id : '', meal = override ? override.meal : this.meal(actor.interactionState ?? '', now);
    const step = barTimeline(actor, now, npcId, meal);
    if (!step) return;
    // A debug run that has played its last clip gives the avatar back to the room.
    if (override && FINAL_CLIPS.has(step.clip) && now - step.startedAt > barClipMs(step.clip) + 150) { this.barOverrides.delete(actor.id); return; }
    // Keep the authored chair/meal timeline and props, but use Mixamo for the neutral seated body.
    // Sitting down, getting up and eating still need their exact contacts with the map's objects.
    const body = step.clip === 'sentado_loop' && skin.tracks.has('Sit') ? 'Sit' : undefined;
    if (!body) {
      const track = this.barAnimations.bodyTrack(step.clip, avatar.skinId!, skin.model, model.animations.map(asset => asset.resource as pc.AnimTrack));
      if (!track) return;
      if (!skin.tracks.has(track.name)) { assignAnimationClips(skin.model.anim!,[{name:track.name,track,loop:BAR_ANIMATIONS.clips[step.clip].loop}]); skin.tracks.add(track.name); }
    } else this.barAnimations.preload(step.clip);
    const place = actor.interactionState ?? '';
    return { step, body, frame: barFrame(actor, npcId), seat: place.startsWith('seat-') ? place : undefined, servedFood: !override && !!meal };
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
    // Asked for from the first lighting update, in the constructor, before the bikes exist.
    const motos = this.motos as Motos | undefined;
    if (motos) yield* motos.casters();
  }

  /**
   * People far from the camera cast no shadow. Past about 12 m a person's shadow is a few pixels, while every caster is
   * drawn again by each lamp map and sun cascade that reaches it. The change is checked every fourth frame, with a margin
   * so a person on the edge does not flicker in and out; only the meshes this turned off are turned back on.
   */
  private updateAvatarShadows(): void {
    const eye = this.camera.getPosition();
    for (const avatar of this.actors.values()) {
      const p = avatar.root.getPosition();
      const distance = Math.hypot(p.x - eye.x, p.z - eye.z);
      const off = this.shadowlessAvatars.get(avatar);
      if (!off && distance > AVATAR_SHADOW_RANGE) {
        const turned: pc.MeshInstance[] = [];
        for (const render of avatar.root.findComponents('render') as pc.RenderComponent[])
          for (const instance of render.meshInstances) if (instance.castShadow) { instance.castShadow = false; turned.push(instance); }
        this.shadowlessAvatars.set(avatar, turned);
      } else if (off && distance < AVATAR_SHADOW_RANGE - AVATAR_SHADOW_MARGIN) {
        for (const instance of off) instance.castShadow = true;
        this.shadowlessAvatars.delete(avatar);
      }
    }
  }
  private readonly shadowlessAvatars = new WeakMap<Avatar, pc.MeshInstance[]>();

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
    openHand(hand);
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
    if (actor.animation === 'fallen' || actor.animation === 'ragdoll') { body.setLocalPosition(0, 0.22, 0); body.setLocalEulerAngles(-88, 0, 0); }
  }

  /** The dance clip for a dance number (the room's draw, or an NPC's phase); '' until a dance bank has arrived. */
  private danceClip(dance: number): string {
    return this.dances.length ? this.dances[dance % this.dances.length]! : '';
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
    const action = isRidingHorse(actor.interactionState) ? 'ride' : actor.animation;
    const ordering=action==='wait'&&!!actor.drinkItem;
    const stage=drunkStage(actor.drunk??0);
    // On a stage spot: the musician's clip of the phase, once converted for this skin (meanwhile the avatar idles there).
    const show=bar?undefined:this.musicianClip(avatar,skin);
    // Object-specific bar actions keep their choreography; generic bodies come from the per-skin Mixamo bank.
    // The fist fight (fightClip): a punch, a blow taken, the guard and its steps; anything else the game draws the usual way.
    const fight = !bar && !show ? this.fightClip(avatar, skin) : undefined;
    const requested = fight ? fight.clip : bar ? bar.body ?? barState(bar.step.clip) : show ? show.state : action === 'kick' ? kickClip(actor.skill) ?? 'Kick' : action === 'fallen' ? 'Fallen' : action === 'stumble' ? 'DrunkIdle'
      : action === 'recover' ? 'Recover' : action === 'wave' ? 'Wave' : action === 'use' ? 'Use' : action === 'text' || (action === 'idle' && actor.looking && !this.selfieOf(avatar)) ? 'Text' : action === 'thank' ? 'Thank' : action === 'pick' ? 'Pick' : action === 'ride' || action === 'ragdoll' ? 'Sit'
      : ordering ? 'Idle' : action === 'wait'||action === 'toilet' ? 'Wait' : action === 'deal' ? 'Deal' : action === 'shuffle' ? 'Shuffle'
      : action === 'bartend' ? 'Bartend' : drinking ? 'Drink' : seated > 0.5 ? (actor.currentTableId ? (actor.cardResult === 'loss' ? 'AngrySit' : 'CardsSit') : 'Sit')
      : dancing ? this.danceClip(actor.dance ?? avatar.phase) : !actor.oldWalk&&pose.walking ? (stage>=3?'DrunkWalk':pose.running?'Run':'Walk') : !actor.oldWalk?(stage>=2?'DrunkIdle':'Idle'):'';
    const locomotion = !bar && !show && (['Idle', 'Walk', 'Jog', 'Run', 'DrunkWalk'].includes(requested) || !!fight?.guard);
    const actionImported = !!requested && skin.tracks.has(requested);
    const oldGait=!!actor.oldWalk&&!gesture&&skin.tracks.has('OldCaneWalk')&&skin.tracks.has('OldCaneHold');
    const imported=actionImported||oldGait;
    const clip = actionImported ? requested : oldGait ? (pose.walking?'OldCaneWalk':'OldCaneHold') : pose.walking && seated < 0.5 ? 'Walk' : gesture ? 'Pose' : 'Idle';
    if(skin.cane)skin.cane.enabled=oldGait&&!actionImported;
    const playbackKey = bar ? `${clip}:${bar.step.startedAt}` : show ? `${clip}:${show.startedAt}` : fight && !fight.guard ? fight.key : locomotion ? clip : `${clip}:${actionImported ? actor.animationStartedAt ?? 0 : 0}`;
    if (skin.clip !== clip || skin.playbackKey !== playbackKey) {
      // The take, start and loop clips follow each other frame to frame; the take and stop clips blend in, as palco_musicos.js does.
      // Bar clips follow each other as barTimeline says (0 from a clip's last frame into the next), enter in 0.3 s and
      // leave as leaveBarAction decided.
      // Mixamo's seated/idle poses differ from the authored endpoints and need a short cross-fade.
      const fromAction = skin.clip.startsWith('Bar ') || skin.clip === 'Sit';
      const walkingBlend=!bar&&!show?walkTransitionSeconds(skin.clip,clip):undefined;
      const blend = bar?.body ? .3 : bar ? (fromAction ? bar.step.blend : bar.step.blend || .3) : show ? show.blend
        : fromAction ? (avatar.barRelease === 0 ? 0 : avatar.barRelease ?? .3) : skin.clip.startsWith('Palco ') ? MUSICIANS.releaseSeconds : clip.startsWith('OldCane')||skin.clip.startsWith('OldCane')?.35:.25;
      // A punch or a blow comes in fast (it must read at once); the guard's idle and steps blend like walking does.
      const fightBlend = fight ? (fight.guard ? (GUARD_CLIPS.has(skin.clip) ? .2 : .18) : .08) : undefined;
      anim.baseLayer?.transition(clip, skin.clip ? fightBlend ?? walkingBlend ?? blend : 0);
      skin.clip = clip; skin.playbackKey = playbackKey;
      if (bar && anim.baseLayer) anim.baseLayer.activeStateCurrentTime = bar.body
        ? Math.max(0, (this.serverNow() - bar.step.startedAt) / 1000) % anim.baseLayer.activeStateDuration : bar.step.time;
      else if (show && anim.baseLayer) anim.baseLayer.activeStateCurrentTime = musicianTime(show.spot,show.phase,show.startedAt,show.now);
      // Someone else's punch seen late starts a little behind the room's clock, so its wind-up shows, and catches up (fightSync).
      else if (fight && !fight.guard && anim.baseLayer) anim.baseLayer.activeStateCurrentTime = Math.max(0, fight.age - (fight.local ? 0 : FIGHT_CATCH_UP_S));
      else if (actionImported && !locomotion && actor.animationStartedAt && anim.baseLayer) {
        const age = Math.max(0, (this.serverNow() - actor.animationStartedAt) / 1000);
        const duration = anim.baseLayer.activeStateDuration;
        anim.baseLayer.activeStateCurrentTime = ['Deal', 'Wait', 'Text', 'DrunkIdle', 'DrunkWalk', ...SEATED_CLIPS].includes(clip) || clip.startsWith('Dance ') ? age % duration : Math.min(age, duration);
      }
    }
    const pace = CLIP_PACES[avatar.skinId ?? '']?.[clip] ?? MIXAMO_PACE[clip];
    if(clip==='Walk')skin.walkRate=walkPlaybackRate(skin.walkRate,avatar.speed??0,pose.dt,pace);
    else skin.walkRate=undefined;
    anim.speed = clip==='Walk'?skin.walkRate!:pace ? clamp((avatar.speed ?? 0) / pace, .5, 2.6) : clip==='OldCaneWalk'?(skin.oldCaneRate??1):(avatar.hitStopUntil ?? 0) > performance.now() ? 0 : 1;
    // A drink in hand: the hand layer fades in over a free body and keeps to the room's clock (sips line up for everyone,
    // whatever pace the walk sets for the clips).
    const now = this.serverNow();
    const held = actor.holding && (actor.holdingUntil ?? 0) > now ? HELD_DRINKS.find(id => id === actor.holding) : undefined;
    if(skin.orderLayer){
      const age=Math.max(0,(now-(actor.animationStartedAt??now))/1000),duration=skin.orderLayer.activeStateDuration;
      const fade=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
      skin.orderLayer.weight=ordering?fade(age/.28)*fade((duration-age)/.35):0;
      if(ordering&&duration>0)skin.orderLayer.activeStateCurrentTime=Math.min(age,duration);
    }
    const handOn = !!held && !bar && !show && HAND_FREE_CLIPS.has(clip) && !!skin.handLayer && smokingTimeline(actor,now,actor.id).phase!=='lighting';
    if (skin.handLayer) {
      skin.handLayer.weight = lerp(skin.handLayer.weight, handOn ? 1 : 0, 1 - Math.exp(-10 * pose.dt));
      const duration = skin.handLayer.activeStateDuration;
      if (handOn && duration > 0) skin.handLayer.activeStateCurrentTime = (Math.max(0, now - (actor.holdingSince ?? now)) / 1000) % duration;
    }
    this.fightSync(avatar, skin, fight, pose.dt);
    if (show) this.musicians!.play(show.spot.id,show.phase,show.startedAt,show.now,show.blend);
    // The body keeps to the room's clock (a hidden tab, a slow frame): props and chair are drawn at that time too.
    else if (bar && anim.baseLayer?.activeState === clip) {
      const duration = bar.body ? anim.baseLayer.activeStateDuration : BAR_ANIMATIONS.clips[bar.step.clip].duration;
      const time = bar.body ? Math.max(0, (this.serverNow() - bar.step.startedAt) / 1000) % duration : bar.step.time;
      const looping = BAR_ANIMATIONS.clips[bar.step.clip].loop, current = anim.baseLayer.activeStateCurrentTime;
      // PlayCanvas accumulates loop time across laps. Compare phases so an old/suspended tab can still catch up.
      const drift = Math.abs((looping ? (current % duration + duration) % duration : current) - time);
      if ((looping ? Math.min(drift, duration - drift) : drift) > .2) anim.baseLayer.activeStateCurrentTime = time;
    }
    // A kick too: the room decides what it hits from this very moment of the clip, so the foot must be where the room says it is.
    else if (action === 'kick' && actionImported && anim.baseLayer?.activeState === clip && actor.animationStartedAt && (avatar.hitStopUntil ?? 0) <= performance.now()) {
      const time = Math.min(Math.max(0, (now - actor.animationStartedAt) / 1000), anim.baseLayer.activeStateDuration);
      if (Math.abs(anim.baseLayer.activeStateCurrentTime - time) > KICK_DRIFT) anim.baseLayer.activeStateCurrentTime = time;
    }
    if (imported) {
      body.setLocalPosition(0, 0, 0); body.setLocalEulerAngles(0, 0, 0);
      // (On a bike seatRider puts the hips on its seat, wherever it is.)
      if (SEATED_CLIPS.includes(clip) && action !== 'ride' && action !== 'ragdoll') {
        // The skins have different pelvis-to-thigh offsets; anchor the actual hip joints to the chair.
        const hipY = (bones.upperleg_l.getPosition().y + bones.upperleg_r.getPosition().y) / 2;
        body.setLocalPosition(0,(actor.y??0)+0.56-hipY,0);
      }
      if(clip==='CardsSit'&&(actor.cardCount??0)>0)this.holdCards(avatar,skin,actor.cardCount!);
      // The drinking clip raises the drink with the left hand: the one ordered or taken from the backpack (NPCs: a bottle).
      const item:HeldDrink|undefined=drinking?(HELD_DRINKS.find(id=>id===actor.drinkItem)??'garrafa'):handOn?held:undefined;
      const prop=item&&(clip==='Drink'||handOn)&&skin.drinkHand?this.drink(avatar,item):undefined;
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
    const now=this.serverNow(),current=musicianPhase(playing,now);
    if(!current||current.phase==='fim')return;
    const tracks=this.musicians.bodyTracks(spot.id,avatar.skinId!,skin.model,model.animations.map(asset=>asset.resource as pc.AnimTrack));
    if(!tracks)return;
    if(!skin.tracks.has(tracks[0]!.name)){
      assignAnimationClips(skin.model.anim!,tracks.map((track,i)=>({name:track.name,track,loop:STAGE_PHASES[i]==='loop'})));
      tracks.forEach(track=>skin.tracks.add(track.name));
    }
    const blend=(current.phase==='entrando'||current.phase==='saindo')&&now-current.startedAt<MUSICIANS.blendSeconds*1000?MUSICIANS.blendSeconds:0;
    return {state:musicianState(spot.id,current.phase),spot,...current,now,blend};
  }

  /** Rotates a bone by `degrees` about a world-space axis, on top of its current pose. */
  private turn(bone: pc.Entity, axis: pc.Vec3, degrees: number): void {
    if (Math.abs(degrees) < 0.01) return;
    bone.setRotation(this.tempTurn.setFromAxisAngle(axis, degrees).mul(bone.getRotation()));
  }

  /**
   * The engine builds a shader the first time something is drawn with a new combination of material and lights, and waits
   * for the driver to finish it in the middle of the frame: a new skin, a prop or a city block froze the game for 0.3–1 s.
   * Draws now go ahead without waiting (KHR_parallel_shader_compile builds the shader on the driver's threads): what needs
   * it appears a frame or two later instead. That holds for shadow maps too: one shadow shader waited 2 s at the start,
   * queued behind the colour ones. A lamp's cached map keeps what it drew, so once the last shadow shader is built, every
   * lamp draws its map again. Other passes (the room's reflections, made once) still wait.
   */
  private compileShadersInBackground(): void {
    const device = this.app.graphicsDevice as unknown as { setShader?: (shader: unknown, asyncCompile?: boolean) => void; activateShader?: () => void;
      shader?: { ready?: boolean; failed?: boolean }; shaderValid?: boolean };
    const setShader = device.setShader?.bind(device), activate = device.activateShader?.bind(device);
    if (!setShader || !activate) return;
    // The forward renderer passes `false`; the shadow renderer passes nothing, and so do the one-off passes that keep waiting.
    const shadowPass = (shader: unknown) => /ShadowPass/.test((shader as { name?: string } | undefined)?.name ?? '');
    device.setShader = (shader, asyncCompile) => setShader(shader, asyncCompile === false || (asyncCompile === undefined && shadowPass(shader)) ? true : asyncCompile);
    device.activateShader = () => {
      activate();
      if (device.shaderValid === false && device.shader && !device.shader.failed && !device.shader.ready) { this.compiling++; if (shadowPass(device.shader)) this.compilingShadows++; }
    };
    this.app.on('frameend', () => {
      if (this.compilingShadows) this.shadowsPending = true;
      else if (this.shadowsPending) { this.shadowsPending = false; this.environment.refreshLampShadows(); }
      this.compilingShadows = 0;
      this.compilingLastFrame = this.compiling; this.compiling = 0;
      // Without a steady redraw (a menu over the scene) the frame that skipped something is drawn again once it is ready.
      if (this.compilingLastFrame) this.app.renderNextFrame = true;
    });
  }
  /** After the map arrives: frames are drawn until none skips a draw for a shader still being built (at most 20 s). */
  private shadersSettled(): Promise<void> {
    return new Promise(resolve => {
      const started = performance.now();let frames = 0;
      const check = () => {
        if (this.destroyed || (++frames > 2 && !this.compilingLastFrame) || performance.now() - started > 20000) { this.app.off('frameend', check); resolve(); return; }
        this.app.renderNextFrame = true;
      };
      this.app.on('frameend', check);
      this.app.renderNextFrame = true;
    });
  }
  /**
   * The frame cap of the settings skips whole frames, the scene's update and the engine's with them: on a 120 Hz phone
   * capped at 60 the CPU does half the work. The engine asks for its next frame with `requestAnimationFrame(app.tick)`,
   * reading the property each time, so a wrapped tick sees every frame the screen offers and passes on the ones due.
   */
  private capFrameRate(): void {
    const app = this.app as unknown as { tick: (timestamp?: number, frame?: unknown) => void; frameRequestId?: number };
    const tick = app.tick;let last = -1;
    app.tick = (timestamp, frame) => {
      const cap = this.graphics?.fpsCap ?? 0;
      // 2.5 ms of slack: screens do not tick exactly on time, and a frame a hair early must still count.
      if (cap && timestamp !== undefined && !frame && last >= 0 && timestamp - last < 1000 / cap - 2.5) { app.frameRequestId = requestAnimationFrame(app.tick); return; }
      last = timestamp ?? -1;
      tick(timestamp, frame);
    };
  }

  /** Configurações → Gráficos (apps/web/src/graphics.ts). */
  setGraphics(graphics: GraphicsSettings): void {
    this.graphics = graphics; this.scale = graphics.renderScale; this.goodSeconds = 0; this.badSeconds = 0;
    this.textureMax = textureLimit(graphics);
    this.applyResolution();
    this.environment.setQuality(graphics.shadows, FOG_SCALE[graphics.fog]);
    this.applyCityQuality();
    this.app.autoRender = this.enabled;
    this.app.renderNextFrame = true;
  }
  private applyCityQuality(): void {
    const graphics = this.graphics;
    if (graphics) this.city?.setQuality(graphics.city, CITY_FOG.end * FOG_SCALE[graphics.fog], graphics.shadows !== 'off');
  }
  getGraphics() { return { ...this.graphics, currentScale: this.scale, fps: this.fps, pixelRatio: this.app.graphicsDevice.maxPixelRatio }; }
  getHorses(){return [...this.actors.values()].filter(a=>a.horse).map(a=>({id:a.actor.id,...a.horse!.telemetry(),sound:this.horseSounds.telemetry(a.actor.id),hip:a.skin?.hip?.getPosition().clone().toArray(),feet:[a.skin?.bones.foot_l.getPosition().clone().toArray(),a.skin?.bones.foot_r.getPosition().clone().toArray()]}));}
  private applyResolution(): void {
    // In a headset the session's own scale decides (VrSettings.resolution), not the window's.
    if (this.vr?.active) return;
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, this.graphics?.pixelRatioCap ?? 1.5) * this.scale;
    this.resize();
  }
  /**
   * Dynamic resolution: below 80% of the target for two seconds running, draw fewer pixels; give them back after 4 s of
   * headroom. Each step resizes the canvas (its buffers are made again), so a single slow second (a skin or a city block
   * arriving) does not cost one, and the scale does not hunt up and down.
   */
  private adaptResolution(): void {
    const graphics = this.graphics;
    if (!graphics?.dynamicResolution || !this.enabled || this.vr.active) return;
    const target = graphics.fpsCap || 60;
    if (this.fps < target * 0.8) {
      this.goodSeconds = 0;
      if (++this.badSeconds >= 2 && this.scale > 0.5) { this.scale = Math.max(0.5, +(this.scale - 0.1).toFixed(2)); this.badSeconds = 0; this.applyResolution(); }
      return;
    }
    this.badSeconds = 0;
    if (this.fps >= target * 0.95 && this.scale < graphics.renderScale && ++this.goodSeconds >= 4) { this.scale = Math.min(graphics.renderScale, +(this.scale + 0.05).toFixed(2)); this.goodSeconds = 0; this.applyResolution(); }
  }

  private update(dt: number): void {
    this.updateProfiler.begin();
    this.frameSeconds += dt;
    // The engine stops counting at a tenth of a second: below 10 FPS the bike must still ride in real time.
    const wall = performance.now(), realDt = dt < .1 ? dt : Math.min((wall - this.lastFrameAt) / 1000, .5);
    this.lastFrameAt = wall;
    this.swingDoors();
    this.frames++;
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
    this.updateProfiler.mark('setup');
    this.fuelProps.begin(this.camera.getPosition());
    if (this.frameId % 4 === 0) this.updateAvatarShadows();
    // The body put under the headset last frame goes back where the room has it before it is moved again (vrBody).
    if (this.vrShifted) { const p = this.vrShifted.root.getPosition(); this.vrShifted.root.setPosition(p.x - this.vrShift.x, p.y, p.z - this.vrShift.z); this.vrShifted = undefined; }
    for (const avatar of this.actors.values()) this.animateAvatar(avatar, dt);
    this.morte?.update(dt);
    if (!this.vr.active && this.fovPunch !== this.fovPunchGoal) { this.fovPunch += (this.fovPunchGoal - this.fovPunch) * (1 - Math.exp(-(this.fovPunchGoal > this.fovPunch ? 18 : 5) * dt)); if (Math.abs(this.fovPunch - this.fovPunchGoal) < .01) this.fovPunch = this.fovPunchGoal; if (this.camera.camera) this.camera.camera.fov = this.lensFov + this.rush * RUSH_FOV - this.fovPunch; }
    this.updateProfiler.mark('avatars');
    this.callbacks.onFrame?.(realDt);
    this.updateProfiler.mark('client');
    this.motos.update(dt, this.camera, this.app.scene.exposure,this.environment.rainStrength>.15);
    this.placeRiders();
    this.placeHorseRiders();
    this.horseSounds.update([...this.actors.values()].filter(a=>a.horse).map(a=>{
      const position=a.root.getPosition();
      return {id:a.actor.id,speed:a.speed??0,animation:a.actor.animation,rearAt:a.actor.horseRearAt??0,x:position.x,y:position.y+.2,z:position.z};
    }),this.camera.getPosition(),this.camera.forward,this.camera.up);
    this.placeThrown(dt);
    // Pull the posed corpse into the cloud after physics has placed its pelvis.
    this.applyDeathPull();
    this.blowEffects.update(dt, this.camera);
    this.predictPunch();
    this.drawDamage();
    this.smokeBurst.update(dt, this.camera);
    this.fireworks.update(this.serverNow(),this.camera);
    this.crowd.update(dt, this.camera, this.modelSlots, .55 + .45 * this.environment.daylight);
    this.updateProfiler.mark('vehicles');
    // Instruments nobody was drawn playing this frame go back on their stands.
    this.musicians?.frame();
    // Props nobody plays go away, pulled chairs go back, the cup and the freezer lid show again; particles and leftovers.
    this.barAnimations?.frame(dt,this.camera.camera,this.app.graphicsDevice.height,this.barPlayed);
    this.placeServed(this.serverNow());
    const bartender=this.actors.get('bartender');
    // The tap runs while the chopp pours (Prop_Jato in Magrão's clip).
    this.mapEffects?.update(this.elapsed,!!this.barAnimations?.pouring()||bartender?.skin?.clip==='Bartend');
    this.updateProfiler.mark('barEffects');
    const player = this.actors.get(this.localId);
    // In a headset the head decides the heading; the camera code below only finds out where the eyes belong.
    let vrView: { yaw: number; pitch: number } | null = null;
    try { vrView = this.vr.beginFrame(realDt); } catch (error) { this.vrFailed(error); }
    let vrFresh = false, vrSpecial = false, vrFoot = false;
    this.feelSpeed(this.enabled ? this.motos.ridden(this.localId) : undefined, dt);
    const television=TELEVISIONS.find(t=>t.id===this.watchingTv);
    if(television){
      // Far enough back for the screen to fill the view: 1.15 m from a TV, about 6 m from the stage screen.
      const angle=television.yaw*Math.PI/180,back=Math.max(1.15,television.width*1.1);
      this.camera.setPosition(television.x+Math.sin(angle+this.tvYaw)*back*Math.cos(this.tvPitch),television.y+Math.sin(this.tvPitch)*back,television.z+Math.cos(angle+this.tvYaw)*back*Math.cos(this.tvPitch));
      this.camera.lookAt(television.x,television.y,television.z,-Math.sin(angle+this.tvYaw)*Math.sin(this.tvPitch),Math.cos(this.tvPitch),-Math.cos(angle+this.tvYaw)*Math.sin(this.tvPitch));
      this.rig.idle();
      vrFresh = vrSpecial = true;
    } else if(this.watchingStage){
      // From the back of the backyard, under the terrace, a little above the crowd's heads; turned so the stage sits in the
      // middle of the part of the screen the panel leaves.
      const yaw=clamp(this.tvYaw,-.5,.5),pitch=clamp(.16+this.tvPitch,.02,.6),distance=9.2,target=this.tempPosition.set(STAGE.deck.x,2.9,STAGE.deck.z-.6);
      this.tvYaw=yaw;this.tvPitch=pitch-.16;
      this.camera.setPosition(target.x+Math.sin(yaw)*Math.cos(pitch)*distance,target.y+Math.sin(pitch)*distance,target.z+Math.cos(yaw)*Math.cos(pitch)*distance);
      this.camera.lookAt(target);
      const covered=clamp(this.watchingStage(),0,.45),aspect=this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight);
      const half=Math.tan((this.camera.camera?.fov??57)*Math.PI/360)*aspect;
      if(covered&&!this.vr.active)this.camera.rotateLocal(0,-Math.atan(covered*half)*RAD_TO_DEG,0);
      this.rig.idle();
      vrFresh = vrSpecial = true;
    } else if (player && this.enabled && this.selfie && player.skin) {
      // Arm's length in front of the face, a little to the right, as a phone held up in the right hand. The mouse turns it
      // round the face (and up and down), and movement follows the same heading, so what the keys do matches the picture.
      this.rig.turn(realDt);
      const bones = player.skin.bones, feet = player.root.getPosition(), joint = bones.head.getPosition(), eased = this.selfieHead;
      const offset = this.tempPosition.set(joint.x - feet.x, joint.y - feet.y, joint.z - feet.z);
      if (!this.selfieHeadSet || eased.distance(offset) > 1) { eased.copy(offset); this.selfieHeadSet = true; } else eased.lerp(eased, offset, 1 - Math.exp(-8 * realDt));
      const head = new pc.Vec3(feet.x + eased.x, feet.y + eased.y, feet.z + eased.z), yaw = this.rig.yaw, lift = clamp(this.rig.pitch, -.25, .6);
      const ahead = new pc.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw)), side = new pc.Vec3(Math.cos(yaw), 0, -Math.sin(yaw));
      const lens = head.clone().add(ahead.clone().mulScalar(.85 * Math.cos(lift))).add(side.clone().mulScalar(.2)).add(new pc.Vec3(0, .85 * Math.sin(lift) + .02, 0));
      this.camera.setPosition(lens);
      this.camera.lookAt(head.x, head.y + .02, head.z);
      // The right arm reaches for the phone, aimed under the lens so it leaves the picture by its bottom edge.
      reach(bones.upperarm_r, bones.lowerarm_r, bones.hand_r, lens.clone().add(new pc.Vec3(0, -.3, 0)), side.clone().add(new pc.Vec3(0, -1, 0)));
      this.rig.idle();
      vrFresh = vrSpecial = true;
    } else if (player && this.enabled) {
      const bike = this.motos.ridden(this.localId);
      // Thrown off, the view stays behind the body until it is up: never inside it.
      const riding = !!bike || isRidingHorse(player.actor.interactionState) || player.actor.interactionState === 'thrown';
      if (riding !== this.chasing) { this.chasing = riding; this.rig.ride(this.chasing); this.motoSwitches = 0; }
      // Always through the eyes in a headset: the chase view behind a bike is for a screen.
      if (this.vr.active && this.rig.mode !== 'first') this.rig.enterFirst();
      // In real time: the body moved for all of a stalled frame, and a view told a shorter one reads it as a sprint and falls metres behind.
      if (bike) { this.rig.chase(bike.drawn.yaw, realDt); this.cancelSignal(bike); }
      // Drunk view: the camera rolls slowly (more with each stage).
      const eyes=bike?.rig instanceof CarRig&&vehicleSeat(bike.state,this.localId)===0?bike.rig.ponto('ponto_olhos').getPosition():player.skin?.bones.head.getPosition();
      this.rig.follow(realDt, { feet: bike ? bike.entity.getPosition() : player.root.getPosition(), head: eyes, facing: player.yaw / RAD_TO_DEG,
        roll: this.vr.active ? 0 : DRUNK_CAMERA_ROLL[drunkStage(player.actor.drunk ?? 0)]!, elapsed: this.elapsed, ...(bike ? {...MOTO_XRAY,clearance:vehiclePhysics(bike.state.model).HALF_LENGTH} : {}) });
      vrFresh = true;
      vrFoot = !bike && !riding && !player.actor.interactionState && !player.actor.currentTableId;
    } else if (!player && this.showcaseOn && !this.enabled) {
      this.showcaseCamera(dt, realDt);
      this.rig.idle();
    } else if (!player) {
      // Waiting at the door: a slow drift in front of the facade.
      this.camera.setPosition(18+Math.sin(this.elapsed*.035)*2,9,16);
      this.camera.lookAt(14,1.8,-6);
      this.rig.idle();
    }
    if (this.vr.active) {
      if (vrFresh) {
        // The eyes belong where the camera code put the camera; on foot, over the feet, which move smoothly (the head joint bobs).
        const eye = this.camera.getPosition(), forward = this.camera.forward, anchor = this.vrAnchor;
        anchor.x = eye.x; anchor.y = eye.y; anchor.z = eye.z; anchor.special = vrSpecial;
        if (vrFoot && player) { const feet = player.root.getPosition(); anchor.x = feet.x; anchor.z = feet.z; }
        anchor.faceYaw = Math.atan2(-forward.x, -forward.z);
        this.vrAnchored = true;
      }
      // The camera code did not run (a window is open, or the room has not admitted the player yet): the eyes stay with the avatar,
      // never where the lobby camera was left.
      if (!vrFresh && player) { const feet = player.root.getPosition(), anchor = this.vrAnchor; anchor.x = feet.x; anchor.z = feet.z; if (!this.vrAnchored) { anchor.y = feet.y + 1.62; anchor.special = false; anchor.faceYaw = this.rig.yaw + Math.PI * 0; } else anchor.y = Math.max(anchor.y, feet.y + 1.2); this.vrAnchored = true; }
      try { if (this.vrAnchored) this.vr.endFrame(realDt, this.vrAnchor); } catch (error) { this.vrFailed(error); }
      if (vrView) this.rig.slave(vrView.yaw, vrView.pitch);
    }
    this.applyHeadLooks(dt);
    if (this.vr.active && vrView) this.vrBody(player, vrView.yaw, vrFoot && !vrSpecial);
    this.vrArms(player, realDt);
    const cigaretteActors=[],crossedActors=[],smokingNow=this.serverNow();
    for(const avatar of this.actors.values()){
      const {actor,skin}=avatar;if(!skin)continue;
      if(actor.animation==='wait'&&actor.drinkItem)counterRequest(skin,(smokingNow-(actor.animationStartedAt??smokingNow))/1000,avatar.body);
      const armsAvailable=!avatar.riding&&!avatar.ragdoll&&!actor.musician&&!actor.currentTableId&&!actor.vrArms&&!actor.fireworkEquipped&&!actor.carrying&&!actor.parcel&&!actor.holding&&
        (!avatar.bar||avatar.bar.clip==='sentado_loop')&&(skin.orderLayer?.weight??0)<.001&&
        ['Idle','Walk','Jog','Run','DrunkIdle','DrunkWalk','Wait','Sit'].includes(skin.clip);
      crossedActors.push({id:actor.id,active:!!actor.armsCrossed,available:armsAvailable,rig:skin});
      if(actor.smokingSince)cigaretteActors.push({id:actor.id,skin:avatar.skinId!,state:actor,rig:skin,
        hidden:!!avatar.deathHidden||['ragdoll','fallen','recover','vomit'].includes(actor.animation??''),
        armsFree:!avatar.riding&&!avatar.ragdoll&&!actor.musician&&!actor.currentTableId&&!actor.vrArms&&!actor.fireworkEquipped&&!actor.carrying&&!actor.parcel&&
          (!avatar.bar||avatar.bar.clip==='sentado_loop')&&(skin.orderLayer?.weight??0)<.001&&
          ['Idle','Walk','Jog','Run','DrunkIdle','DrunkWalk','Wait','OldCaneWalk','OldCaneHold','Sit'].includes(skin.clip)});
    }
    this.crossedArms.update(crossedActors,dt);
    this.cigarettes.update(cigaretteActors,smokingNow,dt,this.camera,this.app.graphicsDevice.height);
    this.showOwnHead(player);
    this.footstepSounds.update(realDt,this.enabled?[...this.actors.values()].map(avatar=>{
      const position=avatar.root.getPosition(),actor=avatar.actor;
      return {id:actor.id,x:position.x,y:position.y,z:position.z,animation:actor.animation??actor.state,
        oldWalk:actor.oldWalk,blocked:!!avatar.riding||!!avatar.horse||!!avatar.ragdoll||!!avatar.bar||!!actor.musician||!!avatar.deathHidden};
    }):[],this.camera.getPosition(),this.camera.forward,this.camera.up);
    this.updateProfiler.mark('camera');
    const focus = this.cityFocus ?? this.motos.ridden(this.localId)?.entity.getPosition() ?? player?.root.getPosition() ?? this.camera.getPosition();
    this.city?.update(dt, focus.x, focus.z);
    this.updateProfiler.mark('streaming');
    this.environment.setFocus(player?.root.getPosition());
    this.environment.update(this.serverNow(),dt,this.eventType);
    this.surfaces?.update(this.environment.power);
    this.jukeboxLights?.update(dt,this.jukeboxState,this.serverNow(),this.jukeboxDuration,this.app.scene.exposure);
    this.stageLights?.update(dt,this.stageState,this.serverNow(),this.stageDuration,this.app.scene.exposure);
    this.updateProfiler.mark('lighting');
    const serverNow=this.serverNow();
    this.foosballBalls.update(serverNow);
    this.poolBalls.update();
    this.stageShow.update(dt,{stage:this.stageLive(serverNow),desk:this.showDesk,serverNow,camera:this.camera,height:this.app.graphicsDevice.height,daylight:this.environment.daylight});
    // The telão darkens under the laser's drawings.
    this.televisions.get('telao')?.setDim(this.stageShow.screenDim);
    this.updateProfiler.mark('stage');
    this.animateMarker(this.objective);
    this.updateStageBlips();
    this.updateFoodBase();
    this.updateGarages();
    const party = this.environment.partyStrength;
    for (let i = 0; i < this.partyLights.length; i++) {
      const light = this.partyLights[i]!.light;
      if (light){light.intensity = party * (2 + Math.sin(this.elapsed * 3 + i * Math.PI));light.enabled=light.intensity>.015;}
    }
    this.discoBall.rotate(0, dt * (8+party*62), 0);
    this.updateProfiler.mark('markers');
    this.callbacks.onMediaFrame?.();
    this.updateProfiler.mark('media');
  }

  /**
   * Animation level of detail: a skinned body more than OFFSTAGE_NEAR from the camera and outside its view (with a margin
   * of OFFSTAGE_MARGIN around the body, so it moves again before it shows) is not animated. Evaluating the clips and posing
   * the bones of everyone in the room, in view or not, was most of the scene's time with a crowd. Whoever does something the
   * room depends on (a bar action, a stage spot, a bike, a fall, a kick) always moves; and only while playing (fixtures and
   * the TV view animate everyone).
   */
  private offstage(avatar: Avatar): boolean {
    const { actor } = avatar, camera = this.camera.camera;
    if (!this.enabled || !camera || actor.musician || OFFSTAGE_BUSY.has(actor.animation ?? '')) return false;
    const p = avatar.root.getPosition(), eye = this.camera.getPosition();
    if ((p.x - eye.x) ** 2 + (p.y - eye.y) ** 2 + (p.z - eye.z) ** 2 < OFFSTAGE_NEAR ** 2) return false;
    this.offstageSphere.center.set(p.x, p.y + 1, p.z);
    return !camera.frustum.containsSphere(this.offstageSphere);
  }
  private readonly offstageSphere = new pc.BoundingSphere(new pc.Vec3(), OFFSTAGE_MARGIN);

  /** Whoever rides a bike goes where it is drawn, in the riding pose; off it, the avatar's own shadow comes back. */
  private placeRiders(): void {
    for (const [id, avatar] of this.actors) {
      const bike = avatar.skin && avatar.actor.animation === 'ride' ? this.motos.ridden(id) : undefined;
      if(bike?.rig instanceof CarRig){avatar.carScale??=avatar.root.getLocalScale().clone();}
      else if(avatar.carScale){avatar.root.setLocalScale(avatar.carScale);avatar.carScale=undefined;}
      if (!!bike !== !!avatar.riding) { avatar.riding = !!bike; avatar.contact.enabled = !bike; }
      if (!bike || !avatar.skin) continue;
      this.seat(avatar, avatar.skin, bike);
      avatar.yaw = bike.drawn.yaw * RAD_TO_DEG;
      if (id === this.localId) this.lastRotation = normalizeHeading(bike.drawn.yaw);
    }
  }
  /**
   * The bodies a crash or a kick threw, on top of the clip (Sit: only what the ragdoll does not move shows), and the way back into getting up; and
   * someone lifting a fallen bike. After motos.update, since the bike's grips are where the hands go.
   */
  private placeThrown(dt: number): void {
    const now = this.serverNow();
    for (const [id, avatar] of this.actors) {
      const { skin, actor } = avatar;
      if (!skin) continue;
      if (actor.animation === 'kick') this.swingKick(avatar, now);
      if (actor.animation === 'moto-lift') {
        const bike = this.motos.lifted(id);
        if (bike) lifterPose(this.bodyRig(avatar, skin), { left: bike.rig.ponto('ponto_mao_E').getPosition(), right: bike.rig.ponto('ponto_mao_D').getPosition(), seat: bike.rig.ponto('ponto_piloto').getPosition() }, (now - (actor.animationStartedAt ?? now)) / MOTO.LIFT_MS, reach);
        continue;
      }
      const start = this.ragdollStarts[id];
      if (start && actor.animation === 'ragdoll') {
        if (avatar.ragdoll?.startedAt !== start.startedAt) {
          avatar.ragdoll = new RagdollPuppet(start, start.startedAt, now - start.startedAt, start.seated ? this.motos.nearest(start)?.drawn : avatar.root.getPosition());
          if (start.by && now - start.startedAt <= LATE_MS) this.kickLanded(id, avatar, skin, start.by);
        }
        const rig = this.bodyRig(avatar, skin);
        avatar.ragdoll.pose(dt, rig);
        const landing = avatar.ragdoll.takeLanding();
        if (landing) {
          this.blowSounds.fall(landing.speed, landing);
          if (landing.floor && landing.speed > DUST_FROM) this.blowEffects.puff(landing.x, avatar.ragdoll.ground(), landing.z, Math.min(1, landing.speed / 7));
        }
        const [x, , z] = avatar.ragdoll.pelvis();
        avatar.contact.setPosition(x, avatar.ragdoll.ground() + .012, z);
        continue;
      }
      // Respawn must not blend the old corpse across the map; only getting up uses that blend.
      if (avatar.ragdoll && !start && actor.animation !== 'recover') {
        avatar.ragdoll = undefined; avatar.body.setLocalPosition(0, 0, 0); avatar.body.setLocalScale(1, 1, 1);
      } else if (avatar.ragdoll && !avatar.ragdoll.fade(dt, this.bodyRig(avatar, skin))) avatar.ragdoll = undefined;
    }
  }
  /**
   * The fist fight's clip for this avatar this frame (docs/sistemas/luta.md), or undefined to let the game's other clips decide. A blow taken and a
   * punch are on the room's clock (`age`, seconds into the clip); the local player's own, from the click or the room's message, ahead of the room
   * (fight-controller.ts). With the guard up and nothing thrown: its idle, or its steps by the way the body moves against where it faces.
   */
  private fightClip(avatar: Avatar, skin: SkinnedRig): { clip: string; key: string; age: number; guard: boolean; local: boolean } | undefined {
    const { actor } = avatar, local = actor.id === this.localId, ahead = local ? this.callbacks.fight?.() : undefined, fist = actor.fist, now = this.serverNow();
    const action = actor.animation ?? 'idle';
    if (action === 'punch' || action === 'hit' || (local && (ahead?.punch || ahead?.blow))) avatar.fightBusyAt = performance.now();
    if (action === 'ragdoll' || action === 'death' || actor.interactionState === 'thrown') return undefined;
    const has = (clip: string) => skin.tracks.has(clip);
    // A blow taken: drawn from the message for the one hit, from the room's state for everyone else.
    if (ahead?.blow && has(ahead.blow.reaction)) {
      const age = (performance.now() - ahead.blow.startedAt) / 1000;
      if (age < (HIT_REACTIONS[ahead.blow.reaction as keyof typeof HIT_REACTIONS] ?? 1000) / 1000) return { clip: ahead.blow.reaction, key: `hit:${ahead.blow.startedAt}`, age, guard: false, local: true };
    }
    if (action === 'hit' && fist?.hit && has(fist.hit) && !(local && ahead?.blow)) return { clip: fist.hit, key: `hit:${fist.hitAt}`, age: Math.max(0, now - (fist.hitAt ?? now)) / 1000, guard: false, local };
    // A punch: the local player's from the click (the room's, later by the trip, would set it back), everyone else's from the room.
    if (local) {
      const move = ahead?.punch ? FIGHT_MOVES[ahead.punch.move] : undefined;
      if (ahead?.punch && move && has(move.clip)) {
        const age = (performance.now() - ahead.punch.startedAt) / 1000;
        if (age < move.durationMs / 1000) return { clip: move.clip, key: `punch:${ahead.punch.n}:${ahead.punch.startedAt}`, age, guard: false, local: true };
      }
    } else if (action === 'punch') {
      const move = punchById(fist?.punch);
      if (move && has(move.clip)) return { clip: move.clip, key: `punch:${fist?.n}:${fist?.at}`, age: Math.max(0, now - (fist?.at ?? now)) / 1000, guard: false, local: false };
    }
    const guard = local ? !!ahead?.guard : !!fist?.fight;
    if (!guard || !['idle', 'walk', 'run', 'punch', 'hit'].includes(action) || actor.interactionState && actor.interactionState !== 'stagger' || !has('FightIdle')) return undefined;
    const step = this.guardStep(avatar);
    return { clip: has(step) ? step : 'FightIdle', key: step, age: 0, guard: true, local };
  }
  /**
   * How far a punch's or kick's own step (root motion: fight-paths.ts and kick-paths.ts root) has carried the body by the moment its clip is drawn at,
   * past where the newest state has it (world x, z). The room moves the body a tick at a time; the local player's punches are predicted already.
   */
  private carriedOffset(avatar: Avatar, local: boolean): { x: number; z: number } | undefined {
    const { actor, skin } = avatar, layer = skin?.model.anim?.baseLayer;
    if (!skin || !layer || this.stateAt <= 0) return undefined;
    const drawn = layer.activeStateCurrentTime * 1000;
    if (actor.animation === 'kick' && actor.animationStartedAt && skin.clip === kickClip(actor.skill)) {
      // The room puts the kicker at kickRoot each tick, in the axes it faced at the start (it does not turn while kicking).
      const now = kickRoot(actor.skill ?? '', drawn), then = kickRoot(actor.skill ?? '', this.stateAt - actor.animationStartedAt);
      const side = now[0] - then[0], ahead = now[1] - then[1], s = Math.sin(actor.rotation ?? 0), c = Math.cos(actor.rotation ?? 0);
      return { x: c * side + s * ahead, z: -s * side + c * ahead };
    }
    const fist = actor.fist, move = punchById(fist?.punch);
    if (local || actor.animation !== 'punch' || !fist || !move || skin.clip !== move.clip) return undefined;
    // Input k (about k ticks after the throw) puts the body at the root one tick on, plus the step in towards the target over its first inputs.
    const root = fistPath(actor.skin, move.id).root, way = (ms: number) => {
      const f = Math.max(0, Math.min(root.length - 1, ms / TICK_MS)), i = Math.min(root.length - 2, Math.floor(f));
      return (root.length < 2 ? root[0] ?? 0 : root[i]! + (root[i + 1]! - root[i]!) * (f - i)) + (fist.lunge ?? 0) * Math.min(move.lungeSteps, Math.max(0, ms / TICK_MS));
    };
    const along = way(drawn) - way(this.stateAt - (fist.at ?? 0) + TICK_MS);
    return { x: Math.sin(fist.yaw ?? 0) * along, z: Math.cos(fist.yaw ?? 0) * along };
  }
  /** The guard's step clip from how the body moves against where it faces: still, forward (Walk), back, or to either side; a little stickiness at the edges. */
  private guardStep(avatar: Avatar): string {
    const now = performance.now(), held = avatar.guardStep ?? 'FightIdle';
    // A punch's lunge and push, and the turn to its target, move the body for a moment: not a reason to change steps (that flickered the arms).
    if (now - (avatar.fightBusyAt ?? -1e9) < 600) { avatar.guardCand = undefined; return avatar.guardStep = 'FightIdle'; }
    const v = avatar.velocity, speed = v ? Math.hypot(v.x, v.z) : 0;
    let raw = 'FightIdle';
    if (v && speed >= (held === 'FightIdle' ? .6 : .3)) {
      const yaw = avatar.yaw / RAD_TO_DEG, ahead = v.x * Math.sin(yaw) + v.z * Math.cos(yaw), left = v.x * Math.cos(yaw) - v.z * Math.sin(yaw);
      const angle = Math.atan2(left, ahead) * RAD_TO_DEG, sticky = held === 'FightIdle' ? 0 : 12;
      const forward = Math.abs(angle) <= 55 + (held === 'Walk' || held === 'Run' ? sticky : 0), back = Math.abs(angle) >= 125 - (held === 'FightBack' ? sticky : 0);
      // Shift in the guard (FIGHT.runSpeed): past a fast walk, the run.
      raw = forward ? (speed >= (held === 'Run' ? 3 : 3.6) ? 'Run' : 'Walk') : back ? 'FightBack' : angle > 0 ? 'FightLeft' : 'FightRight';
    }
    if (raw === held) { avatar.guardCand = undefined; return held; }
    // A new step must hold for a moment before the clip changes.
    if (avatar.guardCand !== raw) { avatar.guardCand = raw; avatar.guardCandAt = now; }
    if (now - (avatar.guardCandAt ?? now) < 220) return held;
    avatar.guardCand = undefined;
    return avatar.guardStep = raw;
  }
  /**
   * Each frame of a fight clip: a punch or a blow stays on its clock (a late one catches up by playing faster instead of jumping, a landed punch
   * holds an instant first), the swing is heard as the fist goes, and the guard layer comes in over the steps.
   */
  private fightSync(avatar: Avatar, skin: SkinnedRig, fight: ReturnType<BarScene['fightClip']>, dt: number): void {
    const anim = skin.model.anim!, layer = anim.baseLayer;
    if (skin.guardLayer) {
      // Up the whole time the guard is up, FightIdle included (same pose, so harmless there): toggling it with the clip dipped the arms on every
      // still↔step change. Short gaps (a frame with no fight clip) keep it; it fades out only once the guard has been gone a moment.
      const duration = skin.guardLayer.activeStateDuration;
      if (fight?.guard) { skin.guardGone = 0; skin.guardLayer.weight = Math.min(1, skin.guardLayer.weight + dt * 12); }
      else {
        skin.guardGone = (skin.guardGone ?? 0) + dt;
        // A punch or a blow (fight set, not guard) owns the arms at once; only a frame with no fight clip at all gets the grace.
        if (fight || skin.guardGone > .25) skin.guardLayer.weight = lerp(skin.guardLayer.weight, 0, 1 - Math.exp(-14 * dt));
      }
      // Its own clock: the steps' pace sets the component's speed, the bounce of the guard keeps its own.
      if (skin.guardLayer.weight > .001 && duration > 0) skin.guardLayer.activeStateCurrentTime = (this.elapsed + avatar.phase) % duration;
    }
    if (!fight || fight.guard || !layer || layer.activeState !== skin.clip || skin.clip !== fight.clip) return;
    const duration = layer.activeStateDuration, wanted = Math.min(fight.age, duration), current = layer.activeStateCurrentTime, gap = wanted - current;
    if ((avatar.hitStopUntil ?? 0) > performance.now()) anim.speed = 0;
    else if (Math.abs(gap) > .35) { layer.activeStateCurrentTime = wanted; anim.speed = 1; }
    else anim.speed = clamp(1 + gap * 5, .6, FIGHT_CATCH_UP_RATE);
    const move = PUNCH_IDS.map(id => FIGHT_MOVES[id]).find(candidate => candidate.clip === fight.clip);
    if (move && avatar.swungKey !== fight.key && current * 1000 >= move.swingMs) {
      avatar.swungKey = fight.key;
      if ((current * 1000 - move.swingMs) < 250) { const at = avatar.root.getPosition(); this.blowSounds.swing(move.heavy, { x: at.x, y: at.y + 1.3, z: at.z }); }
    }
  }
  /** Whom the local player's punch may go at: the others as drawn (the aim goes at what the player sees, fight.ts punchAim). */
  fightTargets(): FightTarget[] {
    const targets: FightTarget[] = [];
    for (const [id, avatar] of this.actors) {
      const { actor } = avatar;
      if (avatar.npc || id === this.localId || actor.connected === false || actor.currentTableId || avatar.ragdoll || (actor.interactionState && actor.interactionState !== 'stagger' && actor.interactionState !== 'kick')) continue;
      const at = avatar.root.getPosition();
      targets.push({ id, x: at.x, y: at.y, z: at.z, skin: actor.skin });
    }
    return targets;
  }
  /** Where the camera looks, as a heading (the guard faces it). */
  fightView(): number { return normalizeHeading(this.rig.yaw + Math.PI); }
  /**
   * The local player's punch, as drawn, against the others as drawn, frame by frame: the instant the fist meets a body here, the blow is heard and
   * seen and the clip holds, without waiting for the room (whose word, a moment later, brings the number: fightHit).
   */
  private predictPunch(): void {
    const ahead = this.callbacks.fight?.(), punch = ahead?.punch, me = this.actors.get(this.localId);
    if (!punch || punch.landed || !me) return;
    const move = FIGHT_MOVES[punch.move], age = performance.now() - punch.startedAt, from = this.predictedFrom.get(punch.n) ?? 0;
    if (age < move.activeFrom - 20 || from >= move.activeTo) return;
    this.predictedFrom.set(punch.n, age);
    const feet = me.root.getPosition(), pose = { x: feet.x, y: feet.y, z: feet.z, rotation: this.lastRotation };
    let best: { id: string; contact: NonNullable<ReturnType<typeof punchContact>> } | undefined;
    for (const target of this.fightTargets()) {
      if (Math.abs(target.x - feet.x) > 3 || Math.abs(target.z - feet.z) > 3) continue;
      const avatar = this.actors.get(target.id)!, body = { x: target.x, y: target.y ?? 0, z: target.z, rotation: avatar.yaw / RAD_TO_DEG };
      const contact = punchContact(me.actor.skin, punch.move, from, age, () => pose, target.skin, () => body);
      if (contact && (!best || contact.ms < best.contact.ms)) best = { id: target.id, contact };
    }
    if (!best) return;
    punch.landed = true;
    this.fightShown.add(`${this.localId}:${punch.n}`);
    const at = { x: best.contact.x, y: best.contact.y, z: best.contact.z };
    this.blowSounds.hit(move.heavy, at);
    this.blowEffects.star(at, move.heavy ? .7 : .42);
    me.hitStopUntil = performance.now() + PUNCH_HIT_STOP_MS[move.heavy ? 'heavy' : 'light'];
    const victim = this.actors.get(best.id);
    if (victim) (victim.flinch ??= new FlinchPose()).hit(this.elapsed, Math.atan2(best.contact.x - feet.x, best.contact.z - feet.z), FLINCH_DEGREES[punch.move] ?? 10);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.rig.shake(move.heavy ? .03 : .016);
  }
  /**
   * A punch landed (the room's fight.hit, to everyone near): its number where the fist met the body, and, unless this browser already drew it
   * (the puncher's own, predictPunch), the blow heard and seen, the clip holding an instant and the upper body jolted.
   */
  fightHit(hit: FightHit): void {
    const victim = this.actors.get(hit.to), puncher = this.actors.get(hit.by), move = FIGHT_MOVES[hit.move], key = `${hit.by}:${hit.n}`;
    // The room's point, moved with the body as it is drawn now (the room saw it a moment ago).
    const drawn = victim?.root.getPosition(), at = drawn && victim ? { x: hit.x + drawn.x - victim.actor.x, y: hit.y + drawn.y - (victim.actor.y ?? 0), z: hit.z + drawn.z - victim.actor.z } : { x: hit.x, y: hit.y, z: hit.z };
    const kind = hit.ko ? 'ko' : hit.to === this.localId ? 'taken' : move.heavy ? 'heavy' : 'hit';
    this.damageNumbers.show(at, hit.ko ? `${hit.damage} KO` : String(hit.damage), kind, this.elapsed);
    const felt = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!this.fightShown.has(key)) {
      this.fightShown.add(key);
      this.blowSounds.hit(move.heavy || hit.ko, at);
      this.blowEffects.star(at, move.heavy || hit.ko ? .7 : .42);
      if (puncher) puncher.hitStopUntil = performance.now() + PUNCH_HIT_STOP_MS[move.heavy ? 'heavy' : 'light'];
      if (victim && !hit.ko) (victim.flinch ??= new FlinchPose()).hit(this.elapsed, hit.yaw, FLINCH_DEGREES[hit.move] ?? 10);
      if (felt && hit.by === this.localId) this.rig.shake(move.heavy ? .03 : .016);
    }
    if (felt && hit.to === this.localId) this.rig.shake(hit.ko ? .09 : move.heavy ? .07 : .035);
    if (this.fightShown.size > 64) this.fightShown.delete(this.fightShown.values().next().value!);
  }
  /** The damage numbers follow the view: projected each frame, in front of the eye only, drifting along the screen's sideways. */
  private drawDamage(): void {
    const camera = this.camera.camera;
    if (!camera) return;
    const eye = this.camera.getPosition(), forward = this.camera.forward, right = this.camera.right;
    this.damageNumbers.update(this.elapsed, (x, y, z) => {
      const ahead = (x - eye.x) * forward.x + (y - eye.y) * forward.y + (z - eye.z) * forward.z;
      if (ahead < .2) return undefined;
      camera.worldToScreen(this.tempPoint.set(x, y, z), this.tempScreen);
      return { x: this.tempScreen.x, y: this.tempScreen.y, distance: Math.hypot(x - eye.x, y - eye.y, z - eye.z) };
    }, { x: right.x, z: right.z });
  }
  /** The fight as drawn (tests): the numbers shown, and each avatar's fight clip and guard layer. */
  getFight() {
    return { numbers: [...this.damageNumbers.shown], avatars: [...this.actors].filter(([, a]) => a.skin).map(([id, a]) => ({ id, clip: a.skin!.clip, guard: +(a.skin!.guardLayer?.weight ?? 0).toFixed(2), step: a.guardStep, yaw: +a.yaw.toFixed(2), x: +a.root.getPosition().x.toFixed(3), z: +a.root.getPosition().z.toFixed(3), vx: +(a.velocity?.x??0).toFixed(2), vz: +(a.velocity?.z??0).toFixed(2), time: +(a.skin!.model.anim?.baseLayer?.activeStateCurrentTime ?? 0).toFixed(3), flinch: !!a.flinch?.active })) };
  }

  /** The kicking leg cuts the air at the same moment of the clip for everyone (clips run on the room's clock). A late arrival hears nothing. */
  private swingKick(avatar: Avatar, now: number): void {
    const { actor } = avatar, blow = KICKS[actor.skill ?? ''], age = now - (actor.animationStartedAt ?? now);
    if (!blow || avatar.swungAt === actor.animationStartedAt || age < blow.swingMs) return;
    avatar.swungAt = actor.animationStartedAt;
    if (age > blow.swingMs + SWING_LATE_MS) return;
    const at = avatar.root.getPosition();
    this.blowSounds.swing(blow.heavy, { x: at.x, y: at.y + 1, z: at.z });
  }
  /** The moment a kick lands, for whoever is looking: a star where the foot is drawn, the sound, and the blow felt by the two involved. */
  private kickLanded(id: string, avatar: Avatar, skin: SkinnedRig, by: string): void {
    const kicker = this.actors.get(by), blow = KICKS[kicker?.actor.skill ?? ''], heavy = !!blow?.heavy;
    const head = skin.bones.head.getPosition(), feet = avatar.root.getPosition();
    const chest = this.tempPosition.set(feet.x, (feet.y + head.y) / 2 + .25, feet.z);
    const left = kicker?.skin?.bones.foot_l.getPosition(), right = kicker?.skin?.bones.foot_r.getPosition();
    const foot = left && right ? (left.distance(chest) < right.distance(chest) ? left : right) : undefined;
    // The room saw the foot a little earlier than this frame draws it: far from the body, the body is where it hurts.
    const at = foot && foot.distance(chest) < KICK_STAR_NEAR ? foot : chest;
    this.blowSounds.hit(heavy, at);
    this.blowEffects.star(at, heavy ? .85 : .6);
    // shortcut: the blow's full life, though the room keeps the last point (kick.ts); send the room's number with the body if that ever shows.
    if (blow) this.damageNumbers.show({ x: at.x, y: at.y + .25, z: at.z }, String(blow.hp), id === this.localId ? 'taken' : heavy ? 'heavy' : 'hit', this.elapsed);
    if (kicker) kicker.hitStopUntil = performance.now() + HIT_STOP_MS;
    const felt = id === this.localId ? (heavy ? .085 : .06) : by === this.localId ? (heavy ? .04 : .026) : 0;
    if (felt && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.rig.shake(felt);
  }
  private bodyRig(avatar: Avatar, skin: SkinnedRig): RagdollRig {
    const hip = skin.hip ??= (skin.model.findByName('hip') as pc.Entity | null) ?? undefined;
    avatar.spine ??= (skin.model.findByName('spine_02') as pc.Entity | null) ?? null;
    return { root: avatar.root, hip: hip!, spine: avatar.spine, neck: skin.model.findByName('neck') as pc.Entity | null, ...skin.bones };
  }
  private seat(avatar: Avatar, skin: SkinnedRig, bike: Bike): void {
    const hip = skin.hip ??= (skin.model.findByName('hip') as pc.Entity | null) ?? undefined;
    if (!hip) return;
    avatar.spine ??= (skin.model.findByName('spine_02') as pc.Entity | null) ?? null;
    const rider={ root: avatar.root, hip, spine: avatar.spine, ...skin.bones, handRigL: skin.drinkHand, handRigR: skin.rightHand };
    if(bike.rig instanceof CarRig)seatCar(bike.rig,rider,vehicleSeat(bike.state,avatar.actor.id),avatar.carScale);else seatRider(bike.rig,rider);
  }

  /** Something plays on the stage: a video on the telão, or a musician at a spot. */
  private stageLive(now:number):boolean {
    return this.stageState?.status==='playing'||this.stageSpots.some(spot=>!!spot.playerId&&LIVE_PHASES.has(musicianPhase(spot,now)?.phase??'fim'));
  }

  /** Full screen holds the mouse on the canvas (mouse-capture.ts): there is no cursor, and no button needed to look around. */
  private get mouseCaptured(): boolean { return document.pointerLockElement === this.canvas; }
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
      if(!event.repeat&&event.code==='KeyR'&&this.actors.get(this.localId)?.actor.fireworkEquipped){event.preventDefault();this.callbacks.onFireworkStow?.();return;}
      // On a bike Space is the brake, even with the toolbar button last clicked still focused.
      if (event.code === 'Space' && this.chasing && document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      // Let a focused interface button receive its native keyboard activation.
      if ((event.code === 'Enter' || event.code === 'Space') && document.activeElement?.tagName === 'BUTTON') return;
      if (!event.repeat && event.code === 'KeyB' && !event.altKey) { this.callbacks.onFly?.(); }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code) || (event.code === 'Space' && (this.chasing || this.flying())) || (event.code === 'ControlLeft' && this.flying())) {
        event.preventDefault(); this.keys.add(event.code);
      }
      if (!event.repeat && event.code === 'KeyE') { event.preventDefault(); this.callbacks.onInteract?.(); }
      // On a bike, the switches on the bars take these keys over.
      const vehicle=this.motos.ridden(this.localId);
      if(vehicle&&vehicle.state.riderId===this.localId){
        if(event.code==='KeyF'){event.preventDefault();this.keys.add(event.code);return;}
        const action:Record<string,string>={KeyH:'headlights',KeyR:'engine',...(isHatch(vehicle.state)?{KeyN:'wipers',KeyO:'hood',KeyU:'trunk',KeyY:event.shiftKey?'right-door':'left-door'}:isCar(vehicle.state)?{KeyN:'wipers',KeyY:event.shiftKey?'right-door':'left-door'}:{})};
        if(action[event.code]){event.preventDefault();if(!event.repeat)this.callbacks.onVehicleControl?.(vehicle.state.id,action[event.code]!);return;}
      }
      if (this.chasing && vehicle?.state.riderId===this.localId && ['KeyZ', 'KeyX', 'KeyC', 'KeyH'].includes(event.code)) { event.preventDefault(); if (!event.repeat) this.motoSwitch(event.code); return; }
      // R: the fist fight's guard (on a bike R is its engine, handled above). The touch buttons press these made-up codes for the punches.
      if (!event.repeat && event.code === 'KeyR') { event.preventDefault(); this.callbacks.onGuard?.(); }
      if (event.code === 'FightLight' || event.code === 'FightHeavy') { this.callbacks.onPunch?.(event.code === 'FightLight' ? 'light' : 'heavy'); return; }
      if (!event.repeat && event.code === 'KeyG') this.callbacks.onEmote?.('dance');
      if (!event.repeat && event.code === 'KeyV') { event.preventDefault(); this.callbacks.onEmote?.('wave'); }
      // F1 toggles an upper-body overlay; the locomotion clip keeps owning the legs.
      if (!event.repeat && event.code === 'F1') { event.preventDefault(); this.callbacks.onEmote?.('cross-arms'); }
      // F lights a persistent cigarette or puts it out; locomotion remains independent.
      if (!event.repeat && event.code === 'KeyF') { event.preventDefault(); this.callbacks.onEmote?.('smoke'); }
      if (!event.repeat && event.code === 'KeyC') { event.preventDefault(); this.callbacks.onSkins?.(); }
      if (!event.repeat && event.code === 'KeyZ') { event.preventDefault(); this.callbacks.onShowNames?.(); }
      if (!event.repeat && event.code === 'KeyQ') { event.preventDefault(); this.callbacks.onCameraChange?.(this.rig.cycle(),this.rig.reach); }
      if (!event.repeat && (event.code === 'Enter' || event.code === 'KeyT')) { event.preventDefault(); this.callbacks.onChat?.(); }
      if (!event.repeat && this.callbacks.onSkillKey?.(event.code)) event.preventDefault();
    });
    listen(window, 'keyup', event => this.keys.delete(event.code));
    listen(window, 'blur', () => { this.keys.clear(); this.dragging = false; });
    listen(this.canvas, 'pointerdown', event => {
      if (event.pointerType === 'touch') { this.touchDown(event); return; }
      if ((!this.enabled&&!this.watchingTv&&!this.watchingStage) || (event.button !== 0 && event.button !== 2)) return;
      this.press = { x: event.clientX, y: event.clientY, at: performance.now(), button: event.button,travel:0 };
      // With the guard up the buttons punch: left a light one, right the heavy one (the drag still turns the view when the mouse is free).
      if (this.enabled && this.callbacks.onPunch?.(event.button === 0 ? 'light' : 'heavy')) this.press = undefined;
      // A locked pointer cannot be captured, and it looks around anyway.
      if (this.mouseCaptured) return;
      this.dragging = true;
      this.canvas.setPointerCapture(event.pointerId);
    });
    listen(this.canvas, 'pointermove', event => {
      if (event.pointerType === 'touch') { this.touchMove(event); return; }
      if(this.press)this.press.travel+=Math.hypot(event.movementX,event.movementY);
      if ((!this.enabled&&!this.watchingTv&&!this.watchingStage) || (!this.dragging&&!this.mouseCaptured)) return;
      if(this.watchingTv||this.watchingStage){this.tvYaw-=event.movementX*.006;this.tvPitch+=event.movementY*.004;return;}
      // A captured pointer now and then reports a jump of thousands of pixels (a browser quirk): no hand moves that far in one event.
      this.rig.drag(clamp(event.movementX, -MOUSE_JUMP, MOUSE_JUMP), clamp(event.movementY, -MOUSE_JUMP, MOUSE_JUMP));
    });
    listen(window, 'pointerup', event => {
      if (event.pointerType === 'touch') { this.touchUp(event); return; }
      this.dragging = false;
      const press = this.press; this.press = undefined;
      if(press?.button===0&&event.button===0&&press.travel<=6&&this.enabled&&!this.watchingTv&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<=6&&performance.now()-press.at<450&&this.shootFirework())return;
      if (!press || press.button !== 2 || !this.enabled || this.watchingTv || this.callbacks.fight?.()?.guard || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6 || performance.now() - press.at > 450) return;
      const rect = this.canvas.getBoundingClientRect();
      // With no cursor on the screen, a click is at the middle of the view.
      const x = this.mouseCaptured ? rect.width / 2 : event.clientX - rect.left, y = this.mouseCaptured ? rect.height / 2 : event.clientY - rect.top;
      const player = this.pickPlayer(x, y, true), moto = this.pickMoto(x, y);
      if (player || moto) this.callbacks.onWorldMenu?.(rect.left + x, rect.top + y, { ...(player ? { player } : {}), ...(moto ? { moto } : {}) });
    });
    listen(this.canvas, 'pointercancel', event => { this.dragging = false; if (event.pointerType === 'touch') this.touchUp(event); });
    // The right button is the game's, over the view and over the HUD; a released drag can land on either. Text boxes keep paste and copy.
    listen(window, 'contextmenu', event => { if (!(event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"]'))) event.preventDefault(); });
    listen(this.canvas, 'wheel', event => {
      if (!this.enabled) return;
      event.preventDefault();
      // Pages and lines scroll by other units than pixels.
      if(this.rig.wheel(event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1)))
        this.callbacks.onCameraChange?.(this.rig.mode,this.rig.reach);
    }, { passive: false });
  }

  private fingerSpan(): number { const [a, b] = [...this.fingers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; }
  private touchDown(event: PointerEvent): void {
    if (!this.enabled && !this.watchingTv && !this.watchingStage) return;
    this.fingers.set(event.pointerId, { x: event.clientX, y: event.clientY, x0: event.clientX, y0: event.clientY, at: performance.now(), moved: 0 });
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* Capture only keeps the drag on the view. */ }
    // A second finger makes it a pinch: neither of the two is a tap or a look any more.
    if (this.fingers.size >= 2) { for (const finger of this.fingers.values()) finger.moved = Infinity; this.pinch = this.fingerSpan(); }
  }
  /** One finger turns the view (the mouse's drag), two zoom it (the wheel's steps); in a TV or stage view they turn the picture. */
  private touchMove(event: PointerEvent): void {
    const finger = this.fingers.get(event.pointerId);
    if (!finger) return;
    const dx = event.clientX - finger.x, dy = event.clientY - finger.y;
    finger.x = event.clientX; finger.y = event.clientY;
    if (finger.moved !== Infinity) finger.moved = Math.max(finger.moved, Math.hypot(finger.x - finger.x0, finger.y - finger.y0));
    if (!this.enabled && !this.watchingTv && !this.watchingStage) return;
    if (this.fingers.size >= 2) {
      const span = this.fingerSpan();
      // Spreading the fingers brings the view closer: the wheel turned the other way.
      if (this.pinch && !this.watchingTv && !this.watchingStage && this.rig.wheel(-(span - this.pinch) * TOUCH_PINCH)) this.callbacks.onCameraChange?.(this.rig.mode, this.rig.reach);
      this.pinch = span;
      return;
    }
    if (finger.moved < TOUCH_SLOP) return;
    if (this.watchingTv || this.watchingStage) { this.tvYaw -= dx * .006 * TOUCH_LOOK; this.tvPitch += dy * .004 * TOUCH_LOOK; return; }
    this.rig.drag(dx * TOUCH_LOOK, dy * TOUCH_LOOK);
  }
  /** The last finger up after a short tap on a player or a bike opens their menu, as a right click does. */
  private touchUp(event: PointerEvent): void {
    const finger = this.fingers.get(event.pointerId);
    if (!finger) return;
    this.fingers.delete(event.pointerId);
    this.pinch = this.fingers.size >= 2 ? this.fingerSpan() : 0;
    if (event.type !== 'pointerup' || this.fingers.size || !this.enabled || this.watchingTv || finger.moved > TAP_SLOP || performance.now() - finger.at > TAP_MS) return;
    if(this.shootFirework())return;
    const rect = this.canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    const player = this.pickPlayer(x, y, true), moto = this.pickMoto(x, y);
    if (player || moto) this.callbacks.onWorldMenu?.(event.clientX, event.clientY, { ...(player ? { player } : {}), ...(moto ? { moto } : {}) });
  }

  private resize(): void {
    if (this.destroyed) return;
    // resizeCanvas pins the canvas's size in pixels; drop it so the canvas measures its CSS box (the whole window in the
    // game) again, also when that box has grown.
    this.canvas.style.width = ''; this.canvas.style.height = '';
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.app.resizeCanvas(width, height);
  }
}

export type { SceneActor, SceneCallbacks, SceneInput, SceneLabel, SceneWorld } from './scene-types';
