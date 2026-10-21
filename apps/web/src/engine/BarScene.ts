import * as pc from 'playcanvas';
import { COLLIDERS, INTERACTABLES, WORLD, type Position, type WorldState } from '@bar/shared';
import type { SceneActor, SceneCallbacks, SceneInput, SceneLabel, SceneWorld } from './scene-types';

type Primitive = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane';
type V3 = [number, number, number];
interface Avatar {
  root: pc.Entity;
  body: pc.Entity;
  leftArm: pc.Entity;
  rightArm: pc.Entity;
  leftLeg: pc.Entity;
  rightLeg: pc.Entity;
  head: pc.Entity;
  cup: pc.Entity;
  ring: pc.Entity;
  actor: SceneActor;
  npc: boolean;
  phase: number;
  seatedBlend?: number;
}

const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;
const color = (hex: string): pc.Color => new pc.Color().fromString(hex);
const lerp = (a: number, b: number, amount: number): number => a + (b - a) * amount;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/**
 * The bar is procedural and ships without third-party artwork or physics binaries.
 * The app supplies authoritative snapshots and predicted local positions. This
 * renderer never moves a player on the server or decides whether an action succeeds.
 */
export class BarScene {
  readonly app: pc.Application;
  onInteract?: () => void;
  onEmote?: () => void;
  onChat?: () => void;
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
  private readonly discoBall: pc.Entity;
  private readonly fan: pc.Entity;
  private localId = '';
  private enabled = false;
  private destroyed = false;
  private elapsed = 0;
  private yaw = 0.15;
  private pitch = 0.55;
  private distance = 7.6;
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
    this.camera.setPosition(14, 13, 18);
    this.camera.lookAt(-1, 0.8, -3);

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
        if (existing) {
          existing.actor = { ...actor };
          existing.ring.enabled = actor.id === localId;
        } else {
          this.actors.set(actor.id, this.makeAvatar(actor, npc));
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
    avatar.actor = { ...avatar.actor, ...position };
    avatar.root.setPosition(position.x, 0, position.z);
    if (position.rotation !== undefined) this.lastRotation = position.rotation;
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
      this.tempPosition.set(p.x - eye.x, 2.3 - eye.y, p.z - eye.z);
      if (this.tempPosition.dot(forward) <= 0 || this.tempPosition.lengthSq() > 400) continue;
      this.tempPosition.set(p.x, 2.3, p.z);
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
    const floor = this.textured((ctx, width) => {
      ctx.fillStyle = '#332d2b';
      ctx.fillRect(0, 0, width, width);
      const tile = width / 8;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#9c7560' : '#ccb38b';
        ctx.fillRect(x * tile + 2, y * tile + 2, tile - 4, tile - 4);
        ctx.strokeStyle = (x + y) % 2 ? '#a78168' : '#d4bf9a';
        ctx.strokeRect(x * tile + 5, y * tile + 5, tile - 10, tile - 10);
      }
    });
    floor.diffuseMapTiling = new pc.Vec2(4, 3);
    floor.update();
    this.box('Foundation', [0, -0.2, 0], [28.7, 0.4, 22.7], this.material('#282423'));
    this.shape('Vintage ceramic floor', 'plane', [0, 0.015, 0], [28, 1, 22], floor);

