// moto_delivery.js (v3) - script do PlayCanvas para a moto_delivery.glb gerada por scripts\55_moto_v3.py
//
// Rig (nomes dos nos no GLB; ponto_piloto / ponto_mao_* / ponto_pe_* / ponto_farol / ponto_lanterna / ponto_escapamento /
// ponto_entrega-> agora ponto_bau mantem a funcao dos nomes da moto antiga):
//   Moto_Rig > raiz > chassi > direcao > suspensao_diant > roda_dianteira
//                                      > ponto_mao_E/D, ponto_farol, ponto_farol_alto, ponto_seta_frente_E/D, ponto_buzina
//                            > balanca > roda_traseira
//                            > descanso
//                            > ponto_piloto, ponto_garupa, ponto_pe_E/D, ponto_pe_garupa_E/D, ponto_lanterna, ponto_freio,
//                              ponto_luz_placa, ponto_placa, ponto_seta_tras_E/D, ponto_escapamento, ponto_tanque, ponto_motor,
//                              ponto_bau (onde a bag de entrega e encaixada), ponto_camera
//                    > ponto_contato_diant, ponto_contato_tras, ponto_descanso_chao (filhos da raiz, no chao)
//   Frente da moto = +Z local (padrao glTF). pc.Entity.forward aponta para -Z, entao a frente no mundo e moto.frente().
//   Esquerda do piloto = +X. Origem no chao, entre os eixos (1,36 m). Rodas r = 0,30 m. Banco a 0,80 m.
//   Ossos que apontam para cima tem rotacao de repouso identidade; "direcao" e "suspensao_diant" ficam inclinados 27 graus
//   (a coluna) e seus filhos compensam. O script guarda o repouso e aplica o movimento por cima.
//
// Malhas do GLB (1 draw call cada): Moto (pintura + atlas), Moto_Placa, Luz_Farol, Luz_Seta_E, Luz_Seta_D, Luz_Lanterna,
//   Luz_Freio. As luzes saem APAGADAS: moto.luz('Luz_Farol', true). A BAG DE ENTREGA NAO VEM NA MOTO: e outro modelo
//   (moto_bag.glb + moto_bag.js); entidade da bag como filha de moto.ponto('ponto_bau').
//
// Uso (entidade com o modelo instanciado + este script):
//   const moto = entidade.script.motoDelivery;
//   moto.velocidade = 8;          // m/s, negativo = re (as rodas giram pela distancia percorrida)
//   moto.direcao = 1;             // -1 esquerda .. +1 direita (guidao e inclinacao vao suavizados ate o alvo)
//   moto.freio = 1;               // 0..1: o garfo mergulha e a traseira levanta
//   moto.acelerador = 1;          // 0..1: a traseira agacha
//   moto.descansoAberto = true;   // abre o descanso lateral (moto parada)
//   moto.luz('Luz_Freio', true);  // acende (emissive); moto.luz('Luz_Seta_E', pisca) para as setas
//   piloto.reparent(moto.ponto('ponto_piloto'));   // ponto na superficie do banco
//   moto.encaixarBag(bagEntity);  // coloca a bag no ponto_bau (ou bagEntity.reparent(moto.ponto('ponto_bau')))
// Colisao: moto_delivery_colisao.glb (casco convexo sem os espelhos) ou a caixa do PROMPT_integracao_moto_v3.md.
var MotoDelivery = pc.createScript('motoDelivery');

MotoDelivery.attributes.add('velocidade', { type: 'number', default: 0, title: 'Velocidade (m/s)' });
MotoDelivery.attributes.add('direcao', { type: 'number', default: 0, min: -1, max: 1, title: 'Direcao (-1..1)' });
MotoDelivery.attributes.add('freio', { type: 'number', default: 0, min: 0, max: 1, title: 'Freio (0..1)' });
MotoDelivery.attributes.add('acelerador', { type: 'number', default: 0, min: 0, max: 1, title: 'Acelerador (0..1)' });
MotoDelivery.attributes.add('descansoAberto', { type: 'boolean', default: false, title: 'Descanso aberto' });
MotoDelivery.attributes.add('anguloDirecao', { type: 'number', default: 28, title: 'Giro max do guidao (graus)' });
MotoDelivery.attributes.add('inclinacaoMax', { type: 'number', default: 10, title: 'Inclinacao max na curva (graus)' });
MotoDelivery.attributes.add('velocidadeInclinacao', { type: 'number', default: 10, title: 'Velocidade da inclinacao max (m/s)' });
MotoDelivery.attributes.add('raioRoda', { type: 'number', default: 0.30, title: 'Raio da roda (m)' });
MotoDelivery.attributes.add('suavizacao', { type: 'number', default: 8, title: 'Suavizacao do guidao' });
MotoDelivery.attributes.add('curso', { type: 'number', default: 0.07, title: 'Curso da suspensao dianteira (m)' });

