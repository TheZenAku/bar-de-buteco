import type {GameSettings} from '../../settings';
import {buttonRow,choiceRow,groupRow,noteRow,rangeRow,switchRow} from '../../pause-menu/rows';
import {DEFAULT_WEAPON_KEYS,WEAPON_ACTIONS,WEAPON_ACTION_NAMES,keyLabel,type WeaponKeys} from '../key-bindings';
import {AIM_CAMERA_LIMITS,CURVE_LIMITS,DEFAULT_AIM_CAMERA,LOOK_SPEED_LIMITS,PAD_ASSISTS,PAD_ASSIST_LABELS,SENSITIVITY_LIMITS,readAim,readAimCamera,readPad,readShoulder,type AimCamera} from '../aim-settings';

/**
 * The Esc menu's "Armas e mira" page and the guide's firearm keys (docs/sistemas/armas.md#ajustes), shown only while /armas is on. The rows carry
 * `data-setting` names (aim.*, pad.*, shoulder) that main.ts applies through aimSettingPatch: each change replaces the nested object, so the
 * settings' subscribers (which compare by reference) hear of it.
 */
const percent=(value:number)=>`${Math.round(value*100)}%`;
const curveLabel=(value:number)=>value<=1.04?'Linear':`${value.toFixed(1).replace('.',',')}×`;
const LABELS:Record<string,(value:number)=>string>={'aim.adsSensitivity':percent,'aim.scopeSensitivity':percent,'pad.lookSpeed':percent,'pad.curve':curveLabel};
const range=(min:number,max:number)=>({min:Math.round(min*100),max:Math.round(max*100)});
const comma=(value:number,digits:number)=>value.toFixed(digits).replace('.',',');
const metres=(value:number)=>`${comma(value,2)} m`,centimetres=(value:number)=>`${Math.round(value*100)} cm`,times=(value:number)=>`${comma(value,1)}×`;
/** The weapon camera's rows (AimCamera): its key, name, what it reads as, the slider's step (hundredths), and a note. */
const AIM_CAMERA_ROWS:ReadonlyArray<readonly [keyof AimCamera,string,(value:number)=>string,number,string]>=[
  ['armedBoom','Distância com a arma na mão',metres,5,'Sem mirar: quanto a câmera fica atrás do personagem'],
  ['armedRise','Altura com a arma na mão',value=>`${value>0?'+':''}${centimetres(value)}`,1,'Sem mirar: sobe (+) ou desce (−) a câmera, comparado a sem arma'],
  ['armedShoulder','Lado com a arma na mão',centimetres,1,'Sem mirar: quanto a câmera vai para o lado do ombro (tira o personagem de baixo da mira)'],
  ['rise','Altura mirando',value=>`${value>0?'+':''}${centimetres(value)}`,1,'Sobe (+) ou desce (−) a câmera mirando, comparado a sem mirar'],
  ['boomRifle','Distância mirando (armas longas)',metres,5,'Quanto a câmera fica atrás do personagem'],
  ['boomPistol','Distância mirando (pistolas)',metres,5,'Pistola e revólver'],
  ['shoulder','Lado mirando',centimetres,1,'Quanto a câmera vai para o lado do ombro'],
  ['level','Nivelar ao olhar para cima e baixo',percent,5,'100%: gira no lugar; 0%: gira em volta do personagem (desce ao olhar para cima)'],
  ['zoom','Zoom da mira (sem luneta)',percent,5,'Quanto do zoom de cada arma entra ao mirar; 0%: sem zoom'],
  ['follow','Firmeza ao seguir mirando',times,10,'Quanto a câmera gruda no personagem andando'],
  ['turn','Giro extra mirando',times,10,'Quanto mais rápido a câmera acompanha o mouse'],
];
for(const [key,,label] of AIM_CAMERA_ROWS)LABELS[`aimCamera.${key}`]=label;
/** The tuning as text to paste in the conversation (and to make the defaults). */
export const aimCameraText=(tune:AimCamera)=>`Câmera de mira: ${AIM_CAMERA_ROWS.map(([key,name,label])=>`${name} ${label(tune[key])}`).join(' · ')}\n${JSON.stringify(tune)}`;

