// Made-up truco tables for the visual prototype (tests/fixtures/truco.html). Nothing here decides anything: each scene is a
// view of the table as the room will send it, and `demo` is a scripted sequence of them.
const LOOKS=[
  {tone:2,hair:1,hairColor:1,facial:2,glasses:0,shirt:1,bg:1},
  {tone:3,hair:7,hairColor:0,facial:0,glasses:0,shirt:3,bg:3},
  {tone:1,hair:5,hairColor:4,facial:0,glasses:1,shirt:6,bg:5},
  {tone:4,hair:6,hairColor:0,facial:3,glasses:2,shirt:4,bg:2},
];
const seats=()=>[
  {seat:0,team:0,name:'Rafael',kind:'human',color:'#b90eb2',cards:3},
  {seat:1,team:1,name:'Dona Neide',kind:'npc',look:LOOKS[2],personality:'Experiente',cards:3},
  {seat:2,team:0,name:'Tonico',kind:'npc',look:LOOKS[0],personality:'Estratégico',cards:3},
  {seat:3,team:1,name:'Zé Provoca',kind:'npc',look:LOOKS[3],personality:'Provocador',cards:3},
];
const card=(id,rank,suit)=>({id,rank,suit});
const hand=()=>[card('c1','3','copas'),card('c2','5','paus'),card('c3','K','espadas')];
const vira=card('v','4','ouros');
const base=(over={})=>({
  mode:'Duplas 2x2 · Você e um NPC contra dois NPCs',phase:'playing',handNumber:7,selfSeat:0,seats:seats(),dealer:3,turn:0,deadline:0,turnMs:20000,
  score:[7,4],target:12,handValue:1,callLabel:'',vira,deck:27,mine:hand(),table:[],tricks:[{winner:null},{winner:null},{winner:null}],
  canCall:{value:3,label:'Truco'},log:['Mão 7: Zé Provoca deu as cartas','Vira: 4 de ouros, manilha é o 5'],...over,
});
const withCards=(list,counts)=>list.map(s=>({...s,cards:counts[s.seat]}));
const say=(list,seat,text,tone,key=1)=>list.map(s=>s.seat===seat?{...s,say:{text,tone,key}}:s);
const log=(...lines)=>['Mão 7: Zé Provoca deu as cartas','Vira: 4 de ouros, manilha é o 5',...lines];