// cor emissiva de cada luz quando acesa (r, g, b)
MotoDelivery.LUZES = {
    Luz_Farol: [1.0, 0.96, 0.82], Luz_Seta_E: [1.0, 0.55, 0.05], Luz_Seta_D: [1.0, 0.55, 0.05],
    Luz_Lanterna: [1.0, 0.06, 0.04], Luz_Freio: [1.0, 0.10, 0.06]
};

MotoDelivery.prototype.initialize = function () {
    this._ossos = {};
    ['chassi', 'direcao', 'suspensao_diant', 'roda_dianteira', 'roda_traseira', 'balanca', 'descanso'].forEach(function (nome) {
        var e = this.entity.findByName(nome);
        if (e) this._ossos[nome] = { entidade: e, repouso: e.getLocalRotation().clone(), pos: e.getLocalPosition().clone() };
        else console.warn('motoDelivery: osso "' + nome + '" nao encontrado');
    }, this);
    this._giroRodas = 0;
    this._guidao = 0;
    this._inclinacao = 0;
    this._mergulho = 0;
    this._descanso = 0;
    this._freioVis = 0;
    this._acelVis = 0;
    this._q = new pc.Quat();
    this._tmp = new pc.Quat();
    this._v = new pc.Vec3();
    this._frente = new pc.Vec3();
    this._luzes = {};
};

// no do rig pelo nome (pontos de encaixe, ossos)
MotoDelivery.prototype.ponto = function (nome) {
    return this.entity.findByName(nome);
};

// frente da moto no mundo (+Z local)
MotoDelivery.prototype.frente = function () {
    return this._frente.copy(this.entity.forward).mulScalar(-1);
};

// encaixa a bag de entrega (entidade de moto_bag.glb) no ponto_bau
MotoDelivery.prototype.encaixarBag = function (bag) {
    var p = this.ponto('ponto_bau');
    if (!p) return;
    bag.reparent(p);
    bag.setLocalPosition(0, 0, 0);
    bag.setLocalRotation(pc.Quat.IDENTITY);
};

// acende / apaga uma luz (Luz_Farol, Luz_Seta_E, Luz_Seta_D, Luz_Lanterna, Luz_Freio); intensidade 0..2.
// O material e clonado por moto, entao cada uma acende sozinha.
MotoDelivery.prototype.luz = function (nome, ligada, intensidade) {
    var l = this._luzes[nome];
    if (!l) {
        var e = this.entity.findByName(nome);
        var r = e && e.render;
        if (!r) return;
        var cor = MotoDelivery.LUZES[nome] || [1, 1, 1];
        l = this._luzes[nome] = { mis: r.meshInstances, cor: new pc.Color(cor[0], cor[1], cor[2]), v: -1 };
        l.mis.forEach(function (mi) { mi.material = mi.material.clone(); });
    }
    var k = ligada ? (intensidade === undefined ? 1 : intensidade) : 0;
    if (k === l.v) return;
    l.v = k;
    l.mis.forEach(function (mi) {
        mi.material.emissive = l.cor;
        mi.material.emissiveIntensity = k;
        mi.material.update();
    });
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

    // freio: o garfo mergulha (a roda sobe ao longo da coluna) e a traseira levanta; acelerador agacha a traseira
    this._freioVis += (pc.math.clamp(this.freio, 0, 1) - this._freioVis) * k;
    this._acelVis += (pc.math.clamp(this.acelerador, 0, 1) - this._acelVis) * k;
    this._mergulho += (this._freioVis * this.curso - this._mergulho) * k;
    var s = this._ossos.suspensao_diant;
    if (s) {
        this._v.set(0, this._mergulho, 0);
        s.repouso.transformVector(this._v, this._v);
        s.entidade.setLocalPosition(s.pos.x + this._v.x, s.pos.y + this._v.y, s.pos.z + this._v.z);
    }
    this._girar('balanca', this._freioVis * -2.0 + this._acelVis * 1.5, 0, 0);

    // descanso lateral: recolhido no repouso; -90 graus em X abre (a perna aponta para o chao)
    this._descanso += ((this.descansoAberto ? 1 : 0) - this._descanso) * k * 0.6;
    this._girar('descanso', -90 * this._descanso, 0, 0);
};