export function aimSettingsPage(current:GameSettings,touch:boolean):string {
  const {aim,pad}=current;
  return groupRow('Mira')
    +choiceRow('Ajuda no controle','data-setting="aim.assistPad"',PAD_ASSISTS.map(mode=>[mode,mode==='travar'?`${PAD_ASSIST_LABELS[mode]} (como no RDR2)`:PAD_ASSIST_LABELS[mode]] as const),aim.assistPad,
      {note:aim.assistPad==='travar'?'LT trava no alvo; o direcional direito ajusta':aim.assistPad==='assistida'?'A mira desacelera e puxa de leve perto de alguém':'Nenhuma ajuda'})
    +switchRow('Ajuda no toque','data-setting="aim.assistTouch"',aim.assistTouch,{note:'Na tela de toque, a mira puxa de leve para o alvo'})
    +switchRow('Tiro automático','data-setting="aim.autoFire"',aim.autoFire,{note:touch?'Só no celular: mirando num corpo, atira sozinho':'Só no celular'})
    +rangeRow('Sensibilidade mirando','data-setting="aim.adsSensitivity"',Math.round(aim.adsSensitivity*100),percent(aim.adsSensitivity),{...range(...SENSITIVITY_LIMITS),step:5,note:'100%: o mesmo giro na tela que sem mirar'})
    +rangeRow('Sensibilidade na luneta','data-setting="aim.scopeSensitivity"',Math.round(aim.scopeSensitivity*100),percent(aim.scopeSensitivity),{...range(...SENSITIVITY_LIMITS),step:5})
    +groupRow('Controle')
    +rangeRow('Velocidade do direcional','data-setting="pad.lookSpeed"',Math.round(pad.lookSpeed*100),percent(pad.lookSpeed),{...range(...LOOK_SPEED_LIMITS),step:10})
    +rangeRow('Curva de resposta','data-setting="pad.curve"',Math.round(pad.curve*100),curveLabel(pad.curve),{...range(...CURVE_LIMITS),step:10,note:'Mais alta, mais fino perto do centro'})
    +switchRow('Inverter vertical','data-setting="pad.invertY"',pad.invertY)
    +switchRow('Vibração','data-setting="pad.vibration"',pad.vibration,{note:'No tiro, ao levar tiro e ao derrubar alguém'})
    +groupRow('Câmera')
    +choiceRow('Ombro da câmera','data-setting="shoulder"',[['right','Direito'],['left','Esquerdo']],current.shoulder,{note:`Atalho: ${keyLabel(current.weaponKeys.shoulder)||'sem tecla'} (R3 no controle)`})
    +groupRow('Teclas das armas (teclado e mouse)')
    +noteRow('Clique numa ação e aperte a tecla ou um botão lateral do mouse. Esc cancela, Delete deixa sem tecla. Atirar e mirar ficam nos botões esquerdo e direito; o botão do meio liga e desliga o mouse.')
    +WEAPON_ACTIONS.map(action=>{const [name,note]=WEAPON_ACTION_NAMES[action],code=current.weaponKeys[action],isDefault=code===DEFAULT_WEAPON_KEYS[action];
      return buttonRow(name,`data-action="weapon-key" data-key="${action}"`,keyLabel(code)||'Sem tecla','keyboard',[note,isDefault?'':`padrão ${keyLabel(DEFAULT_WEAPON_KEYS[action])||'sem tecla'}`].filter(Boolean).join(' · ')||undefined);}).join('')
    +buttonRow('Restaurar teclas','data-action="weapon-keys-reset"','Restaurar','reset')
    +groupRow('Posição da câmera (ajuste fino)')
    +noteRow('Vale na hora e fica salvo neste navegador: feche o menu (Esc) e veja com a arma na mão, ou mirando com o botão direito. Achou a melhor posição? Use Copiar valores e cole na conversa para virar o padrão.')
    +AIM_CAMERA_ROWS.map(([key,name,label,step,note],index)=>{const value=current.aimCamera[key],changed=Math.abs(value-DEFAULT_AIM_CAMERA[key])>1e-6;
      return (index===0?groupRow('Com a arma na mão (sem mirar)'):key==='rise'?groupRow('Mirando (botão direito)'):'')+rangeRow(name,`data-setting="aimCamera.${key}"`,Math.round(value*100),label(value),{...range(...AIM_CAMERA_LIMITS[key]),step,note:changed?`${note} · padrão ${label(DEFAULT_AIM_CAMERA[key])}`:note});}).join('')
    +buttonRow('Copiar valores','data-action="aim-camera-copy"','Copiar','copy','A posição atual, para colar na conversa')
    +buttonRow('Restaurar padrão','data-action="aim-camera-reset"','Restaurar','reset')
    +noteRow('Mouse e teclado nunca têm ajuda de mira.');
}

