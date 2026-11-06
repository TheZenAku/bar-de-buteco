import * as pc from 'playcanvas';
import { CROWD, SKINS, readCrowd } from '@bar/shared';

/**
 * The crowd: everybody the room sends as a short record instead of a full avatar (packages/shared/src/crowd.ts) is drawn
 * here as a flat sprite of their skin, turned to the camera, from sheets drawn by the game's own engine
 * (tools/assets/render-crowd-sheets.mjs: 16 angles, standing and two steps of a walk). All of them are one mesh, one
 * texture and one draw call, with no skeleton and no shadow: a thousand cost what ten do.
 *
 * Packing: every skin's sheet sits in one atlas, SKINS_PER_ROW blocks wide. The vertex shader works the sprite's corner
 * and the angle to show from the camera's position, so the CPU only writes where each one stands and which way it faces.
 */
const ANGLES = 16, POSES = 3, CELL_W = 56, CELL_H = 112;
const BLOCK_W = ANGLES * CELL_W, BLOCK_H = POSES * CELL_H, SKINS_PER_ROW = 2;
/** The sprite's size in metres: the frame the sheets were drawn in (tests/fixtures/crowd-render.js). */
const SPRITE_W = 1.2, SPRITE_H = 2.4, SPRITE_BOTTOM = -.1;
const MAX_SPRITES = Math.ceil(CROWD.max * 1.6);
/** Seconds of one standing-to-standing stride of the two walk poses, by gait. */
const STEP_SECONDS = [0, .55, .32];
/** How fast the drawn position, and the facing, catch up with the last record (the records come a few times a second). */
const CATCH_UP = 5, TURN_UP = 8, JUMP_METRES = 6;
const TAU = Math.PI * 2;

const VERTEX = `attribute vec3 aPosition;attribute vec2 aUv0;attribute vec4 aColor;
uniform mat4 matrix_viewProjection;uniform vec3 uCamera;uniform vec4 uSprite;uniform vec4 uAtlas;varying vec2 vUv;
void main(){
  vec2 to=uCamera.xz-aPosition.xz;float len=max(length(to),0.001);vec2 dir=to/len;
  vec3 right=vec3(dir.y,0.0,-dir.x);
  vec3 world=aPosition+right*aUv0.x*uSprite.x+vec3(0.0,aUv0.y*uSprite.y+uSprite.z,0.0);
  gl_Position=matrix_viewProjection*vec4(world,1.0);
  float seen=atan(to.x,to.y);
  float angle=mod(floor(fract((aColor.y-seen)/6.2831853)*16.0+0.5),16.0);
  float skin=aColor.x;vec2 block=vec2(mod(skin,uAtlas.z),floor(skin/uAtlas.z));
  vec2 cell=vec2(angle+aUv0.x+0.5,aColor.z+1.0-aUv0.y);
  vUv=(block*vec2(896.0,336.0)+cell*vec2(56.0,112.0))/uAtlas.xy;
}`;
const FRAGMENT = `precision highp float;varying vec2 vUv;uniform sampler2D uTexture;uniform float uBright;
void main(){vec4 c=texture2D(uTexture,vUv);if(c.a<0.5)discard;gl_FragColor=vec4(c.rgb*uBright,1.0);}`;

interface Sprite {
  slot: number; x: number; y: number; z: number; facing: number; tx: number; ty: number; tz: number; tfacing: number; skin: number; gait: number; phase: number;
}

export class CrowdSprites {
  private readonly mesh: pc.Mesh;
  private readonly material: pc.ShaderMaterial;
  private readonly entity: pc.Entity;
  private readonly position = new Float32Array(MAX_SPRITES * 4 * 3);
  private readonly corner = new Float32Array(MAX_SPRITES * 4 * 2);
  private readonly look = new Float32Array(MAX_SPRITES * 4 * 4);
  private readonly sprites = new Map<number, Sprite>();
  private texture?: pc.Texture;
  private readonly ready = new Set<number>();
  private clock = 0;
  private loading = false;
  private destroyed = false;

  constructor(private readonly app: pc.Application) {
    for (let i = 0; i < MAX_SPRITES; i++) this.corner.set([-.5, 0, .5, 0, .5, 1, -.5, 1], i * 8);
    const indices = new Uint16Array(MAX_SPRITES * 6);
    for (let i = 0; i < MAX_SPRITES; i++) indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    this.mesh = new pc.Mesh(app.graphicsDevice);
    this.mesh.setPositions(this.position); this.mesh.setUvs(0, this.corner); this.mesh.setColors(this.look); this.mesh.setIndices(indices); this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    this.mesh.primitive[0]!.count = 0;
    this.material = new pc.ShaderMaterial({ uniqueName: 'Boteco crowd sprites', attributes: { aPosition: pc.SEMANTIC_POSITION, aUv0: pc.SEMANTIC_TEXCOORD0, aColor: pc.SEMANTIC_COLOR }, vertexGLSL: VERTEX, fragmentGLSL: FRAGMENT });
    this.material.cull = pc.CULLFACE_NONE;
    this.material.setParameter('uSprite', [SPRITE_W, SPRITE_H, SPRITE_BOTTOM, 0]); this.material.setParameter('uBright', 1); this.material.setParameter('uCamera', [0, 0, 0]);
    this.material.update();
    const instance = new pc.MeshInstance(this.mesh, this.material); instance.cull = false;
    this.entity = new pc.Entity('Crowd sprites');
    this.entity.addComponent('render', { meshInstances: [instance], castShadows: false, receiveShadows: false });
    this.entity.enabled = false; app.root.addChild(this.entity);
  }

