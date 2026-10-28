// Musicos do palco do Highland Bar: violao, cavaquinho, bateria e vocal (animacoes do 16_animacoes_palco.py).
//
//   import { criarPalco } from './palco_musicos.js';
//   const palco = criarPalco(mapa, { pasta: '/animacoes/' });  // mapa = gltf.scene do bar_boteco.glb, ja na cena
//   await palco.carregar();                                    // baixa palco_violao / _cavaquinho / _bateria / _vocal.glb
//
//   const show = palco.entrar('violao', personagem, {          // personagem: Object3D que o jogo move (com a SkinnedMesh)
//     mixer,                  // opcional: o AnimationMixer que o jogo ja usa nesse personagem (senao cria um)
//     acaoAtual,              // opcional: AnimationAction tocando agora (idle, walk) para o crossfade de entrada
//     aoMudarFase(fase) {},   // 'entrando' | 'comecando' | 'loop' | 'saindo' | 'fim'
//     aoTerminar(show) {},    // voltou a ficar em pe no lugar: devolva o controle e chame show.liberar()
//   });
//   show.parar();             // toca o clipe de parar e sair (se ainda estiver sentando/comecando, para assim que der)
//   palco.atualizar(dt);      // todo frame, dt em segundos (atualiza os mixers criados aqui e os instrumentos)
//
//   palco.lugares             { violao, cavaquinho, bateria, vocal }: vazios Palco_Lugar_* do mapa (frente = +Z local)
//   palco.maisPerto(pos, r)   nome do lugar livre mais perto de pos (Vector3 do mundo) dentro do raio r, ou null
//   palco.ocupado(lugar)      true enquanto alguem usa o lugar
//   palco.clipes(lugar, personagem)  os 4 AnimationClip ja convertidos para esse personagem (para tocar por conta propria)
//
// Para quem chega no meio do show (multiplayer): palco.entrar(lugar, personagem, { fase: 'loop', tempo: segundos }).
//
// Como funciona: durante o show o personagem fica parado no lugar (e levado ate la em 0,35 s) e as animacoes movem o
// quadril (andar ate o banco, sentar). Os clipes foram feitos num esqueleto Mixamo de 1,75 m e sao convertidos para o
// esqueleto do personagem pela rotacao de cada osso no mundo (nomes Mixamo com qualquer prefixo: mixamorig, mixamorig1,
// mixamorig:...), entao servem para personagem carregado de FBX ou de GLB, com ou sem escala. O instrumento do mapa
// (Palco_Violao, Palco_Cavaquinho, Palco_Baquetas) some e a copia que vem no GLB da animacao vai para a mao.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LUGARES = ['violao', 'cavaquinho', 'bateria', 'vocal'];
const FASES = ['entrando', 'comecando', 'loop', 'saindo'];
const ALTURA_AUTORIA = 1.75;
const TRANSICAO = 0.35;
const nomeOsso = n => n.replace(/^.*mixamorig\d*[:_]?/i, '');

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();

// ---------------------------------------------------------------- arquivo de animacao (esqueleto de autoria)
function lerFonte(gltf, lugar) {
  const cena = gltf.scene;
  cena.updateMatrixWorld(true);
  const ossos = new Map();
  cena.traverse(o => { if (/mixamorig/i.test(o.name) && !o.isMesh) ossos.set(nomeOsso(o.name), o); });
  const ordem = [];
  cena.traverse(o => { if (ossos.get(nomeOsso(o.name)) === o) ordem.push(nomeOsso(o.name)); });
  const restW = new Map(), restL = new Map(), pai = new Map();
  for (const n of ordem) {
    const o = ossos.get(n);
    o.matrixWorld.decompose(_p, _q, _s);
    restW.set(n, _q.clone());
    restL.set(n, o.quaternion.clone());
    pai.set(n, o.parent && ossos.get(nomeOsso(o.parent.name)) === o.parent ? nomeOsso(o.parent.name) : null);
  }
  const quadril = ossos.get('Hips');
  const clipes = {};
  for (const c of gltf.animations) clipes[c.name.slice(lugar.length + 1)] = c;
  return {
    ossos, ordem, restW, restL, pai,
    raizW: quadril.parent.getWorldQuaternion(new THREE.Quaternion()),
    paiQuadril: quadril.parent.matrixWorld.clone(),
    quadrilRest: quadril.getWorldPosition(new THREE.Vector3()),
    props: cena.children.filter(o => o.name.startsWith('Prop_')),
    clipes, info: cena.userData,
  };
}

