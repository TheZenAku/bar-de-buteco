// The collection without a server: window.fixture.open(view, focus) mounts the screen on a catalog answered here, with purchases that just work.
import '../../apps/web/src/assets/fonts/neon-ui.css';
import '../../apps/web/src/neon-ui.css';
import {SKILLS,SKINS} from '@bar/shared';
import {createCollection} from '../../apps/web/src/collection/collection';

function wardrobe(balance=3400,owned=['nathan','rafael'],skills=['karate']){
  return {equippedSkin:'rafael',balance,
    catalog:SKINS.map(skin=>({id:skin.id,name:skin.name,base:skin.base,variant:skin.variant,rarity:skin.rarity,accent:skin.accent,description:skin.description,price:skin.price,owned:owned.includes(skin.id),available:true})),
    skills:SKILLS.map(skill=>({id:skill.id,skin:skill.skin,name:skill.name,description:skill.description,icon:skill.icon,rarity:skill.rarity,price:skill.price,owned:skills.includes(skill.id),available:true}))};
}
let view=wardrobe(),worn='rafael',instance;
const root=document.querySelector('#collection-root');
const fixture={
  toasts:[],
  open(next={},focus){
    instance?.destroy();
    view={...wardrobe(),...next};worn=view.equippedSkin;
    instance=createCollection(root,view,{
      wearing:()=>worn,busy:()=>'',volume:()=>0,toast:text=>{fixture.toasts.push(text);},
      buy:async skin=>{const price=view.catalog.find(card=>card.id===skin).price;view={...view,balance:view.balance-price,catalog:view.catalog.map(card=>card.id===skin?{...card,owned:true}:card)};return view;},
      buySkill:async skill=>{const price=view.skills.find(each=>each.id===skill).price;view={...view,balance:view.balance-price,skills:view.skills.map(each=>each.id===skill?{...each,owned:true}:each)};return view;},
      equip:async skin=>{worn=skin;view={...view,equippedSkin:skin};return view;},
    },focus);
  },
  close(){instance?.destroy();instance=undefined;},
};
window.fixture=fixture;
fixture.open();
