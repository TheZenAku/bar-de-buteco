/**
 * What the Morte says (docs/sistemas/morte.md): one phrase per death, in the dark, and the red ones on a mistake.
 * `{nome}` becomes the character's name. The category is the one the player did most (see SERIES_CATEGORY).
 */
export const MORTE_CATEGORIES=['geral','bebidas','jogos','veiculos','cigarro','dinheiro','palco','social'] as const;
export type MorteCategory=typeof MORTE_CATEGORIES[number];

export const MORTE_FRASES:Readonly<Record<MorteCategory,readonly string[]>>={
  geral:[
    '{nome}, sua conta foi paga. Agora começa uma rodada nova, sem dívidas.',
    'Você viveu a noite inteira. Amanhã, um bar novo e uma cadeira nova.',
    'Ninguém escolhe a hora da última rodada. Mas dá para escolher a primeira da próxima.',
    'O bar fecha para uns. Para outros, abre uma porta. Atravesse, {nome}.',
    'Respire. Você chegou até aqui, e ainda tem história para contar.',
  ],
  bebidas:[
    'Cada copo teve sua história. Esta foi a última saideira. Que a próxima seja de recomeço.',
    'Você brindou demais e a conta chegou. Agora é hora de um brinde novo.',
    'A cerveja esquentou na mesa. Deixe o gelo para a próxima vida.',
  ],
  jogos:[
    'Você apostou tudo na última mão. Agora comece outra, {nome}.',
    'No pebolim a bola sempre volta. Desta vez, volte para o começo.',
    'Truco, seis, nove, doze... o jogo acabou. Mas dá para pedir revanche.',
    'A sinuca não termina na última bola. Termina quando alguém decide sair da mesa. Decida agora.',
  ],
  veiculos:[
    'A estrada não tinha fim, mas a sua curva chegou. Acelere em outra direção.',
    'Motor desligado, capacete no chão. Todo recomeço começa com a ignição.',
  ],
  cigarro:[
    'Cada cigarro era uma despedida que você adiou. Agora é de verdade. Respire fundo.',
    'A fumaça foi embora antes de você. Deixe o ar entrar de novo.',
  ],
  dinheiro:[
    'Muita coisa ficou no fiado. A morte aceita moedas, mas não aceita desculpas. Comece limpo.',
    'A conta fechou. Não há saldo a pagar, só um saldo novo a construir.',
  ],
  palco:[
    'A última música já tocou, {nome}. O próximo refrão ainda não foi escrito.',
    'Os aplausos param. O silêncio que sobra é o espaço para recomeçar.',
  ],
  social:[
    'Você tinha muitos amigos nessa mesa. Eles vão lembrar de você. Agora é a sua vez de ser o novo.',
    'Quem te conheceu nunca esqueceu. Conheça alguém novo, em outro lugar.',
  ],
};

/** The red ones, on a mistake in the sequence. */
export const MORTE_FRASES_ERRO:readonly string[]=[
  'VOCÊ ERROU. ELA ESTÁ AQUI.',
  'A sequência não perdoa. Sinta o frio.',
  'Não era esse o caminho, {nome}. Você ainda é meu.',
  'Os olhos vazios acompanham cada erro.',
  'Errou. A foice está mais perto.',
];

/**
 * The statistic that already exists for each kind of thing a player does (achievements.ts series), and the phrase category it counts for.
 * There is no data for "fiado" in the game; coins sent by Pix stand for money.
 */
export const SERIES_CATEGORY:Readonly<Record<string,MorteCategory>>={
  bebum:'bebidas',cafeinado:'bebidas',apagou:'bebidas','passou-mal':'bebidas',
  'rei-do-21':'jogos','craque-do-pebolim':'jogos','mestre-da-sinuca':'jogos','rei-do-truco':'jogos',
  motoboy:'veiculos',entregador:'veiculos',barbeiro:'veiculos',mecanico:'veiculos',
  fumante:'cigarro',pix:'dinheiro',
  'estrela-do-palco':'palco','mesa-de-luz':'palco',
  resenha:'social','gente-boa':'social',fofoqueiro:'social',
};

/** The category of the most counted activity; nothing counted (or a tie at zero) is "geral". */
export function dominantCategory(counts:Readonly<Partial<Record<MorteCategory,number>>>|undefined):MorteCategory {
  let best:MorteCategory='geral',top=0;
  for(const category of MORTE_CATEGORIES){const value=counts?.[category]??0;if(category!=='geral'&&value>top){best=category;top=value;}}
  return best;
}

const fill=(text:string,name:string)=>text.replaceAll('{nome}',name);
/** One phrase of the category (or "geral"), never the one the player saw last. `random` is injectable for tests. */
export function pickPhrase(category:MorteCategory,name:string,last?:string,random:()=>number=Math.random):string {
  return pickFrom(MORTE_FRASES[category]??MORTE_FRASES.geral,name,last,random);
}
export function pickErrorPhrase(name:string,last?:string,random:()=>number=Math.random):string {return pickFrom(MORTE_FRASES_ERRO,name,last,random);}
function pickFrom(list:readonly string[],name:string,last:string|undefined,random:()=>number):string {
  const options=list.map(text=>fill(text,name)).filter(text=>text!==last);
  const pool=options.length?options:list.map(text=>fill(text,name));
  return pool[Math.min(pool.length-1,Math.floor(random()*pool.length))]!;
}
