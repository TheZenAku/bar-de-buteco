// moto_delivery.js (v2) - script do PlayCanvas para a moto_delivery.glb gerada por scripts\54_moto_tripo.py
//
// Rig (nomes dos nos no GLB; os 4 primeiros ossos e os pontos ponto_piloto / ponto_mao_* / ponto_pe_* / ponto_farol /
// ponto_lanterna / ponto_escapamento / ponto_entrega tem os mesmos nomes da moto antiga):
//   Moto_Rig > raiz > chassi > direcao > suspensao_diant > roda_dianteira
//                                      > manete_freio, manete_embreagem, punho_acelerador, ponteiro_velocimetro
//                                      > ponto_mao_E/D, ponto_farol, ponto_farol_alto, ponto_painel, ponto_seta_frente_E/D, ponto_buzina
//                            > balanca > roda_traseira
//                            > descanso
//                            > bau > bau_tampa ; ponto_entrega (no bau)
//                            > ponto_piloto, ponto_garupa, ponto_pe_E/D, ponto_pe_garupa_E/D, ponto_lanterna, ponto_freio,
//                              ponto_luz_placa, ponto_placa, ponto_seta_tras_E/D, ponto_escapamento, ponto_tanque, ponto_motor, ponto_camera
//                    > ponto_contato_diant, ponto_contato_tras, ponto_descanso_chao (filhos da raiz, no chao)
//   Frente da moto = +Z local (padrao glTF). pc.Entity.forward aponta para -Z, entao a frente no mundo e moto.frente().
//   Esquerda do piloto = +X. Origem no chao, no meio do entre-eixos (1,38 m). Rodas r = 0,29 m. Banco a 0,81 m.
//   Todos os ossos que apontam para cima tem rotacao de repouso identidade; "direcao" e "suspensao_diant" ficam
//   inclinados 27 graus como a coluna e seus filhos compensam. O script guarda o repouso e aplica o movimento por cima.
//
// Meshes do GLB (1 draw call cada): Moto (pintura + atlas), Moto_Bau, Moto_Placa, Luz_Farol, Luz_Posicao, Luz_Seta_E,
//   Luz_Seta_D, Luz_Lanterna (lanterna + luz da placa), Luz_Freio. As luzes saem APAGADAS: moto.luz('Luz_Farol', true).
//
// Uso (entidade com o modelo instanciado + este script):
//   const moto = entidade.script.motoDelivery;
//   moto.velocidade = 8;          // m/s, negativo = re (as rodas giram pela distancia percorrida; o velocimetro acompanha)
//   moto.direcao = 1;             // -1 esquerda .. +1 direita (guidao e inclinacao vao suavizados ate o alvo)
//   moto.freio = 1;               // 0..1: manete de freio + garfo mergulha
//   moto.acelerador = 1;          // 0..1: punho
//   moto.descansoAberto = true;   // abre o descanso lateral (moto parada)
//   moto.bauAberto = true;        // abre a tampa do bau
//   moto.luz('Luz_Freio', true);  // acende (emissive) a luz de freio; moto.luz('Luz_Seta_E', pisca) para as setas
//   piloto.reparent(moto.ponto('ponto_piloto'));   // ponto na superficie do banco
//   moto.ponto('bau').setLocalScale(0, 0, 0);       // esconde o bau (malha com pele: desativar o no nao esconde)
// Colisao: moto_delivery_colisao.glb (casco convexo) ou a caixa halfExtents / offset do PROMPT_integracao_moto_v2.md.
var MotoDelivery = pc.createScript('motoDelivery');

MotoDelivery.attributes.add('velocidade', { type: 'number', default: 0, title: 'Velocidade (m/s)' });
MotoDelivery.attributes.add('direcao', { type: 'number', default: 0, min: -1, max: 1, title: 'Direcao (-1..1)' });
MotoDelivery.attributes.add('freio', { type: 'number', default: 0, min: 0, max: 1, title: 'Freio (0..1)' });
MotoDelivery.attributes.add('acelerador', { type: 'number', default: 0, min: 0, max: 1, title: 'Acelerador (0..1)' });
MotoDelivery.attributes.add('descansoAberto', { type: 'boolean', default: false, title: 'Descanso aberto' });
MotoDelivery.attributes.add('bauAberto', { type: 'boolean', default: false, title: 'Tampa do bau aberta' });
MotoDelivery.attributes.add('anguloDirecao', { type: 'number', default: 28, title: 'Giro max do guidao (graus)' });
MotoDelivery.attributes.add('inclinacaoMax', { type: 'number', default: 10, title: 'Inclinacao max na curva (graus)' });
MotoDelivery.attributes.add('velocidadeInclinacao', { type: 'number', default: 10, title: 'Velocidade da inclinacao max (m/s)' });
MotoDelivery.attributes.add('raioRoda', { type: 'number', default: 0.29, title: 'Raio da roda (m)' });
MotoDelivery.attributes.add('suavizacao', { type: 'number', default: 8, title: 'Suavizacao do guidao' });
MotoDelivery.attributes.add('velocimetroMax', { type: 'number', default: 120, title: 'Fundo de escala do velocimetro (km/h)' });
MotoDelivery.attributes.add('curso', { type: 'number', default: 0.07, title: 'Curso da suspensao dianteira (m)' });

