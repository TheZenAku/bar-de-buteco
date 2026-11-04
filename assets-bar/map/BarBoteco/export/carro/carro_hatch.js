// carro_hatch.js - script do PlayCanvas para carro_hatch.glb (gerado por scripts\21_carro_hatch.py)
//
// Hatch 3 portas anos 80 (estilo PS2/PS3). Medidas: 1,73 x 1,39 x 3,71 m (L x A x C com espelhos; lataria 1,51),
// entre-eixos 2,314 m, bitola 1,33 m, rodas r = 0,285 m. Origem no chao, no meio do entre-eixos.
// Frente do carro = +Z local (padrao glTF, igual a moto e ao personagem do Mixamo); esquerda do motorista = +X;
// motorista sentado a esquerda. pc.Entity.forward aponta para -Z, entao a frente no mundo e carro.frente().
//
// Rig (nomes dos nos no GLB):
//   Carro_Rig > raiz > chassi > porta_E, porta_D, capo, tampa_traseira (> limpador_traseiro, ponto_placa_tras),
//                               volante (> ponto_mao_E, ponto_mao_D), limpador_E, limpador_D, ponto_*
//                    > direcao_E > roda_dianteira_E      direcao_D > roda_dianteira_D
//                    > roda_traseira_E, roda_traseira_D, ponto_porta_E, ponto_porta_D
//   Todos os ossos tem rotacao de repouso identidade, menos volante (eixo Y = coluna de direcao) e os 3 limpadores
//   (eixo Y = normal do vidro). O script guarda o repouso e aplica o movimento por cima.
//   Malhas (pele rigida, todas no mesmo esqueleto): Carro (materiais Carro_Pintura + Carro_Atlas), Carro_Vidros,
//   Carro_Placas, Luz_Farol, Luz_Lanterna, Luz_Re, Luz_Seta_E, Luz_Seta_D. Malha com pele nao some desativando o
//   no: para esconder uma peca, ponha escala 0 no osso dela.
//
// Uso (entidade com o modelo instanciado + este script):
//   const carro = entidade.script.carroHatch;
//   carro.velocidade = 10;          // m/s, negativo = re (rodas giram pela distancia; luz de re acende sozinha)
//   carro.direcao = -1;             // -1 esquerda .. +1 direita (rodas, volante e rolagem suavizados)
//   carro.freio = true;             // luz de freio
//   carro.farol = 1;                // 0 apagado, 1 baixo, 2 alto (lanterna acende junto)
//   carro.seta = 'E';               // '', 'E', 'D' ou 'alerta'
//   carro.portaE = 1;               // 0 fechada .. 1 aberta (tambem portaD, capo, tampa)
//   carro.limpadores = true;
//   carro.definirCor(0.55, 0.05, 0.05);     // cor da pintura (so desta instancia)
//   carro.definirPlaca('BAR1H26');          // placa Mercosul desenhada em canvas (frente e tras)
//   motorista.reparent(carro.ponto('ponto_motorista'));   // ponto no assento; abaixe pela altura do quadril
// Colisao: carro_hatch_colisao.glb (casco convexo 228 tri) ou caixa halfExtents (0.76, 0.56, 1.80) com
//   linearOffset (0, 0.82, 0).
var CarroHatch = pc.createScript('carroHatch');

