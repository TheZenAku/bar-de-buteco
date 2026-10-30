import {readGraphics,defaultGraphics,type GraphicsSettings} from './graphics';
import {DEFAULT_CAMERA_DISTANCE,isCameraMode,readCameraDistance,type CameraMode} from './engine/camera-rig';
/** Per-browser preferences for sound, proximity voice, graphics and the camera. The jukebox keeps its own volume (jukebox.ts). */
export interface GameSettings {
  /** Volumes 0–1; the microphone gain is mic × 2 (0.5 = unchanged). */
  master:number;music:number;voice:number;mic:number;
  micEnabled:boolean;voicesEnabled:boolean;voiceMode:'open'|'ptt';
  /** 0 picks up whispers, 1 only loud speech. */
  sensitivity:number;inputDevice:string;
  graphics:GraphicsSettings;
  /** Q switches between the player's eyes and their chosen third-person distance. */
  camera:CameraMode;
  /** Last positive third-person distance in metres; preserved while in first person. */
  cameraDistance:number;
}
const KEY='bar:settings:v1';
export const DEFAULT_SETTINGS:GameSettings={master:1,music:1,voice:1,mic:.5,micEnabled:false,voicesEnabled:true,voiceMode:'open',sensitivity:.35,inputDevice:'',graphics:defaultGraphics(),camera:'third',cameraDistance:DEFAULT_CAMERA_DISTANCE};
const unit=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;

export function createSettings(){
  let current={...DEFAULT_SETTINGS};
  const listeners=new Set<(settings:GameSettings,previous:GameSettings)=>void>();
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)??'null');
    if(saved&&typeof saved==='object')current={
      master:unit(saved.master,current.master),music:unit(saved.music,current.music),voice:unit(saved.voice,current.voice),mic:unit(saved.mic,current.mic),
      // Restored only if the browser already granted the microphone (see VoiceChat.enter).
      micEnabled:saved.micEnabled===true,voicesEnabled:typeof saved.voicesEnabled==='boolean'?saved.voicesEnabled:current.voicesEnabled,
      voiceMode:saved.voiceMode==='ptt'?'ptt':'open',sensitivity:unit(saved.sensitivity,current.sensitivity),
      inputDevice:typeof saved.inputDevice==='string'?saved.inputDevice.slice(0,256):'',
      graphics:readGraphics(saved.graphics),
      camera:isCameraMode(saved.camera)?saved.camera:current.camera,
      // Older browsers stored one of three fixed third-person views, with no separate distance.
      cameraDistance:readCameraDistance(saved.cameraDistance,saved.camera==='near'?3:saved.camera==='far'?10.5:current.cameraDistance),
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