// ---------------------------------------------------------------- personagem do jogo
function lerAlvo(personagem) {
  personagem.updateMatrixWorld(true);
  let malha = null;
  personagem.traverse(o => { if (!malha && o.isSkinnedMesh && o.skeleton.bones.some(b => /mixamorig/i.test(b.name))) malha = o; });
  if (!malha) throw new Error('palco_musicos: nenhuma SkinnedMesh com ossos Mixamo (mixamorig...) no personagem');
  const sk = malha.skeleton;
  const invP = personagem.matrixWorld.clone().invert();
  // repouso (bind) de cada osso no espaco do personagem: malha.matrixWorld * bindMatrix^-1 * boneInverse^-1
  const base = invP.clone().multiply(malha.matrixWorld).multiply(malha.bindMatrix.clone().invert());
  const ossos = new Map(), rest = new Map();
  sk.bones.forEach((b, i) => {
    const n = nomeOsso(b.name);
    if (ossos.has(n)) return;
    ossos.set(n, b);
    const invB = sk.boneInverses[i].clone().invert();
    _m.copy(base).multiply(invB).decompose(_p, _q, _s);
    rest.set(n, { p: _p.clone(), q: _q.clone() });
  });
  const ordem = [];
  personagem.traverse(o => { if (o.isBone && ossos.get(nomeOsso(o.name)) === o) ordem.push(nomeOsso(o.name)); });
  const paiDe = n => { const p = ossos.get(n).parent; return p && p.isBone && ossos.get(nomeOsso(p.name)) === p ? nomeOsso(p.name) : null; };
  const quadril = ossos.get('Hips');
  // pais que nao sao ossos (Armature, grupo do FBX...) ficam parados em relacao ao personagem
  const paiFixo = new Map();
  for (const n of ordem) if (!paiDe(n)) paiFixo.set(n, invP.clone().multiply(ossos.get(n).parent.matrixWorld));
  // piso e altura no repouso (caixa da malha no bind, no espaco do personagem)
  malha.geometry.computeBoundingBox();
  const bb = malha.geometry.boundingBox, toP = invP.clone().multiply(malha.matrixWorld);
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    _p.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(toP);
    y0 = Math.min(y0, _p.y); y1 = Math.max(y1, _p.y);
  }
  const escala = personagem.getWorldScale(new THREE.Vector3()).y;
  return { ossos, ordem, rest, paiDe, paiFixo, quadril, piso: y0, altura: (y1 - y0) * escala, escala };
}

