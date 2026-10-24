import type {CharacterConfig} from '@bar/shared';
import {LegacyCharacterPreview} from './LegacyCharacterPreview';

export type ClothingPreviews=Record<string,string>;

/** The creator's 3D preview. The next avatar system plugs in here; today it is the current base characters. */
export class CharacterPreview{
  private implementation:LegacyCharacterPreview;
  constructor(canvas:HTMLCanvasElement,onClothingPreviews?:(images:ClothingPreviews)=>void){this.implementation=new LegacyCharacterPreview(canvas,onClothingPreviews);}
  rotate(degrees:number){this.implementation.rotate(degrees);}
  update(config:CharacterConfig){return this.implementation.update(config);}
  destroy(){this.implementation.destroy();}
}