export function makeScenes(now){
  const deadline=()=>now()+14000;
  const firstTrick=[{seat:1,card:card('p1','2','ouros')},{seat:2,card:card('p2','A','copas')},{seat:3,card:card('p3','6','espadas')}];
  return {
    shuffle:()=>base({phase:'shuffling',turn:null,vira:null,mine:[],seats:withCards(seats(),[0,0,0,0]),canCall:undefined,log:['Mão 7: Zé Provoca embaralha']}),
    deal:()=>base({phase:'dealing',turn:null,canCall:undefined}),
    yourTurn:()=>base({deadline:deadline(),seats:withCards(seats(),[3,2,2,2]),table:firstTrick,log:log('Dona Neide jogou 2 de ouros','Tonico jogou Ás de copas','Zé Provoca jogou 6 de espadas')}),
    theirTurn:()=>base({turn:3,deadline:deadline(),canCall:undefined,seats:withCards(seats(),[2,2,2,3]),mine:hand().slice(0,2),table:[{seat:1,card:card('p1','7','paus')},{seat:2,card:card('p2','Q','ouros')},{seat:0,card:card('c3','K','espadas')}],tricks:[{winner:0,seat:0},{winner:null},{winner:null}],handValue:3,callLabel:'Truco',log:log('Truco aceito: a mão vale 3','Você ganhou a 1ª vaza')}),
    trickWon:()=>base({phase:'trick-end',turn:null,canCall:undefined,seats:withCards(seats(),[2,2,2,2]),mine:hand().slice(1),table:[{seat:1,card:card('p1','2','ouros')},{seat:2,card:card('p2','A','copas')},{seat:3,card:card('p3','6','espadas')},{seat:0,card:card('c1','3','copas'),winner:true}],tricks:[{winner:0,seat:0},{winner:null},{winner:null}],log:log('Você jogou 3 de copas','1ª vaza: nós')}),
    manilhaHand:()=>base({deadline:deadline(),mine:[card('c1','5','paus'),card('c2','5','copas'),card('c3','7','ouros')],log:log('Você tem Zap e Copeta')}),
    beforeCall:()=>base({turn:3,canCall:undefined,deadline:deadline(),seats:withCards(seats(),[3,2,2,3]),table:firstTrick.slice(0,2),log:log('Tonico jogou Ás de copas')}),
    truco:()=>base({phase:'bet',turn:null,canCall:undefined,deadline:deadline(),seats:say(withCards(seats(),[3,2,2,3]),3,'Truco, seu pato!','taunt'),table:firstTrick.slice(0,2),bet:{by:3,label:'Truco',from:1,to:3,raiseTo:6,raiseLabel:'Seis',runAway:1,mine:false,answering:true},log:log('Zé Provoca pediu Truco')}),
    six:()=>base({phase:'bet',turn:null,canCall:undefined,handValue:3,callLabel:'Truco',deadline:deadline(),seats:say(withCards(seats(),[2,2,2,2]),1,'Seis, meu bem.','calm',2),mine:hand().slice(0,2),tricks:[{winner:0,seat:0},{winner:null},{winner:null}],bet:{by:1,label:'Seis',from:3,to:6,raiseTo:9,raiseLabel:'Nove',runAway:3,mine:false,answering:true},log:log('Truco aceito','Dona Neide pediu Seis')}),
    twelve:()=>base({phase:'bet',turn:null,canCall:undefined,handValue:9,callLabel:'Nove',deadline:deadline(),score:[3,3],seats:withCards(seats(),[1,1,1,1]),mine:hand().slice(0,1),tricks:[{winner:0,seat:0},{winner:1,seat:1},{winner:null}],bet:{by:3,label:'Doze',from:9,to:12,runAway:9,mine:false,answering:true},log:['Nove aceito','Zé Provoca pediu Doze']}),
    waiting:()=>base({phase:'bet',turn:null,canCall:undefined,deadline:deadline(),bet:{by:0,label:'Truco',from:1,to:3,runAway:1,mine:true,answering:false,waitingFor:'Dona Neide'},log:log('Você pediu Truco')}),
    eleven:()=>base({phase:'eleven',turn:null,canCall:undefined,score:[11,8],handValue:3,callLabel:'Mão de 11',deadline:deadline(),eleven:{team:0,mine:true,partnerCards:[card('o1','5','ouros'),card('o2','3','paus'),card('o3','J','copas')]},log:['Mão de 11: nós','Consultem as cartas e decidam']}),
    casal:()=>base({phase:'eleven',turn:null,canCall:undefined,score:[11,8],handValue:3,callLabel:'Mão de 11',deadline:deadline(),mine:[card('c1','5','paus'),card('c2','5','copas'),card('c3','7','ouros')],eleven:{team:0,mine:true,casalMaior:true,canShow:true,partnerCards:[card('o1','6','ouros'),card('o2','2','paus'),card('o3','J','copas')]},log:['Mão de 11: nós','Casal Maior na mão']}),
    iron:()=>base({score:[11,11],handValue:3,callLabel:'Ferro',canCall:undefined,deadline:deadline(),iron:{dark:true},mine:[card('c1','?',''),card('c2','?',''),card('c3','?','')],log:['11 a 11: Mão de Ferro','Ninguém olha as cartas']}),
    handWon:()=>base({phase:'hand-end',turn:null,canCall:undefined,score:[10,4],seats:withCards(seats(),[0,0,0,0]),mine:[],handValue:3,callLabel:'Truco',tricks:[{winner:0,seat:0},{winner:1,seat:1},{winner:0,seat:2}],result:{winner:0,points:3,reason:'Duas vazas em três, com Truco aceito'},log:log('Mão nossa: +3')}),
    victory:()=>base({phase:'match-end',prize:200,turn:null,canCall:undefined,score:[12,8],seats:withCards(seats(),[0,0,0,0]),mine:[],result:{winner:0,points:3,reason:'Tonico e você fecharam a partida no Truco.'}}),
    defeat:()=>base({phase:'match-end',prize:-200,turn:null,canCall:undefined,score:[9,12],seats:withCards(seats(),[0,0,0,0]),mine:[],result:{winner:1,points:6,reason:'Zé Provoca e Dona Neide fecharam no Seis.'}}),
    rivalTaunt:()=>base({turn:1,deadline:deadline(),canCall:undefined,seats:say(withCards(seats(),[3,3,3,3]),3,'Essa mão é minha!','taunt',3),log:log('Dona Neide pensa')}),
    between:()=>base({phase:'lobby',handNumber:0,dealer:-1,turn:null,vira:null,mine:[],canCall:undefined,log:[],mode:'Duplas 2x2 · 2 pessoas e 2 NPCs · Nível Médio · 400 moedas por pessoa',lobby:{level:'medio',dark:false,betweenPeople:true,stake:400,min:400,max:5000,step:100,levels:[{id:'iniciante',label:'Iniciante',stake:100,npcs:'NPCs iniciantes'},{id:'medio',label:'Médio',stake:150,npcs:'NPCs de nível médio'},{id:'experiente',label:'Experiente',stake:200,npcs:'NPCs experientes'}],taking:false},seats:[{seat:0,team:0,name:'Rafael',kind:'human',color:'#b90eb2',cards:0,ready:true},{seat:1,team:1,name:'Bia',kind:'human',color:'#0386f0',cards:0,ready:false},{seat:2,team:0,name:'',kind:'empty',cards:0},{seat:3,team:1,name:'',kind:'empty',cards:0}]}),
    hide:()=>base({deadline:deadline(),canHide:true,stake:200,seats:withCards(seats(),[2,1,1,1]),mine:hand().slice(1),table:[{seat:1,card:card('h1','?','')},{seat:2,card:card('h2','7','copas')},{seat:3,card:card('h3','K','ouros')}],tricks:[{winner:1,seat:1},{winner:null},{winner:null}],log:log('Dona Neide jogou uma carta encoberta')}),
    lobby:()=>base({phase:'lobby',handNumber:0,dealer:-1,turn:null,vira:null,mine:[],canCall:undefined,log:[],mode:'Duplas 2x2 · 1 pessoa e 3 NPCs · Nível Iniciante · 100 moedas por pessoa',lobby:{level:'iniciante',dark:false,betweenPeople:false,stake:100,min:400,max:5000,step:100,levels:[{id:'iniciante',label:'Iniciante',stake:100,npcs:'NPCs iniciantes'},{id:'medio',label:'Médio',stake:150,npcs:'NPCs de nível médio'},{id:'experiente',label:'Experiente',stake:200,npcs:'NPCs experientes'}],taking:false},seats:[{seat:0,team:0,name:'Rafael',kind:'human',id:'me',color:'#b90eb2',cards:0},{seat:1,team:1,name:'',kind:'empty',cards:0},{seat:2,team:0,name:'',kind:'empty',cards:0},{seat:3,team:1,name:'',kind:'empty',cards:0}]}),
  };
}

