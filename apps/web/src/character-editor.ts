import {BODY_TYPES,HAIRSTYLES,SKIN_TONES,HAIR_COLORS,EYE_COLORS,OUTFIT_COLORS,MALE_TOPS,MALE_BOTTOMS,MALE_FOOTWEAR,MALE_ACCESSORIES,characterSchema,type CharacterConfig,type ClothingSlot} from '@bar/shared';
import {CharacterPreview} from './engine/CharacterPreview';
import {escape as e} from './api';

export function characterEditor(container:HTMLElement,initial:CharacterConfig,first:boolean,onSave:(config:CharacterConfig)=>Promise<void>){
  let draft={...initial},disposed=false,busy=false,preview:CharacterPreview|undefined;
  const colors=(name:string,label:string,values:readonly string[])=>`<fieldset class="color-options"><legend>${label}</legend><div>${values.map((color,i)=>`<label class="color-choice" style="--swatch:${color}" title="${label} ${i+1}"><input type="radio" name="${name}" value="${color}" aria-label="${label} ${i+1}" ${draft[name as keyof CharacterConfig]===color?'checked':''}><span></span></label>`).join('')}</div></fieldset>`;
  const options=(list:readonly {id:string;name:string}[],value:string)=>list.map(item=>`<option value="${item.id}" ${item.id===value?'selected':''}>${e(item.name)}</option>`).join('');
  const clothes=(name:ClothingSlot,label:string,list:readonly {id:string;name:string}[])=>`<fieldset class="clothing-options"><legend>${label}</legend><div class="clothing-grid">${list.map(item=>`<label class="clothing-card"><input type="radio" name="${name}" value="${item.id}" aria-label="${e(item.name)}" ${draft[name]===item.id?'checked':''}><span class="clothing-card-face"><span class="clothing-art">${item.id==='none'?'<svg class="clothing-empty" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="23"/><path d="m16 48 32-32"/></svg>':`<img data-clothing-image="${item.id}" alt="Modelo 3D: ${e(item.name)}" width="256" height="256" hidden><span data-clothing-loading="${item.id}" class="clothing-loading">Carregando prévia…</span>`}</span><span class="clothing-card-caption"><b>${e(item.name)}</b><span class="clothing-check" aria-hidden="true">✓</span></span></span></label>`).join('')}</div></fieldset>`;
  container.innerHTML=`<p class="modal-description">${first?'Sua primeira rodada começa com um personagem que é a sua cara.':'Mude seu personagem. Skins completas ficam guardadas na sua coleção.'}</p><form id="character-form" class="character-editor">
    <div class="character-portrait"><canvas id="character-preview" aria-label="Prévia 3D do personagem"></canvas><p id="preview-status" role="status">Carregando personagem…</p><div class="portrait-tools"><button type="button" data-creator="rotate-left" aria-label="Girar personagem para a esquerda">↶</button><span>arraste para girar</span><button type="button" data-creator="rotate-right" aria-label="Girar personagem para a direita">↷</button></div></div>
    <div class="character-options"><label>Corpo<select name="body" aria-label="Corpo">${options(BODY_TYPES,draft.body)}</select></label>${colors('skinTone','Tom de pele',SKIN_TONES)}
    <label>Cabelo<select name="hair" aria-label="Cabelo">${options(HAIRSTYLES,draft.hair)}</select></label>${colors('hairColor','Cor do cabelo',HAIR_COLORS)}
    <label>Sobrancelhas<select name="eyebrows" aria-label="Sobrancelhas">${options([{id:'regular',name:'Regulares'},{id:'female',name:'Finas'},{id:'none',name:'Sem sobrancelhas'}],draft.eyebrows)}</select></label>
    <label class="checkbox-field"><input type="checkbox" name="beard" ${draft.beard?'checked':''}> Barba</label>${colors('eyeColor','Cor dos olhos',EYE_COLORS)}${colors('outfitColor','Roupa base',OUTFIT_COLORS)}
    <div id="male-clothing" ${draft.body==='male'?'':'hidden'}>
      <h3 class="clothing-heading">Seu guarda-roupa</h3><p class="clothing-description">Escolha uma peça para experimentar no personagem. As prévias acompanham a cor escolhida.</p>
      ${clothes('top','Blusas',MALE_TOPS)}${colors('topColor','Cor da blusa',OUTFIT_COLORS)}
      ${clothes('bottom','Calça',MALE_BOTTOMS)}${colors('bottomColor','Cor da calça',OUTFIT_COLORS)}
      ${clothes('footwear','Calçados',MALE_FOOTWEAR)}${colors('footwearColor','Cor dos calçados',OUTFIT_COLORS)}
      ${MALE_ACCESSORIES.length>1?clothes('accessory','Acessórios',MALE_ACCESSORIES)+colors('accessoryColor','Cor do acessório',OUTFIT_COLORS):'<input type="hidden" name="accessory" value="none"><input type="hidden" name="accessoryColor" value="'+draft.accessoryColor+'">'}
    </div>
    <button type="button" class="text-button" data-creator="random">Surpreenda-me ↗</button></div>
    <div class="character-footer"><p id="character-message" role="status"></p><button class="button primary" type="submit">${first?'Criar personagem e continuar':'Salvar personagem'} ↗</button></div></form>`;
  const form=container.querySelector<HTMLFormElement>('#character-form')!,message=container.querySelector<HTMLElement>('#character-message')!,status=container.querySelector<HTMLElement>('#preview-status')!;
  const render=()=>{container.querySelector<HTMLElement>('#male-clothing')!.hidden=draft.body!=='male';if(!preview)return;status.textContent='Atualizando prévia…';void preview.update(draft).then(()=>{if(!disposed)status.textContent='';}).catch(error=>{if(!disposed)status.textContent=error.message;});};
  try{preview=new CharacterPreview(container.querySelector<HTMLCanvasElement>('canvas')!,images=>{
    if(disposed)return;
    for(const [id,url] of Object.entries(images)){const image=container.querySelector<HTMLImageElement>(`[data-clothing-image="${id}"]`)!;if(image.getAttribute('src')!==url)image.src=url;image.hidden=false;container.querySelector<HTMLElement>(`[data-clothing-loading="${id}"]`)!.hidden=true;}
  });render();}catch{status.textContent='Prévia 3D indisponível. Você ainda pode salvar seu personagem.';}
  const read=()=>{const data=Object.fromEntries(new FormData(form));draft=characterSchema.parse({...data,version:1,beard:form.querySelector<HTMLInputElement>('[name="beard"]')!.checked});render();};
  const change=()=>{if(!busy)read();};form.addEventListener('change',change);
  const click=(event:MouseEvent)=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-creator]');if(!button||busy)return;const action=button.dataset.creator;if(action?.startsWith('rotate')){preview?.rotate(action==='rotate-left'?-30:30);return;}
    if(action==='random'){
      const choose=<T,>(values:readonly T[])=>values[Math.floor(Math.random()*values.length)];
      draft={version:1,body:choose(BODY_TYPES).id,hair:choose(HAIRSTYLES).id,skinTone:choose(SKIN_TONES),hairColor:choose(HAIR_COLORS),eyeColor:choose(EYE_COLORS),eyebrows:choose(['regular','female','none'] as const),beard:Math.random()<.25,outfitColor:choose(OUTFIT_COLORS),top:choose(MALE_TOPS).id,bottom:choose(MALE_BOTTOMS).id,footwear:choose(MALE_FOOTWEAR).id,accessory:choose(MALE_ACCESSORIES).id,topColor:choose(OUTFIT_COLORS),bottomColor:choose(OUTFIT_COLORS),footwearColor:choose(OUTFIT_COLORS),accessoryColor:choose(OUTFIT_COLORS)};
      for(const input of form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select')){const value=draft[input.name as keyof CharacterConfig];if(input instanceof HTMLInputElement&&input.type==='radio')input.checked=input.value===value;else if(input instanceof HTMLInputElement&&input.type==='checkbox')input.checked=!!value;else input.value=String(value);}render();
    }
  };form.addEventListener('click',click);
  const submit=async(event:SubmitEvent)=>{event.preventDefault();event.stopPropagation();if(busy)return;busy=true;message.textContent='Salvando seu personagem…';form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('input,select,button').forEach(input=>input.disabled=true);
    try{await onSave({...draft});}catch(error){if(!disposed)message.textContent=error instanceof Error?error.message:'Não foi possível salvar. Tente novamente.';}finally{busy=false;if(!disposed)form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('input,select,button').forEach(input=>input.disabled=false);}
  };form.addEventListener('submit',submit);
  return {destroy(){disposed=true;form.removeEventListener('change',change);form.removeEventListener('click',click);form.removeEventListener('submit',submit);preview?.destroy();}};
}
