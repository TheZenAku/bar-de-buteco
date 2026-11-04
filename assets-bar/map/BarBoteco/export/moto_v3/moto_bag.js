// moto_bag.js - script do PlayCanvas para a bag de entrega (moto_bag.glb, scripts\56_moto_bag.py). Modelo separado da moto.
//
// Rig: Bag_Rig > bag_raiz > bag_tampa. A origem e o centro da base e o conjunto ja vem inclinado 13 graus para assentar no banco;
// instancie a bag como filha de moto.ponto('ponto_bau') com posicao e rotacao locais zero (moto.encaixarBag(bag) faz isso).
// Medidas: 0,42 x 0,44 m de base, 0,30 m de corpo + 0,085 m de tampa (alca no topo). Logo dos dois lados e atras.
//   bag.script.motoBag.aberta = true;   // abre a tampa (dobradica atras; -X em torno do osso bag_tampa)
// Para tirar a bag da moto: bag.reparent(pc.app.root) ou bag.enabled = false (a malha tem pele; escala 0 no osso bag_raiz tambem esconde).
var MotoBag = pc.createScript('motoBag');

MotoBag.attributes.add('aberta', { type: 'boolean', default: false, title: 'Tampa aberta' });
MotoBag.attributes.add('anguloAbertura', { type: 'number', default: 105, title: 'Abertura da tampa (graus)' });
MotoBag.attributes.add('suavizacao', { type: 'number', default: 8, title: 'Suavizacao' });

MotoBag.prototype.initialize = function () {
    var e = this.entity.findByName('bag_tampa');
    this._tampa = e ? { entidade: e, repouso: e.getLocalRotation().clone() } : null;
    if (!e) console.warn('motoBag: osso "bag_tampa" nao encontrado');
    this._t = 0;
    this._q = new pc.Quat();
    this._r = new pc.Quat();
};

MotoBag.prototype.update = function (dt) {
    if (!this._tampa) return;
    this._t += ((this.aberta ? 1 : 0) - this._t) * (1 - Math.exp(-this.suavizacao * dt));
    this._q.setFromEulerAngles(-this.anguloAbertura * this._t, 0, 0);
    this._r.mul2(this._tampa.repouso, this._q);
    this._tampa.entidade.setLocalRotation(this._r);
};
