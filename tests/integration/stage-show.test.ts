import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SHOW,INTERACTABLES,LIGHT_DESK,SHOW_CUES,SHOW_PALETTES,SHOW_PRESETS,SHOW_PROGRAMS,SHOW_TEXT_CHARS,STAGE,applyShowPatch,canInteract,fireShowCue,inStageArea,
  isWalkable,nearestInteraction,onStage,showMoment,showPatchSchema,showText,type StageShowState} from '@bar/shared';
import {LASER_GLYPHS,LASER_SHAPES,textDrawing} from '../../apps/web/src/engine/laser-font';

const BEAT_MS=60000/124;

test('the light desk stands on the deck by the sound desk, used from its blip up on the stage only',()=>{
  const desk=INTERACTABLES.find(object=>object.id==='light-desk');
  assert.ok(desk&&desk.type==='lights');
  assert.ok(onStage(LIGHT_DESK)&&inStageArea(LIGHT_DESK),'up on the stage, in the backyard where the blips show');
  // Where the admin stood, against the sound desk (the position is rounded to the centimetre).
  assert.ok(isWalkable(LIGHT_DESK.x,LIGHT_DESK.z+.01,LIGHT_DESK.y),'on open deck');
  assert.equal(nearestInteraction(LIGHT_DESK)?.id,'light-desk');
  for(const [dx,dz] of [[.5,0],[0,.5],[-.4,.3]])assert.ok(canInteract(desk,{x:LIGHT_DESK.x+dx,y:LIGHT_DESK.y,z:LIGHT_DESK.z+dz}),`on the ring ${dx},${dz}`);
  // From the backyard floor beside the deck, the desk is out of reach.
  assert.equal(canInteract(desk,{x:STAGE.deck.x-STAGE.deck.hx-.35,y:STAGE.deck.minY,z:LIGHT_DESK.z}),false);
  // Facing the sound desk (-Z): the rotation the admin stood at.
  assert.ok(Math.cos(LIGHT_DESK.rotation)<-.9);
});

test('the default show keeps the house clock: 124 BPM from the epoch, eight bars a program, every program in turn',()=>{
  const programMs=32*BEAT_MS,seen=new Set<string>();
  for(let i=0;i<SHOW_PROGRAMS.length;i++){
    const moment=showMoment(DEFAULT_SHOW,i*programMs+3000);
    assert.equal(moment.index,i);assert.ok(Math.abs(moment.beat-3000/BEAT_MS)<1e-6);assert.equal(moment.beats,32);
    seen.add(moment.program);
  }
  assert.deepEqual([...seen].sort(),SHOW_PROGRAMS.map(p=>p.id).sort());
  // Palettes change with the programs.
  assert.equal(new Set(Array.from({length:SHOW_PALETTES.length},(_,i)=>showMoment(DEFAULT_SHOW,i*programMs+1).palette)).size,SHOW_PALETTES.length);
  // Fixed: one program, starting over every `bars` bars; a fixed palette stays.
  const fixed={...DEFAULT_SHOW,mode:'fixed' as const,program:'foco',bars:4,palette:'gelo'};
  for(const at of [0,16*BEAT_MS+10,1e9]){const m=showMoment(fixed,at);assert.equal(m.program,'foco');assert.equal(m.palette,'gelo');assert.equal(m.beats,16);}
});

