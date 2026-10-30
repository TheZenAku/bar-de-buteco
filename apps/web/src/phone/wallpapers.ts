/** Home screen backgrounds (Ajustes); a gallery photo is `photo:<id>` instead. The first is the default. */
export const WALLPAPERS:Record<string,{name:string;css:string;light?:boolean}>={
  aurora:{name:'Highland',css:'radial-gradient(110% 70% at 15% 8%,#ea2fdc 0%,transparent 58%),radial-gradient(90% 60% at 95% 45%,#0386f0 0%,transparent 62%),radial-gradient(90% 55% at 25% 100%,#f59847 0%,transparent 62%),#14072c'},
  neon:{name:'Neon',css:'linear-gradient(165deg,#17d4f4 0%,#a77bff 46%,#ea2fdc 100%)'},
  dourado:{name:'Dourado',css:'linear-gradient(160deg,#2b2218,#0d0d0f 58%,#8a6a35)'},
  ambar:{name:'Âmbar',css:'radial-gradient(circle at 30% 18%,#c9a15a,#3b2a14 45%,#0b0907)'},
  grafite:{name:'Grafite',css:'linear-gradient(180deg,#3d4045,#0e0f11)'},
  nevoa:{name:'Névoa',css:'linear-gradient(200deg,#d3d6db,#656b74)',light:true},
};
