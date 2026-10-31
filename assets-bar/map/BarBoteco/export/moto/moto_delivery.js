// moto_delivery.js - script do PlayCanvas para a moto_delivery.glb (gerada por scripts\20_moto_delivery.py)
//
// Rig (nomes dos nos no GLB):
//   Moto_Rig > raiz > chassi > direcao > roda_dianteira, ponto_mao_E, ponto_mao_D, ponto_farol
//                            > roda_traseira, bau > ponto_entrega
//                            > ponto_piloto, ponto_pe_E, ponto_pe_D, ponto_lanterna, ponto_escapamento
//   Frente da moto = +Z local (padrao glTF, igual ao personagem do Mixamo). pc.Entity.forward aponta para -Z,
//   entao a frente da moto no mundo e moto.frente() (= -entity.forward). Esquerda do piloto = +X. Origem no chao,
//   entre os eixos. Medidas: 1,26 x 1,47 x 1,99 m (L x A x C), rodas r = 0,225 m, entre-eixos 1,34 m, banco a 0,77 m.
//   Todos os ossos tem rotacao de repouso identidade, menos "direcao" (inclinada 9,3 graus como a coluna) e o filho
//   "roda_dianteira"; o script guarda o repouso e aplica o movimento por cima, entao nao precisa se preocupar com isso.
//
// Uso (entidade com o modelo instanciado + este script):
//   const moto = entidade.script.motoDelivery;
//   moto.velocidade = 8;            // m/s, negativo = re (as rodas giram pela distancia percorrida)
//   moto.direcao = 1;               // -1 esquerda .. +1 direita (guidao e inclinacao vao suavizados ate o alvo)
//   piloto.reparent(moto.ponto('ponto_piloto'));   // ponto no banco; desca o personagem pela altura do quadril
//   moto.ponto('bau').setLocalScale(0, 0, 0);       // esconde o bau (malha com pele: desativar o no nao esconde)
// Colisao: moto_delivery_colisao.glb (casco convexo de 118 tri, sem espelhos) ou uma caixa com
//   halfExtents (0.32, 0.71, 0.99) e linearOffset (0, 0.71, -0.05).
var MotoDelivery = pc.createScript('motoDelivery');

MotoDelivery.attributes.add('velocidade', { type: 'number', default: 0, title: 'Velocidade (m/s)' });
MotoDelivery.attributes.add('direcao', { type: 'number', default: 0, min: -1, max: 1, title: 'Direcao (-1..1)' });
MotoDelivery.attributes.add('anguloDirecao', { type: 'number', default: 28, title: 'Giro max do guidao (graus)' });
MotoDelivery.attributes.add('inclinacaoMax', { type: 'number', default: 10, title: 'Inclinacao max na curva (graus)' });
MotoDelivery.attributes.add('velocidadeInclinacao', { type: 'number', default: 10, title: 'Velocidade da inclinacao max (m/s)' });
MotoDelivery.attributes.add('raioRoda', { type: 'number', default: 0.225, title: 'Raio da roda (m)' });
MotoDelivery.attributes.add('suavizacao', { type: 'number', default: 8, title: 'Suavizacao do guidao' });

MotoDelivery.prototype.initialize = function () {
    this._ossos = {};
    ['chassi', 'direcao', 'roda_dianteira', 'roda_traseira'].forEach(function (nome) {
        var e = this.entity.findByName(nome);
        if (e) this._ossos[nome] = { entidade: e, repouso: e.getLocalRotation().clone() };
        else console.warn('motoDelivery: osso "' + nome + '" nao encontrado');
    }, this);
    this._giroRodas = 0;
    this._guidao = 0;
    this._inclinacao = 0;
    this._q = new pc.Quat();
    this._tmp = new pc.Quat();
    this._frente = new pc.Vec3();
};

// no do rig pelo nome (pontos de encaixe, ossos)
MotoDelivery.prototype.ponto = function (nome) {
    return this.entity.findByName(nome);
};

// frente da moto no mundo (+Z local)
MotoDelivery.prototype.frente = function () {
    return this._frente.copy(this.entity.forward).mulScalar(-1);
};

MotoDelivery.prototype._girar = function (nome, x, y, z) {
    var o = this._ossos[nome];
    if (!o) return;
    this._q.setFromEulerAngles(x, y, z);
    this._tmp.mul2(o.repouso, this._q);
    o.entidade.setLocalRotation(this._tmp);
};

MotoDelivery.prototype.update = function (dt) {
    var k = 1 - Math.exp(-this.suavizacao * dt);
    var dir = pc.math.clamp(this.direcao, -1, 1);
    this._guidao += (dir * this.anguloDirecao - this._guidao) * k;
    var fator = pc.math.clamp(Math.abs(this.velocidade) / this.velocidadeInclinacao, 0, 1);
    this._inclinacao += (dir * this.inclinacaoMax * fator - this._inclinacao) * k;
    this._giroRodas = (this._giroRodas + this.velocidade * dt / this.raioRoda * pc.math.RAD_TO_DEG) % 360;

    this._girar('roda_dianteira', this._giroRodas, 0, 0);    // +X local: topo da roda vai para a frente (+Z)
    this._girar('roda_traseira', this._giroRodas, 0, 0);
    this._girar('direcao', 0, -this._guidao, 0);             // +Y local gira para a esquerda; direcao +1 = direita
    this._girar('chassi', 0, 0, this._inclinacao);           // +Z local inclina o topo para a direita (-X)
};