CarroHatch.attributes.add('velocidade', { type: 'number', default: 0, title: 'Velocidade (m/s)' });
CarroHatch.attributes.add('direcao', { type: 'number', default: 0, min: -1, max: 1, title: 'Direcao (-1..1)' });
CarroHatch.attributes.add('anguloDirecao', { type: 'number', default: 33, title: 'Giro max das rodas (graus)' });
CarroHatch.attributes.add('voltasVolante', { type: 'number', default: 1.4, title: 'Voltas do volante (batente a batente / 2)' });
CarroHatch.attributes.add('rolagemMax', { type: 'number', default: 3.5, title: 'Rolagem max na curva (graus)' });
CarroHatch.attributes.add('raioRoda', { type: 'number', default: 0.285, title: 'Raio da roda (m)' });
CarroHatch.attributes.add('suavizacao', { type: 'number', default: 7, title: 'Suavizacao' });
CarroHatch.attributes.add('freio', { type: 'boolean', default: false });
CarroHatch.attributes.add('farol', { type: 'number', default: 0, title: 'Farol (0, 1, 2)' });
CarroHatch.attributes.add('seta', { type: 'string', default: '', title: "Seta ('', 'E', 'D', 'alerta')" });
CarroHatch.attributes.add('portaE', { type: 'number', default: 0, min: 0, max: 1 });
CarroHatch.attributes.add('portaD', { type: 'number', default: 0, min: 0, max: 1 });
CarroHatch.attributes.add('capo', { type: 'number', default: 0, min: 0, max: 1 });
CarroHatch.attributes.add('tampa', { type: 'number', default: 0, min: 0, max: 1 });
CarroHatch.attributes.add('limpadores', { type: 'boolean', default: false });
CarroHatch.attributes.add('luzesReais', { type: 'boolean', default: true, title: 'Criar luzes de verdade (farol, freio)' });
CarroHatch.attributes.add('cor', { type: 'rgb', default: [0.80, 0.79, 0.76], title: 'Cor da pintura' });

// abertura maxima (graus) e eixo local de cada peca movel; o sinal ja abre para o lado certo
var ABERTURAS = {
    portaE: { osso: 'porta_E', eixo: 'y', graus: -68 },
    portaD: { osso: 'porta_D', eixo: 'y', graus: 68 },
    capo: { osso: 'capo', eixo: 'x', graus: -52 },
    tampa: { osso: 'tampa_traseira', eixo: 'x', graus: 78 }
};
var LUZES = ['Luz_Farol', 'Luz_Lanterna', 'Luz_Re', 'Luz_Seta_E', 'Luz_Seta_D'];

CarroHatch.prototype.initialize = function () {
    this._ossos = {};
    ['chassi', 'volante', 'direcao_E', 'direcao_D', 'roda_dianteira_E', 'roda_dianteira_D', 'roda_traseira_E',
        'roda_traseira_D', 'porta_E', 'porta_D', 'capo', 'tampa_traseira', 'limpador_E', 'limpador_D',
        'limpador_traseiro'].forEach(function (nome) {
        var e = this.entity.findByName(nome);
        if (e) this._ossos[nome] = { entidade: e, repouso: e.getLocalRotation().clone() };
        else console.warn('carroHatch: osso "' + nome + '" nao encontrado');
    }, this);
    this._giroRodas = 0;
    this._esterco = 0;
    this._rolagem = 0;
    this._abre = { portaE: 0, portaD: 0, capo: 0, tampa: 0 };
    this._limpa = 0;
    this._fasePisca = 0;
    this._q = new pc.Quat();
    this._tmp = new pc.Quat();
    this._frente = new pc.Vec3();
    this._materiais();
    this._luzesReais();
    var c = this._corPedida || [this.cor.r, this.cor.g, this.cor.b];
    this.definirCor(c[0], c[1], c[2]);
    if (this._placaPedida) this.definirPlaca(this._placaPedida);
    this.on('attr:cor', function (c) { this.definirCor(c.r, c.g, c.b); }, this);
    this.on('destroy', function () {
        if (this._texPlaca) this._texPlaca.destroy();
    }, this);
};

// no do rig pelo nome (pontos de encaixe, ossos)
CarroHatch.prototype.ponto = function (nome) {
    return this.entity.findByName(nome);
};

// frente do carro no mundo (+Z local)
CarroHatch.prototype.frente = function () {
    return this._frente.copy(this.entity.forward).mulScalar(-1);
};

// cada instancia ganha copias proprias dos materiais que mudam (pintura, placa e lentes)
CarroHatch.prototype._materiais = function () {
    this._mat = {};
    var self = this;
    this.entity.findComponents('render').forEach(function (r) {
        r.meshInstances.forEach(function (mi) {
            var nome = mi.material && mi.material.name;
            if (nome === 'Carro_Pintura' || nome === 'Carro_Placa' || LUZES.indexOf(nome) >= 0) {
                if (!self._mat[nome]) self._mat[nome] = mi.material.clone();
                mi.material = self._mat[nome];
            }
        });
    });
    LUZES.forEach(function (nome) { self._acender(nome, 0); });
};

