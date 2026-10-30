import {z} from 'zod';

/**
 * The stage's light desk: the spot the admin chose standing on the deck (2026-10-30), facing the sound desk
 * (COL_Palco_Mesa_Som). E there opens the show's controls; it is used standing on its blip, within LIGHT_DESK_REACH metres.
 */
export const LIGHT_DESK={x:22.07,y:.9,z:-23.46,rotation:2.94} as const;
export const LIGHT_DESK_REACH=.7;

/** The show's programs, in the order the panel lists them (apps/web/src/engine/stage-show.ts draws them). */
export const SHOW_PROGRAMS=[
  {id:'leque',name:'Leque',summary:'Doze feixes abrem e fecham em leque do meio da treliça.'},
  {id:'tesoura',name:'Tesoura',summary:'Os lasers das caixas se cruzam sobre a plateia.'},
  {id:'tunel',name:'Túnel',summary:'Um cone de feixes gira saindo do telão, rumo à plateia.'},
  {id:'onda',name:'Onda',summary:'Os lasers da treliça mergulham um depois do outro.'},
  {id:'chuva',name:'Chuva',summary:'Feixes chovem sobre a plateia e piscam na colcheia.'},
  {id:'estrobo',name:'Estrobo',summary:'Estrobo na batida e heads brancos caçando gente.'},
  {id:'varredura',name:'Varredura',summary:'Uma cortina de lasers sobe e desce sobre as cabeças.'},
  {id:'letreiro',name:'Letreiro',summary:'O laser escreve o letreiro no telão, letra por letra.'},
  {id:'desenhos',name:'Desenhos',summary:'Estrela, coração, caneca de chopp e notas no telão.'},
  {id:'ceu',name:'Céu líquido',summary:'Um teto de luz ondulando acima da plateia.'},
  {id:'helice',name:'Hélice',summary:'Três hélices de feixes girando na treliça.'},
  {id:'grade',name:'Grade',summary:'Os leques das caixas se cruzam numa grade de losangos.'},
  {id:'foco',name:'Foco',summary:'Todos os lasers se encontram num ponto que passeia.'},
  {id:'equalizador',name:'Equalizador',summary:'Cada laser da treliça sobe e desce como um equalizador.'},
  {id:'cometa',name:'Cometa',summary:'Um feixe corre de laser em laser, com rastro.'},
  {id:'relampago',name:'Relâmpago',summary:'Feixes soltos riscam o quintal ao acaso.'},
] as const;
export type ShowProgramId=typeof SHOW_PROGRAMS[number]['id'];
export const SHOW_PROGRAM_IDS=SHOW_PROGRAMS.map(p=>p.id) as [ShowProgramId,...ShowProgramId[]];

/** The beams' colours (sRGB hex); 'auto' on the desk changes palette with every program. */
export const SHOW_PALETTES=[
  {id:'highland',name:'Highland',colours:['#ff2bd6','#17d4f4','#2a6bff']},
  {id:'verde',name:'Verde',colours:['#2bff5a','#17f4c8','#c8ff2b']},
  {id:'fogo',name:'Fogo',colours:['#ff2a3a','#ff8a1c','#ffd21c']},
  {id:'neon',name:'Neon',colours:['#fac416','#ff4fd8','#17d4f4']},
  {id:'gelo',name:'Gelo',colours:['#ffffff','#8fe9ff','#3d7bff']},
  {id:'brasil',name:'Brasil',colours:['#18e05a','#ffd400','#2a5bff']},
  {id:'por-do-sol',name:'Pôr do sol',colours:['#ff5e3a','#ff2bd6','#ffb21c']},
  {id:'arco-iris',name:'Arco-íris',colours:['#ff2a3a','#ffd21c','#2bff5a','#17d4f4','#2a6bff','#ff2bd6']},
] as const;
export type ShowPaletteId=typeof SHOW_PALETTES[number]['id'];
const PALETTE_IDS=SHOW_PALETTES.map(p=>p.id) as [ShowPaletteId,...ShowPaletteId[]];