    const brick = this.textured((ctx, width, height) => {
      ctx.fillStyle = '#5e4036';
      ctx.fillRect(0, 0, width, height);
      const palette = ['#a46b52', '#a66f55', '#996047', '#b27959', '#a2664c'];
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
        ctx.fillStyle = palette[Math.abs(row * 7 + col * 3) % palette.length]!;
        ctx.fillRect(col * 128 + (row % 2) * 64 + 3, row * 64 + 3, 122, 58);
        ctx.fillStyle = '#ffffff0c';
        ctx.fillRect(col * 128 + (row % 2) * 64 + 5, row * 64 + 5, 117, 3);
      }
    });
    brick.diffuseMapTiling = new pc.Vec2(4, 1);
    brick.update();
    const darkWood = this.material('#39332d');
    const panel = this.material('#274039');
    const trim = this.material('#ab8550');
    this.box('Back brick wall', [0, 3.2, -11], [28, 4, 0.45], brick);
    this.box('Left brick wall', [-14, 3.2, 0], [0.45, 4, 22], brick);
    this.box('Right brick wall', [14, 3.2, 0], [0.45, 4, 22], brick);
    this.box('Back wainscoting', [0, 0.7, -10.72], [28, 1.4, 0.14], panel);
    this.box('Left wainscoting', [-13.72, 0.7, 0], [0.14, 1.4, 22], panel);
    this.box('Right wainscoting', [13.72, 0.7, 0], [0.14, 1.4, 22], panel);
    for (const z of [-10.58]) this.box('Back brass rail', [0, 1.42, z], [28, 0.06, 0.08], trim);
    for (const x of [-13.58, 13.58]) this.box('Side brass rail', [x, 1.42, 0], [0.08, 0.06, 22], trim);
    for (let x = -13; x <= 13; x += 2) this.box('Wall panel batten', [x, 0.7, -10.58], [0.06, 1.3, 0.08], darkWood);
    for (const x of [-13.6, 13.6]) for (let z = -10; z <= 10; z += 2) {
      this.box('Side panel batten', [x, 0.7, z], [0.08, 1.3, 0.06], darkWood);
    }
    for (const x of [-13.4, -4.6, 4.6, 13.4]) {
      this.box('Roof timber', [x, 5.25, 0], [0.28, 0.35, 22], darkWood);
    }
    for (const z of [-10.5, -2.5, 6]) this.box('Cross timber', [0, 5.12, z], [28, 0.25, 0.24], darkWood);
    // Open front is a deliberate cutaway; authoritative room bounds still apply.
    this.box('Front threshold', [0, 0.05, 10.7], [28, 0.1, 0.4], darkWood);
    this.box('Entrance mat', [0, 0.035, 8.3], [4.3, 0.04, 2.5], this.material('#423e35'));
    this.sign('Welcome mat', [0, 0.065, 8.3], [3.6, 1.6], ['BEM-VINDO', 'puxe uma cadeira'], { rotation: [0, 0, 0], background: '#373b32', foreground: '#c7b893' });
    this.makeWindow(-13.68, 3.25, 3, 90);
    this.makeWindow(13.68, 3.25, 4.5, -90);
  }

  private makeWindow(x: number, y: number, z: number, rotation: number): void {
    const frame = this.group('Window onto the night', [x, y, z]);
    frame.setLocalEulerAngles(0, rotation, 0);
    const wood = this.material('#29312e');
    const glass = this.material('#315365', '#183240');
    this.box('Window glass', [0, 0, 0], [4.1, 2.4, 0.08], glass, frame);
    for (const xx of [-2.13, 0, 2.13]) this.box('Window mullion', [xx, 0, 0.09], [0.13, 2.7, 0.16], wood, frame);
    for (const yy of [-1.3, 0, 1.3]) this.box('Window frame', [0, yy, 0.09], [4.4, 0.13, 0.18], wood, frame);
    const awning = this.material('#b79a65');
    this.box('Window sill', [0, -1.4, 0.18], [4.6, 0.14, 0.48], awning, frame);
    for (let i = 0; i < 7; i++) this.box('Night skyline', [-1.8 + i * 0.57, -0.8, 0.065], [0.35, 0.6 + (i % 3) * 0.3, 0.04], this.material(i % 2 ? '#233a48' : '#294550'), frame);
  }

  private buildCounter(): void {
    const counter = COLLIDERS.find(collider => collider.id === 'bar')!;
    const wood = this.material('#663f29');
    const top = this.material('#a67340', undefined, 0.4);
    const dark = this.material('#312922');
    const brass = this.material('#b58e4d', undefined, 0.3);
    const green = this.material('#2a4439');
    this.box('Main counter cabinet', [counter.x, 0.68, counter.z], [counter.hx * 2, 1.36, counter.hz * 2], wood);
    this.box('Polished counter top', [counter.x, 1.43, counter.z], [counter.hx * 2 + 0.2, 0.18, counter.hz * 2 + 0.2], top);
    this.box('Counter kickboard', [counter.x, 0.15, counter.z + counter.hz], [counter.hx * 2, 0.22, 0.1], dark);
    this.box('Counter brass footrest', [counter.x, 0.32, counter.z + counter.hz + 0.18], [counter.hx * 2 - 0.4, 0.07, 0.07], brass);
    for (let x = -10.2; x <= -3.5; x += 2.1) {
      this.box('Counter green panel', [x, 0.78, -6.13], [1.83, 0.95, 0.06], green);
      this.box('Counter panel trim', [x, 1.27, -6.09], [1.92, 0.035, 0.035], brass);
      this.box('Footrest support', [x, 0.24, -6], [0.05, 0.3, 0.05], brass);
    }
    for (const x of [-10, -4]) this.makeStool(x, -5, 0);

    this.box('Back bar mirror surround', [-5.5, 2.85, -10.63], [12.8, 3.75, 0.3], dark);
    this.box('Back bar mirror', [-5.5, 2.85, -10.42], [12.25, 3.4, 0.08], this.material('#38514b', '#10261e'));
    for (const y of [1.8, 2.75, 3.7]) {
      this.box('Bottle shelf', [-5.5, y, -10.08], [12.3, 0.09, 0.66], wood);
      this.box('Shelf edge', [-5.5, y, -9.73], [12.3, 0.07, 0.04], brass);
      for (let i = 0; i < 17; i++) {
        if (y === 2.75 && i > 5 && i < 12) continue;
        const bottle = this.makeBottle(-11.1 + i * 0.69, y + 0.06, -10.1, i % 4);
        bottle.setLocalScale(0.85, 0.85 + (i % 3) * 0.13, 0.85);
      }
    }
    this.sign('House signature', [-5.4, 3.03, -9.96], [4.7, 1.45], ['B.A.R.', 'BOM AMIGO REAPARECE'],
      { background: '#193b30', foreground: '#ffde90', glow: true });
    this.sign('House menu', [3.5, 3.0, -10.65], [3.25, 3.25], ['DA CASA', 'Café passado  ·  4', 'Caldo do dia  ·  12', 'Conversa fiada  ·  grátis', 'FIADO? SÓ AMANHÃ.'],
      { background: '#253329', foreground: '#e5dcc1', accent: '#ac8952' });
    this.makeBottle(-10.5, 1.54, -6.7, 0);
    this.makeBottle(-7.2, 1.54, -6.8, 1);
    this.makeCup(-4.5, 1.54, -6.3);
    this.makeCup(-3, 1.54, -6.3);
    this.box('Bar service towel', [-8.7, 1.54, -6.75], [1.2, 0.02, 0.6], this.material('#dbcead'));
    const tap = this.group('Draft taps', [-3.2, 1.55, -7.1]);
    this.shape('Tap column', 'cylinder', [0, 0.45, 0], [0.18, 0.9, 0.18], brass, tap);
    this.box('Tap crossbar', [0, 0.7, 0], [1.1, 0.13, 0.13], brass, tap);
    for (const x of [-0.35, 0.35]) {
      this.box('Tap handle', [x, 0.89, 0.08], [0.14, 0.38, 0.16], dark, tap);
      this.box('Tap nozzle', [x, 0.6, 0.17], [0.08, 0.12, 0.28], brass, tap);
    }
  }

  private makeBottle(x: number, y: number, z: number, variant = 0, parent?: pc.Entity): pc.Entity {
    const bottle = this.group('Bottle', [x, y, z], parent);
    const glass = this.material(['#304e2b', '#73502a', '#2d594e', '#61372e'][variant % 4]!);
    this.shape('Bottle body', 'cylinder', [0, 0.25, 0], [0.22, 0.5, 0.22], glass, bottle);
    this.shape('Bottle neck', 'cylinder', [0, 0.58, 0], [0.09, 0.22, 0.09], glass, bottle);
    this.shape('Bottle label', 'cylinder', [0, 0.27, 0], [0.225, 0.18, 0.225], this.material(variant % 2 ? '#e4c687' : '#d7ccad'), bottle);
    this.shape('Bottle cap', 'cylinder', [0, 0.7, 0], [0.11, 0.045, 0.11], this.material('#a58d50'), bottle);
    return bottle;
  }

  private makeCup(x: number, y: number, z: number, parent?: pc.Entity): pc.Entity {
    const cup = this.group('Drink', [x, y, z], parent);
    this.shape('Glass', 'cylinder', [0, 0.18, 0], [0.22, 0.36, 0.22], this.material('#d59c3c'), cup);
    this.shape('Foam', 'cylinder', [0, 0.365, 0], [0.23, 0.045, 0.23], this.material('#f5e7bf'), cup);
    return cup;
  }

  private makeStool(x: number, z: number, rotation: number): void {
    const stool = this.group('Bar stool', [x, 0, z]);
    stool.setLocalEulerAngles(0, rotation, 0);
    const metal = this.material('#383b33');
    this.shape('Round velvet cushion', 'cylinder', [0, 0.96, 0], [0.78, 0.18, 0.78], this.material('#784536'), stool);
    this.shape('Seat rim', 'cylinder', [0, 0.84, 0], [0.81, 0.08, 0.81], metal, stool);
    this.shape('Stool stem', 'cylinder', [0, 0.44, 0], [0.11, 0.8, 0.11], metal, stool);
    this.shape('Stool foot', 'cylinder', [0, 0.04, 0], [0.64, 0.07, 0.64], metal, stool);
    this.box('Stool back', [0, 1.3, 0.32], [0.65, 0.45, 0.09], this.material('#744332'), stool);
    for (const xx of [-0.25, 0.25]) this.box('Back support', [xx, 1.1, 0.32], [0.045, 0.55, 0.045], metal, stool);
  }

  private buildBlackjack(): void {
    const collider = COLLIDERS.find(collider => collider.id === 'blackjack')!;
    const table = this.group('Blackjack table', [collider.x, 0, collider.z]);
    table.setLocalScale(collider.hx * 2 / 4.2, 1, collider.hz * 2 / 3.15);
    const wood = this.material('#533c2a');
    this.shape('Table pedestal', 'cylinder', [0, 0.57, 0], [0.7, 1.14, 0.7], wood, table);
    this.shape('Table pedestal base', 'cylinder', [0, 0.09, 0], [2.2, 0.15, 2.2], wood, table);
    this.shape('Padded oval rail', 'cylinder', [0, 1.19, 0], [4.2, 0.23, 3.15], this.material('#4e2f27'), table);
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
    this.shape('Green felt playing surface', 'cylinder', [0, 1.32, 0], [3.85, 0.025, 2.8], this.material('#245c47'), table);
    this.shape('Printed blackjack felt', 'plane', [0, 1.338, 0], [3.5, 1, 2.5], felt, table);
    const card = this.material('#f2e7cd');
    for (let i = 0; i < 2; i++) this.box('Dealt card', [-0.28 + i * 0.4, 1.355, -0.65], [0.3, 0.016, 0.42], card, table, [0, i * 12 - 6, 0]);
    for (let i = 0; i < 4; i++) {
      const chip = this.material(['#b94e38', '#e3c879', '#405e76', '#b94e38'][i]!);
      for (let j = 0; j < 3; j++) this.shape('House chip', 'cylinder', [0.75 + i * 0.22, 1.365 + j * 0.035, -0.68], [0.16, 0.03, 0.16], chip, table);
    }
    for (const [x, z, r] of [[3.3, -1.6, 140], [4.45, -1.35, 165], [5.6, -1.35, 195], [6.75, -1.6, 220]]) this.makeChair(x!, z!, r!);
    this.sign('Blackjack wall poster', [8, 3.1, -10.67], [3.3, 2.2], ['21', 'SORTE É SENTAR À MESA', 'BLACKJACK · FICHAS VIRTUAIS'], { background: '#733e31', foreground: '#f4deb0' });
  }

  private makeChair(x: number, z: number, rotation: number): void {
    const chair = this.group('Wooden chair', [x, 0, z]);
    chair.setLocalEulerAngles(0, rotation, 0);
    const wood = this.material('#825a34');
    const seat = this.material('#a2733c');
    this.box('Chair seat', [0, 0.55, 0], [0.8, 0.11, 0.8], seat, chair);
    for (const xx of [-0.3, 0.3]) for (const zz of [-0.3, 0.3]) this.box('Chair leg', [xx, 0.28, zz], [0.08, 0.56, 0.08], wood, chair);
    for (const xx of [-0.31, 0.31]) this.box('Chair back upright', [xx, 1.03, -0.32], [0.08, 0.92, 0.08], wood, chair);
    for (const yy of [1, 1.28]) this.box('Chair back slat', [0, yy, -0.33], [0.7, 0.18, 0.08], seat, chair);
  }

  private buildSeating(): void {
    const wood = this.material('#9a683a');
    const dark = this.material('#4f3928');
    for (const { x, z, hx, hz } of COLLIDERS.filter(collider => collider.id.startsWith('table-'))) {
      this.box('Cafe table top', [x, 0.98, z], [hx * 2, 0.13, hz * 2], wood);
      this.shape('Cafe table stem', 'cylinder', [x!, 0.49, z!], [0.2, 0.95, 0.2], dark);
      this.box('Cafe table foot', [x!, 0.08, z!], [1.4, 0.1, 0.14], dark);
      this.box('Cafe table cross foot', [x!, 0.08, z!], [0.14, 0.1, 1.4], dark);
      this.makeCup(x! + 0.4, 1.055, z! + 0.18);
      this.makeBottle(x! - 0.2, 1.055, z! - 0.3, 1);
      this.box('Folded napkins', [x! - 0.4, 1.067, z! + 0.35], [0.32, 0.035, 0.3], this.material('#e2cda4'));
    }
    for (const seat of INTERACTABLES.filter(object => object.type === 'seat')) {
      this.makeChair(seat.x, seat.z, (seat.rotation ?? 0) * RAD_TO_DEG);
    }
    const bench = this.material('#704234');
    for (const x of [-12.8, 12.8]) {
      this.box('Wall bench', [x, 0.52, 8], [1.3, 0.24, 4], bench);
      this.box('Wall bench back', [x + Math.sign(x) * 0.46, 1.13, 8], [0.2, 1.15, 4], bench);
      for (const z of [6.5, 9.5]) this.box('Bench leg', [x, 0.22, z], [0.75, 0.4, 0.12], dark);
    }
  }

  private buildJukebox(): void {
    const collider = COLLIDERS.find(collider => collider.id === 'jukebox')!;
    const juke = this.group('Jukebox', [collider.x, 0, collider.z]);
    juke.setLocalScale(collider.hx * 2 / 1.8, 1, collider.hz * 2 / 1.15);
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
    this.sign('Jukebox marquee', [collider.x, 2.05, collider.z + 0.6], [0.92, 0.35], ['RÁDIO BOTECO'], { background: '#bba871', foreground: '#373e30' });
    this.sign('Music wall poster', [11.5, 3.8, -10.6], [2.3, 1.4], ['SOM NA CAIXA', 'a noite é nossa'], { background: '#234746', foreground: '#ead298' });
    this.box('Dance floor rug', [8.2, 0.04, -5.7], [3.2, 0.035, 3.2], this.material('#574937'));
  }

  private buildDecor(): void {
    this.sign('House rules print', [-13.64, 3, -4.5], [2.7, 2.8], ['BOTECO', 'desde sempre.', 'Gente boa.', 'História ruim.', 'Noite comprida.'], { rotation: [90, 90, 0], background: '#bc9a61', foreground: '#4b3a2a', accent: '#59422b' });
    this.sign('House small print', [13.64, 3, -1], [2.7, 2.8], ['DEVAGAR', 'Aqui o tempo', 'passa na', 'segunda rodada.'], { rotation: [90, -90, 0], background: '#734f3a', foreground: '#e8d4a9' });
    this.makePlant(-12.5, 0, 9.4);
    this.makePlant(12.5, 0, -9.7);
    this.makePlant(-12.7, 0, -9.3);
    const cable = this.material('#262923');
    const bulb = this.material('#f4cd79', '#efb94e');
    // Low strands and tiny lamps make the cutaway read as a lived-in room.
    for (let i = 0; i < 17; i++) {
      const x = -12 + i * 1.5;
      const y = 4.7 - Math.sin((i / 16) * Math.PI) * 0.65;
      this.shape('Festoon bulb', 'sphere', [x, y - 0.11, -3.5], [0.15, 0.19, 0.15], bulb);
      this.box('Festoon cable', [x, y, -3.5], [1.55, 0.025, 0.025], cable, undefined, [0, 0, (i - 8) * 1.5]);
    }
    // A small radio, register, and bottles supply recognizable silhouettes.
    const register = this.group('Old cash register', [-10.4, 1.54, -7.6]);
    this.box('Register body', [0, 0.25, 0], [0.75, 0.5, 0.65], this.material('#657064'), register);
    this.box('Register display', [0, 0.48, -0.1], [0.6, 0.22, 0.2], this.material('#27372c'), register);
    this.box('Register drawer', [0, 0.04, 0.05], [0.82, 0.09, 0.78], this.material('#2d3930'), register);
  }

  private makePlant(x: number, y: number, z: number): void {
    const plant = this.group('Potted plant', [x, y, z]);
    this.shape('Terracotta pot', 'cylinder', [0, 0.35, 0], [0.8, 0.7, 0.8], this.material('#a16749'), plant);
    this.shape('Pot rim', 'cylinder', [0, 0.68, 0], [0.87, 0.12, 0.87], this.material('#b47a56'), plant);
    this.shape('Pot soil', 'cylinder', [0, 0.75, 0], [0.7, 0.03, 0.7], this.material('#342f25'), plant);
    const leaf = this.material('#41654b');
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * TAU;
      this.shape('Angular plant leaf', 'cone', [Math.cos(angle) * 0.24, 1.25 + (i % 3) * 0.12, Math.sin(angle) * 0.24], [0.24, 1.3, 0.35], leaf, plant, [Math.cos(angle) * 25, i * 45, Math.sin(angle) * 25]);
    }
  }

  private buildLighting(): void {
    const sun = new pc.Entity('Warm key light');
    sun.addComponent('light', { type: 'directional', color: color('#ffe0af'), intensity: 0.95,
      castShadows: true, shadowDistance: 30, shadowResolution: 1024, shadowBias: 0.3,
      normalOffsetBias: 0.07 });
    sun.setEulerAngles(52, -28, 0);
    this.app.root.addChild(sun);
    this.warmLights.push(sun);
    const lampMaterial = this.material('#274239');
    const brass = this.material('#a98247');
    const glow = this.material('#ffe5b2', '#ffd38b');
    for (const [x, z] of [[-7, -6], [6, -1], [-6, 4]]) {
      const lamp = this.group('Hanging enamel lamp', [x!, 4.1, z!]);
      this.shape('Lamp cord', 'cylinder', [0, 0.7, 0], [0.035, 1.4, 0.035], brass, lamp);
      this.shape('Enamel shade', 'cone', [0, 0, 0], [1.3, 0.58, 1.3], lampMaterial, lamp);
      this.shape('Lamp glowing diffuser', 'cylinder', [0, -0.3, 0], [1.17, 0.035, 1.17], glow, lamp);
      const light = new pc.Entity('Amber hanging light');
      light.addComponent('light', { type: 'omni', color: color('#ffd09a'), intensity: 1.5, range: 10,
        castShadows: false });
      light.setPosition(x!, 3.6, z!);
      this.app.root.addChild(light);
      this.warmLights.push(light);
    }
    for (const [x, hex] of [[-8, '#cf5275'], [8, '#41afaa']] as const) {
      const light = new pc.Entity('Party wash');
      light.addComponent('light', { type: 'omni', color: color(hex), intensity: 0, range: 17, castShadows: false });
      light.setPosition(x, 3.8, -1);
      this.app.root.addChild(light);
      this.partyLights.push(light);
    }
  }

  private buildDiscoBall(): pc.Entity {
    const disco = this.group('Disco ball', [4.6, 4.4, -4]);
    this.shape('Mirror ball', 'sphere', [0, 0, 0], [0.65, 0.65, 0.65], this.material('#9cb2a6', '#193c39', 0.2), disco);
    const tile = this.material('#d3dfcb', '#384f41');
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * TAU;
      this.box('Disco mirror', [Math.cos(angle) * 0.33, 0, Math.sin(angle) * 0.33], [0.12, 0.12, 0.025], tile, disco, [0, -i * 36 + 90, 0]);
    }
    return disco;
  }

  private buildFan(): pc.Entity {
    const fan = this.group('Ceiling fan', [-2, 4.86, 2]);
    const wood = this.material('#45372c');
    this.shape('Fan spindle', 'cylinder', [0, 0.12, 0], [0.16, 0.4, 0.16], wood, fan);
    this.shape('Fan motor', 'cylinder', [0, -0.1, 0], [0.55, 0.22, 0.55], this.material('#746747'), fan);
    for (let i = 0; i < 4; i++) {
      const blade = this.group('Fan blade pivot', [0, -0.13, 0], fan);
      blade.setLocalEulerAngles(0, i * 90, 0);
      this.box('Fan blade', [0.92, 0, 0], [1.7, 0.05, 0.34], wood, blade, [0, 0, 6]);
    }
    return fan;
  }

  private makeAvatar(actor: SceneActor, npc: boolean): Avatar {
    const root = this.group(`Avatar ${actor.id}`, [actor.x, 0, actor.z]);
    const body = this.group('Animated rig', [0, 0, 0], root);
    const isBartender = actor.role === 'bartender' || (actor.displayName ?? actor.name)?.toLowerCase().includes('zé');
    const hash = [...actor.id].reduce((value, letter) => value + letter.charCodeAt(0), 0);
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
    const ring = this.shape('Local player marker', 'cylinder', [0, 0.027, 0], [0.83, 0.018, 0.83], this.material('#b1a067', '#514322'), root);
    ring.enabled = actor.id === this.localId;
    return { root, body, leftArm, rightArm, leftLeg, rightLeg, head, cup, ring,
      actor: { ...actor }, npc, phase: hash % 12 };
  }

  private animateAvatar(avatar: Avatar, dt: number): void {
    const { actor, body, root, leftArm, rightArm, leftLeg, rightLeg, head, cup } = avatar;
    const local = actor.id === this.localId;
    const current = root.getPosition();
    const moving = Math.hypot(actor.x - current.x, actor.z - current.z) > 0.025;
    const smoothing = 1 - Math.exp(-(local ? 35 : 13) * dt);
    root.setPosition(lerp(current.x, actor.x, smoothing), 0, lerp(current.z, actor.z, smoothing));
    const rotation = (actor.rotation ?? 0) * RAD_TO_DEG;
    const nowRotation = root.getEulerAngles().y;
    const delta = ((rotation - nowRotation + 540) % 360) - 180;
    root.setEulerAngles(0, nowRotation + delta * (1 - Math.exp(-16 * dt)), 0);
    let animation = (actor.animation ?? actor.state ?? 'idle').toLowerCase();
    if (moving && animation === 'idle') animation = 'walk';
    const t = this.elapsed + avatar.phase;
    const walking = animation.includes('walk') || animation.includes('run') || animation.includes('wander');
    const running = animation.includes('run');
    const seated = animation.includes('sit') || animation.includes('seat') || animation.includes('blackjack');
    const dancing = animation.includes('dance') || (avatar.npc && this.eventType === 'PARTY');
    const drinking = animation.includes('drink') || (avatar.npc && animation.includes('drunk'));
    const stride = walking ? Math.sin(t * (running ? 13 : 8)) * (running ? 45 : 30) : 0;
    const seatedBlend = avatar.seatedBlend = lerp(avatar.seatedBlend ?? 0, seated ? 1 : 0, 1 - Math.exp(-12 * dt));
    body.setLocalPosition(0, -0.18 * seatedBlend + (1 - seatedBlend) * (walking ? Math.abs(Math.sin(t * 8)) * 0.045 : Math.sin(t * 2) * 0.015), 0);
    body.setLocalEulerAngles(running ? 8 : 0, 0, 0);
    leftArm.setLocalEulerAngles(stride * 0.8, 0, 3);
    rightArm.setLocalEulerAngles(-stride * 0.8, 0, -3);
    leftLeg.setLocalEulerAngles(-stride, 0, 0);
    rightLeg.setLocalEulerAngles(stride, 0, 0);
    head.setLocalEulerAngles(0, Math.sin(t * 0.65) * 3, 0);
    cup.enabled = drinking;
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
    if (avatar.npc && this.eventType === 'DRUNK_NPC' && actor.id === 'tonico') {
      body.setLocalEulerAngles(Math.sin(t * 2) * 7, 0, Math.sin(t * 2.7) * 11);
    }
    if (animation.includes('wave')) rightArm.setLocalEulerAngles(0, Math.sin(t * 12) * 20, 155);
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
      // Shorten the whole boom at walls, preserving the orbit direction.
      // Interior objects are below the sight line; no rigidbody runtime is required.
      let ratio = 1;
      if (dx > 0) ratio = Math.min(ratio, (WORLD.maxX - 0.5 - this.cameraTarget.x) / dx);
      if (dx < 0) ratio = Math.min(ratio, (WORLD.minX + 0.5 - this.cameraTarget.x) / dx);
      if (dz > 0) ratio = Math.min(ratio, (WORLD.maxZ - 0.5 - this.cameraTarget.z) / dz);
      if (dz < 0) ratio = Math.min(ratio, (WORLD.minZ + 0.5 - this.cameraTarget.z) / dz);
      ratio = clamp(ratio, 0.12, 1);
      dx *= ratio; dz *= ratio; dy *= ratio;
      this.camera.setPosition(this.cameraTarget.x + dx, this.cameraTarget.y + dy, this.cameraTarget.z + dz);
      this.camera.lookAt(this.cameraTarget);
    } else if (!player) {
      this.camera.setPosition(13 + Math.sin(this.elapsed * 0.035) * 1.8, 11.8, 17.5);
      this.camera.lookAt(-1.5, 1, -3.6);
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
      this.distance = clamp(this.distance + event.deltaY * 0.008, 3, 11);
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