test('the desk: a new tempo keeps the beat going, a tap puts the beat (or the bar) where it was tapped, text is cleaned',()=>{
  const now=1_000_000_123,before=showMoment(DEFAULT_SHOW,now);
  const faster=applyShowPatch(DEFAULT_SHOW,{bpm:150},now,'DJ');
  const after=showMoment(faster,now);
  assert.equal(faster.bpm,150);assert.equal(after.index,before.index);assert.ok(Math.abs(after.beat-before.beat)<1e-6,'no jump');
  assert.ok(Math.abs(showMoment(faster,now+400).beat-(before.beat+1))<1e-6,'a beat every 400 ms');
  assert.deepEqual([faster.updatedBy,faster.revision,faster.preset],['DJ',1,'']);
  // A tap 300 ms ago lands on a whole beat; with `bar`, on the first beat of a bar.
  const tapped=applyShowPatch(faster,{tap:now-300},now,'DJ'),beat=showMoment(tapped,now-300).beat;
  assert.ok(Math.abs(beat-Math.round(beat))<1e-6);
  const one=applyShowPatch(faster,{tap:now,bar:true},now,'DJ'),m=showMoment(one,now);
  assert.ok(Math.abs(m.beat%4)<1e-6||Math.abs(m.beat%4-4)<1e-6,`bar start, got ${m.beat}`);
  // Taps from the future or long ago are held to the last 2 s.
  const late=applyShowPatch(DEFAULT_SHOW,{tap:now+60_000},now,'DJ');assert.ok(Math.abs(showMoment(late,now).beat%1)<1e-6||Math.abs(showMoment(late,now).beat%1-1)<1e-6);
  // The playlist loses repeats; the letreiro only keeps what the font draws.
  assert.equal(applyShowPatch(DEFAULT_SHOW,{playlist:['foco','ceu','foco']},now,'DJ').playlist,'foco,ceu');
  assert.equal(showText('  São João <3 açaí!  '),'SAO JOAO ♥ ACA');
  assert.equal(showText('###'),'HIGHLAND');
  assert.equal(showText('boa noite galera do bar'),'BOA NOITE GALE');
  assert.equal(applyShowPatch(DEFAULT_SHOW,{text:'Parabéns'},now,'DJ').text,'PARABENS');
  // The room refuses what the desk cannot send.
  for(const bad of [{bpm:300},{program:'nada'},{palette:'roxo'},{master:101},{bars:5},{playlist:[]},{extra:1}])assert.equal(showPatchSchema.safeParse(bad).success,false,JSON.stringify(bad));
  for(const preset of SHOW_PRESETS)assert.ok(showPatchSchema.safeParse({...preset.patch,preset:preset.id}).success,preset.id);
});

test('cues run for their length from when they fire; the letreiro cue writes over whatever runs',()=>{
  const now=5_000_000,show:StageShowState={...DEFAULT_SHOW,mode:'fixed',program:'ceu'};
  const lettering=fireShowCue(show,'letreiro',now,'DJ');
  const m=showMoment(lettering,now+3*BEAT_MS);
  assert.deepEqual([m.program,m.cue?.id,m.beats],['letreiro','letreiro',32]);assert.ok(Math.abs(m.beat-3)<1e-6);
  assert.equal(showMoment(lettering,now+33*BEAT_MS).program,'ceu','over after eight bars');
  const flash=fireShowCue(show,'flash',now,'DJ');
  assert.equal(showMoment(flash,now+100).cue?.id,'flash');assert.equal(showMoment(flash,now+700).cue,undefined);
  for(const cue of Object.keys(SHOW_CUES) as Array<keyof typeof SHOW_CUES>){
    const fired=fireShowCue(show,cue,now,'DJ');assert.equal(showMoment(fired,now-1).cue,undefined,'not before it fires');
  }
});

test('the laser font draws every character the letreiro allows; HIGHLAND fits the telão on one line, long texts on two',()=>{
  for(const char of SHOW_TEXT_CHARS)assert.ok(LASER_GLYPHS.includes(char),`glyph for ${JSON.stringify(char)}`);
  const highland=textDrawing('HIGHLAND');
  assert.ok(highland.length>0&&highland.segments.length/6>40);
  assert.equal(highland.height,6);
  // Centred, and in tracing order (each segment starts where the previous ones end).
  let minX=Infinity,maxX=-Infinity,at=0;
  for(let i=0;i<highland.segments.length;i+=6){
    minX=Math.min(minX,highland.segments[i]!,highland.segments[i+2]!);maxX=Math.max(maxX,highland.segments[i]!,highland.segments[i+2]!);
    assert.ok(Math.abs(highland.segments[i+4]!-at)<1e-3);at+=highland.segments[i+5]!;
  }
  assert.ok(Math.abs(minX+maxX)<1e-3&&Math.abs(maxX-minX-highland.width)<1e-3);
  // Fitted to 90% of the screen's width, the letters stand about 0.8 m tall.
  const metres=STAGE.screen.width*.9/highland.width*6;assert.ok(metres>.7&&metres<1,`${metres}`);
  assert.equal(textDrawing('BOA NOITE GALE').height,14.6);
  for(const shape of LASER_SHAPES)assert.ok(shape.drawing.length>10&&shape.drawing.height>5,shape.id);
  assert.ok(SHOW_PALETTES.every(p=>p.colours.every(c=>/^#[0-9a-f]{6}$/.test(c))));
});