/** auto: the show runs while something plays on the stage; on: always; off: never (cues still fire). */
export const SHOW_POWERS=['auto','on','off'] as const;
export type ShowPower=typeof SHOW_POWERS[number];
/** Momentary effects fired from the desk; their length in beats (the flash: a fixed 0.6 s). */
export const SHOW_CUES={flash:{name:'Flash',beats:0},blackout:{name:'Blackout',beats:4},drop:{name:'Drop',beats:8},letreiro:{name:'Letreiro',beats:32}} as const;
export type ShowCue=keyof typeof SHOW_CUES;
const CUE_IDS=Object.keys(SHOW_CUES) as [ShowCue,...ShowCue[]];
export const SHOW_BARS=[4,8,16] as const;
export const SHOW_BPM={min:60,max:180} as const;

/**
 * The show as the room syncs it (BarState.stageShow): who set it last, and everything every browser needs to draw the same
 * show on the same beat. The beat counts from `beatAt` (server ms) at `bpm`; each program runs `bars` bars of four beats.
 */
export interface StageShowState {
  power:ShowPower;
  /** cycle: the programs of `playlist` take turns; fixed: `program` alone, starting over every `bars` bars. */
  mode:'cycle'|'fixed';
  program:string;
  /** Comma-separated program ids. */
  playlist:string;
  bars:number;
  /** A palette id, or 'auto'. */
  palette:string;
  bpm:number;
  beatAt:number;
  /** How fast things move, in % of the tempo's own pace (25–200). */
  speed:number;
  /** Levels, 0–100: the whole show, the lasers (with the drawings), the moving heads, the strobe and blinders. */
  master:number;lasers:number;heads:number;strobe:number;
  /** What the letreiro writes (showText). */
  text:string;
  /** The last cue fired and when (server ms). */
  cue:string;cueAt:number;
  /** The scene last applied as a whole ('' once something was changed by hand). */
  preset:string;
  updatedBy:string;updatedAt:number;revision:number;
}
export const DEFAULT_SHOW_PLAYLIST:readonly ShowProgramId[]=['leque','letreiro','tesoura','ceu','tunel','cometa','onda','grade','chuva','foco','estrobo','helice','varredura','equalizador','desenhos','relampago'];
export const DEFAULT_SHOW:StageShowState={power:'auto',mode:'cycle',program:'letreiro',playlist:DEFAULT_SHOW_PLAYLIST.join(','),bars:8,palette:'auto',
  bpm:124,beatAt:0,speed:100,master:100,lasers:100,heads:100,strobe:100,text:'HIGHLAND',cue:'',cueAt:0,preset:'casa',updatedBy:'',updatedAt:0,revision:0};

/** The characters the laser's font draws (apps/web/src/engine/laser-font.ts); anything else is dropped. */
export const SHOW_TEXT_CHARS='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !?.-♥';
export const SHOW_TEXT_MAX=14;
/** The letreiro's text: capitals without accents, only what the font draws, at most SHOW_TEXT_MAX; HIGHLAND when empty. */
export function showText(raw:string):string {
  const text=[...raw.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/<3/g,'♥')].filter(c=>SHOW_TEXT_CHARS.includes(c)).join('')
    .replace(/\s+/g,' ').trim();
  return [...text].slice(0,SHOW_TEXT_MAX).join('').trim()||'HIGHLAND';
}

/**
 * What the desk sends: any of the settings, a tapped beat (`tap`, server ms; with `bar`, the first beat of a bar) and the
 * scene's name when applying one.
 */
export const showPatchSchema=z.object({
  power:z.enum(SHOW_POWERS).optional(),
  mode:z.enum(['cycle','fixed']).optional(),
  program:z.enum(SHOW_PROGRAM_IDS).optional(),
  playlist:z.array(z.enum(SHOW_PROGRAM_IDS)).min(1).max(SHOW_PROGRAMS.length*2).optional(),
  bars:z.union([z.literal(4),z.literal(8),z.literal(16)]).optional(),
  palette:z.enum(['auto',...PALETTE_IDS]).optional(),
  bpm:z.number().int().min(SHOW_BPM.min).max(SHOW_BPM.max).optional(),
  tap:z.number().finite().optional(),
  bar:z.literal(true).optional(),
  speed:z.number().int().min(25).max(200).optional(),
  master:z.number().int().min(0).max(100).optional(),
  lasers:z.number().int().min(0).max(100).optional(),
  heads:z.number().int().min(0).max(100).optional(),
  strobe:z.number().int().min(0).max(100).optional(),
  text:z.string().max(64).optional(),
  preset:z.string().trim().max(32).optional(),
}).strict();
export type ShowPatch=z.infer<typeof showPatchSchema>;
export const showCueSchema=z.object({cue:z.enum(CUE_IDS)}).strict();

