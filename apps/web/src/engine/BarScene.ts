import * as pc from 'playcanvas';
import { BLACKJACK_SEATS, BLACKJACK_TABLE, CAFE_TABLES, COLLIDERS, DEFAULT_SKIN, INTERACTABLES, PATCH_MS, SKINS, TICK_MS, WORLD, type Position, type WorldState } from '@bar/shared';
import type { SceneActor, SceneCallbacks, SceneInput, SceneLabel, SceneWorld } from './scene-types';

type Primitive = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane';
type V3 = [number, number, number];
type Limbs = Record<'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'head', pc.Entity>;
const SKIN_BONES = ['head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'middle_01_r',
  'upperleg_l', 'lowerleg_l', 'upperleg_r', 'lowerleg_r'] as const;
type SkinBone = typeof SKIN_BONES[number];
// Skins with a Character Creator / Unreal skeleton name the leg bones differently.
const BONE_ALIASES: Partial<Record<SkinBone, string>> = { upperleg_l: 'thigh_l', lowerleg_l: 'calf_l', upperleg_r: 'thigh_r', lowerleg_r: 'calf_r' };
interface SkinnedRig {
  model: pc.Entity;
  bones: Record<SkinBone, pc.Entity>;
  clip: string;
  /** How far the body lowers to sit: from this skin's hip-joint height to just above a 0.47 m seat. */
  sitDrop: number;
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
 * procedural gestures build on. The other skins are rigged to the same skeleton and reuse them.
 */
const skinUrl = (id: string): string => `${import.meta.env.BASE_URL}models/${id}.glb`;
const SKIN_IDS = new Set<string>(SKINS.map(skin => skin.id));
// The bar is built in real-world metres around this model at its natural 1.86 m.
const PLAYER_MODEL_SCALE = 1;
// The box avatars (NPCs, and players while the model loads) are drawn about 2 m tall and stocky;
// this brings them to the player model's height and a slimmer build.
const BOX_AVATAR_SCALE: V3 = [0.75, 0.9, 0.75];
const WALL_HEIGHT = 3.2;
// Name labels float just above head height.
const LABEL_HEIGHT = 2.15;
// The clip walks at 1.27 m/s. Matching WALK_SPEED/RUN_SPEED exactly would look frantic,
// so the cadence is raised only part of the way.
const WALK_CLIP_SPEED = 1.9;
const RUN_CLIP_SPEED = 2.6;
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
 * The bar and its NPCs are procedural; players use the skeletal model above. There are no physics binaries.
 * The app supplies authoritative snapshots and predicted local positions. This
 * renderer never moves a player on the server or decides whether an action succeeds.
 */
export class BarScene {
  readonly app: pc.Application;
  onInteract?: () => void;
  onEmote?: () => void;
  onChat?: () => void;
  onSkins?: () => void;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: pc.Entity;
  private readonly callbacks: SceneCallbacks;
  private readonly actors = new Map<string, Avatar>();
  private readonly materials: pc.StandardMaterial[] = [];
  private readonly materialCache = new Map<string, pc.StandardMaterial>();
  private readonly textures: pc.Texture[] = [];
  private readonly warmLights: pc.Entity[] = [];
  private readonly partyLights: pc.Entity[] = [];
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
  /** Skins already requested, including failed ones, so a missing file is not fetched again. */
  private readonly skinRequests = new Set<string>();
  private readonly discoBall: pc.Entity;
  private readonly fan: pc.Entity;
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
      graphicsDeviceOptions: { alpha: false, antialias: true, powerPreference: 'high-performance' },
    });
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = color('#7e6e62');
    this.app.scene.fog.type = pc.FOG_LINEAR;
    this.app.scene.fogColor = color('#241d25');
    this.app.scene.fogStart = 23;
    this.app.scene.fogEnd = 52;
    this.app.scene.exposure = 1.15;

    this.camera = new pc.Entity('Third-person camera');
    this.camera.addComponent('camera', {
      clearColor: color('#191c25'), fov: 57, nearClip: 0.12, farClip: 75,
    });
    this.app.root.addChild(this.camera);
    this.camera.setPosition(9.5, 8.5, 12.5);
    this.camera.lookAt(-1, 0.8, -2.5);

    this.staticBatchId = this.app.batcher.addGroup('Static bar furnishings', false, 24).id;
    this.buildArchitecture();
    this.buildCounter();
    this.buildBlackjack();
    this.buildSeating();
    this.buildJukebox();
    this.buildDecor();
    this.buildLighting();
    this.app.batcher.generate([this.staticBatchId]);
    this.staticBatchId = -1;
    this.discoBall = this.buildDiscoBall();
    this.fan = this.buildFan();
    this.installControls();
    this.loadSkin(DEFAULT_SKIN);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.app.on('update', this.update, this);
    this.app.start();
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
    this.updateState({
      players: Object.values(world.players).map(player => ({ ...player, animation: player.animationState })),
      npcs: Object.values(world.npcs).map(npc => ({ ...npc, animation: npc.animationState, role: npc.behavior })),
      event: world.event,
    }, localId);
  }

  setLocal(position: Position & { rotation?: number; animation?: string }): void {
    this.updateLocal(position);
  }

  projectLabels(): SceneLabel[] { return this.getLabels(); }

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
          const moved = actor.x !== existing.actor.x || actor.z !== existing.actor.z;
          // The local position comes from prediction (updateLocal), not from the server snapshot.
          existing.actor = local ? { ...actor, x: existing.actor.x, z: existing.actor.z } : { ...actor };
          if (moved && !local) this.glideTo(existing, PATCH_GLIDE);
          existing.ring.enabled = local;
          if (!npc && this.skinFor(existing.actor) !== existing.skinId) this.replaceAvatar(actor.id, existing);
        } else {
          this.actors.set(actor.id, this.makeAvatar(actor, npc));
          if (local) this.lastRotation = actor.rotation ?? this.lastRotation;
        }
      }
    }
    for (const [id, avatar] of this.actors) {
      if (!seen.has(id)) {
        avatar.root.destroy();
        this.actors.delete(id);
      }
    }
  }

  updateLocal(position: { x: number; z: number; rotation?: number; animation?: string }): void {
    const avatar = this.actors.get(this.localId);
    if (!avatar || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    const moved = position.x !== avatar.actor.x || position.z !== avatar.actor.z;
    avatar.actor = { ...avatar.actor, ...position };
    if (moved) this.glideTo(avatar, INPUT_GLIDE);
    if (position.rotation !== undefined) this.lastRotation = position.rotation;
  }

  /** Glides at constant speed from where the avatar is drawn to its new position; long jumps snap. */
  private glideTo(avatar: Avatar, seconds: number): void {
    const { root, actor } = avatar;
    const drawn = root.getPosition();
    if (Math.hypot(actor.x - drawn.x, actor.z - drawn.z) > SNAP_DISTANCE) root.setPosition(actor.x, 0, actor.z);
    avatar.glideFrom.copy(root.getPosition());
    avatar.glideAt = this.elapsed;
    avatar.glide = seconds;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
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
      this.tempPosition.set(p.x - eye.x, LABEL_HEIGHT - eye.y, p.z - eye.z);
      if (this.tempPosition.dot(forward) <= 0 || this.tempPosition.lengthSq() > 400) continue;
      this.tempPosition.set(p.x, LABEL_HEIGHT, p.z);
      this.camera.camera.worldToScreen(this.tempPosition, this.tempScreen);
      const x = this.tempScreen.x;
      const y = this.tempScreen.y;
      if (x < -50 || x > width + 50 || y < 0 || y > height) continue;
      labels.push({ id, name: avatar.actor.displayName ?? avatar.actor.name ?? 'Visitante', x, y,
        local: id === this.localId, npc: avatar.npc });
    }
    return labels;
  }

  getPerformance(): { fps: number; actors: number } {
    return { fps: this.fps, actors: this.actors.size };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.cleanup.forEach(cleanup => cleanup());
    this.app.off('update', this.update, this);
    this.app.destroy();
    this.materials.forEach(material => material.destroy());
    this.textures.forEach(texture => texture.destroy());
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

  private buildArchitecture(): void {
    const { minX, maxX, minZ, maxZ } = WORLD;
    const width = maxX - minX, depth = maxZ - minZ;
    const floor = this.textured((ctx, size) => {
      ctx.fillStyle = '#332d2b';
      ctx.fillRect(0, 0, size, size);
      const tile = size / 8;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#9c7560' : '#ccb38b';
        ctx.fillRect(x * tile + 2, y * tile + 2, tile - 4, tile - 4);
        ctx.strokeStyle = (x + y) % 2 ? '#a78168' : '#d4bf9a';
        ctx.strokeRect(x * tile + 5, y * tile + 5, tile - 10, tile - 10);
      }
    });
    // 40 cm tiles; the texture holds 8 × 8 of them.
    floor.diffuseMapTiling = new pc.Vec2(width / 3.2, depth / 3.2);
    floor.update();
    this.box('Foundation', [0, -0.2, 0], [width + 0.7, 0.4, depth + 0.7], this.material('#282423'));
    this.shape('Vintage ceramic floor', 'plane', [0, 0.015, 0], [width, 1, depth], floor);

    // Bricks of about 23 × 7.5 cm; the texture holds 4 × 8 of them.
    const brick = (length: number): pc.StandardMaterial => {
      const material = this.textured((ctx, w, h) => {
        ctx.fillStyle = '#5e4036';
        ctx.fillRect(0, 0, w, h);
        const palette = ['#a46b52', '#a66f55', '#996047', '#b27959', '#a2664c'];
        for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
          ctx.fillStyle = palette[Math.abs(row * 7 + col * 3) % palette.length]!;
          ctx.fillRect(col * 128 + (row % 2) * 64 + 3, row * 64 + 3, 122, 58);
          ctx.fillStyle = '#ffffff0c';
          ctx.fillRect(col * 128 + (row % 2) * 64 + 5, row * 64 + 5, 117, 3);
        }
      });
      material.diffuseMapTiling = new pc.Vec2(length / 0.92, WALL_HEIGHT / 0.6);
      material.update();
      return material;
    };
    const darkWood = this.material('#39332d');
    const panel = this.material('#274039');
    const trim = this.material('#ab8550');
    this.box('Back brick wall', [0, WALL_HEIGHT / 2, minZ - 0.15], [width + 0.6, WALL_HEIGHT, 0.3], brick(width));
    const sideBrick = brick(depth);
    for (const x of [minX - 0.15, maxX + 0.15]) this.box('Side brick wall', [x, WALL_HEIGHT / 2, -0.15], [0.3, WALL_HEIGHT, depth + 0.3], sideBrick);
    this.box('Back wainscoting', [0, 0.55, minZ + 0.02], [width, 1.1, 0.04], panel);
    this.box('Back chair rail', [0, 1.11, minZ + 0.04], [width, 0.05, 0.05], trim);
    for (let x = minX + 0.5; x < maxX; x += 1) this.box('Wall panel batten', [x, 0.55, minZ + 0.05], [0.04, 1, 0.03], darkWood);
    for (const x of [minX + 0.02, maxX - 0.02]) {
      const inward = Math.sign(-x);
      this.box('Side wainscoting', [x, 0.55, 0], [0.04, 1.1, depth], panel);
      this.box('Side chair rail', [x + inward * 0.02, 1.11, 0], [0.05, 0.05, depth], trim);
      for (let z = minZ + 0.5; z < maxZ; z += 1) this.box('Side panel batten', [x + inward * 0.03, 0.55, z], [0.03, 1, 0.04], darkWood);
    }
    // No ceiling: the camera looks in from above, so a beam only caps the walls.
    this.box('Back wall beam', [0, WALL_HEIGHT + 0.06, minZ - 0.1], [width + 0.7, 0.12, 0.42], darkWood);
    for (const x of [minX - 0.1, maxX + 0.1]) this.box('Side wall beam', [x, WALL_HEIGHT + 0.06, -0.1], [0.42, 0.12, depth + 0.4], darkWood);
    // Open front is a deliberate cutaway; authoritative room bounds still apply.
    this.box('Front threshold', [0, 0.03, maxZ + 0.1], [width, 0.06, 0.2], darkWood);
    this.box('Entrance mat', [0, 0.02, 6], [1.8, 0.02, 1], this.material('#423e35'));
    this.sign('Welcome mat', [0, 0.032, 6], [1.6, 0.8], ['BEM-VINDO', 'puxe uma cadeira'], { rotation: [0, 0, 0], background: '#373b32', foreground: '#c7b893' });
    this.makeWindow(minX + 0.04, 1.65, 2, 90);
    this.makeWindow(maxX - 0.04, 1.65, 3.6, -90);
  }

  private makeWindow(x: number, y: number, z: number, rotation: number): void {
    const frame = this.group('Window onto the night', [x, y, z]);
    frame.setLocalEulerAngles(0, rotation, 0);
    const wood = this.material('#29312e');
    const glass = this.material('#315365', '#183240');
    this.box('Window glass', [0, 0, 0], [1.8, 1.2, 0.03], glass, frame);
    for (let i = 0; i < 7; i++) {
      const height = 0.3 + (i % 3) * 0.12;
      this.box('Night skyline', [-0.72 + i * 0.24, -0.6 + height / 2, 0.02], [0.16, height, 0.01], this.material(i % 2 ? '#233a48' : '#294550'), frame);
    }
    for (const xx of [-0.92, 0, 0.92]) this.box('Window mullion', [xx, 0, 0.04], [0.05, 1.3, 0.06], wood, frame);
    for (const yy of [-0.63, 0, 0.63]) this.box('Window frame', [0, yy, 0.04], [1.9, 0.05, 0.07], wood, frame);
    this.box('Window sill', [0, -0.68, 0.08], [2, 0.05, 0.18], this.material('#b79a65'), frame);
  }

  private buildCounter(): void {
    const { x, z, hx, hz } = COLLIDERS.find(collider => collider.id === 'bar')!;
    const front = z + hz, wall = WORLD.minZ, topY = 1.1;
    const wood = this.material('#663f29');
    const top = this.material('#a67340', undefined, 0.4);
    const dark = this.material('#312922');
    const brass = this.material('#b58e4d', undefined, 0.3);
    const green = this.material('#2a4439');
    this.box('Main counter cabinet', [x, 0.52, z], [hx * 2, 1.04, hz * 2], wood);
    this.box('Polished counter top', [x, topY - 0.03, z + 0.04], [hx * 2 + 0.1, 0.06, hz * 2 + 0.16], top);
    this.box('Counter kickboard', [x, 0.08, front], [hx * 2, 0.16, 0.04], dark);
    this.box('Counter brass footrest', [x, 0.22, front + 0.12], [hx * 2 - 0.2, 0.035, 0.035], brass);
    for (let px = x - hx + 0.6; px < x + hx; px += 1.2) {
      this.box('Counter green panel', [px, 0.6, front + 0.01], [1, 0.66, 0.02], green);
      this.box('Counter panel trim', [px, 0.94, front + 0.02], [1.04, 0.02, 0.02], brass);
      this.box('Footrest support', [px, 0.14, front + 0.07], [0.025, 0.16, 0.1], brass);
    }
    for (let i = 0; i < 6; i++) this.makeStool(x - hx + 0.8 + i * 1.15, front + 0.55, 0);

    // Back bar against the wall, behind the bartender.
    this.box('Back bar cabinet', [x, 0.45, wall + 0.27], [hx * 2 - 0.4, 0.9, 0.5], wood);
    this.box('Back bar worktop', [x, 0.92, wall + 0.27], [hx * 2 - 0.35, 0.04, 0.54], top);
    this.box('Back bar mirror surround', [x, 1.85, wall + 0.04], [hx * 2 - 0.6, 1.5, 0.06], dark);
    this.box('Back bar mirror', [x, 1.85, wall + 0.08], [hx * 2 - 0.8, 1.32, 0.02], this.material('#38514b', '#10261e'));
    for (const y of [1.3, 1.72, 2.14]) {
      this.box('Bottle shelf', [x, y, wall + 0.2], [hx * 2 - 0.7, 0.03, 0.24], wood);
      this.box('Shelf edge', [x, y - 0.005, wall + 0.32], [hx * 2 - 0.7, 0.035, 0.015], brass);
      for (let i = 0, bx = x - hx + 0.5; bx <= x + hx - 0.5; i++, bx += 0.26) {
        const bottle = this.makeBottle(bx, y + 0.015, wall + 0.2, i % 4);
        bottle.setLocalScale(1, 0.85 + (i % 3) * 0.15, 1);
      }
    }
    this.sign('House signature', [x, 2.86, wall + 0.06], [2.3, 0.5], ['B.A.R.', 'BOM AMIGO REAPARECE'],
      { background: '#193b30', foreground: '#ffde90', glow: true });
    this.sign('House menu', [0.6, 1.75, wall + 0.03], [1.1, 1.3], ['DA CASA', 'Café passado  ·  4', 'Caldo do dia  ·  12', 'Conversa fiada  ·  grátis', 'FIADO? SÓ AMANHÃ.'],
      { background: '#253329', foreground: '#e5dcc1', accent: '#ac8952' });

    this.makeBottle(x - hx + 0.9, topY, z - 0.1, 0);
    this.makeBottle(x - hx + 1.15, topY, z - 0.05, 1);
    this.makeCup(x + 1.6, topY, z + 0.15);
    this.makeCup(x + 2.3, topY, z + 0.1);
    this.box('Bar service towel', [x - 0.4, topY + 0.005, z - 0.05], [0.45, 0.01, 0.3], this.material('#dbcead'));
    const tap = this.group('Draft taps', [x + 1, topY, z - 0.1]);
    this.shape('Tap column', 'cylinder', [0, 0.18, 0], [0.06, 0.36, 0.06], brass, tap);
    this.box('Tap crossbar', [0, 0.33, 0], [0.36, 0.05, 0.05], brass, tap);
    for (const tx of [-0.12, 0.12]) {
      this.box('Tap handle', [tx, 0.42, 0.03], [0.035, 0.14, 0.045], dark, tap);
      this.box('Tap nozzle', [tx, 0.29, 0.06], [0.025, 0.05, 0.09], brass, tap);
    }
    const register = this.group('Old cash register', [x - hx + 0.5, topY, z - 0.05]);
    this.box('Register body', [0, 0.11, 0], [0.36, 0.22, 0.3], this.material('#657064'), register);
    this.box('Register display', [0, 0.25, -0.06], [0.28, 0.1, 0.08], this.material('#27372c'), register);
    this.box('Register drawer', [0, 0.02, 0.03], [0.4, 0.04, 0.36], this.material('#2d3930'), register);
  }

  private makeBottle(x: number, y: number, z: number, variant = 0, parent?: pc.Entity): pc.Entity {
    const bottle = this.group('Bottle', [x, y, z], parent);
    const glass = this.material(['#304e2b', '#73502a', '#2d594e', '#61372e'][variant % 4]!);
    this.shape('Bottle body', 'cylinder', [0, 0.11, 0], [0.075, 0.22, 0.075], glass, bottle);
    this.shape('Bottle neck', 'cylinder', [0, 0.255, 0], [0.03, 0.07, 0.03], glass, bottle);
    this.shape('Bottle label', 'cylinder', [0, 0.12, 0], [0.077, 0.08, 0.077], this.material(variant % 2 ? '#e4c687' : '#d7ccad'), bottle);
    this.shape('Bottle cap', 'cylinder', [0, 0.295, 0], [0.034, 0.012, 0.034], this.material('#a58d50'), bottle);
    return bottle;
  }

  private makeCup(x: number, y: number, z: number, parent?: pc.Entity): pc.Entity {
    const cup = this.group('Drink', [x, y, z], parent);
    this.shape('Glass', 'cylinder', [0, 0.06, 0], [0.08, 0.12, 0.08], this.material('#d59c3c'), cup);
    this.shape('Foam', 'cylinder', [0, 0.125, 0], [0.082, 0.015, 0.082], this.material('#f5e7bf'), cup);
    return cup;
  }

  private makeStool(x: number, z: number, rotation: number): void {
    const stool = this.group('Bar stool', [x, 0, z]);
    stool.setLocalEulerAngles(0, rotation, 0);
    const metal = this.material('#383b33');
    this.shape('Round velvet cushion', 'cylinder', [0, 0.74, 0], [0.38, 0.06, 0.38], this.material('#784536'), stool);
    this.shape('Seat rim', 'cylinder', [0, 0.7, 0], [0.4, 0.03, 0.4], metal, stool);
    this.shape('Stool stem', 'cylinder', [0, 0.36, 0], [0.05, 0.68, 0.05], metal, stool);
    this.shape('Stool footrest', 'cylinder', [0, 0.3, 0], [0.3, 0.02, 0.3], metal, stool);
    this.shape('Stool foot', 'cylinder', [0, 0.015, 0], [0.36, 0.03, 0.36], metal, stool);
  }

  private buildBlackjack(): void {
    const { x, z, rx, rz } = BLACKJACK_TABLE;
    const table = this.group('Blackjack table', [x, 0, z]);
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
    for (const seat of BLACKJACK_SEATS) this.makeChair(seat.x, seat.z, seat.rotation * RAD_TO_DEG);
    this.sign('Blackjack wall poster', [x, 1.85, WORLD.minZ + 0.03], [1.3, 0.86], ['21', 'SORTE É SENTAR À MESA', 'BLACKJACK · FICHAS VIRTUAIS'], { background: '#733e31', foreground: '#f4deb0' });
  }

  /** Seat top at 0.47 m; the chair faces `rotation` (degrees, zero = +Z) with its back behind the sitter. */
  private makeChair(x: number, z: number, rotation: number): void {
    const chair = this.group('Wooden chair', [x, 0, z]);
    chair.setLocalEulerAngles(0, rotation, 0);
    const wood = this.material('#825a34');
    const seat = this.material('#a2733c');
    this.box('Chair seat', [0, 0.45, 0], [0.44, 0.04, 0.42], seat, chair);
    for (const xx of [-0.19, 0.19]) for (const zz of [-0.18, 0.18]) this.box('Chair leg', [xx, 0.215, zz], [0.035, 0.43, 0.035], wood, chair);
    for (const xx of [-0.19, 0.19]) this.box('Chair back upright', [xx, 0.7, -0.19], [0.035, 0.46, 0.035], wood, chair);
    for (const yy of [0.66, 0.84]) this.box('Chair back slat', [0, yy, -0.195], [0.38, 0.08, 0.02], seat, chair);
  }

  private buildSeating(): void {
    const wood = this.material('#9a683a');
    const dark = this.material('#4f3928');
    for (const { x, z, hx, hz } of COLLIDERS.filter(collider => collider.id.startsWith('table-'))) {
      this.box('Cafe table top', [x, 0.74, z], [hx * 2, 0.04, hz * 2], wood);
      this.shape('Cafe table stem', 'cylinder', [x, 0.37, z], [0.07, 0.72, 0.07], dark);
      this.box('Cafe table foot', [x, 0.02, z], [0.56, 0.04, 0.06], dark);
      this.box('Cafe table cross foot', [x, 0.02, z], [0.06, 0.04, 0.56], dark);
      this.makeCup(x + 0.16, 0.76, z + 0.12);
      this.makeBottle(x - 0.1, 0.76, z - 0.14, 1);
      this.box('Folded napkins', [x - 0.2, 0.765, z + 0.18], [0.12, 0.01, 0.12], this.material('#e2cda4'));
    }
    for (const seat of INTERACTABLES.filter(object => object.type === 'seat')) {
      this.makeChair(seat.x, seat.z, (seat.rotation ?? 0) * RAD_TO_DEG);
    }
    const bench = COLLIDERS.find(collider => collider.id === 'bench')!;
    const cushion = this.material('#704234');
    this.box('Wall bench seat', [bench.x, 0.42, bench.z], [bench.hx * 2, 0.08, bench.hz * 2], cushion);
    this.box('Wall bench back', [bench.x - bench.hx + 0.05, 0.72, bench.z], [0.08, 0.55, bench.hz * 2], cushion);
    for (const dz of [-bench.hz + 0.15, bench.hz - 0.15]) this.box('Bench leg', [bench.x, 0.19, bench.z + dz], [bench.hx * 2 - 0.05, 0.38, 0.06], dark);
  }

  private buildJukebox(): void {
    const collider = COLLIDERS.find(collider => collider.id === 'jukebox')!;
    const juke = this.group('Jukebox', [collider.x, 0, collider.z]);
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
    this.sign('Jukebox marquee', [collider.x, 1.24, collider.z + collider.hz + 0.05], [0.46, 0.18], ['RÁDIO BOTECO'], { background: '#bba871', foreground: '#373e30' });
    this.sign('Music wall poster', [WORLD.maxX - 0.03, 1.8, -4.4], [1, 0.62], ['SOM NA CAIXA', 'a noite é nossa'], { rotation: [90, -90, 0], background: '#234746', foreground: '#ead298' });
    this.box('Dance floor rug', [8, 0.02, -4.7], [2.6, 0.02, 2.6], this.material('#574937'));
  }

  private buildDecor(): void {
    this.sign('House rules print', [WORLD.minX + 0.03, 1.85, -1], [1, 1.05], ['BOTECO', 'desde sempre.', 'Gente boa.', 'História ruim.', 'Noite comprida.'], { rotation: [90, 90, 0], background: '#bc9a61', foreground: '#4b3a2a', accent: '#59422b' });
    this.sign('House small print', [WORLD.maxX - 0.03, 1.85, 1.2], [1, 1.05], ['DEVAGAR', 'Aqui o tempo', 'passa na', 'segunda rodada.'], { rotation: [90, -90, 0], background: '#734f3a', foreground: '#e8d4a9' });
    this.makePlant(-9.45, 0, 6.45);
    this.makePlant(9.45, 0, 6.45);
    this.makePlant(-9.45, 0, -2.9);
    this.makePlant(9.45, 0, -1.8);
    const cable = this.material('#262923');
    const bulb = this.material('#f4cd79', '#efb94e');
    // A festoon strand across the room makes the cutaway read as a lived-in space.
    for (let i = 0; i < 13; i++) {
      const x = -9 + i * 1.5;
      const y = 3 - Math.sin((i / 12) * Math.PI) * 0.35;
      this.shape('Festoon bulb', 'sphere', [x, y - 0.06, -1.6], [0.07, 0.09, 0.07], bulb);
      this.box('Festoon cable', [x, y, -1.6], [1.52, 0.012, 0.012], cable, undefined, [0, 0, (i - 6) * 0.6]);
    }
  }

  private makePlant(x: number, y: number, z: number): void {
    const plant = this.group('Potted plant', [x, y, z]);
    this.shape('Terracotta pot', 'cylinder', [0, 0.21, 0], [0.42, 0.42, 0.42], this.material('#a16749'), plant);
    this.shape('Pot rim', 'cylinder', [0, 0.41, 0], [0.46, 0.06, 0.46], this.material('#b47a56'), plant);
    this.shape('Pot soil', 'cylinder', [0, 0.445, 0], [0.38, 0.02, 0.38], this.material('#342f25'), plant);
    const leaf = this.material('#41654b');
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * TAU;
      this.shape('Angular plant leaf', 'cone', [Math.cos(angle) * 0.12, 0.75 + (i % 3) * 0.07, Math.sin(angle) * 0.12], [0.13, 0.7, 0.19], leaf, plant, [Math.cos(angle) * 25, i * 45, Math.sin(angle) * 25]);
    }
  }

  private buildLighting(): void {
    const sun = new pc.Entity('Warm key light');
    sun.addComponent('light', { type: 'directional', color: color('#ffe0af'), intensity: 0.95,
      castShadows: true, shadowDistance: 25, shadowResolution: 1024, shadowBias: 0.3,
      normalOffsetBias: 0.07 });
    sun.setEulerAngles(52, -28, 0);
    this.app.root.addChild(sun);
    this.warmLights.push(sun);
    const lampMaterial = this.material('#274239');
    const brass = this.material('#a98247');
    const glow = this.material('#ffe5b2', '#ffd38b');
    const counter = COLLIDERS.find(collider => collider.id === 'bar')!;
    const lamps: V3[] = [
      [counter.x - 1.6, 2.3, counter.z], [counter.x + 1.6, 2.3, counter.z],
      [BLACKJACK_TABLE.x, 2.15, BLACKJACK_TABLE.z],
      ...CAFE_TABLES.map(({ x, z }): V3 => [x, 2, z]),
    ];
    for (const [x, y, z] of lamps) {
      const lamp = this.group('Hanging enamel lamp', [x, y, z]);
      this.shape('Lamp cord', 'cylinder', [0, (WALL_HEIGHT - y) / 2, 0], [0.012, WALL_HEIGHT - y, 0.012], brass, lamp);
      this.shape('Enamel shade', 'cone', [0, 0, 0], [0.42, 0.22, 0.42], lampMaterial, lamp);
      this.shape('Lamp glowing diffuser', 'cylinder', [0, -0.11, 0], [0.38, 0.01, 0.38], glow, lamp);
    }
    // One light per area rather than per lamp keeps the light count low.
    for (const [x, y, z, range] of [[counter.x, 2.1, counter.z, 6], [BLACKJACK_TABLE.x, 2, BLACKJACK_TABLE.z, 5.5], [-5.4, 1.9, 1.5, 6.5], [5.6, 1.9, 1.5, 6.5]] as const) {
      const light = new pc.Entity('Amber hanging light');
      light.addComponent('light', { type: 'omni', color: color('#ffd09a'), intensity: 1.5, range, castShadows: false });
      light.setPosition(x, y, z);
      this.app.root.addChild(light);
      this.warmLights.push(light);
    }
    for (const [x, hex] of [[-5, '#cf5275'], [5, '#41afaa']] as const) {
      const light = new pc.Entity('Party wash');
      light.addComponent('light', { type: 'omni', color: color(hex), intensity: 0, range: 12, castShadows: false });
      light.setPosition(x, 2.8, -1.5);
      this.app.root.addChild(light);
      this.partyLights.push(light);
    }
  }

  private buildDiscoBall(): pc.Entity {
    const disco = this.group('Disco ball', [8, 2.75, -4.7]);
    this.shape('Mirror ball', 'sphere', [0, 0, 0], [0.32, 0.32, 0.32], this.material('#9cb2a6', '#193c39', 0.2), disco);
    const tile = this.material('#d3dfcb', '#384f41');
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * TAU;
      this.box('Disco mirror', [Math.cos(angle) * 0.16, 0, Math.sin(angle) * 0.16], [0.06, 0.06, 0.012], tile, disco, [0, -i * 36 + 90, 0]);
    }
    return disco;
  }

  private buildFan(): pc.Entity {
    const fan = this.group('Ceiling fan', [-1.2, 2.95, 0.6]);
    const wood = this.material('#45372c');
    this.shape('Fan spindle', 'cylinder', [0, 0.13, 0], [0.04, 0.26, 0.04], wood, fan);
    this.shape('Fan motor', 'cylinder', [0, -0.03, 0], [0.2, 0.1, 0.2], this.material('#746747'), fan);
    for (let i = 0; i < 4; i++) {
      const blade = this.group('Fan blade pivot', [0, -0.05, 0], fan);
      blade.setLocalEulerAngles(0, i * 90, 0);
      this.box('Fan blade', [0.36, 0, 0], [0.6, 0.012, 0.12], wood, blade, [0, 0, 6]);
    }
    return fan;
  }

  /** Starts downloading every skin, e.g. when the skin selector opens, so a switch is instant. */
  preloadSkins(): void {
    for (const { id } of SKINS) this.loadSkin(id);
  }

  private loadSkin(id: string): void {
    if (this.skinRequests.has(id)) return;
    this.skinRequests.add(id);
    this.app.assets.loadFromUrl(skinUrl(id), 'container', (error, asset) => {
      if (this.destroyed) return;
      if (error || !asset) { console.warn(`Skin "${id}" indisponível; usando outro visual.`, error); return; }
      this.skinModels.set(id, asset.resource as pc.ContainerResource);
      // Players waiting for this skin (or for any model, on the box avatar) switch to it in place.
      for (const [actorId, avatar] of this.actors) {
        if (!avatar.npc && this.skinFor(avatar.actor) !== avatar.skinId) this.replaceAvatar(actorId, avatar);
      }
    });
  }

  /**
   * The skin to draw for a player: the chosen one once loaded, meanwhile the default one, and the box
   * avatar until the default (which carries the animations) has arrived. Asks for missing skins.
   */
  private skinFor(actor: SceneActor): string | undefined {
    const wanted = actor.skin && SKIN_IDS.has(actor.skin) ? actor.skin : DEFAULT_SKIN;
    if (!this.skinModels.has(wanted)) this.loadSkin(wanted);
    if (!this.skinModels.has(DEFAULT_SKIN)) return undefined;
    return this.skinModels.has(wanted) ? wanted : DEFAULT_SKIN;
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
    // Skins rigged to Nathan's skeleton reuse its clips; skins with their own skeleton ship retargeted ones.
    const clips = model.animations.length ? model : this.skinModels.get(DEFAULT_SKIN)!;
    const tracks = clips.animations.map(asset => asset.resource as pc.AnimTrack);
    // The first clip assigned becomes the default state.
    for (const name of ['Idle', 'Walk', 'Pose']) {
      const track = tracks.find(candidate => candidate.name === name);
      if (track) entity.anim!.assignAnimation(name, track);
    }
    const bones = Object.fromEntries(SKIN_BONES.map(name => [name, entity.findByName(name) ?? entity.findByName(BONE_ALIASES[name] ?? name)])) as Record<SkinBone, pc.Entity>;
    // Measured in the bind pose, before any clip runs; the thighs are level at about 0.56 m when seated.
    const hipHeight = bones.upperleg_l.getPosition().y - entity.getPosition().y;
    // No clip yet: the first pose is applied without a cross-fade (e.g. a skin swap while seated).
    return { model: entity, bones, clip: '', sitDrop: hipHeight - 0.56 };
  }

  private makeAvatar(actor: SceneActor, npc: boolean): Avatar {
    const root = this.group(`Avatar ${actor.id}`, [actor.x, 0, actor.z]);
    const body = this.group('Animated rig', [0, 0, 0], root);
    const skinId = npc ? undefined : this.skinFor(actor);
    if (!skinId) body.setLocalScale(...BOX_AVATAR_SCALE);
    const isBartender = actor.role === 'bartender' || (actor.displayName ?? actor.name)?.toLowerCase().includes('zé');
    const hash = [...actor.id].reduce((value, letter) => value + letter.charCodeAt(0), 0);
    const ring = this.shape('Local player marker', 'cylinder', [0, 0.027, 0], [0.83, 0.018, 0.83], this.material('#b1a067', '#514322'), root);
    ring.enabled = actor.id === this.localId;
    const motion = { glideFrom: new pc.Vec3(actor.x, 0, actor.z), glideAt: 0, glide: PATCH_GLIDE, yaw: (actor.rotation ?? 0) * RAD_TO_DEG };
    root.setEulerAngles(0, motion.yaw, 0);
    if (skinId) {
      const cup = this.makeCup(0, 0, 0, root);
      cup.enabled = false;
      return { root, body, skin: this.makeSkin(body, this.skinModels.get(skinId)!), skinId, cup, ring, actor: { ...actor }, npc, phase: hash % 12, ...motion };
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
    root.setPosition(lerp(glideFrom.x, actor.x, progress), 0, lerp(glideFrom.z, actor.z, progress));
    let animation = (actor.animation ?? actor.state ?? 'idle').toLowerCase();
    if (moving && animation === 'idle') animation = 'walk';
    const seated = animation.includes('sit') || animation.includes('seat') || animation.includes('blackjack');
    // The local player faces the predicted travel direction; the server's lags behind it.
    // Seats set the facing on the server, so seated players keep that one.
    if (local && seated) this.lastRotation = actor.rotation ?? this.lastRotation;
    const rotation = (local ? this.lastRotation : actor.rotation ?? 0) * RAD_TO_DEG;
    const turn = ((rotation - avatar.yaw + 540) % 360) - 180;
    avatar.yaw = ((avatar.yaw + turn * (1 - Math.exp(-16 * dt)) + 540) % 360) - 180;
    root.setEulerAngles(0, avatar.yaw, 0);
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
  }

  /**
   * The clip sets the base pose; gestures are extra joint turns about the body's own axes,
   * which keeps them independent of each bone's local frame. The model faces +Z, its left on +X.
   */
  private poseSkin({ body, cup }: Avatar, skin: SkinnedRig, pose: Pose): void {
    const { t, seated, dancing, drinking, waving } = pose;
    const { bones } = skin;
    const anim = skin.model.anim!;
    // Gestures are built on the static Pose; plain standing uses the animated Idle.
    const gesture = seated > 0.01 || dancing || drinking || waving;
    const clip = pose.walking && seated < 0.5 ? 'Walk' : gesture ? 'Pose' : 'Idle';
    if (skin.clip !== clip) {
      anim.baseLayer?.transition(clip, skin.clip ? 0.25 : 0);
      skin.clip = clip;
    }
    anim.speed = clip === 'Walk' ? (pose.running ? RUN_CLIP_SPEED : WALK_CLIP_SPEED) : 1;
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
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;
    this.frames++;
    if (this.frameSeconds >= 1) {
      this.fps = Math.round(this.frames / this.frameSeconds);
      this.frameSeconds = 0;
      this.frames = 0;
    }
    for (const avatar of this.actors.values()) this.animateAvatar(avatar, dt);
    const player = this.actors.get(this.localId);
    if (player && this.enabled) {
      const p = player.root.getPosition();
      const smooth = 1 - Math.exp(-10 * dt);
      this.cameraTarget.set(lerp(this.cameraTarget.x, p.x, smooth), 1.25,
        lerp(this.cameraTarget.z, p.z, smooth));
      const horizontal = Math.cos(this.pitch) * this.distance;
      let dx = Math.sin(this.yaw) * horizontal;
      let dz = Math.cos(this.yaw) * horizontal;
      let dy = Math.sin(this.pitch) * this.distance;
      // Shorten the whole boom at walls, preserving the orbit direction. The front (+Z) is the open
      // cutaway, so the camera may pass it. Interior objects are below the sight line; no rigidbody runtime is required.
      let ratio = 1;
      if (dx > 0) ratio = Math.min(ratio, (WORLD.maxX - 0.5 - this.cameraTarget.x) / dx);
      if (dx < 0) ratio = Math.min(ratio, (WORLD.minX + 0.5 - this.cameraTarget.x) / dx);
      if (dz < 0) ratio = Math.min(ratio, (WORLD.minZ + 0.5 - this.cameraTarget.z) / dz);
      ratio = clamp(ratio, 0.12, 1);
      dx *= ratio; dz *= ratio; dy *= ratio;
      this.camera.setPosition(this.cameraTarget.x + dx, this.cameraTarget.y + dy, this.cameraTarget.z + dz);
      this.camera.lookAt(this.cameraTarget);
    } else if (!player) {
      this.camera.setPosition(9 + Math.sin(this.elapsed * 0.035) * 1.2, 8.2, 12.5);
      this.camera.lookAt(-1, 0.9, -2.4);
    }
    const blackout = this.eventType === 'BLACKOUT';
    const party = this.eventType === 'PARTY';
    for (let i = 0; i < this.warmLights.length; i++) {
      const light = this.warmLights[i]!.light;
      if (light) light.intensity = blackout ? (i === 0 ? 0.07 : 0.03) : i === 0 ? 0.95 : party ? 0.8 : 1.5;
    }
    this.app.scene.ambientLight = color(blackout ? '#262b35' : party ? '#7e6170' : '#7e6e62');
    for (let i = 0; i < this.partyLights.length; i++) {
      const light = this.partyLights[i]!.light;
      if (light) light.intensity = party ? 2 + Math.sin(this.elapsed * 3 + i * Math.PI) : 0;
    }
    this.discoBall.rotate(0, dt * (party ? 70 : 8), 0);
    if (!blackout) this.fan.rotate(0, dt * 90, 0);
    // The fan hangs at the height the camera boom passes through; hide it while it is near the line of
    // sight from the camera to the player, rather than let its blades fill the view.
    const eye = this.camera.getPosition(), hub = this.fan.getPosition(), target = this.cameraTarget;
    const sx = target.x - eye.x, sy = target.y - eye.y, sz = target.z - eye.z;
    const along = clamp(((hub.x - eye.x) * sx + (hub.y - eye.y) * sy + (hub.z - eye.z) * sz) / (sx * sx + sy * sy + sz * sz || 1), 0, 1);
    this.fan.enabled = Math.hypot(eye.x + sx * along - hub.x, eye.y + sy * along - hub.y, eye.z + sz * along - hub.z) > 1;
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
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        event.preventDefault(); this.keys.add(event.code);
      }
      if (!event.repeat && event.code === 'KeyE') { event.preventDefault(); this.callbacks.onInteract?.(); this.onInteract?.(); }
      if (!event.repeat && event.code === 'KeyG') { this.callbacks.onEmote?.('dance'); this.onEmote?.(); }
      if (!event.repeat && event.code === 'KeyV') this.callbacks.onEmote?.('wave');
      if (!event.repeat && event.code === 'KeyC') { event.preventDefault(); this.onSkins?.(); }
      if (!event.repeat && (event.code === 'Enter' || event.code === 'KeyT')) { event.preventDefault(); this.onChat?.(); }
    });
    listen(window, 'keyup', event => this.keys.delete(event.code));
    listen(window, 'blur', () => { this.keys.clear(); this.dragging = false; });
    listen(this.canvas, 'pointerdown', event => {
      if (!this.enabled || (event.button !== 0 && event.button !== 2)) return;
      this.dragging = true;
      this.canvas.setPointerCapture(event.pointerId);
    });
    listen(this.canvas, 'pointermove', event => {
      if (!this.enabled || !this.dragging) return;
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
