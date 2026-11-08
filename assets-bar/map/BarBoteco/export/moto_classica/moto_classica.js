// moto_classica.js - script do PlayCanvas para moto_classica.glb (gerada por BarBoteco\scripts\61_moto_classica_tripo.py:
// a moto classica da Tripo com rodas raiadas novas, textura nova e rig). Mesma API da moto v4 + cor do tanque.
//
// Rig (nomes dos nos no GLB):
//   Moto_Rig > raiz > chassi > direcao > suspensao_diant > roda_dianteira
//                              direcao > manete_freio, manete_embreagem, ponto_mao_E/D, ponto_farol, setas da frente
//                    chassi > balanca > roda_traseira
//                    chassi > descanso, ponto_piloto, ponto_garupa, ponto_pe_*, ponto_lanterna, ponto_escapamento...
//                    raiz   > ponto_contato_diant, ponto_contato_tras, ponto_descanso_chao (no chao)
//   Frente = +Z local (glTF). Esquerda do piloto = +X. Origem no chao, entre os eixos (1,372 m). Rodas r = 0,30 m.
//   Banco a 0,84 m (piloto) / 0,91 m (garupa). Coluna de direcao 26 graus.
//
// Malhas: Moto (2 materiais: Moto_Pintura = tanque, Moto_Atlas), Luz_Farol,
//   Luz_Seta_E, Luz_Seta_D, Luz_Lanterna. Luzes saem APAGADAS.
//
// Uso:
//   const moto = entidade.script.motoClassica;
//   moto.pintar('#8a1010');          // cor do tanque (preto na referencia); '#rrggbb', [r, g, b] (0..1) ou pc.Color
//   moto.velocidade = 8;             // m/s (rodas giram pela distancia)
//   moto.direcao = 1;                // -1 esquerda .. +1 direita
//   moto.freio = 1;                  // 0..1: garfo mergulha e a manete do freio puxa
//   moto.acelerador = 1;             // 0..1: traseira agacha
//   moto.embreagem = 1;              // 0..1: manete da embreagem
//   moto.descansoAberto = true;      // descanso lateral
//   moto.luz('Luz_Lanterna', true);  // acende (emissive)
var MotoClassica = pc.createScript('motoClassica');

MotoClassica.attributes.add('velocidade', { type: 'number', default: 0, title: 'Velocidade (m/s)' });
MotoClassica.attributes.add('direcao', { type: 'number', default: 0, min: -1, max: 1, title: 'Direcao (-1..1)' });
MotoClassica.attributes.add('freio', { type: 'number', default: 0, min: 0, max: 1, title: 'Freio (0..1)' });
MotoClassica.attributes.add('acelerador', { type: 'number', default: 0, min: 0, max: 1, title: 'Acelerador (0..1)' });
MotoClassica.attributes.add('embreagem', { type: 'number', default: 0, min: 0, max: 1, title: 'Embreagem (0..1)' });
MotoClassica.attributes.add('descansoAberto', { type: 'boolean', default: true, title: 'Descanso aberto' });
MotoClassica.attributes.add('cor', { type: 'rgb', default: [0.012, 0.012, 0.014], title: 'Cor do tanque' });
MotoClassica.attributes.add('anguloDirecao', { type: 'number', default: 28, title: 'Giro max do guidao (graus)' });
MotoClassica.attributes.add('inclinacaoMax', { type: 'number', default: 10, title: 'Inclinacao max na curva (graus)' });
MotoClassica.attributes.add('velocidadeInclinacao', { type: 'number', default: 10, title: 'Velocidade da inclinacao max (m/s)' });
MotoClassica.attributes.add('raioRoda', { type: 'number', default: 0.30, title: 'Raio da roda (m)' });
MotoClassica.attributes.add('suavizacao', { type: 'number', default: 8, title: 'Suavizacao' });
MotoClassica.attributes.add('curso', { type: 'number', default: 0.07, title: 'Curso da suspensao dianteira (m)' });

MotoClassica.LUZES = {
    Luz_Farol: [1.0, 0.96, 0.82], Luz_Seta_E: [1.0, 0.55, 0.05], Luz_Seta_D: [1.0, 0.55, 0.05],
    Luz_Lanterna: [1.0, 0.06, 0.04]
};
MotoClassica.OSSOS = ['chassi', 'direcao', 'suspensao_diant', 'roda_dianteira', 'roda_traseira', 'balanca', 'descanso',
    'manete_freio', 'manete_embreagem'];

