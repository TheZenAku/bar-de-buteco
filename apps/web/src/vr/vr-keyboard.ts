/**
 * The keyboard of the VR screen. A headset in a WebXR session has no system keyboard, and the chat, the phone and the forms all
 * type. This one is plain HTML at the bottom of the page: the mirror draws it with everything else (dom-mirror.ts) and the laser
 * clicks its keys, which write into whichever text field has the focus.
 */
const ROWS:readonly string[][]=[
  ['1','2','3','4','5','6','7','8','9','0'],
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l','ç'],
  ['z','x','c','v','b','n','m','-','_','@'],
  ['.',',','!','?',':','/','+','=','(',')'],
];
const ACCENTS:Readonly<Record<string,string>>={a:'á',e:'é',i:'í',o:'ó',u:'ú'};
const TEXT_TYPES=new Set(['text','search','email','url','tel','password','number','']);

type Field=HTMLInputElement|HTMLTextAreaElement;
const isField=(node:EventTarget|null):node is Field=>
  (node instanceof HTMLInputElement&&TEXT_TYPES.has(node.type))||node instanceof HTMLTextAreaElement;

export function createVrKeyboard():{show():void;hide():void;readonly visible:boolean;destroy():void} {
  const root=document.createElement('div');
  root.id='vr-keyboard';root.className='vr-keyboard hidden';root.setAttribute('data-capture-input','');
  let shift=false,accent=false;
  const render=()=>{
    const cased=(key:string)=>shift?key.toUpperCase():key;
    root.innerHTML=`<div class="vr-kb-rows">${ROWS.map(row=>`<div class="vr-kb-row">${row.map(key=>`<button type="button" class="vr-key" data-key="${key}">${cased(key)}</button>`).join('')}</div>`).join('')}
      <div class="vr-kb-row"><button type="button" class="vr-key wide ${shift?'on':''}" data-act="shift">Maiúscula</button><button type="button" class="vr-key wide ${accent?'on':''}" data-act="accent">Acento ´</button>
      <button type="button" class="vr-key space" data-act="space">espaço</button><button type="button" class="vr-key wide" data-act="back">Apagar</button>
      <button type="button" class="vr-key wide go" data-act="enter">Enviar</button><button type="button" class="vr-key wide" data-act="close">Fechar</button></div></div>`;
  };
  render();
  document.body.append(root);

  const field=()=>isField(document.activeElement)?document.activeElement:null;
  const insert=(text:string)=>{
    const target=field();if(!target)return;
    const start=target.selectionStart??target.value.length,end=target.selectionEnd??start;
    try{target.setRangeText(text,start,end,'end');}catch{target.value+=text;}
    // Number and e-mail fields have no selection to keep; the page listens for the same event a keystroke makes.
    target.dispatchEvent(new InputEvent('input',{bubbles:true,data:text,inputType:'insertText'}));
  };
  const erase=()=>{
    const target=field();if(!target)return;
    const start=target.selectionStart,end=target.selectionEnd;
    if(start===null||end===null){target.value=target.value.slice(0,-1);}
    else if(start!==end)target.setRangeText('',start,end,'end');
    else if(start>0)target.setRangeText('',start-1,start,'end');
    target.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));
  };
  const enter=()=>{
    const target=field();if(!target)return;
    for(const type of ['keydown','keyup'])target.dispatchEvent(new KeyboardEvent(type,{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
    const form=target.form;
    if(form&&target instanceof HTMLInputElement)form.requestSubmit();
    else if(target instanceof HTMLTextAreaElement)insert('\n');
  };
  const hide=()=>{root.classList.add('hidden');};
  const show=()=>{root.classList.remove('hidden');};

  // A key press must not take the focus from the text field: the laser's click is not a real mouse down, but a real one (the
  // page in 2D, when the headset is taken off) is stopped the same way.
  root.addEventListener('pointerdown',event=>event.preventDefault());
  root.addEventListener('mousedown',event=>event.preventDefault());
  root.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLElement>('button');
    if(!button)return;
    const act=button.dataset.act,key=button.dataset.key;
    if(act==='shift'){shift=!shift;render();return;}
    if(act==='accent'){accent=!accent;render();return;}
    if(act==='space')insert(' ');
    else if(act==='back')erase();
    else if(act==='enter')enter();
    else if(act==='close'){hide();(document.activeElement as HTMLElement|null)?.blur?.();return;}
    else if(key){
      let text=shift?key.toUpperCase():key;
      if(accent&&ACCENTS[key]){text=shift?ACCENTS[key]!.toUpperCase():ACCENTS[key]!;}
      accent=false;insert(text);
      if(shift){shift=false;}
      render();
    }
  });
  // Opens by itself when a text field gets the focus while in VR, and closes when the focus leaves for something else.
  const onFocus=(event:FocusEvent)=>{
    if(!document.documentElement.classList.contains('vr-active'))return;
    if(isField(event.target)&&!root.contains(event.target as Node))show();
  };
  const onBlur=()=>setTimeout(()=>{if(!isField(document.activeElement))hide();},60);
  document.addEventListener('focusin',onFocus);
  document.addEventListener('focusout',onBlur);
  return {show,hide,get visible(){return !root.classList.contains('hidden');},destroy(){document.removeEventListener('focusin',onFocus);document.removeEventListener('focusout',onBlur);root.remove();}};
}