CarroHatch.prototype._acender = function (nome, intensidade) {
    var m = this._mat[nome];
    if (!m) return;
    if (m._ligado === intensidade) return;
    m._ligado = intensidade;
    m.emissive = intensidade > 0 ? pc.Color.WHITE : pc.Color.BLACK;
    m.emissiveIntensity = intensidade;
    m.update();
};

// pode ser chamado antes do initialize: o pedido fica guardado e e aplicado quando os materiais existirem
CarroHatch.prototype.definirCor = function (r, g, b) {
    this._corPedida = [r, g, b];
    var m = this._mat && this._mat.Carro_Pintura;
    if (!m) return;
    m.diffuse = new pc.Color(r, g, b);
    m.update();
};

// placa Mercosul 40 x 13 cm desenhada num canvas (a mesma textura serve para a frente e para tras)
CarroHatch.prototype.definirPlaca = function (texto) {
    this._placaPedida = texto;
    var m = this._mat && this._mat.Carro_Placa;
    if (!m) return;
    var c = document.createElement('canvas');
    c.width = 512;
    c.height = 168;
    var g = c.getContext('2d');
    g.fillStyle = '#f4f4f4';
    g.fillRect(0, 0, 512, 168);
    g.fillStyle = '#0d348c';
    g.fillRect(4, 4, 504, 30);
    g.fillStyle = '#1a733a';
    g.fillRect(14, 10, 24, 18);
    g.fillStyle = '#f2cc1a';
    g.fillRect(20, 14, 12, 10);
    g.fillStyle = '#ffffff';
    g.font = 'bold 22px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('BRASIL', 256, 20);
    g.fillStyle = '#111111';
    g.font = 'bold 96px "Arial Narrow", Arial, sans-serif';
    g.fillText(String(texto || '').toUpperCase().slice(0, 7), 256, 104, 480);
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 506, 162);
    var tex = new pc.Texture(this.app.graphicsDevice, { width: 512, height: 168, mipmaps: true });
    tex.setSource(c);
    if (this._texPlaca) this._texPlaca.destroy();
    this._texPlaca = tex;
    m.diffuseMap = tex;
    m.update();
};

CarroHatch.prototype._luzesReais = function () {
    this._luz = {};
    if (!this.luzesReais) return;
    var criar = function (pai, nome, opcoes, pos, rot) {
        if (!pai) return null;
        var e = new pc.Entity(nome);
        e.addComponent('light', opcoes);
        e.setLocalPosition(pos[0], pos[1], pos[2]);
        if (rot) e.setLocalEulerAngles(rot[0], rot[1], rot[2]);
        pai.addChild(e);
        e.enabled = false;
        return e;
    };
    var quente = new pc.Color(1.0, 0.92, 0.78);
    var vermelho = new pc.Color(1.0, 0.08, 0.05);
    // spot do PlayCanvas aponta para -Y; -86 graus em X aponta para a frente (+Z), um pouco para baixo
    this._luz.farolE = criar(this.ponto('ponto_farol_E'), 'Farol E', { type: 'spot', color: quente, range: 28,
        intensity: 2.2, innerConeAngle: 18, outerConeAngle: 34, castShadows: false }, [0, 0, 0.05], [-86, 0, 0]);
    this._luz.farolD = criar(this.ponto('ponto_farol_D'), 'Farol D', { type: 'spot', color: quente, range: 28,
        intensity: 2.2, innerConeAngle: 18, outerConeAngle: 34, castShadows: false }, [0, 0, 0.05], [-86, 0, 0]);
    this._luz.freio = criar(this.ponto('ponto_porta_malas'), 'Freio', { type: 'omni', color: vermelho, range: 3.5,
        intensity: 1.2, castShadows: false }, [0, -0.25, -0.75]);
};