MotoClassica.prototype.initialize = function () {
    this._ossos = {};
    MotoClassica.OSSOS.forEach(function (nome) {
        var e = this.entity.findByName(nome);
        if (e) this._ossos[nome] = { entidade: e, repouso: e.getLocalRotation().clone(), pos: e.getLocalPosition().clone() };
        else console.warn('motoClassica: osso "' + nome + '" nao encontrado');
    }, this);
    this._giroRodas = 0;
    this._guidao = 0;
    this._inclinacao = 0;
    this._mergulho = 0;
    this._v = { freio: 0, acel: 0, emb: 0, desc: 0 };
    this._q = new pc.Quat();
    this._tmp = new pc.Quat();
    this._vec = new pc.Vec3();
    this._frente = new pc.Vec3();
    this._luzes = {};
    this._mats = {};
    this.pintar(this.cor);
    this.on('attr:cor', function (c) { this.pintar(c); }, this);
};

MotoClassica.prototype.ponto = function (nome) {
    return this.entity.findByName(nome);
};

MotoClassica.prototype.frente = function () {
    return this._frente.copy(this.entity.forward).mulScalar(-1);
};

// cores: '#rrggbb' | [r, g, b] | pc.Color. O material e clonado so para esta moto.
MotoClassica.prototype.pintar = function (c) { this._cor('Moto_Pintura', c); };      // tanque

MotoClassica.prototype._cor = function (nomeMat, c) {
    var cor = new pc.Color(0, 0, 0);
    if (typeof c === 'string') cor.fromString(c);
    else if (Array.isArray(c)) cor.set(c[0], c[1], c[2]);
    else if (c) cor.copy(c);
    var lista = this._mats[nomeMat];
    if (!lista) {
        lista = this._mats[nomeMat] = [];
        var clones = {};
        this.entity.findComponents('render').forEach(function (r) {
            r.meshInstances.forEach(function (mi) {
                if (!mi.material || mi.material.name !== nomeMat) return;
                var id = mi.material.id;
                if (!clones[id]) {
                    clones[id] = mi.material.clone();
                    lista.push(clones[id]);
                }
                mi.material = clones[id];
            });
        });
        if (!lista.length) console.warn('motoClassica: material ' + nomeMat + ' nao encontrado');
    }
    lista.forEach(function (m) {
        m.diffuse = cor;
        m.update();
    });
};

MotoClassica.prototype.luz = function (nome, ligada, intensidade) {
    var l = this._luzes[nome];
    if (!l) {
        var e = this.entity.findByName(nome);
        var r = e && e.render;
        if (!r) return;
        var cor = MotoClassica.LUZES[nome] || [1, 1, 1];
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

MotoClassica.prototype._girar = function (nome, x, y, z) {
    var o = this._ossos[nome];
    if (!o) return;
    this._q.setFromEulerAngles(x, y, z);
    this._tmp.mul2(o.repouso, this._q);
    o.entidade.setLocalRotation(this._tmp);
};

MotoClassica.prototype._ir = function (chave, alvo, k) {
    this._v[chave] += (alvo - this._v[chave]) * k;
    return this._v[chave];
};

MotoClassica.prototype.update = function (dt) {
    var k = 1 - Math.exp(-this.suavizacao * dt);
    var kr = 1 - Math.exp(-this.suavizacao * 2 * dt);
    var dir = pc.math.clamp(this.direcao, -1, 1);
    this._guidao += (dir * this.anguloDirecao - this._guidao) * k;
    var fator = pc.math.clamp(Math.abs(this.velocidade) / this.velocidadeInclinacao, 0, 1);
    this._inclinacao += (dir * this.inclinacaoMax * fator - this._inclinacao) * k;
    this._giroRodas = (this._giroRodas + this.velocidade * dt / this.raioRoda * pc.math.RAD_TO_DEG) % 360;

    this._girar('roda_dianteira', this._giroRodas, 0, 0);
    this._girar('roda_traseira', this._giroRodas, 0, 0);
    this._girar('direcao', 0, -this._guidao, 0);
    this._girar('chassi', 0, 0, this._inclinacao);

    var freio = this._ir('freio', pc.math.clamp(this.freio, 0, 1), kr);
    var acel = this._ir('acel', pc.math.clamp(this.acelerador, 0, 1), kr);
    var emb = this._ir('emb', pc.math.clamp(this.embreagem, 0, 1), kr);
    this._mergulho += (freio * this.curso - this._mergulho) * k;
    var s = this._ossos.suspensao_diant;
    if (s) {
        this._vec.set(0, this._mergulho, 0);
        s.repouso.transformVector(this._vec, this._vec);
        s.entidade.setLocalPosition(s.pos.x + this._vec.x, s.pos.y + this._vec.y, s.pos.z + this._vec.z);
    }
    this._girar('balanca', freio * -2.0 + acel * 1.5, 0, 0);

    // manetes giram no pino (eixo vertical do osso)
    this._girar('manete_freio', 0, -16 * freio, 0);
    this._girar('manete_embreagem', 0, 16 * emb, 0);

    // descanso: o da Tripo esta aberto no repouso (apoiado no chao); recolher = girar para tras e para cima
    var desc = this._ir('desc', this.descansoAberto ? 0 : 1, k * 0.6);
    this._girar('descanso', 85 * desc, 0, 0);
};