// ---------------------------------------------------------------- conversao de um clipe para o personagem
function converter(clip, F, A) {
  const trilhas = new Map(), props = [];
  for (const t of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(t.name);
    if (nodeName.startsWith('Prop_')) { props.push(t); continue; }
    trilhas.set(nomeOsso(nodeName) + '.' + propertyName, t);
  }
  const base = trilhas.get('Hips.quaternion');
  const tempos = base.times;
  const nT = tempos.length;
  const interp = new Map();
  for (const [k, t] of trilhas) interp.set(k, t.createInterpolant());
  const saidaQ = new Map(A.ordem.map(n => [n, new Float32Array(nT * 4)]));
  const saidaP = new Float32Array(nT * 3);
  const W = new Map(), D = new Map(), WA = new Map();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const qPaiFixo = new Map([...A.paiFixo].map(([n, M]) => { M.decompose(_p, _q, _s); return [n, _q.clone()]; }));
  const restLA = new Map();             // repouso local (osso do personagem sem par no arquivo fica nele)
  for (const n of A.ordem) {
    const pn = A.paiDe(n);
    restLA.set(n, (pn ? A.rest.get(pn).q : qPaiFixo.get(n)).clone().invert().multiply(A.rest.get(n).q));
  }
  const invPaiQuadril = A.paiFixo.get('Hips') ? A.paiFixo.get('Hips').clone().invert() : null;
  const k = 1 / A.escala;
  const pq = new THREE.Vector3();
  for (let i = 0; i < nT; i++) {
    const t = tempos[i];
    // rotacoes no mundo do esqueleto de autoria e delta desde o repouso
    for (const n of F.ordem) {
      const it = interp.get(n + '.quaternion');
      const ql = it ? qa.fromArray(it.evaluate(t)) : qa.copy(F.restL.get(n));
      const pn = F.pai.get(n);
      const w = (W.get(n) || new THREE.Quaternion()).copy(pn ? W.get(pn) : F.raizW).multiply(ql);
      W.set(n, w);
      D.set(n, (D.get(n) || new THREE.Quaternion()).copy(w).multiply(qb.copy(F.restW.get(n)).invert()));
    }
    // mesmo delta no mundo aplicado ao repouso de cada osso do personagem
    for (const n of A.ordem) {
      const pn = A.paiDe(n);
      const wp = pn ? WA.get(pn) : qPaiFixo.get(n);
      const w = WA.get(n) || new THREE.Quaternion();
      if (D.has(n)) w.copy(D.get(n)).multiply(A.rest.get(n).q);
      else w.copy(wp).multiply(restLA.get(n));
      WA.set(n, w);
      qa.copy(wp).invert().multiply(w).normalize().toArray(saidaQ.get(n), i * 4);
    }
    // quadril: deslocamento (metros) desde o repouso de autoria somado ao repouso do personagem
    const it = interp.get('Hips.position');
    if (it && invPaiQuadril) {
      pq.fromArray(it.evaluate(t)).applyMatrix4(F.paiQuadril).sub(F.quadrilRest).multiplyScalar(k).add(A.rest.get('Hips').p);
      pq.applyMatrix4(invPaiQuadril).toArray(saidaP, i * 3);
    }
  }
  const tracks = A.ordem.map(n => new THREE.QuaternionKeyframeTrack(A.ossos.get(n).uuid + '.quaternion', tempos, saidaQ.get(n)));
  if (invPaiQuadril) tracks.push(new THREE.VectorKeyframeTrack(A.quadril.uuid + '.position', tempos, saidaP));
  return {
    corpo: new THREE.AnimationClip(clip.name, clip.duration, tracks),
    props: props.length ? new THREE.AnimationClip(clip.name, clip.duration, props) : null,
  };
}