/** The scripted match: [ms on screen, scene or a change to apply]. */
export function demoScript(now){
  const c=(id,r,s)=>card(id,r,s);
  const d=()=>now()+9000;
  const step=(ms,over)=>[ms,()=>base({deadline:d(),...over})];
  const s=(counts)=>withCards(seats(),counts);
  const m=[c('c1','3','copas'),c('c2','5','paus'),c('c3','K','espadas')];
  const empty=[{winner:null},{winner:null},{winner:null}];
  const t1=[{seat:1,card:c('p1','2','ouros')},{seat:2,card:c('p2','A','copas')},{seat:3,card:c('p3','6','espadas')}];
  const won1=[{winner:0,seat:0},{winner:null},{winner:null}];
  const won2=[{winner:0,seat:0},{winner:1,seat:1},{winner:null}];
  return [
    step(1500,{phase:'shuffling',turn:null,vira:null,mine:[],seats:s([0,0,0,0]),canCall:undefined,tricks:empty,log:['Mão 7: Zé Provoca embaralha']}),
    step(2100,{phase:'dealing',turn:null,canCall:undefined,tricks:empty}),
    step(1300,{turn:1,canCall:undefined,tricks:empty}),
    step(1300,{turn:2,canCall:undefined,seats:s([3,2,3,3]),table:t1.slice(0,1),tricks:empty,log:log('Dona Neide jogou 2 de ouros')}),
    step(1300,{turn:3,canCall:undefined,seats:s([3,2,2,3]),table:t1.slice(0,2),tricks:empty,log:log('Tonico jogou Ás de copas')}),
    step(2600,{turn:0,seats:s([3,2,2,2]),table:t1,tricks:empty,log:log('Zé Provoca jogou 6 de espadas','Sua vez')}),
    step(1700,{phase:'trick-end',turn:null,canCall:undefined,seats:s([2,2,2,2]),mine:m.slice(1),table:[...t1,{seat:0,card:m[0],winner:true}],tricks:won1,log:log('Você jogou 3 de copas','1ª vaza: nós')}),
    step(1300,{turn:0,seats:s([2,2,2,2]),mine:m.slice(1),tricks:won1,log:log('1ª vaza: nós','Você começa a 2ª')}),
    step(3200,{phase:'bet',turn:null,canCall:undefined,seats:say(s([2,2,2,2]),3,'Truco, seu pato!','taunt',9),mine:m.slice(1),tricks:won1,bet:{by:3,label:'Truco',from:1,to:3,raiseTo:6,raiseLabel:'Seis',runAway:1,mine:false,answering:true},log:log('Zé Provoca pediu Truco')}),
    step(1200,{turn:0,handValue:3,callLabel:'Truco',canCall:{value:6,label:'Seis'},seats:s([2,2,2,2]),mine:m.slice(1),tricks:won1,log:log('Truco aceito: a mão vale 3')}),
    step(1800,{phase:'trick-end',turn:null,canCall:undefined,handValue:3,callLabel:'Truco',seats:s([1,1,1,1]),mine:m.slice(2),table:[{seat:0,card:m[1]},{seat:1,card:c('p5','J','paus'),winner:false},{seat:2,card:c('p6','4','copas')},{seat:3,card:c('p7','7','copas')}].map((p,i)=>i===0?{...p,winner:true}:p),tricks:[{winner:0,seat:0},{winner:0,seat:0},{winner:null}],log:log('Você jogou o Zap','2ª vaza: nós')}),
    step(2400,{phase:'hand-end',turn:null,canCall:undefined,handValue:3,callLabel:'Truco',score:[10,4],seats:s([0,0,0,0]),mine:[],tricks:[{winner:0,seat:0},{winner:0,seat:0},{winner:null}],result:{winner:0,points:3,reason:'Duas vazas, com Truco aceito'},log:log('Mão nossa: +3')}),
    [4500,()=>base({phase:'match-end',turn:null,canCall:undefined,score:[12,8],seats:s([0,0,0,0]),mine:[],result:{winner:0,points:3,reason:'Tonico e você fecharam a partida no Truco.'}})],
  ];
}