CarroHatch.prototype._girar = function (nome, x, y, z) {
    var o = this._ossos[nome];
    if (!o) return;
    this._q.setFromEulerAngles(x, y, z);
    this._tmp.mul2(o.repouso, this._q);
    o.entidade.setLocalRotation(this._tmp);
};

CarroHatch.prototype.update = function (dt) {
    var k = 1 - Math.exp(-this.suavizacao * dt);
    var dir = pc.math.clamp(this.direcao, -1, 1);
    this._esterco += (dir * this.anguloDirecao - this._esterco) * k;
    var fator = pc.math.clamp(Math.abs(this.velocidade) / 15, 0, 1);
    this._rolagem += (dir * this.rolagemMax * fator - this._rolagem) * k;
    this._giroRodas = (this._giroRodas + this.velocidade * dt / this.raioRoda * pc.math.RAD_TO_DEG) % 360;

    // rodas: +X local rola para a frente; direcao_*: +Y local vira para a esquerda (direcao +1 = direita)
    ['roda_dianteira_E', 'roda_dianteira_D', 'roda_traseira_E', 'roda_traseira_D'].forEach(function (n) {
        this._girar(n, this._giroRodas, 0, 0);
    }, this);
    this._girar('direcao_E', 0, -this._esterco, 0);
    this._girar('direcao_D', 0, -this._esterco, 0);
    // volante gira no eixo da coluna (+Y local = sentido anti-horario visto pelo motorista = esquerda)
    this._girar('volante', 0, -this._esterco / this.anguloDirecao * this.voltasVolante * 360 / 2, 0);
    // rolagem: na curva para a direita o topo vai para a esquerda (+X), que e rotacao negativa em Z
    this._girar('chassi', 0, 0, -this._rolagem);

    // portas, capo e tampa (abertura suave ate o alvo 0..1)
    var ka = 1 - Math.exp(-4 * dt);
    for (var chave in ABERTURAS) {
        var a = ABERTURAS[chave];
        this._abre[chave] += (pc.math.clamp(this[chave], 0, 1) - this._abre[chave]) * ka;
        var g = this._abre[chave] * a.graus;
        this._girar(a.osso, a.eixo === 'x' ? g : 0, a.eixo === 'y' ? g : 0, 0);
    }

    // limpadores: vai e volta (~1 ciclo a cada 1,6 s); param na posicao de descanso
    if (this.limpadores || this._limpa > 0.001) {
        this._limpa += dt / 1.6;
        if (!this.limpadores && this._limpa % 1 < 0.02) this._limpa = 0;
    }
    var s = Math.sin(Math.PI * (this._limpa % 1));
    this._girar('limpador_E', 0, -82 * s, 0);
    this._girar('limpador_D', 0, -82 * s, 0);
    this._girar('limpador_traseiro', 0, -165 * s, 0);

    // luzes: emissivo das lentes + luzes reais
    this._fasePisca = (this._fasePisca + dt * 1.6) % 1;
    var pisca = this._fasePisca < 0.5 ? 1 : 0;
    var re = this.velocidade < -0.05;
    var farol = this.farol | 0;
    this._acender('Luz_Farol', farol === 0 ? 0 : (farol === 1 ? 2.0 : 3.5));
    this._acender('Luz_Lanterna', this.freio ? 3.0 : (farol > 0 ? 1.2 : 0));
    this._acender('Luz_Re', re ? 2.5 : 0);
    var seta = this.seta;
    this._acender('Luz_Seta_E', (seta === 'E' || seta === 'alerta') ? 2.5 * pisca : 0);
    this._acender('Luz_Seta_D', (seta === 'D' || seta === 'alerta') ? 2.5 * pisca : 0);
    if (this._luz.farolE) {
        var alto = farol === 2;
        this._luz.farolE.enabled = this._luz.farolD.enabled = farol > 0;
        this._luz.farolE.light.range = this._luz.farolD.light.range = alto ? 45 : 28;
        this._luz.farolE.light.intensity = this._luz.farolD.light.intensity = alto ? 3.2 : 2.2;
    }
    if (this._luz.freio) this._luz.freio.enabled = this.freio;
};