/** A control of that page moved: the settings to update and the text its output should read; undefined for any other key. */
export function aimSettingPatch(current:GameSettings,key:string,control:HTMLInputElement|HTMLSelectElement):{patch:Partial<GameSettings>;label?:string}|undefined {
  if(key==='shoulder')return {patch:{shoulder:readShoulder(control.value)}};
  const dot=key.indexOf('.'),group=key.slice(0,dot),name=key.slice(dot+1);
  if(group!=='aim'&&group!=='pad'&&group!=='aimCamera')return undefined;
  const input=control instanceof HTMLInputElement?control:undefined;
  const value=input?.type==='range'?Number(input.value)/100:input?.type==='checkbox'?input.checked:control.value;
  if(group==='aimCamera'){const aimCamera=readAimCamera({...current.aimCamera,[name]:value});return {patch:{aimCamera},label:LABELS[key]?.(aimCamera[name as keyof AimCamera])};}
  if(group==='aim'){const aim=readAim({...current.aim,[name]:value});return {patch:{aim},label:LABELS[key]?.(aim[name as keyof typeof aim] as number)};}
  const pad=readPad({...current.pad,[name]:value});
  return {patch:{pad},label:LABELS[key]?.(pad[name as keyof typeof pad] as number)};
}

/** The guide's "Controles das armas" (docs/sistemas/armas.md#controles). */
export const weaponGuide=(keys:WeaponKeys):Readonly<Record<'teclado'|'controle'|'toque',ReadonlyArray<readonly [string,string]>>>=>{
  const k=(action:keyof WeaponKeys)=>keyLabel(keys[action])||'(sem tecla)';
  return {...WEAPON_KEYS,teclado:[[k('wheel'),'Roda de armas: segure e solte em cima da arma (um toque deixa aberta); o centro guarda'],['1 … 0','Escolhe a arma pela posição na roda'],
    ['Clique','Atira'],['Botão direito','Segure para mirar pelo ombro ou pela luneta'],[k('reload'),'Recarrega (sem arma na mão, R é a guarda da luta)'],[k('mode'),'Modo de tiro: automático ou semi'],
    [k('holster'),'Guarda a arma ou saca a última'],[k('prev'),'Arma anterior'],[k('next'),'Arma seguinte'],[k('shoulder'),'Troca o ombro da câmera'],[k('arsenal'),'Abre o Arsenal: equipamentos e melhorias'],
    [k('breath'),'Na luneta, segura o fôlego'],['Roda do mouse','Na luneta de precisão, troca o aumento (8x ↔ 4x)']]};
};
const WEAPON_KEYS:Readonly<Record<'teclado'|'controle'|'toque',ReadonlyArray<readonly [string,string]>>>={
  teclado:[],
  controle:[['LB','Segure: roda de armas (o direcional direito escolhe). Toque rápido: arma anterior'],['RB','Arma seguinte'],['RT','Atira'],
    ['LT','Mira; no modo Travar no alvo, prende a mira em quem está mais perto do centro'],['X','Recarrega'],['Y','Modo de tiro'],['B','Guarda a arma ou saca a última'],
    ['R3','Troca o ombro'],['L3','Corre; na luneta, segura o fôlego'],['D-pad ↑ ↓','Zoom da luneta'],['D-pad →','Arsenal'],['Start','Menu']],
  toque:[['Fogo','Segure para atirar; arrastar em cima dele também gira a câmera'],['Mirar','Liga e desliga a mira'],['Recarregar','Recarrega'],
    ['Arma','Abre a roda: toque na arma; no centro, guarda; fora, fecha'],['Zoom + −','Com luneta, muda o aumento'],['Fôlego','Com luneta, segure para firmar']],
};