/** The desk's ready-made scenes: a whole patch each (`text` only where the scene is about it). */
export const SHOW_PRESETS:ReadonlyArray<{id:string;name:string;summary:string;patch:ShowPatch}>=[
  {id:'casa',name:'Padrão da casa',summary:'Todos os programas em rodízio, cores automáticas, 124 BPM.',
    patch:{power:'auto',mode:'cycle',playlist:[...DEFAULT_SHOW_PLAYLIST],bars:8,palette:'auto',bpm:124,speed:100,master:100,lasers:100,heads:100,strobe:100}},
  {id:'abertura',name:'Abertura Highland',summary:'O laser escreve HIGHLAND no telão, sem parar.',
    patch:{power:'on',mode:'fixed',program:'letreiro',bars:8,palette:'highland',bpm:124,speed:100,master:100,lasers:100,heads:80,strobe:60,text:'HIGHLAND'}},
  {id:'festa',name:'Festa no quintal',summary:'Leques, cometas, céu líquido e desenhos, a 128 BPM.',
    patch:{power:'auto',mode:'cycle',playlist:['leque','cometa','tesoura','ceu','onda','foco','desenhos','letreiro'],bars:8,palette:'auto',bpm:128,speed:100,master:100,lasers:100,heads:100,strobe:80}},
  {id:'rave',name:'Rave',summary:'Estrobo, túnel, relâmpagos e grade em verde, 140 BPM, trocando a cada 4 compassos.',
    patch:{power:'auto',mode:'cycle',playlist:['estrobo','tunel','relampago','grade','helice','chuva','equalizador'],bars:4,palette:'verde',bpm:140,speed:130,master:100,lasers:100,heads:100,strobe:100}},
  {id:'pagode',name:'Pagode',summary:'Verde e amarelo, ondas e cometas num balanço de 100 BPM.',
    patch:{power:'auto',mode:'cycle',playlist:['onda','cometa','ceu','desenhos','leque','varredura'],bars:8,palette:'brasil',bpm:100,speed:85,master:100,lasers:100,heads:90,strobe:25}},
  {id:'modao',name:'Modão',summary:'Lento e quente: céu líquido, varredura e foco, sem estrobo.',
    patch:{power:'auto',mode:'cycle',playlist:['ceu','varredura','leque','foco'],bars:16,palette:'fogo',bpm:76,speed:55,master:90,lasers:80,heads:70,strobe:0}},
  {id:'gelo',name:'Noite gelada',summary:'Túnel, hélices e grade em branco e azul.',
    patch:{power:'auto',mode:'cycle',playlist:['tunel','helice','ceu','grade','varredura'],bars:8,palette:'gelo',bpm:118,speed:100,master:100,lasers:100,heads:100,strobe:40}},
  {id:'karaoke',name:'Karaokê',summary:'Desenhos e letreiro no telão, céu líquido por cima.',
    patch:{power:'auto',mode:'cycle',playlist:['desenhos','letreiro','ceu','onda'],bars:8,palette:'neon',bpm:110,speed:90,master:100,lasers:100,heads:80,strobe:20}},
  {id:'apagado',name:'Tudo apagado',summary:'Nada acende, nem com música. Os efeitos ainda disparam.',patch:{power:'off'}},
];

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
/** Beats since `beatAt` at time `at`. */
const beatsAt=(show:Pick<StageShowState,'bpm'|'beatAt'>,at:number)=>(at-show.beatAt)*show.bpm/60000;
export const showPlaylist=(show:Pick<StageShowState,'playlist'>):ShowProgramId[]=>{
  const list=show.playlist.split(',').filter((id):id is ShowProgramId=>SHOW_PROGRAM_IDS.includes(id as ShowProgramId));
  return list.length?list:[...DEFAULT_SHOW_PLAYLIST];
};