// ---------------------------------------------------------------- palco
export function criarPalco(mapa, opcoes = {}) {
  const pasta = opcoes.pasta ?? './';
  const loader = opcoes.loader ?? new GLTFLoader();
  const lugares = {};
  for (const n of LUGARES) {
    const o = mapa.getObjectByName('Palco_Lugar_' + n[0].toUpperCase() + n.slice(1));
    if (o) lugares[n] = o;
  }
  const fontes = {};
  const cache = new WeakMap();          // personagem -> { lugar: clipes convertidos }
  const shows = new Set();
  const emUso = new Map();

  function clipes(lugar, personagem) {
    const F = fontes[lugar];
    if (!F) throw new Error('palco_musicos: carregue o lugar ' + lugar + ' antes (palco.carregar)');
    let c = cache.get(personagem);
    if (!c) cache.set(personagem, c = {});
    if (!c[lugar]) {
      const A = lerAlvo(personagem);
      if (Math.abs(A.altura - ALTURA_AUTORIA) > 0.15)
        console.warn(`palco_musicos: personagem com ${A.altura.toFixed(2)} m; as animacoes foram feitas para ${ALTURA_AUTORIA} m ` +
                     '(maos e assento podem nao encostar certinho)');
      c[lugar] = { A, clipes: FASES.map((f, i) => converter(F.clipes[(lugar === 'vocal' ? VOCAL : CORDAS)[i]], F, A)) };
    }
    return c[lugar];
  }

  function entrar(lugar, personagem, o = {}) {
    const anc = lugares[lugar];
    if (!anc || emUso.has(lugar)) return null;
    const { A, clipes: cl } = clipes(lugar, personagem);
    const F = fontes[lugar];
    const mixer = o.mixer ?? new THREE.AnimationMixer(personagem);
    const proprio = !o.mixer;
    // destino: pes no piso do lugar, de frente para +Z do vazio
    mapa.updateMatrixWorld(true);
    anc.matrixWorld.decompose(_p, _q, _s);
    const destPos = _p.clone().addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(_q), -A.piso * A.escala);
    const destQ = _q.clone();
    if (personagem.parent) {
      personagem.parent.updateMatrixWorld(true);
      const inv = personagem.parent.matrixWorld.clone().invert();
      destPos.applyMatrix4(inv);
      destQ.premultiply(personagem.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
    }
    // instrumento: some o do mapa, entra a copia animada
    const nomeInst = anc.userData.instrumento;
    const inst = nomeInst ? mapa.getObjectByName(nomeInst) : null;
    let grupo = null, mixerProps = null;
    if (F.props.length) {
      grupo = new THREE.Group();
      grupo.name = 'Palco_Musico_' + lugar;
      grupo.matrixAutoUpdate = false;
      grupo.matrix.copy(mapa.matrixWorld).invert().multiply(anc.matrixWorld);
      for (const p of F.props) grupo.add(p.clone());
      mapa.add(grupo);
      mixerProps = new THREE.AnimationMixer(grupo);
    }
    if (inst) inst.visible = false;
    const acoes = cl.map(c => {
      const a = mixer.clipAction(c.corpo);
      const ap = mixerProps && c.props ? mixerProps.clipAction(c.props) : null;
      return { a, ap };
    });
    acoes.forEach((x, i) => {
      const modo = i === 2 ? THREE.LoopRepeat : THREE.LoopOnce;
      for (const a of [x.a, x.ap]) if (a) { a.setLoop(modo, Infinity); a.clampWhenFinished = i !== 2; }
    });
    const show = {
      lugar, personagem, mixer, fase: null, acao: null,
      parar() { pedidoParar = true; if (show.fase === 'loop') irPara(3, TRANSICAO); },
      // depois do 'fim': some com a ultima pose em 'seg' segundos (o jogo faz fadeIn/crossfade do idle junto)
      liberar(seg = 0.3) { if (fimLiberar === null) { show.acao?.fadeOut(seg); fimLiberar = seg; } },
    };
    let pedidoParar = false, fimLiberar = null, deslize = 0, acabou = -1;
    const iniPos = personagem.position.clone(), iniQ = personagem.quaternion.clone();

    function irPara(i, fade, tempo = 0) {
      const ant = show.acao ? acoes[FASES.indexOf(show.fase)] : null;
      const x = acoes[i];
      for (const a of [x.a, x.ap]) if (a) { a.reset(); a.time = tempo; a.setEffectiveWeight(1); a.play(); }
      if (ant && fade > 0) {
        for (const [de, para] of [[ant.a, x.a], [ant.ap, x.ap]]) if (de && para) de.crossFadeTo(para, fade, false);
      } else if (ant) {
        for (const a of [ant.a, ant.ap]) if (a) a.stop();
      }
      show.acao = x.a;
      show.fase = FASES[i];
      o.aoMudarFase?.(show.fase, show);
      if (i === 2 && pedidoParar) irPara(3, TRANSICAO);
    }

    function aoAcabar(e) {                          // so anota: a troca e feita fora do update do mixer
      const i = acoes.findIndex(x => x.a === e.action);
      if (i >= 0 && FASES[i] === show.fase) acabou = i;
    }

    function proximaFase() {
      const i = acabou;
      acabou = -1;
      if (i < 0) return;
      if (i < 2) irPara(i + 1, 0);                  // o ultimo quadro de um clipe e o primeiro do seguinte
      else if (i === 3) {
        show.fase = 'fim';
        if (inst) inst.visible = true;
        if (grupo) { grupo.removeFromParent(); grupo = null; }
        o.aoMudarFase?.('fim', show);
        if (o.aoTerminar) o.aoTerminar(show); else show.liberar();
      }
    }

    function limpar() {
      mixer.removeEventListener('finished', aoAcabar);
      shows.delete(show);
      if (emUso.get(lugar) === show) emUso.delete(lugar);
      if (grupo) { grupo.removeFromParent(); grupo = null; }
      if (inst) inst.visible = true;
    }

    show._tick = dt => {
      if (deslize < TRANSICAO && !o.fase) {
        deslize = Math.min(TRANSICAO, deslize + dt);
        const t = deslize / TRANSICAO, s = t * t * (3 - 2 * t);
        personagem.position.lerpVectors(iniPos, destPos, s);
        personagem.quaternion.slerpQuaternions(iniQ, destQ, s);
      }
      if (proprio) mixer.update(dt);
      proximaFase();
      if (mixerProps) {                               // instrumento no mesmo tempo do corpo
        for (const x of acoes) if (x.ap) { x.ap.time = x.a.time; x.ap.weight = x.a.getEffectiveWeight(); x.ap.enabled = x.a.enabled; }
        mixerProps.update(0);
      }
      if (fimLiberar !== null && show.fase === 'fim') {
        fimLiberar -= dt;
        if (fimLiberar <= 0) { for (const x of acoes) { x.a.stop(); x.ap?.stop(); } limpar(); }
      }
    };

    mixer.addEventListener('finished', aoAcabar);
    shows.add(show);
    emUso.set(lugar, show);
    if (o.fase) {                                   // entra no meio (quem chegou depois no multiplayer)
      personagem.position.copy(destPos);
      personagem.quaternion.copy(destQ);
      if (proprio || !o.acaoAtual) mixer.stopAllAction();
      irPara(Math.max(0, FASES.indexOf(o.fase)), 0, o.tempo ?? 0);
    } else {
      if (o.acaoAtual) o.acaoAtual.fadeOut(TRANSICAO);
      else if (!proprio) mixer.stopAllAction();
      irPara(0, 0);
      if (o.acaoAtual) acoes[0].a.fadeIn(TRANSICAO);
    }
    return show;
  }

  return {
    lugares,
    async carregar(...quais) {
      const lista = quais.length ? quais : Object.keys(lugares);
      await Promise.all(lista.filter(n => !fontes[n]).map(async n => {
        const g = await loader.loadAsync(pasta + (lugares[n]?.userData.animacoes ?? `palco_${n}.glb`));
        fontes[n] = lerFonte(g, n);
      }));
    },
    clipes(lugar, personagem) { return clipes(lugar, personagem).clipes.map(c => c.corpo); },
    entrar,
    ocupado: lugar => emUso.has(lugar),
    maisPerto(pos, raio = 1.5) {
      let melhor = null, dist = raio;
      for (const [n, o] of Object.entries(lugares)) {
        if (emUso.has(n)) continue;
        const d = o.getWorldPosition(_p).distanceTo(pos);
        if (d <= dist) { dist = d; melhor = n; }
      }
      return melhor;
    },
    atualizar(dt) { for (const s of [...shows]) s._tick(dt); },
  };
}

const CORDAS = ['sentar_pegar', 'comecar_tocar', 'tocando_loop', 'parar_sair'];
const VOCAL = ['chegar_pegar', 'comecar_cantar', 'cantando_loop', 'parar_sair'];
