// Animacoes dos personagens do Highland Bar (18_animacoes_bar.py): andar, bebado, cair, fumar, vomitar, cadeira (sentar,
// comer, levantar), limpar mesa, urinar e o magrao no balcao (chopp claro/escuro, long-neck do freezer).
//
//   import { criarAnimacoesBar } from './animacoes_bar.js';
//   const bar = criarAnimacoesBar(mapa, { pasta: '/animacoes/', cena: scene, renderer });  // mapa = gltf.scene do bar_boteco.glb
//   await bar.carregar();                    // ou bar.carregar('locomocao', 'fumar') so com o que for usar
//   const p = bar.personagem(jogador, { mixer });   // jogador: Object3D que o jogo move (com a SkinnedMesh Mixamo)
//   bar.atualizar(dt);                       // todo frame (atualiza mixers criados aqui, props, cadeiras e particulas)
//
// Andar (o jogo move o personagem; as animacoes sao no lugar):
//   p.locomover(velocidade, { bebado: false })   // m/s; 0 = parado. Ajusta o ritmo do passo para o pe nao escorregar
// Acoes (cada uma devolve uma Promise que resolve quando o personagem fica livre de novo):
//   p.fumar()            acende e fica fumando (loop)        -> p.pararDeFumar()   joga a bituca no chao e pisa
//   p.vomitar()          -> poca verde fica no chao (opcoes.restos segundos, padrao 60)
//   p.cair()             cai e fica deitado                  -> p.levantarDoChao()
//   p.sentar(cadeira)    puxa a cadeira, senta (loop)        -> p.comer() / p.pararDeComer() / p.levantar()
//   p.limparMesa(mesa)   pela quina mais perto do personagem
//   p.urinar(mictorio)
//   p.atender('chopp' | 'chopp_escuro' | 'longneck')  magrao vai ate a chopeira (ou freezer), enche e entrega no balcao;
//                        a Promise resolve com o Object3D da bebida em cima do balcao (o jogo decide quando tirar)
//   p.estado             'livre' | 'fumando' | 'sentado' | 'comendo' | 'caido' | 'ocupado'
// Opcoes de bar.personagem(obj, { ... }):
//   mixer                o AnimationMixer que o jogo ja usa nesse personagem (senao cria um e atualiza em bar.atualizar)
//   locomocao: false     o jogo continua com o idle/walk dele: locomover() nao faz nada; use aoComecar para esmaecer o
//                        idle/walk do jogo (0,3 s) e aoTerminar para tocar o idle do jogo de novo (peso 1, sem fade)
//   aoComecar(p) / aoTerminar(p) / aoDeixar(objeto, clipe)   (aoDeixar: bituca, poca, prato que ficam no mapa)
// Lugares do mapa: bar.cadeiras (instancias A_cadeira-vermelha em volta das mesas), bar.mesas (Mesa_NN de 4 lugares),
// bar.mictorios (Mictorio_Lugar_N), bar.balcao (Balcao_Lugar_Magrao); bar.maisPerto(lista, posicao, raio) acha o livre.
//
// Como funciona: os clipes foram feitos no esqueleto Mixamo do rafael-mixamo (1,90 m) e sao convertidos para o esqueleto
// do personagem pela rotacao de cada osso no mundo (qualquer prefixo mixamorig), entao servem para FBX ou GLB, com ou sem
// escala. Props (cigarro, garfo, copo...) vem nos GLBs e sao corrigidos pela mao/cabeca real do personagem enquanto estao
// seguros (proporcoes diferentes da autoria). FX_* sao emissores: a escala do no e a intensidade da particula.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const GRUPOS = ['locomocao', 'fumar', 'vomitar', 'cadeira', 'mesa', 'banheiro', 'magrao'];
const GRUPO_DO_CLIPE = {
  parado_loop: 'locomocao', andar_loop: 'locomocao', andar_bebado_loop: 'locomocao', cair: 'locomocao', levantar_chao: 'locomocao',
  fumar_acender: 'fumar', fumar_loop: 'fumar', fumar_apagar: 'fumar', vomitar: 'vomitar',
  sentar: 'cadeira', sentado_loop: 'cadeira', comer_comecar: 'cadeira', comer_loop: 'cadeira', comer_terminar: 'cadeira', levantar: 'cadeira',
  limpar_mesa: 'mesa', urinar: 'banheiro', magrao_chopp: 'magrao', magrao_chopp_escuro: 'magrao', magrao_longneck: 'magrao',
};
const ALTURA_AUTORIA = 1.903;
const TRANSICAO = 0.3;
const FPS = 30;
const nomeOsso = n => n.replace(/^.*mixamorig\d*[:_]?/i, '');
const ehOsso = n => /mixamorig/i.test(n);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3(), _um = new THREE.Vector3(1, 1, 1);

// ---------------------------------------------------------------- arquivo de animacao (esqueleto de autoria + props)
function lerFonte(gltf, grupo) {
  const cena = gltf.scene;
  cena.updateMatrixWorld(true);
  let info = {};
  try { info = JSON.parse(cena.userData.bar_animacoes || '{}'); } catch (e) { console.warn('animacoes_bar: extras invalidos em', grupo); }
  const ossos = new Map();
  cena.traverse(o => { if (ehOsso(o.name) && !o.isMesh) ossos.set(nomeOsso(o.name), o); });
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
  const raizEsq = quadril.parent;                               // no "Personagem" (armature)
  const props = cena.children.filter(o => /^(Prop_|FX_)/.test(o.name));
  const clipes = {};
  for (const c of gltf.animations) clipes[c.name] = c;
  return {
    grupo, info, ossos, ordem, restW, restL, pai, props, clipes, esqueleto: raizEsq,
    raizW: raizEsq.getWorldQuaternion(new THREE.Quaternion()),
    paiQuadril: raizEsq.matrixWorld.clone(),
    quadrilRest: quadril.getWorldPosition(new THREE.Vector3()),
  };
}