// cor emissiva de cada luz quando acesa (r, g, b)
MotoDelivery.LUZES = {
    Luz_Farol: [1.0, 0.96, 0.82], Luz_Posicao: [0.95, 0.97, 1.0], Luz_Seta_E: [1.0, 0.55, 0.05],
    Luz_Seta_D: [1.0, 0.55, 0.05], Luz_Lanterna: [1.0, 0.06, 0.04], Luz_Freio: [1.0, 0.10, 0.06]
};

MotoDelivery.prototype.initialize = function () {
    this._ossos = {};
    ['chassi', 'direcao', 'suspensao_diant', 'roda_dianteira', 'roda_traseira', 'balanca', 'descanso', 'manete_freio',
        'punho_acelerador', 'ponteiro_velocimetro', 'bau_tampa'].forEach(function (nome) {
        var e = this.entity.findByName(nome);
        if (e) this._ossos[nome] = { entidade: e, repouso: e.getLocalRotation().clone(), pos: e.getLocalPosition().clone() };
        else console.warn('motoDelivery: osso "' + nome + '" nao encontrado');
    }, this);
    this._giroRodas = 0;
    this._guidao = 0;
    this._inclinacao = 0;
    this._mergulho = 0;
    this._descanso = 0;
    this._tampa = 0;
    this._freioVis = 0;
    this._acelVis = 0;
    this._agulha = 0;
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

// acende / apaga uma luz (nome do mesh: Luz_Farol, Luz_Posicao, Luz_Seta_E, Luz_Seta_D, Luz_Lanterna, Luz_Freio).
// intensidade: 0..2 (1 = emissive pleno). O material e clonado por moto, entao cada uma acende sozinha.
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

    // freio: o garfo mergulha e a manete fecha; acelerador gira o punho
    var f = pc.math.clamp(this.freio, 0, 1);
    this._freioVis += (f - this._freioVis) * k;
    this._acelVis += (pc.math.clamp(this.acelerador, 0, 1) - this._acelVis) * k;
    this._mergulho += (this._freioVis * this.curso - this._mergulho) * k;
    var s = this._ossos.suspensao_diant;
    if (s) {                                                   // compressao = roda sobe ao longo do eixo da coluna (+Y local)
        this._v.set(0, this._mergulho, 0);
        s.repouso.transformVector(this._v, this._v);
        s.entidade.setLocalPosition(s.pos.x + this._v.x, s.pos.y + this._v.y, s.pos.z + this._v.z);
    }
    this._girar('manete_freio', 0, -this._freioVis * 18, 0);   // puxa a manete para o punho
    this._girar('punho_acelerador', 0, this._acelVis * 30, 0);
    this._girar('balanca', this._freioVis * -2.0 + this._acelVis * 1.5, 0, 0);   // traseira levanta no freio, senta na aceleracao

    // velocimetro: 0 .. fundo de escala em 270 graus no sentido horario (rotacao negativa em torno do eixo do osso)
    var alvo = pc.math.clamp(Math.abs(this.velocidade) * 3.6 / this.velocimetroMax, 0, 1) * 270;
    this._agulha += (alvo - this._agulha) * (1 - Math.exp(-12 * dt));
    this._girar('ponteiro_velocimetro', 0, -this._agulha, 0);

    // descanso lateral e tampa do bau: giram em torno de X (a tampa abre com rotacao negativa; o descanso desce com -90)
    this._descanso += ((this.descansoAberto ? 1 : 0) - this._descanso) * k * 0.6;
    this._girar('descanso', -90 * this._descanso, 0, 0);
    this._tampa += ((this.bauAberto ? 1 : 0) - this._tampa) * k * 0.6;
    this._girar('bau_tampa', -105 * this._tampa, 0, 0);
};
