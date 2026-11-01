// Integracao do mapa novo (bar_boteco.glb / bar_boteco_draco.glb) no jogo three.js.
//
//   import { prepararMapa } from './integracao_highland.js';
//   const bar = prepararMapa(gltf.scene);        // logo depois de carregar o mapa
//   bar.atualizar(dt);                           // todo frame (dt em segundos)
//
//   bar.mesa(7)               Object3D no tampo da mesa 7; userData = { mesa, area, andar, lugares }
//   bar.mesas('quintal')      mesas de uma area: 'salao', 'varanda', 'quintal', 'superior', 'terraco' (sem argumento: todas)
//   bar.corJukebox('#ff00aa') cor fixa no brilho da jukebox e na luz dela (desliga o ciclo)
//   bar.jukeboxCiclo = true   volta para o ciclo de cores
import * as THREE from 'three';

export function prepararMapa(mapa) {
  const mesas = [];
  mapa.traverse(o => { if (Number.isInteger(o.userData?.mesa)) mesas.push(o); });
  mesas.sort((a, b) => a.userData.mesa - b.userData.mesa);

  const brilho = mapa.getObjectByName('Jukebox_FX_Luz');            // malha brilhante (emissiveMap = mascara)
  const ponto = mapa.getObjectByName('Jukebox_FX_Ponto_Luz');       // PointLight na frente da jukebox
  const lampada = ponto && (ponto.isLight ? ponto : ponto.getObjectByProperty('isLight', true));
  if (brilho) brilho.material = brilho.material.clone();             // material so dela

  const cor = new THREE.Color();
  let matiz = 0;
  const pintar = c => {
    if (brilho) brilho.material.emissive.set(c);
    if (lampada) lampada.color.set(c);
  };
  const bar = {
    mesas: area => (area ? mesas.filter(m => m.userData.area === area) : mesas.slice()),
    mesa: n => mesas.find(m => m.userData.mesa === n) || null,
    jukeboxCiclo: true,
    corJukebox(c) { bar.jukeboxCiclo = false; pintar(c); },
    atualizar(dt) {
      if (!bar.jukeboxCiclo) return;
      matiz = (matiz + dt * 0.12) % 1;                               // uma volta no arco-iris a cada ~8 s
      pintar(cor.setHSL(matiz, 1, 0.5));
    },
  };
  return bar;
}