// ---------------------------------------------------------------- personagem do jogo
function lerAlvo(personagem) {
  personagem.updateMatrixWorld(true);
  let malha = null;
  personagem.traverse(o => { if (!malha && o.isSkinnedMesh && o.skeleton.bones.some(b => ehOsso(b.name))) malha = o; });
  if (!malha) throw new Error('animacoes_bar: nenhuma SkinnedMesh com ossos Mixamo (mixamorig...) no personagem');
  const sk = malha.skeleton;
  const invP = personagem.matrixWorld.clone().invert();
  const base = invP.clone().multiply(malha.matrixWorld).multiply(malha.bindMatrix.clone().invert());
  const ossos = new Map(), rest = new Map();
  sk.bones.forEach((b, i) => {
    const n = nomeOsso(b.name);
    if (ossos.has(n)) return;
    ossos.set(n, b);
    _m.copy(base).multiply(sk.boneInverses[i].clone().invert()).decompose(_p, _q, _s);
    rest.set(n, { p: _p.clone(), q: _q.clone() });
  });
  const ordem = [];
  personagem.traverse(o => { if (o.isBone && ossos.get(nomeOsso(o.name)) === o) ordem.push(nomeOsso(o.name)); });
  const paiDe = n => { const p = ossos.get(n).parent; return p && p.isBone && ossos.get(nomeOsso(p.name)) === p ? nomeOsso(p.name) : null; };
  const paiFixo = new Map();
  for (const n of ordem) if (!paiDe(n)) paiFixo.set(n, invP.clone().multiply(ossos.get(n).parent.matrixWorld));
  malha.geometry.computeBoundingBox();
  const bb = malha.geometry.boundingBox, toP = invP.clone().multiply(malha.matrixWorld);
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    _p.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(toP);
    y0 = Math.min(y0, _p.y); y1 = Math.max(y1, _p.y);
  }
  const escala = personagem.getWorldScale(new THREE.Vector3()).y;
  return { ossos, ordem, rest, paiDe, paiFixo, quadril: ossos.get('Hips'), piso: y0, altura: (y1 - y0) * escala, escala };
}

// ---------------------------------------------------------------- conversao de um clipe para o personagem
function converter(clip, F, A, fatorQuadril) {
  const trilhas = new Map(), props = [];
  for (const t of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(t.name);
    if (ehOsso(nodeName)) trilhas.set(nomeOsso(nodeName) + '.' + propertyName, t);
    else if (nodeName !== F.esqueleto.name) props.push(t);
  }
  const tempos = trilhas.get('Hips.quaternion').times;
  const nT = tempos.length;
  const interp = new Map();
  for (const [k, t] of trilhas) interp.set(k, t.createInterpolant());
  const saidaQ = new Map(A.ordem.map(n => [n, new Float32Array(nT * 4)]));
  const saidaP = new Float32Array(nT * 3);
  const W = new Map(), D = new Map(), WA = new Map();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const qPaiFixo = new Map([...A.paiFixo].map(([n, M]) => { M.decompose(_p, _q, _s); return [n, _q.clone()]; }));
  const restLA = new Map();
  for (const n of A.ordem) {
    const pn = A.paiDe(n);
    restLA.set(n, (pn ? A.rest.get(pn).q : qPaiFixo.get(n)).clone().invert().multiply(A.rest.get(n).q));
  }
  const invPaiQuadril = A.paiFixo.get('Hips') ? A.paiFixo.get('Hips').clone().invert() : null;
  const k = fatorQuadril / A.escala;
  const pq = new THREE.Vector3();
  for (let i = 0; i < nT; i++) {
    const t = tempos[i];
    for (const n of F.ordem) {
      const it = interp.get(n + '.quaternion');
      const ql = it ? qa.fromArray(it.evaluate(t)) : qa.copy(F.restL.get(n));
      const pn = F.pai.get(n);
      const w = (W.get(n) || new THREE.Quaternion()).copy(pn ? W.get(pn) : F.raizW).multiply(ql);
      W.set(n, w);
      D.set(n, (D.get(n) || new THREE.Quaternion()).copy(w).multiply(qb.copy(F.restW.get(n)).invert()));
    }
    for (const n of A.ordem) {
      const pn = A.paiDe(n);
      const wp = pn ? WA.get(pn) : qPaiFixo.get(n);
      const w = WA.get(n) || new THREE.Quaternion();
      if (D.has(n)) w.copy(D.get(n)).multiply(A.rest.get(n).q);
      else w.copy(wp).multiply(restLA.get(n));
      WA.set(n, w);
      qa.copy(wp).invert().multiply(w).normalize().toArray(saidaQ.get(n), i * 4);
    }
    const it = interp.get('Hips.position');
    if (it && invPaiQuadril) {
      // deslocamento do quadril (metros, espaco do lugar/personagem) somado ao repouso do quadril do personagem
      pq.fromArray(it.evaluate(t)).applyMatrix4(F.paiQuadril).sub(F.quadrilRest).multiplyScalar(k);
      pq.add(A.rest.get('Hips').p).applyMatrix4(invPaiQuadril).toArray(saidaP, i * 3);
    }
  }
  const tracks = A.ordem.map(n => new THREE.QuaternionKeyframeTrack(A.ossos.get(n).uuid + '.quaternion', tempos, saidaQ.get(n)));
  if (invPaiQuadril) tracks.push(new THREE.VectorKeyframeTrack(A.quadril.uuid + '.position', tempos, saidaP));
  return {
    corpo: new THREE.AnimationClip(clip.name, clip.duration, tracks),
    props: props.length ? new THREE.AnimationClip(clip.name, clip.duration, props) : null,
    ossosFonte: new THREE.AnimationClip(clip.name, clip.duration, [...trilhas.values()]),
  };
}