  /** How many sprites are held (the records of the last message). */
  get count(): number { return this.sprites.size; }

  /** The records of one message: the sprites it lists are the crowd; the others are gone. */
  setRecords(bytes: ArrayBuffer | Uint8Array): void {
    if (this.destroyed) return;
    if (!this.texture && !this.loading) void this.loadSheets();
    const seen = new Set<number>();
    for (const record of readCrowd(bytes)) {
      if (this.sprites.size >= MAX_SPRITES && !this.sprites.has(record.slot)) continue;
      seen.add(record.slot);
      const sprite = this.sprites.get(record.slot);
      if (sprite) {
        if (Math.hypot(record.x - sprite.x, record.z - sprite.z) > JUMP_METRES) { sprite.x = record.x; sprite.y = record.y; sprite.z = record.z; }
        Object.assign(sprite, { tx: record.x, ty: record.y, tz: record.z, tfacing: record.facing, skin: record.skin, gait: record.flags & 3 });
      } else this.sprites.set(record.slot, { slot: record.slot, x: record.x, y: record.y, z: record.z, facing: record.facing, tx: record.x, ty: record.y, tz: record.z, tfacing: record.facing, skin: record.skin, gait: record.flags & 3, phase: (record.slot * 0.37) % 1 });
    }
    for (const slot of this.sprites.keys()) if (!seen.has(slot)) this.sprites.delete(slot);
  }

  clear(): void { this.sprites.clear(); this.mesh.primitive[0]!.count = 0; this.entity.enabled = false; }

  /** Moves every sprite towards its last record and writes the vertices. `models`: slots drawn as avatars right now (their sprite stays hidden). */
  update(dt: number, camera: pc.GraphNode, models: ReadonlySet<number>, brightness: number): void {
    if (!this.texture || !this.sprites.size) { this.entity.enabled = false; return; }
    this.clock += dt;
    const move = 1 - Math.exp(-CATCH_UP * dt), turn = 1 - Math.exp(-TURN_UP * dt), eye = camera.getPosition();
    let n = 0;
    for (const sprite of this.sprites.values()) {
      if (models.has(sprite.slot) || !this.ready.has(sprite.skin)) continue;
      sprite.x += (sprite.tx - sprite.x) * move; sprite.y += (sprite.ty - sprite.y) * move; sprite.z += (sprite.tz - sprite.z) * move;
      let delta = (sprite.tfacing - sprite.facing) % TAU; if (delta > Math.PI) delta -= TAU; else if (delta < -Math.PI) delta += TAU;
      sprite.facing = (sprite.facing + delta * turn + TAU) % TAU;
      // Standing, or the two steps of the walk one after the other.
      const stride = STEP_SECONDS[sprite.gait]!, pose = stride ? 1 + (Math.floor(this.clock / stride + sprite.phase * 2) & 1) : 0;
      for (let v = 0; v < 4; v++) {
        this.position[n * 12 + v * 3] = sprite.x; this.position[n * 12 + v * 3 + 1] = sprite.y; this.position[n * 12 + v * 3 + 2] = sprite.z;
        const at = n * 16 + v * 4; this.look[at] = sprite.skin; this.look[at + 1] = sprite.facing; this.look[at + 2] = pose; this.look[at + 3] = 1;
      }
      n++;
    }
    this.entity.enabled = n > 0;
    if (!n) return;
    this.material.setParameter('uCamera', [eye.x, eye.y, eye.z]); this.material.setParameter('uBright', brightness);
    this.mesh.setPositions(this.position); this.mesh.setColors(this.look); this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    this.mesh.primitive[0]!.count = n * 6;
  }

  /** Every skin's sheet, drawn into one canvas and handed to the GPU once; a skin whose sheet fails simply has no sprite. */
  private async loadSheets(): Promise<void> {
    this.loading = true;
    const rows = Math.ceil(SKINS.length / SKINS_PER_ROW), canvas = document.createElement('canvas');
    canvas.width = BLOCK_W * SKINS_PER_ROW; canvas.height = BLOCK_H * rows;
    const g = canvas.getContext('2d')!;
    await Promise.all(SKINS.map(async (skin, index) => {
      try {
        const response = await fetch(`/skins/crowd/${skin.id}.webp`); if (!response.ok) return;
        const image = await createImageBitmap(await response.blob());
        g.drawImage(image, (index % SKINS_PER_ROW) * BLOCK_W, Math.floor(index / SKINS_PER_ROW) * BLOCK_H); image.close();
        this.ready.add(index);
      } catch { /* no sheet: no sprite for this skin */ }
    }));
    if (this.destroyed) return;
    const texture = new pc.Texture(this.app.graphicsDevice, { name: 'Crowd atlas', width: canvas.width, height: canvas.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
    texture.setSource(canvas);
    this.material.setParameter('uTexture', texture); this.material.setParameter('uAtlas', [canvas.width, canvas.height, SKINS_PER_ROW, 0]); this.material.update();
    this.texture = texture;
  }

  destroy(): void { this.destroyed = true; this.entity.destroy(); this.mesh.destroy(); this.material.destroy(); this.texture?.destroy(); this.sprites.clear(); }
}
