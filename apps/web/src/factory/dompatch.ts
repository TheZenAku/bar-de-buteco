/**
 * Updates `root` to show `html` by changing only what differs, instead of replacing everything.
 * The panel is refreshed several times a second; replacing its buttons each time dropped clicks (a press landed on a
 * button that no longer existed), reset the scroll and the hover, and made the focus ring jump.
 */
export function patchHtml(root:HTMLElement,html:string):void {
  const template=document.createElement('template');template.innerHTML=html;
  reconcile(root,template.content);
}

function reconcile(current:ParentNode,next:ParentNode):void {
  const have=[...current.childNodes],want=[...next.childNodes];
  for(let i=0;i<want.length;i++){
    const target=want[i]!,existing=have[i];
    if(!existing){current.appendChild(target.cloneNode(true));continue;}
    if(existing.nodeType!==target.nodeType||(existing instanceof Element&&target instanceof Element&&existing.tagName!==target.tagName)){
      current.replaceChild(target.cloneNode(true),existing);continue;
    }
    if(existing instanceof Text){if(existing.nodeValue!==target.nodeValue)existing.nodeValue=target.nodeValue;continue;}
    if(existing instanceof Element&&target instanceof Element){
      syncAttributes(existing,target);
      // A text field being typed in keeps its value and focus.
      if(existing instanceof HTMLInputElement||existing instanceof HTMLTextAreaElement||existing instanceof HTMLSelectElement)continue;
      reconcile(existing,target);
    }
  }
  while(current.childNodes.length>want.length)current.removeChild(current.lastChild!);
}

function syncAttributes(from:Element,to:Element):void {
  for(const {name,value} of [...to.attributes])if(from.getAttribute(name)!==value)from.setAttribute(name,value);
  for(const {name} of [...from.attributes])if(!to.hasAttribute(name))from.removeAttribute(name);
}