// ---------------------------------------------------------------- particulas (fumaca, vomito, urina)
const FX_TIPOS = {
  fumaca: { taxa: 20, vel: 0.04, sobe: 0.16, abre: 0.03, vida: [2.2, 3.2], tam: [0.02, 0.16], cor: [0.80, 0.80, 0.82], cor2: [0.70, 0.70, 0.74], alfa: 0.32, grav: 0, arrasto: 0.5 },
  fumaca_boca: { taxa: 90, vel: 0.65, sobe: 0.06, abre: 0.22, vida: [1.6, 2.4], tam: [0.04, 0.26], cor: [0.84, 0.84, 0.86], cor2: [0.74, 0.74, 0.78], alfa: 0.34, grav: 0, arrasto: 1.8 },
  vomito: { taxa: 170, vel: 1.4, sobe: 0, abre: 0.32, vida: [0.6, 0.9], tam: [0.022, 0.032], cor: [0.45, 0.62, 0.12], cor2: [0.62, 0.58, 0.18], alfa: 0.95, grav: 9.8, chao: true, solido: true },
  urina: { taxa: 240, vel: 1.65, sobe: 0, abre: 0.035, vida: [0.32, 0.45], tam: [0.010, 0.012], cor: [0.97, 0.86, 0.32], cor2: [0.93, 0.80, 0.26], alfa: 0.7, grav: 9.8, chao: true, solido: true },
};

