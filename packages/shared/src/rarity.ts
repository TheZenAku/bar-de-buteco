/** How rare a thing is, from the commonest. Badges and the collection's cards share the same five tiers; the rarest also shines with glitter. */
export const RARITIES=['common','uncommon','rare','epic','legendary'] as const;
export type Rarity=typeof RARITIES[number];
export const RAREST:Rarity='legendary';
export const RARITY_INFO:Record<Rarity,{name:string;color:string}>={
  common:{name:'Comum',color:'#aeb6c8'},uncommon:{name:'Incomum',color:'#5fd86c'},rare:{name:'Raro',color:'#17d4f4'},epic:{name:'Épico',color:'#c48bff'},legendary:{name:'Lendário',color:'#fac416'},
};