/**
 * The desk's change applied at `now` by `by`. A new tempo keeps the beat count going (the program does not jump); a tap
 * puts a whole beat on the tapped moment (at most 2 s ago), or with `bar` a bar's first beat, so the show's "one" lands
 * where the DJ heard it.
 */
export function applyShowPatch(show:StageShowState,patch:ShowPatch,now:number,by:string):StageShowState {
  const next:StageShowState={...show};
  for(const key of ['power','mode','program','bars','palette','speed','master','lasers','heads','strobe'] as const)
    if(patch[key]!==undefined)(next as unknown as Record<string,unknown>)[key]=patch[key];
  if(patch.playlist)next.playlist=[...new Set(patch.playlist)].join(',');
  if(patch.text!==undefined)next.text=showText(patch.text);
  if(patch.bpm!==undefined&&patch.bpm!==show.bpm){next.bpm=patch.bpm;next.beatAt=now-beatsAt(show,now)*60000/patch.bpm;}
  if(patch.tap!==undefined){
    const at=clamp(patch.tap,now-2000,now),unit=patch.bar?4:1,beat=Math.round(beatsAt(next,at)/unit)*unit;
    next.beatAt=at-beat*60000/next.bpm;
  }
  next.preset=patch.preset??'';
  next.updatedBy=by;next.updatedAt=now;next.revision=show.revision+1;
  return next;
}

/** A cue fired from the desk now. */
export function fireShowCue(show:StageShowState,cue:ShowCue,now:number,by:string):StageShowState {
  return {...show,cue,cueAt:now,updatedBy:by,updatedAt:now,revision:show.revision+1};
}

/** Where the show is at `now`: the program, its palette, the beat within it and a cue still running. */
export interface ShowMoment {
  program:ShowProgramId;palette:ShowPaletteId;
  /** The program's turn (counted from beatAt) and its length in beats. */
  index:number;beats:number;
  /** Beats since the program began (fractional) and its bar. */
  beat:number;bar:number;
  /** Milliseconds per beat. */
  beatMs:number;
  /** A cue still running: its beat (fractional, from when it fired) and its length in beats. */
  cue?:{id:ShowCue;beat:number;beats:number;ms:number};
}
const FLASH_MS=600;
export function showMoment(show:StageShowState=DEFAULT_SHOW,now:number):ShowMoment {
  const bpm=clamp(show.bpm||DEFAULT_SHOW.bpm,SHOW_BPM.min,SHOW_BPM.max),beatMs=60000/bpm,bars=SHOW_BARS.includes(show.bars as 4)?show.bars:8,beats=bars*4;
  const total=(now-show.beatAt)/beatMs,index=Math.floor(total/beats),beat=total-index*beats;
  const list=show.mode==='fixed'?[SHOW_PROGRAM_IDS.includes(show.program as ShowProgramId)?show.program as ShowProgramId:'letreiro' as const]:showPlaylist(show);
  const turn=((index%list.length)+list.length)%list.length,lap=Math.floor(index/list.length);
  // Three palettes on each turn (prime to their count), one more each lap of the playlist: every palette comes round.
  const auto=SHOW_PALETTES[(((index*3+lap)%SHOW_PALETTES.length)+SHOW_PALETTES.length)%SHOW_PALETTES.length]!.id;
  const palette=PALETTE_IDS.includes(show.palette as ShowPaletteId)?show.palette as ShowPaletteId:auto;
  const moment:ShowMoment={program:list[turn]!,palette,index,beats,beat,bar:Math.floor(beat/4),beatMs};
  const cue=show.cue in SHOW_CUES?show.cue as ShowCue:undefined,since=now-show.cueAt;
  if(cue&&since>=0){
    const length=SHOW_CUES[cue].beats,ms=length?length*beatMs:FLASH_MS;
    if(since<ms){
      moment.cue={id:cue,beat:since/beatMs,beats:length,ms:since};
      // The letreiro cue writes the text now, over whatever was running.
      if(cue==='letreiro')Object.assign(moment,{program:'letreiro',beats:length,beat:since/beatMs,bar:Math.floor(since/beatMs/4)});
    }
  }
  return moment;
}
