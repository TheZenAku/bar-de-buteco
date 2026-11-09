import {readGraphics,defaultGraphics,type GraphicsSettings} from './graphics';
import {DEFAULT_CAMERA_DISTANCE,DEFAULT_CAMERA_FEEL,isCameraMode,readCameraDistance,readCameraFeel,type CameraFeel,type CameraMode} from './engine/camera-rig';
import {DEFAULT_WEAPON_KEYS,readWeaponKeys,type WeaponKeys} from './weapons/key-bindings';
import {AIM_CAMERA_VERSION,DEFAULT_AIM,DEFAULT_AIM_CAMERA,DEFAULT_PAD,readAim,readAimCamera,readPad,readShoulder,type AimCamera,type AimSettings,type PadSettings,type ShoulderSide} from './weapons/aim-settings';
/** Per-browser preferences for sound, proximity voice, graphics and the camera. The jukebox keeps its own volume (jukebox.ts). */
export interface GameSettings {
  /** Volumes 0–1; the microphone gain is mic × 2 (0.5 = unchanged). */
  master:number;music:number;voice:number;mic:number;
  /** The pause menu's sounds (pause-menu/menu-sounds.ts), under the general volume. */
  ui:number;
  micEnabled:boolean;voicesEnabled:boolean;voiceMode:'open'|'ptt';
  /** 0 picks up whispers, 1 only loud speech. */
  sensitivity:number;inputDevice:string;
  graphics:GraphicsSettings;
  /** Q switches between the player's eyes and their chosen third-person distance. */
  camera:CameraMode;
  /** Perto, médio or longe, in metres (CAMERA_ZOOMS); preserved while in first person. */
  cameraDistance:number;
  /** Height, sensitivity and smoothing of the view. */
  cameraFeel:CameraFeel;
  /** Firearms (weapons/aim-settings.ts): the aim help per device and the look's speed while aiming; the gamepad's stick; the shoulder the view sits over. */
  aim:AimSettings;pad:PadSettings;shoulder:ShoulderSide;
  /** Where the camera sits with a weapon, aiming and not (tuned live to find the defaults). */
  aimCamera:AimCamera;
  /** Which defaults aimCamera was saved under: older ones are dropped for the current DEFAULT_AIM_CAMERA. */
  aimCameraVersion:number;
  /** The firearms' keys on the keyboard and the mouse's side buttons (weapons/key-bindings.ts). */
  weaponKeys:WeaponKeys;
}
const KEY='bar:settings:v1';
// The starting distance until 2026-11-02: saved as it was, it means the player never zoomed, so they get the new one.
const OLD_DEFAULT_DISTANCE=6.4;
export const DEFAULT_SETTINGS:GameSettings={master:1,music:1,voice:1,mic:.5,ui:.8,micEnabled:false,voicesEnabled:true,voiceMode:'open',sensitivity:.35,inputDevice:'',graphics:defaultGraphics(),camera:'third',cameraDistance:DEFAULT_CAMERA_DISTANCE,cameraFeel:{...DEFAULT_CAMERA_FEEL},aim:{...DEFAULT_AIM},pad:{...DEFAULT_PAD},shoulder:'right',aimCamera:{...DEFAULT_AIM_CAMERA},aimCameraVersion:AIM_CAMERA_VERSION,weaponKeys:{...DEFAULT_WEAPON_KEYS}};
const unit=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;

export function createSettings(){
  let current={...DEFAULT_SETTINGS};
  const listeners=new Set<(settings:GameSettings,previous:GameSettings)=>void>();
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)??'null');
    if(saved&&typeof saved==='object')current={
      master:unit(saved.master,current.master),music:unit(saved.music,current.music),voice:unit(saved.voice,current.voice),mic:unit(saved.mic,current.mic),ui:unit(saved.ui,current.ui),
      // Restored only if the browser already granted the microphone (see VoiceChat.enter).
      micEnabled:saved.micEnabled===true,voicesEnabled:typeof saved.voicesEnabled==='boolean'?saved.voicesEnabled:current.voicesEnabled,
      voiceMode:saved.voiceMode==='ptt'?'ptt':'open',sensitivity:unit(saved.sensitivity,current.sensitivity),
      inputDevice:typeof saved.inputDevice==='string'?saved.inputDevice.slice(0,256):'',
      graphics:readGraphics(saved.graphics),
      camera:isCameraMode(saved.camera)?saved.camera:current.camera,
      // Older browsers stored one of three fixed third-person views, with no separate distance.
      cameraDistance:saved.cameraDistance===OLD_DEFAULT_DISTANCE?current.cameraDistance:readCameraDistance(saved.cameraDistance,saved.camera==='near'?3:saved.camera==='far'?10.5:current.cameraDistance),
      cameraFeel:readCameraFeel(saved.cameraFeel),
      aim:readAim(saved.aim),pad:readPad(saved.pad),shoulder:readShoulder(saved.shoulder),aimCamera:saved.aimCameraVersion===AIM_CAMERA_VERSION?readAimCamera(saved.aimCamera):{...DEFAULT_AIM_CAMERA},aimCameraVersion:AIM_CAMERA_VERSION,weaponKeys:readWeaponKeys(saved.weaponKeys),
    };
  }catch{/* Private mode or malformed: defaults. */}
  return {
    get():GameSettings{return current;},
    update(patch:Partial<GameSettings>):void{
      const previous=current;current={...current,...patch,cameraDistance:readCameraDistance(patch.cameraDistance,current.cameraDistance)};
      try{localStorage.setItem(KEY,JSON.stringify(current));}catch{/* Still applies for this visit. */}
      for(const listener of listeners)listener(current,previous);
    },
    subscribe(listener:(settings:GameSettings,previous:GameSettings)=>void):void{listeners.add(listener);},
  };
}
export type Settings=ReturnType<typeof createSettings>;
