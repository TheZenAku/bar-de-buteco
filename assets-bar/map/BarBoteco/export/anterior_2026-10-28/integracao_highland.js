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
//
//   bar.telao                 Mesh da tela do palco: plano 16:9 (5,76 x 3,24 m) virado para a plateia (+Z local),
//                             origem no centro, UV 0..1; userData = { interativo: 'telao', largura_m, altura_m, ... }
//   bar.telaoTextura(tex)     mostra uma textura na tela (VideoTexture de um <video>, CanvasTexture...) sem luz nem
//                             tone mapping; null volta para a imagem de espera
//   bar.telaoRecorte()        "fura" a tela no canvas WebGL (pixels transparentes) para um <iframe> do YouTube posto
//                             atras do canvas com o CSS3DRenderer aparecer ali. Requer WebGLRenderer({ alpha: true }).
//                             Para alinhar o iframe (ex.: 1920 x 1080 px) com a tela:
//                               bar.telao.getWorldPosition(obj.position); bar.telao.getWorldQuaternion(obj.quaternion);
//                               obj.scale.setScalar(bar.telao.userData.largura_m / 1920);
//   bar.corPalco('#00e5ff')   cor fixa nas luzes coloridas do palco (lentes, fita de LED da borda e contraluz)
//   bar.palcoCiclo = true     volta para o ciclo de cores do palco
import * as THREE from 'three';

function lampadaDe(mapa, nome) {
  const o = mapa.getObjectByName(nome);
  return o && (o.isLight ? o : o.getObjectByProperty('isLight', true));
}

export function prepararMapa(mapa) {
  const mesas = [];
  mapa.traverse(o => { if (Number.isInteger(o.userData?.mesa)) mesas.push(o); });
  mesas.sort((a, b) => a.userData.mesa - b.userData.mesa);

  const brilho = mapa.getObjectByName('Jukebox_FX_Luz');            // malha brilhante (emissiveMap = mascara)
  const lampada = lampadaDe(mapa, 'Jukebox_FX_Ponto_Luz');          // PointLight na frente da jukebox
  if (brilho) brilho.material = brilho.material.clone();             // material so dela

  const tela = mapa.getObjectByName('Telao_Tela');
  const telaEspera = tela?.material;
  let telaVideo = null;
  const fxPalco = mapa.getObjectByName('Palco_FX_Luz');             // lentes + fita de LED (material Palco_Luz)
  const luzPalco = lampadaDe(mapa, 'Luz_Palco_Cor');                // contraluz colorida
  if (fxPalco) fxPalco.material = fxPalco.material.clone();

  const cor = new THREE.Color();
  let matiz = 0, matizPalco = 0.9;
  const pintar = c => {
    if (brilho) brilho.material.emissive.set(c);
    if (lampada) lampada.color.set(c);
  };
  const pintarPalco = c => {
    if (fxPalco) fxPalco.material.emissive.set(c);
    if (luzPalco) luzPalco.color.set(c);
  };
  const bar = {
    mesas: area => (area ? mesas.filter(m => m.userData.area === area) : mesas.slice()),
    mesa: n => mesas.find(m => m.userData.mesa === n) || null,
    jukeboxCiclo: true,
    corJukebox(c) { bar.jukeboxCiclo = false; pintar(c); },
    telao: tela || null,
    telaoTextura(tex) {
      if (!tela) return;
      if (!tex) { tela.material = telaEspera; return; }
      tex.flipY = false;                                             // UV do glTF: v = 0 no topo da imagem
      tex.colorSpace = THREE.SRGBColorSpace;
      telaVideo ??= new THREE.MeshBasicMaterial({ toneMapped: false });
      if (telaVideo.map !== tex) { telaVideo.map = tex; telaVideo.needsUpdate = true; }
      tela.material = telaVideo;
    },
    telaoRecorte() {
      if (!tela) return;
      tela.material = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending });
    },
    palcoCiclo: true,
    corPalco(c) { bar.palcoCiclo = false; pintarPalco(c); },
    atualizar(dt) {
      if (bar.jukeboxCiclo) {
        matiz = (matiz + dt * 0.12) % 1;                             // uma volta no arco-iris a cada ~8 s
        pintar(cor.setHSL(matiz, 1, 0.5));
      }
      if (bar.palcoCiclo) {
        matizPalco = (matizPalco + dt * 0.04) % 1;                   // palco mais calmo: uma volta a cada ~25 s
        pintarPalco(cor.setHSL(matizPalco, 1, 0.5));
      }
    },
  };
  return bar;
}
