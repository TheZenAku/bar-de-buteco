import * as pc from 'playcanvas';

/**
 * The camera's x-ray: when something hides the local player from the camera (a wall the boom has not cleared yet, the
 * counter, a fridge, a tree, the floor above), whatever stands in between dissolves in a round window around the body,
 * the same way for every material, so the player is always seen and nothing pops. The window opens and closes over a
 * few frames (CameraRig decides how open it is).
 *
 * It is the engine's litUserMainStartPS chunk, set for the whole app before any shader is built, so every lit material
 * gets it; it runs in the colour pass only (shadows and picking stay whole). A fragment is cut when it is inside the
 * cone from the eye to a disc around the player, more than MARGIN nearer to the eye than the body's centre, and above the
 * player's floor (the floor in front of the feet stays). The edge is dithered with a 4x4 Bayer pattern: no blending, no
 * sorting, and the depth buffer stays right for what is drawn.
 */
// Metres in front of the body's centre that are never cut (the player's own arms, the drink in hand), and over how
// many more metres the cut fades in.
const MARGIN = .5, MARGIN_FADE = .25;
// The window is shaped like the body: this much taller than it is wide (xrayCentre.w is its half width).
const TALL = 1.4;
// Where its edge feathers out, as a part of its radius: open inside, dithered across the thin rim.
const FEATHER = .78;
const DECLARATION = `
uniform vec4 xrayEye;
uniform vec4 xrayCentre;
uniform float xrayFloor;
float xrayBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float xrayBayer4(vec2 a) { return xrayBayer2(0.5 * a) * 0.25 + xrayBayer2(a); }
`;
const MAIN_START = `
#if !defined(SHADOW_PASS) && !defined(PICK_PASS) && !defined(PREPASS_PASS)
if (xrayEye.w > 0.004 && vPositionW.y > xrayFloor) {
  vec3 xrayAxis = xrayCentre.xyz - xrayEye.xyz;
  float xrayReach = length(xrayAxis);
  xrayAxis /= max(xrayReach, 1e-4);
  vec3 xrayRay = vPositionW - xrayEye.xyz;
  float xrayAlong = dot(xrayRay, xrayAxis);
  if (xrayAlong > 0.0 && xrayAlong < xrayReach - ${MARGIN.toFixed(2)}) {
    // Off the line to the player, upright and sideways as seen from the eye, in window radii at this depth: 1 on its rim.
    vec3 xrayOff = (xrayRay - xrayAxis * xrayAlong) / (xrayCentre.w * xrayAlong / xrayReach);
    vec3 xrayUp = vec3(0.0, 1.0, 0.0) - xrayAxis * xrayAxis.y;
    float xrayUpright = dot(xrayOff, xrayUp / max(length(xrayUp), 1e-4));
    float xrayTall = xrayUpright / ${TALL.toFixed(2)};
    float xrayAcross = sqrt(max(dot(xrayOff, xrayOff) - xrayUpright * xrayUpright, 0.0) + xrayTall * xrayTall);
    // Open in the middle, a thin dithered rim, and a short fade just in front of the body.
    float xrayOpen = xrayEye.w * (1.0 - smoothstep(${FEATHER.toFixed(2)}, 1.0, xrayAcross))
      * smoothstep(0.0, ${MARGIN_FADE.toFixed(2)}, xrayReach - ${MARGIN.toFixed(2)} - xrayAlong);
    if (xrayOpen > xrayBayer4(gl_FragCoord.xy) * 0.94 + 0.03) discard;
  }
}
#endif
`;

export class CameraXray {
  private readonly eye: pc.ScopeId;
  private readonly centre: pc.ScopeId;
  private readonly floor: pc.ScopeId;
  private readonly eyeValue = new Float32Array(4);
  private readonly centreValue = new Float32Array(4);

  /** Must run before the first material is drawn: shaders built earlier would not have the window. */
  constructor(device: pc.GraphicsDevice) {
    const chunks = pc.ShaderChunks.get(device, pc.SHADERLANGUAGE_GLSL);
    chunks.set('litUserDeclarationPS', DECLARATION);
    chunks.set('litUserMainStartPS', MAIN_START);
    this.eye = device.scope.resolve('xrayEye');
    this.centre = device.scope.resolve('xrayCentre');
    this.floor = device.scope.resolve('xrayFloor');
    this.set(undefined, undefined, 0, 0, 0);
  }

  /**
   * The window this frame: from `eye` to a disc of `radius` metres around `centre` (the body), `strength` 0 (closed)
   * to 1, nothing below `floor` (metres, world height) cut.
   */
  set(eye: pc.Vec3 | undefined, centre: pc.Vec3 | undefined, radius: number, strength: number, floor: number): void {
    this.eyeValue[0] = eye?.x ?? 0; this.eyeValue[1] = eye?.y ?? 0; this.eyeValue[2] = eye?.z ?? 0; this.eyeValue[3] = eye && centre ? strength : 0;
    this.centreValue[0] = centre?.x ?? 0; this.centreValue[1] = centre?.y ?? 0; this.centreValue[2] = centre?.z ?? 0; this.centreValue[3] = Math.max(radius, .01);
    this.eye.setValue(this.eyeValue); this.centre.setValue(this.centreValue); this.floor.setValue(floor);
  }
}