class Particulas {
  constructor(cena, max = 2400) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.cor = new Float32Array(max * 4);
    this.tam = new Float32Array(max);
    this.vida = new Float32Array(max);
    this.vidaMax = new Float32Array(max);
    this.tipo = new Array(max).fill(null);
    this.chao = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('cor', new THREE.BufferAttribute(this.cor, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tamanho', new THREE.BufferAttribute(this.tam, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { escalaTela: { value: 500 } },
      vertexShader: `attribute float tamanho; attribute vec4 cor; varying vec4 vCor; uniform float escalaTela;
        void main() { vCor = cor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = tamanho * escalaTela / max(-mv.z, 0.05); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vCor;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0 || vCor.a <= 0.0) discard;
          gl_FragColor = vec4(vCor.rgb * (1.0 - 0.25 * d), vCor.a * (1.0 - smoothstep(0.35, 1.0, d))); }`,
      transparent: true, depthWrite: false,
    });
    this.pontos = new THREE.Points(g, this.mat);
    this.pontos.name = 'AnimacoesBar_Particulas';
    this.pontos.frustumCulled = false;
    this.pontos.renderOrder = 10;
    cena.add(this.pontos);
    this.acum = new WeakMap();
  }

  emitir(no, nomeTipo, dt, chaoY) {
    const T = FX_TIPOS[nomeTipo];
    if (!T) return;
    no.updateWorldMatrix(true, false);
    no.matrixWorld.decompose(_p, _q, _s);
    const inten = _s.x;
    if (inten <= 0.001) return;
    let a = (this.acum.get(no) || 0) + T.taxa * inten * dt;
    const dir = _v.set(0, 1, 0).applyQuaternion(_q).normalize();
    while (a >= 1) {
      a -= 1;
      const i = this.livre();
      const r = Math.random();
      this.pos.set([_p.x + (Math.random() - 0.5) * 0.006, _p.y + (Math.random() - 0.5) * 0.006, _p.z + (Math.random() - 0.5) * 0.006], i * 3);
      const ab = T.abre;
      const vx = dir.x * T.vel + (Math.random() - 0.5) * 2 * ab * T.vel + (Math.random() - 0.5) * 0.02;
      const vy = dir.y * T.vel + (Math.random() - 0.5) * 2 * ab * T.vel + T.sobe;
      const vz = dir.z * T.vel + (Math.random() - 0.5) * 2 * ab * T.vel + (Math.random() - 0.5) * 0.02;
      const f = 0.85 + 0.3 * Math.random();
      this.vel.set([vx * f, vy * f, vz * f], i * 3);
      this.vida[i] = 0;
      this.vidaMax[i] = T.vida[0] + (T.vida[1] - T.vida[0]) * Math.random();
      this.tipo[i] = T;
      this.chao[i] = chaoY;
      for (let c = 0; c < 3; c++) this.cor[i * 4 + c] = T.cor[c] + (T.cor2[c] - T.cor[c]) * r;
    }
    this.acum.set(no, a);
  }

  livre() {
    for (let k = 0; k < this.max; k++) {
      const i = (this.n + k) % this.max;
      if (!this.tipo[i]) { this.n = (i + 1) % this.max; return i; }
    }
    const i = this.n;
    this.n = (this.n + 1) % this.max;
    return i;
  }

  atualizar(dt, renderer, camera) {
    if (renderer && camera?.isPerspectiveCamera) {
      const h = renderer.getSize(_v).y * renderer.getPixelRatio();
      this.mat.uniforms.escalaTela.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    }
    for (let i = 0; i < this.max; i++) {
      const T = this.tipo[i];
      if (!T) { this.cor[i * 4 + 3] = 0; this.tam[i] = 0; continue; }
      this.vida[i] += dt;
      const u = this.vida[i] / this.vidaMax[i];
      if (u >= 1) { this.tipo[i] = null; this.cor[i * 4 + 3] = 0; this.tam[i] = 0; continue; }
      const k = Math.exp(-(T.arrasto || 0) * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 2] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - T.grav * dt;
      for (let c = 0; c < 3; c++) this.pos[i * 3 + c] += this.vel[i * 3 + c] * dt;
      if (T.chao && this.pos[i * 3 + 1] <= this.chao[i] + 0.004) { this.tipo[i] = null; this.cor[i * 4 + 3] = 0; this.tam[i] = 0; continue; }
      this.tam[i] = T.tam[0] + (T.tam[1] - T.tam[0]) * Math.sqrt(u);
      this.cor[i * 4 + 3] = T.alfa * (T.solido ? 1 : Math.min(1, u * 6)) * (1 - u * u);
    }
    const g = this.pontos.geometry;
    g.attributes.position.needsUpdate = g.attributes.cor.needsUpdate = g.attributes.tamanho.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- modulo
export function criarAnimacoesBar(mapa, opcoes = {}) {
  const pasta = opcoes.pasta ?? './';
  const loader = opcoes.loader ?? new GLTFLoader();
  const cena = opcoes.cena ?? mapa;
  const restos = opcoes.restos ?? 60;
  const fontes = {};
  const controles = new Set();
  const temporarios = [];
  let particulas = null;
  mapa.updateMatrixWorld(true);

  // lugares do mapa ---------------------------------------------------------------------------------------------
  const porNome = n => mapa.getObjectByName(n);
  const mesas = [];
  mapa.traverse(o => { if (/^Mesa_\d+$/.test(o.name) && (o.userData.lugares ?? 4) === 4) mesas.push(o); });
  const mictorios = [];
  mapa.traverse(o => { if (/^Mictorio_Lugar_\d+$/.test(o.name)) mictorios.push(o); });
  const balcao = porNome('Balcao_Lugar_Magrao') || null;
  const cadeiras = [];
  mapa.traverse(o => {
    if (!o.isInstancedMesh || !/cadeira/i.test(o.name + (o.geometry?.name || '') + (o.parent?.name || ''))) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, _m);
      const M = o.matrixWorld.clone().multiply(_m);
      M.decompose(_p, _q, _s);
      const cima = _v.set(0, 1, 0).applyQuaternion(_q);
      if (cima.y < 0.95) continue;                                 // empilhadas/viradas
      const mesa = mesas.find(t => { const tp = t.getWorldPosition(new THREE.Vector3()); return Math.hypot(tp.x - _p.x, tp.z - _p.z) < 0.85 && Math.abs(tp.y - 0.778 - _p.y) < 0.15; });
      if (!mesa) continue;
      const anc = new THREE.Object3D();
      anc.name = 'Cadeira_' + mesa.name + '_' + i;
      anc.matrixAutoUpdate = false;
      anc.matrix.compose(_p, _q, _um);
      anc.matrixWorld.copy(anc.matrix);
      anc.userData = { malha: o, indice: i, original: _m.clone(), mesa };
      cadeiras.push(anc);
    }
  });
  if (!cadeiras.length) console.warn('animacoes_bar: nenhuma instancia de cadeira perto das mesas (sentar fica sem cadeira)');

  function ancoraMesa(mesa, pos) {
    // espaco do clipe: centro da mesa no chao, quina +X/+Z(three) da autoria; gira de 90 em 90 para a quina mais perto
    mesa.updateWorldMatrix(true, false);
    const topo = 0.778;
    const M = mesa.matrixWorld.clone().multiply(_m.makeTranslation(0, -topo, 0));
    const local = M.clone().invert().multiply(_m2.makeTranslation(pos.x, pos.y, pos.z));
    _p.setFromMatrixPosition(local);
    const ang = Math.atan2(-_p.z, _p.x);                           // quina da autoria: (+x, -z) no three = (+X, +Y) no Blender
    const k = Math.round((ang - Math.PI / 4) / (Math.PI / 2));
    const R = _m.makeRotationY(k * Math.PI / 2);
    const anc = new THREE.Object3D();
    anc.matrixAutoUpdate = false;
    anc.matrix.copy(M).multiply(R);
    anc.matrixWorld.copy(anc.matrix);
    anc.name = 'Quina_' + mesa.name;
    return anc;
  }

  function noEspacoDaCena(o, Mmundo) {
    // o fica filho de 'cena' com a transformacao de mundo Mmundo
    cena.updateWorldMatrix(true, false);
    o.matrixAutoUpdate = false;
    o.matrix.copy(cena.matrixWorld).invert().multiply(Mmundo);
    o.matrixWorldNeedsUpdate = true;
  }

  function ocupado(lugar) {
    for (const c of controles) if (c._lugar === lugar) return true;
    return false;
  }

  // fontes ------------------------------------------------------------------------------------------------------
  async function carregar(...quais) {
    const lista = quais.length ? quais : GRUPOS;
    await Promise.all(lista.filter(g => !fontes[g]).map(async g => {
      const gltf = await loader.loadAsync(pasta + 'bar_' + g + '.glb');
      fontes[g] = lerFonte(gltf, g);
    }));
  }

  // controle de um personagem ------------------------------------------------------------------------------------
  function personagem(obj, o = {}) {
    const A = lerAlvo(obj);
    if (Math.abs(A.altura - ALTURA_AUTORIA) > 0.2)
      console.warn(`animacoes_bar: personagem com ${A.altura.toFixed(2)} m; as animacoes foram feitas para ${ALTURA_AUTORIA} m`);
    const mixer = o.mixer ?? new THREE.AnimationMixer(obj);
    const proprio = !o.mixer;
    const cache = {};                                              // clipe -> { corpo, props, ossosFonte, acao }
    const kits = {};                                               // grupo -> { grupo(Object3D de props), mixerProps, fonte(esqueleto), mixerFonte }
    const c = { personagem: obj, mixer, estado: 'livre', _lugar: null };
    let atual = null;                                              // { clipe, info, F, x, kit, ancora, substitui, fim }
    let loco = null;
    let deslize = null;
    let pendente = null;                                           // proxima etapa pedida durante um loop

    function clipe(nome) {
      if (cache[nome]) return cache[nome];
      const g = GRUPO_DO_CLIPE[nome];
      const F = fontes[g];
      if (!F) throw new Error(`animacoes_bar: carregue o grupo '${g}' antes (bar.carregar('${g}'))`);
      const ancorado = !!F.info.ancora;
      const conv = converter(F.clipes[nome], F, A, ancorado ? 1 : A.altura / ALTURA_AUTORIA);
      const acao = mixer.clipAction(conv.corpo);
      const loop = !!F.info.clipes?.[nome]?.loop;
      acao.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      acao.clampWhenFinished = !loop;
      return (cache[nome] = { ...conv, acao, loop, F, info: F.info.clipes?.[nome] || {}, nome });
    }

    function kit(F) {
      if (kits[F.grupo]) return kits[F.grupo];
      const grupo = new THREE.Group();
      grupo.name = 'AnimacoesBar_' + F.grupo;
      for (const p of F.props) { const k = p.clone(true); k.visible = !p.name.startsWith('FX_'); k.scale.setScalar(0); grupo.add(k); }
      const fonte = F.esqueleto.clone(true);                       // esqueleto de autoria (para corrigir props pela mao real)
      const raizF = new THREE.Group();
      raizF.add(fonte);
      fonte.position.copy(F.esqueleto.position); fonte.quaternion.copy(F.esqueleto.quaternion); fonte.scale.copy(F.esqueleto.scale);
      const ossosF = new Map();
      fonte.traverse(n => { if (ehOsso(n.name)) ossosF.set(nomeOsso(n.name), n); });
      return (kits[F.grupo] = { grupo, mixerProps: new THREE.AnimationMixer(grupo), raizF, ossosF, mixerFonte: new THREE.AnimationMixer(fonte) });
    }

    // locomocao -----------------------------------------------------------------------------------------------
    function garantirLoco() {
      if (loco || o.locomocao === false || !fontes.locomocao) return loco;
      const v = fontes.locomocao.info.velocidade || {};
      loco = { parado: clipe('parado_loop').acao, andar: clipe('andar_loop').acao, bebado: clipe('andar_bebado_loop').acao,
               vAndar: v.andar_loop || 0.85, vBebado: v.andar_bebado_loop || 0.55, vel: 0, beb: false, peso: 1 };
      for (const a of [loco.parado, loco.andar, loco.bebado]) { a.play(); a.setEffectiveWeight(0); }
      loco.parado.setEffectiveWeight(1);
      return loco;
    }

    function pesosLoco(dt) {
      if (!loco) return;
      const alvo = c.estado === 'livre' && !atual ? 1 : 0;
      loco.peso += Math.sign(alvo - loco.peso) * Math.min(Math.abs(alvo - loco.peso), dt / TRANSICAO);
      const w = THREE.MathUtils.smoothstep(loco.vel, 0.05, 0.35);
      const anda = loco.beb ? loco.bebado : loco.andar;
      const outra = loco.beb ? loco.andar : loco.bebado;
      anda.timeScale = THREE.MathUtils.clamp(loco.vel / (loco.beb ? loco.vBebado : loco.vAndar), 0.5, 2.2);
      loco.parado.setEffectiveWeight(loco.peso * (1 - w));
      anda.setEffectiveWeight(loco.peso * w);
      outra.setEffectiveWeight(0);
    }

    c.locomover = (vel, op = {}) => {
      if (!garantirLoco()) {
        if (o.locomocao === false && !c._avisou) { c._avisou = true; console.warn('animacoes_bar: locomover() com { locomocao: false } nao faz nada (o jogo anima o andar)'); }
        return;
      }
      if (!!op.bebado !== loco.beb) { (op.bebado ? loco.bebado : loco.andar).time = 0; loco.beb = !!op.bebado; }
      loco.vel = Math.max(0, vel);
    };

    // tocar um clipe ------------------------------------------------------------------------------------------
    function posicionar(anc) {
      // personagem desliza ate a ancora (pes no chao do lugar, frente = +Z local da ancora)
      anc.updateWorldMatrix?.(true, false);
      anc.matrixWorld.decompose(_p, _q, _s);
      const destPos = _p.clone().addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(_q), -A.piso * A.escala);
      const destQ = _q.clone();
      if (obj.parent) {
        obj.parent.updateMatrixWorld(true);
        destPos.applyMatrix4(obj.parent.matrixWorld.clone().invert());
        destQ.premultiply(obj.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      }
      deslize = { t: 0, de: obj.position.clone(), deQ: obj.quaternion.clone(), para: destPos, paraQ: destQ };
    }

    function tocar(nome, op = {}) {
      const x = clipe(nome);
      const F = x.F;
      const k = kit(F);
      const ant = atual;
      const fade = op.fade ?? TRANSICAO;
      // espaco do clipe: ancora (lugar do mapa) ou o proprio personagem (o grupo segue o personagem em _tick)
      if (k.grupo.parent !== cena) cena.add(k.grupo);
      k.grupo.matrixAutoUpdate = false;
      k.ancora = op.ancora || null;
      if (k.ancora) noEspacoDaCena(k.grupo, k.ancora.matrixWorld);
      // objetos do mapa trocados pelas copias animadas
      const subst = [];
      for (const [nm] of Object.entries(x.info.substitui || {})) { const m = porNome(nm); if (m) { m.visible = false; subst.push(m); } }
      x.acao.reset();
      x.acao.time = op.tempo ?? 0;
      x.acao.setEffectiveWeight(1);
      x.acao.play();
      if (ant && ant.x.acao !== x.acao) {
        if (fade > 0) ant.x.acao.crossFadeTo(x.acao, fade, false);
        else ant.x.acao.stop();
      } else if (!ant && fade > 0) x.acao.fadeIn(fade);
      const ap = x.props ? k.mixerProps.clipAction(x.props) : null;
      if (ap) { k.mixerProps.stopAllAction(); ap.reset(); ap.setLoop(x.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); ap.clampWhenFinished = !x.loop; ap.play(); }
      const af = k.mixerFonte.clipAction(x.ossosFonte);
      k.mixerFonte.stopAllAction(); af.reset(); af.setLoop(x.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); af.clampWhenFinished = !x.loop; af.play();
      for (const p of k.grupo.children) if (!x.props?.tracks.some(t => t.name.startsWith(p.name + '.'))) p.scale.setScalar(0);
      if (ant && ant.kit !== k && ant.kit.grupo.parent) ant.kit.grupo.removeFromParent();
      if (ant) for (const m of ant.subst) if (!subst.includes(m)) m.visible = true;
      atual = { nome, x, F, kit: k, ap, af, subst, ancora: op.ancora || null, cadeira: op.cadeira || null, quandoAcabar: op.quandoAcabar };
      return atual;
    }

    function acabou(e) {
      if (atual && e.action === atual.x.acao && !atual.x.loop) atual.terminou = true;
    }
    mixer.addEventListener('finished', acabou);

    // fim de uma acao: o objeto do personagem vai para onde o corpo terminou (sem soluco ao voltar para o parado)
    function reenraizar() {
      const k = atual.kit;
      k.raizF.updateMatrixWorld(true);
      const H = k.ossosF.get('Hips');
      H.getWorldPosition(_p);
      const q = H.getWorldQuaternion(new THREE.Quaternion()).multiply(atual.F.restW.get('Hips').clone().invert());
      const fr = _v.set(0, 0, 1).applyQuaternion(q);
      const yaw = Math.atan2(fr.x, fr.z);
      const M = new THREE.Matrix4().compose(new THREE.Vector3(_p.x, 0, _p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), _um);
      k.grupo.updateMatrixWorld(true);
      const base = k.grupo.matrixWorld.clone();                  // espaco do clipe no mundo (ancora ou pes do personagem)
      base.multiply(M).decompose(_p, _q, _s);
      _p.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(_q), -A.piso * A.escala);
      if (obj.parent) { _p.applyMatrix4(obj.parent.matrixWorld.clone().invert()); _q.premultiply(obj.parent.getWorldQuaternion(new THREE.Quaternion()).invert()); }
      obj.position.copy(_p);
      obj.quaternion.copy(_q);
    }

    function soltar() {
      // entrega/restos viram objetos soltos no mapa; props somem; personagem volta ao parado na mesma pose
      const a = atual;
      if (!a) return null;
      const deixados = [];
      for (const nm of [...(a.x.info.entrega || []), ...(a.x.info.fica || [])]) {
        const p = a.kit.grupo.getObjectByName(nm);
        if (!p || p.scale.x < 1e-3) continue;
        p.updateWorldMatrix(true, false);
        const cp = p.clone(true);
        cp.matrixAutoUpdate = true;
        noEspacoDaCena(cp, p.matrixWorld);
        cp.matrixAutoUpdate = true;
        cp.matrix.decompose(cp.position, cp.quaternion, cp.scale);
        cena.add(cp);
        deixados.push({ obj: cp, entrega: (a.x.info.entrega || []).includes(nm) });
      }
      // a bebida (copo + chopp) vira um grupo so
      let bebida = null;
      const ent = deixados.filter(d => d.entrega).map(d => d.obj);
      if (ent.length) {
        bebida = new THREE.Group();
        bebida.name = 'Bebida_' + (a.x.info.bebida || 'bar');
        bebida.userData.bebida = a.x.info.bebida;
        ent[0].getWorldPosition(bebida.position);
        cena.add(bebida);
        for (const e of ent) bebida.attach(e);
      }
      for (const d of deixados) if (!d.entrega) { temporarios.push({ obj: d.obj, t: restos }); o.aoDeixar?.(d.obj, a.nome); }
      if (a.cadeira) { const u = a.cadeira.userData; u.malha.setMatrixAt(u.indice, u.original); u.malha.instanceMatrix.needsUpdate = true; }
      reenraizar();
      for (const m of a.subst) m.visible = true;
      a.x.acao.stop();
      a.ap?.stop();
      a.kit.grupo.removeFromParent();
      atual = null;
      if (garantirLoco()) {                                     // parado com peso 1 na hora: a ultima pose dos clipes e a do parado
        loco.peso = 1; loco.vel = 0; loco.parado.reset().play(); loco.parado.setEffectiveWeight(1);
      }
      return bebida;
    }

    // sequencias ------------------------------------------------------------------------------------------------
    function seq(etapas, op = {}) {
      // etapas: nomes de clipe; o ultimo pode ser loop (fica ate pedirem a proxima etapa)
      return new Promise(resolve => {
        const st = { etapas, i: 0, op, resolve };
        c._seq = st;
        if (op.ancora) posicionar(op.ancora);
        if (loco) loco.peso = Math.min(loco.peso, 1);
        if (!atual) o.aoComecar?.(c);                            // jogo com andar proprio: esmaece o idle/walk dele aqui
        tocar(etapas[0], { ...op, fade: op.fade ?? TRANSICAO });
      });
    }

    function proxima() {
      const st = c._seq;
      if (!st || !atual?.terminou) return;
      st.i++;
      if (st.i < st.etapas.length) {                             // o ultimo quadro de um clipe e o primeiro do seguinte
        const x = tocar(st.etapas[st.i], { ...st.op, fade: 0 }).x;
        if (x.loop && st.i === st.etapas.length - 1) st.resolve(null);   // chegou no loop: a acao esta estabelecida
        return;
      }
      c._seq = null;
      if (st.op.manter) { st.resolve(null); return; }            // cair: fica deitado no ultimo quadro
      const bebida = soltar();
      c.estado = 'livre';
      c._lugar = null;
      st.resolve(bebida);
      o.aoTerminar?.(c);
    }

    function depoisDoLoop(nome, op = {}) {
      // troca do loop atual para a etapa seguinte (mistura curta a partir de qualquer ponto do loop)
      return new Promise(resolve => {
        const st = { etapas: Array.isArray(nome) ? nome : [nome], i: 0, op: { ...op, ancora: atual?.ancora, cadeira: atual?.cadeira }, resolve };
        c._seq = st;
        tocar(st.etapas[0], { ...st.op, fade: op.fade ?? 0.4 });
      });
    }

    c.fumar = () => { c.estado = 'fumando'; return seq(['fumar_acender', 'fumar_loop']); };
    c.pararDeFumar = () => depoisDoLoop('fumar_apagar');
    c.vomitar = () => { c.estado = 'ocupado'; return seq(['vomitar']); };
    c.cair = () => { c.estado = 'caido'; return seq(['cair'], { manter: true, fade: 0.15 }); };
    c.levantarDoChao = () => { c.estado = 'ocupado'; return seq(['levantar_chao'], { fade: 0 }); };
    c.sentar = cadeira => {
      if (!cadeira || ocupado(cadeira)) return Promise.resolve(null);
      c.estado = 'sentado'; c._lugar = cadeira;
      return seq(['sentar', 'sentado_loop'], { ancora: cadeira, cadeira });
    };
    c.comer = () => { c.estado = 'comendo'; return depoisDoLoop(['comer_comecar', 'comer_loop']); };
    c.pararDeComer = () => { c.estado = 'sentado'; return depoisDoLoop(['comer_terminar', 'sentado_loop']); };
    c.levantar = () => { c.estado = 'ocupado'; return depoisDoLoop(['levantar']); };
    c.limparMesa = mesa => { c.estado = 'ocupado'; c._lugar = mesa; return seq(['limpar_mesa'], { ancora: ancoraMesa(mesa, obj.getWorldPosition(new THREE.Vector3())) }); };
    c.urinar = mict => { if (ocupado(mict)) return Promise.resolve(null); c.estado = 'ocupado'; c._lugar = mict; return seq(['urinar'], { ancora: mict }); };
    c.atender = (pedido = 'chopp') => {
      if (!balcao) throw new Error('animacoes_bar: Balcao_Lugar_Magrao nao esta no mapa (rode o 17_lugares_animacao.py e reexporte)');
      const nome = { chopp: 'magrao_chopp', chopp_escuro: 'magrao_chopp_escuro', longneck: 'magrao_longneck', 'long-neck': 'magrao_longneck' }[pedido];
      if (!nome) throw new Error('animacoes_bar: pedido desconhecido ' + pedido);
      c.estado = 'ocupado'; c._lugar = balcao;
      return seq([nome], { ancora: balcao });
    };

    // quadro a quadro --------------------------------------------------------------------------------------------
    c._tick = dt => {
      if (deslize) {
        deslize.t = Math.min(TRANSICAO, deslize.t + dt);
        const s = THREE.MathUtils.smoothstep(deslize.t / TRANSICAO, 0, 1);
        obj.position.lerpVectors(deslize.de, deslize.para, s);
        obj.quaternion.slerpQuaternions(deslize.deQ, deslize.paraQ, s);
        if (deslize.t >= TRANSICAO) deslize = null;
      }
      pesosLoco(dt);
      if (proprio) mixer.update(dt);
      const a = atual;
      if (a) {
        const k = a.kit;
        if (!k.ancora) {                                         // props no espaco do personagem (pes no chao, sem escala)
          obj.updateWorldMatrix(true, false);
          obj.matrixWorld.decompose(_p, _q, _s);
          _p.addScaledVector(_v.set(0, 1, 0).applyQuaternion(_q), A.piso * A.escala);
          noEspacoDaCena(k.grupo, _m2.compose(_p, _q, _um));
        }
        const t = a.x.acao.time;
        if (a.ap) { a.ap.time = t; k.mixerProps.update(0); }
        a.af.time = t; k.mixerFonte.update(0);
        k.grupo.updateMatrixWorld(true);
        corrigirProps(a, t);
        if (a.cadeira) {
          const pc = k.grupo.getObjectByName('Prop_Cadeira');
          const u = a.cadeira.userData;
          if (pc && pc.scale.x > 1e-3) {                          // a instancia da cadeira do mapa acompanha o Prop_Cadeira
            pc.updateWorldMatrix(true, false);
            u.malha.updateWorldMatrix(true, false);
            _m.copy(u.malha.matrixWorld).invert().multiply(pc.matrixWorld);
            u.malha.setMatrixAt(u.indice, _m);
            u.malha.instanceMatrix.needsUpdate = true;
          }
        }
        if (particulas) {
          const chao = k.grupo.getWorldPosition(_v).y;
          for (const p of k.grupo.children) if (p.name.startsWith('FX_')) particulas.emitir(p, a.F.info.fx?.[p.name], dt, chao);
        }
      }
      proxima();
    };

    // props seguros: corrigidos pela diferenca entre o osso de autoria e o do personagem (mao/cabeca)
    const _C = new THREE.Matrix4(), _S = new THREE.Matrix4(), _T = new THREE.Matrix4(), _Gi = new THREE.Matrix4();
    function corrigirProps(a, t) {
      const segue = a.x.info.segue;
      if (!segue) return;
      const f = t * FPS;
      _Gi.copy(a.kit.grupo.matrixWorld).invert();
      a.kit.raizF.updateMatrixWorld(true);
      for (const [nome, faixas] of Object.entries(segue)) {
        const p = a.kit.grupo.getObjectByName(nome);
        if (!p) continue;
        let w = 0, osso = null;
        for (const [f0, f1, o_] of faixas) {
          if (f >= f0 - 4 && f <= f1 + 4) {
            const ww = Math.min(1, (f - (f0 - 4)) / 4, ((f1 + 4) - f) / 4);
            if (ww > w) { w = ww; osso = o_; }
          }
        }
        if (!osso || w <= 0) continue;
        const bF = a.kit.ossosF.get(osso), bA = A.ossos.get(osso);
        if (!bF || !bA) continue;
        bF.matrixWorld.decompose(_p, _q, _s); _S.compose(_p, _q, _um);
        bA.updateWorldMatrix(true, false);
        _T.multiplyMatrices(_Gi, bA.matrixWorld).decompose(_p, _q, _s); _T.compose(_p, _q, _um);
        _C.multiplyMatrices(_T, _S.invert());
        if (w < 1) {
          _C.decompose(_p, _q, _s);
          _p.multiplyScalar(w); _q.slerpQuaternions(new THREE.Quaternion(), _q, w);
          _C.compose(_p, _q, _um);
        }
        p.updateMatrix();
        _m.multiplyMatrices(_C, p.matrix).decompose(p.position, p.quaternion, p.scale);
        p.updateMatrixWorld(true);
      }
    }

    c.liberar = () => { mixer.removeEventListener('finished', acabou); for (const x of Object.values(cache)) x.acao.stop(); controles.delete(c); };
    controles.add(c);
    garantirLoco();
    return c;
  }

  function maisPerto(lista, pos, raio = 2.0) {
    let melhor = null, d = raio;
    for (const l of lista) {
      if (ocupado(l)) continue;
      l.updateWorldMatrix?.(true, false);
      const e = _v.setFromMatrixPosition(l.matrixWorld).distanceTo(pos);
      if (e < d) { d = e; melhor = l; }
    }
    return melhor;
  }

  return {
    carregar, personagem, maisPerto, cadeiras, mesas, mictorios, balcao, fontes,
    atualizar(dt, camera) {
      if (!particulas && GRUPOS.some(g => fontes[g] && Object.keys(fontes[g].info.fx || {}).length)) particulas = new Particulas(cena);
      for (const c of [...controles]) c._tick(dt);
      particulas?.atualizar(dt, opcoes.renderer, camera ?? opcoes.camera);
      for (let i = temporarios.length - 1; i >= 0; i--) {
        if ((temporarios[i].t -= dt) <= 0) { temporarios[i].obj.removeFromParent(); temporarios.splice(i, 1); }
      }
    },
  };
}
