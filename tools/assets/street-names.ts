// The real streets of Santa Bárbara d'Oeste, read from the city hall's plans (ws.santabarbara.sp.gov.br/instar/mapas/loteamentos/): centro.pdf,
// olaria.pdf, conceicao.pdf and distrito-industrial-i.pdf. The plans are CAD drawings without text, so the spelling was read by eye, at zoom.
// The game's map is not the real one: each stretch of street takes a name from the plan of the neighbourhood it lies in, so an address always
// reads as a street of that neighbourhood. In the Centro the two families of parallel streets keep their real order.

/**
 * For each neighbourhood (as `cityZone` writes it), the name of a street of the game. A key is a street's name in cidade_vias.json, for those that
 * bend, or the line it runs along: `x-99` runs along z at x -99, `z47` runs along x at z 47. Stretches without a name take the nearest one's.
 */
export const REAL_STREETS:Readonly<Record<string,Readonly<Record<string,string>>>>={
  Centro:{
    // West to east, in the plan's order.
    'x-151':'Av. Monte Castelo',
    'x-99':'Rua Duque de Caxias',
    'x-53':'Rua Santa Bárbara',
    'x-7':'Rua Dona Margarida',
    x39:'Rua XV de Novembro',
    x85:'Rua Riachuelo',
    x131:'Rua Inácio Antônio',
    x184:'Av. Corifeu de Azevedo Marques',
    // North to south, in the plan's order.
    'Rua Coletora Norte':'Av. Tiradentes',
    'z-212':'Rua Graça Martins',
    'z-200':'Rua Graça Martins',
    'z-159':'Av. de Cillo',
    'z-113':'Rua Floriano Peixoto',
    'z-73':'Rua General Osório',
    'z-33':'Rua General Câmara',
    z7:'Rua João Lino',
    z47:'Rua 13 de Maio',
    z87:'Rua Fernando de Assis Saes',
  },
  'Parque Olaria':{
    'Avenida Principal':'Av. Sete de Setembro',
    'Olaria Oeste':'Rua Ipiranga',
    z47:'Rua Marília de Dirceu',
    z190:'Rua Padre Correia de Toledo',
    z244:'Rua Independência',
    z298:'Rua Cônego Luiz Vieira da Silva',
    z352:'Rua 21 de Abril',
    'x-355':'Rua Álvares Maciel',
    'x-220':'Rua Inconfidência Mineira',
    'x-151':'Rua Alvarenga Peixoto',
    'x-99':'Rua Freire de Andrade',
    'x-53':'Rua Cláudio Manoel da Costa',
    'x-7':'Rua Dom Pedro I',
    x39:'Rua Ouro Preto',
    x85:'Rua Dom Pedro II',
    x184:'Rua Padre Rolim',
  },
  'Jardim Conceição':{
    'Avenida Principal':'Av. Anhanguera',
    'Rotatoria do Jardim':'Av. Anhanguera',
    'Rua Coletora Norte':'Rua Primo Scarazzatti',
    'z-345':'Rua José Martins',
    'z-200':'Rua Nazareno Voltani',
    'z-113':'Rua João Matheus Sobrinho',
    'z-33':'Rua João Teizen',
    'x-355':'Rua Euzébio Jorge da Silva',
    'x-288':'Rua Batista Pio',
    'x-220':'Rua Benedito da Costa Machado',
  },
  'Distrito Industrial':{
    'Avenida Principal':'Av. Santa Bárbara',
    x290:'Av. Interdistrital Comendador Emílio Romi',
    x372:'Av. Juscelino Kubitschek de Oliveira',
    'z-345':'Rua Potiguares',
    'z-265':'Rua Rafael Cervone',
    'z-159':'Rua Luiz Ometto',
    'z-33':'Rua Ricardo Fracassi',
    z47:'Rua Vereador Sérgio Leopoldino Alves',
    z246:'Rua Silvio Bignotto',
    z352:'Rua Frederico Amadeu Covolan',
  },
};
/** How far from its line, in metres, a street still counts as on it: they wander a little. */
const LINE_REACH=8;
/** The real name of a stretch of street in a neighbourhood, if it has one of its own. */
export function realStreet(zone:string,source:string,x:number,z:number,alongZ:boolean):string|undefined {
  const names=REAL_STREETS[zone];if(!names)return undefined;
  if(names[source])return names[source];
  const axis=alongZ?'x':'z',at=alongZ?x:z;
  for(const [key,name] of Object.entries(names)){
    if(key[0]===axis&&Math.abs(Number(key.slice(1))-at)<=LINE_REACH)return name;
  }
  return undefined;
}
