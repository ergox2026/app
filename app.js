'use strict';

// ================================================================
//  ERGO X — app.js  (completo: login, opções gerenciáveis,
//  filtro por cliente, gráfico de linha, tema escuro)
// ================================================================

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzkkG-HAbqLGbInZYH2zPE02QAw0czwXZ6QT0b_sqMVBSv1CreAwv4aYmXvIpgQryah/exec',
  SHEETS: { AET: 'AET', PA: 'PA', CLIENTES: 'CLIENTES', FISIO: 'FISIO' }
};

// ================================================================
//  STATE
// ================================================================
const State = {
  aet:  [],
  pa:   [],
  fisio: [],
  session: null,
  charts: {
    aetGenero: null, aetCrit: null,
    paStatus: null, paCrit: null, paEvolucao: null,
    fisioGenero: null, fisioFaixa: null, fisioEvolucao: null
  },
  editTarget: null
};

// ================================================================
//  API
// ================================================================
const API = {
  isConfigured() {
    return !!(CONFIG.API_URL && CONFIG.API_URL.startsWith('https://'));
  },

  encodeData(obj) {
    const json  = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    const bin   = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    return btoa(bin);
  },

  async call(params) {
    const url = new URL(CONFIG.API_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    const res  = await fetch(url.toString());
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Erro desconhecido');
    return json.data;
  },

  async loginUser(usuario, senha) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('action',  'login');
    url.searchParams.set('usuario', usuario);
    url.searchParams.set('senha',   senha);
    const res  = await fetch(url.toString());
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Erro de autenticação');
    return json.data;   // { ok, nome, tipo, cliente }
  },

  read(sheet)                 { return this.call({ action: 'read', sheet }); },
  create(sheet, data)         { return this.call({ action: 'create', sheet, data: this.encodeData(data) }); },
  update(sheet, rowNum, data) { return this.call({ action: 'update', sheet, rowNum, data: this.encodeData(data) }); },
  delete(sheet, rowNum)       { return this.call({ action: 'delete', sheet, rowNum }); },
  readClients()               { return this.read(CONFIG.SHEETS.CLIENTES); },
  createClient(data)          { return this.create(CONFIG.SHEETS.CLIENTES, data); },
  deleteClient(rowNum)        { return this.delete(CONFIG.SHEETS.CLIENTES, rowNum); },
  readFisio()                 { return this.read(CONFIG.SHEETS.FISIO); }
};

// ================================================================
//  AUTH — Login / Sessão
// ================================================================
const Auth = {
  KEY: 'ergo_session',

  get() {
    const s = sessionStorage.getItem(this.KEY);
    return s ? JSON.parse(s) : null;
  },

  set(s) {
    sessionStorage.setItem(this.KEY, JSON.stringify(s));
    State.session = s;
  },

  clear() {
    sessionStorage.removeItem(this.KEY);
    State.session = null;
  },

  isAdmin()  { return State.session && State.session.tipo === 'admin'; },
  isClient() { return State.session && State.session.tipo === 'cliente'; },

  async handleLogin(event) {
    event.preventDefault();
    const user  = document.getElementById('login-user').value.trim();
    const pass  = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');
    const btn   = document.getElementById('btnLogin');

    errEl.textContent = '';
    btn.disabled = true;
    btn.querySelector('.btn-login-text').textContent    = 'Entrando…';
    btn.querySelector('.btn-login-spinner').style.display = 'inline-block';

    try {
      const result = await API.loginUser(user, pass);
      if (result.ok) {
        this.set(result);
        this.applySession();
      } else {
        errEl.textContent = result.error || 'Usuário ou senha incorretos.';
      }
    } catch (e) {
      errEl.textContent = 'Erro de conexão. Verifique a URL do Apps Script.';
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-login-text').textContent    = 'Entrar';
      btn.querySelector('.btn-login-spinner').style.display = 'none';
    }
  },

  logout() {
    this.clear();
    location.reload();
  },

  applySession() {
    const s = State.session;
    if (!s) return;

    document.getElementById('loginScreen').style.display  = 'none';
    document.getElementById('appWrapper').style.display   = 'block';
    document.getElementById('userChip').textContent =
      (this.isAdmin() ? '⚙ ' : '👤 ') + (s.nome || s.usuario);

    // Mostrar/ocultar elementos exclusivos de admin
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = this.isAdmin() ? '' : 'none';
    });

    // Navegar para aba inicial conforme perfil
    const startTab = this.isAdmin() ? 'lancamentos' : 'aet';
    const startBtn = document.querySelector(`[data-tab="${startTab}"]`);
    if (startBtn) {
      startBtn.style.display = '';   // garante visibilidade
      startBtn.click();
    }

    App.refresh();
  }
};

// ================================================================
//  OPTIONS — Dropdowns gerenciáveis (localStorage)
// ================================================================
const Options = {
  DEFAULTS: {
    SETOR_AET:       [],
    POSTO_AET:       [],
    CRITICIDADE_AET: ['ALTÍSSIMO RISCO', 'ALTO', 'MODERADO', 'BAIXO', 'AUSÊNCIA DE RISCO', 'EXTINTO'],
    GENERO_AET:      ['Masculino', 'Feminino', 'Unissex'],
    GERENTE_AET:     [],
    SETOR_PA:        [],
    POSTO_PA:        [],
    CRITICIDADE_PA:  ['ALTÍSSIMO RISCO', 'ALTO', 'MODERADO', 'BAIXO'],
    CLASSIFICACAO_PA:['Ação Normativa', 'Sugestão de Melhoria', 'Engenharia'],
    GERENTE_PA:      [],
    RESPONSAVEL_PA:  [],
    SETOR_FISIO:     [],
    GENERO_FISIO:    ['Masculino', 'Feminino'],
    PARECER_FISIO:   ['Aprovado', 'Aprovado com Restrição', 'Reprovado'],
    CLIENTE:         []
  },

  get(key) {
    const s = localStorage.getItem('ergo_opts_' + key);
    return s ? JSON.parse(s) : [...(this.DEFAULTS[key] || [])];
  },

  set(key, vals) {
    localStorage.setItem('ergo_opts_' + key, JSON.stringify(vals));
  },

  add(key, val) {
    val = val.trim();
    if (!val) return false;
    const vals = this.get(key);
    if (!vals.includes(val)) { vals.push(val); this.set(key, vals); }
    return true;
  },

  remove(key, val) {
    this.set(key, this.get(key).filter(v => v !== val));
  },

  populate(selectId, key, selected = '') {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const vals  = this.get(key);
    const first = sel.options[0]
      ? sel.options[0].cloneNode(true)
      : Object.assign(document.createElement('option'), { value: '', textContent: 'Selecione…' });
    sel.innerHTML = '';
    sel.appendChild(first);
    vals.forEach(v => {
      const o = document.createElement('option');
      o.value = o.textContent = v;
      if (v === selected) o.selected = true;
      sel.appendChild(o);
    });
  },

  addUI(key, selectId) {
    const val = prompt('Digite o nome da nova opção para adicionar à lista:');
    if (!val || !val.trim()) return;
    this.add(key, val.trim());
    this.populate(selectId, key, val.trim());
  },

  removeUI(key, selectId) {
    const sel = document.getElementById(selectId);
    if (!sel || !sel.value) {
      alert('Selecione uma opção na lista antes de remover.');
      return;
    }
    const val = sel.value;
    if (!confirm(`Remover a opção "${val}" desta lista?`)) return;
    this.remove(key, val);
    this.populate(selectId, key);
  },

  initAll() {
    const pairs = [
      ['f-aet-CLIENTE',          'CLIENTE'],
      ['f-aet-SETOR',            'SETOR_AET'],
      ['f-aet-POSTO_TRABALHO',   'POSTO_AET'],
      ['f-aet-CRITICIDADE_ATUAL','CRITICIDADE_AET'],
      ['f-aet-POSTO_GENERO',     'GENERO_AET'],
      ['f-aet-GERENTE',          'GERENTE_AET'],
      ['f-pa-CLIENTE',           'CLIENTE'],
      ['f-pa-SETOR',             'SETOR_PA'],
      ['f-pa-POSTO_TRABALHO',    'POSTO_PA'],
      ['f-pa-CRITICIDADE',       'CRITICIDADE_PA'],
      ['f-pa-CLASSIFICACAO',     'CLASSIFICACAO_PA'],
      ['f-pa-GERENTE',           'GERENTE_PA'],
      ['f-pa-RESPONSAVEL',       'RESPONSAVEL_PA'],
      ['f-fisio-CLIENTE',        'CLIENTE'],
      ['f-fisio-SETOR',          'SETOR_FISIO'],
      ['f-fisio-GENERO',         'GENERO_FISIO'],
      ['f-fisio-PARECER',        'PARECER_FISIO'],
    ];
    pairs.forEach(([id, key]) => this.populate(id, key));
  }
};

// ================================================================
//  UTILS
// ================================================================
const Utils = {
  esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  truncate(str, n = 75) {
    const s = str || '';
    return s.length > n ? s.slice(0, n) + '…' : s;
  },

  formatDate(val) {
    if (!val) return '—';
    const d = new Date(val + 'T00:00:00');
    return isNaN(d) ? String(val) : d.toLocaleDateString('pt-BR');
  },

  unique(arr, key) {
    return [...new Set(arr.map(r => r[key]).filter(Boolean))].sort();
  },

  fillSelect(id, values) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur   = sel.value;
    const first = sel.options[0].cloneNode(true);
    sel.innerHTML = '';
    sel.appendChild(first);
    values.forEach(v => {
      const o = document.createElement('option');
      o.value = o.textContent = v;
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  },

  critBadge(val) {
    const v = (val || '').toUpperCase().trim();
    const map = {
      'ALTÍSSIMO RISCO': 'altissimo',
      'ALTO':            'alto',
      'MODERADO':        'moderado',
      'BAIXO':           'baixo',
      'AUSÊNCIA DE RISCO': 'ausencia',
      'EXTINTO':         'extinto',
      'DESATIVADO':      'extinto'
    };
    const cls = map[v] || 'extinto';
    return `<span class="badge badge-${cls}">${Utils.esc(val) || '—'}</span>`;
  },

  semaforo(r) {
    const s = (r.STATUS || '').toUpperCase();
    if (s === 'CONCLUÍDO' || s === 'OK' || r.DATA_CONCLUSAO)
      return { label: 'CONCLUÍDO',    cls: 'sem-verde' };
    if (s === 'NÃO INICIADO')
      return { label: 'NÃO INICIADO', cls: 'sem-cinza' };
    if (r.DATA_PREVISTA && new Date(r.DATA_PREVISTA + 'T00:00:00') < new Date())
      return { label: 'ATRASADO',     cls: 'sem-vermelho' };
    return { label: 'EM ANDAMENTO',   cls: 'sem-amarelo' };
  },

  toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className   = `toast show ${type}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.className = 'toast'), 3500);
  },

  critOpts(selected, isPA = false) {
    const list = isPA
      ? ['ALTÍSSIMO RISCO','ALTO','MODERADO','BAIXO']
      : ['ALTÍSSIMO RISCO','ALTO','MODERADO','BAIXO','AUSÊNCIA DE RISCO','EXTINTO'];
    return list.map(c => `<option${c === selected ? ' selected' : ''}>${c}</option>`).join('');
  },

  selectOpts(list, selected) {
    return list.map(v =>
      `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`
    ).join('');
  },

  dateValue(val) {
    if (!val) return '';
    const d = new Date(val + 'T00:00:00');
    return isNaN(d) ? '' : d.toISOString().split('T')[0];
  }
};

// ================================================================
//  CHARTS helpers
// ================================================================
// Paleta de risco
const RISK_COLORS = {
  'ALTÍSSIMO RISCO': '#a855f7',
  'ALTO':            '#ef4444',
  'MODERADO':        '#f59e0b',
  'BAIXO':           '#22c55e',
  'AUSÊNCIA DE RISCO':'#60a5fa',
  'EXTINTO':         '#6b7280'
};

const Charts = {
  destroy(key) {
    if (State.charts[key]) { State.charts[key].destroy(); State.charts[key] = null; }
  },

  // Cores de legenda / ticks para tema escuro
  _legendStyle: {
    color: 'rgba(221,232,245,.7)',
    boxWidth: 12,
    padding: 12,
    font: { size: 11 }
  },
  _tickStyle: { color: 'rgba(221,232,245,.5)', font: { size: 11 } },
  _gridStyle: { color: 'rgba(255,255,255,.06)' },

  donut(key, canvasId, labels, data, colors) {
    this.destroy(key);
    const ctx   = document.getElementById(canvasId);
    if (!ctx) return;
    const total = data.reduce((s, v) => s + v, 0);
    State.charts[key] = new Chart(ctx, {
      type: 'doughnut',
      plugins: [ChartDataLabels],
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: 'rgba(6,16,30,.8)' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: this._legendStyle },
          datalabels: {
            display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
            formatter: (v) => {
              const pct = total > 0 ? Math.round(v / total * 100) : 0;
              return pct > 0 ? pct + '%' : '';
            },
            color: '#fff',
            font: { size: 12, weight: 'bold' }
          }
        }
      }
    });
  },

  barStacked(key, canvasId, labels, datasets) {
    this.destroy(key);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    State.charts[key] = new Chart(ctx, {
      type: 'bar',
      plugins: [ChartDataLabels],
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: { ...this._tickStyle, maxRotation: 35 }
          },
          y: { stacked: true, display: false }
        },
        plugins: {
          legend: { position: 'bottom', labels: this._legendStyle },
          datalabels: {
            anchor: 'center', align: 'center',
            formatter: v => v > 0 ? v : '',
            font: { size: 11, weight: 'bold' },
            color: '#fff'
          }
        },
        layout: { padding: { top: 8 } }
      }
    });
  },

  bar(key, canvasId, labels, datasets, stacked = false) {
    this.destroy(key);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    State.charts[key] = new Chart(ctx, {
      type: 'bar',
      plugins: [ChartDataLabels],
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: {
            stacked,
            grid: { display: false },
            border: { display: false },
            ticks: { ...this._tickStyle, maxRotation: 35 }
          },
          y: { stacked, display: false }
        },
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: 'bottom',
            labels: this._legendStyle
          },
          datalabels: {
            anchor: 'end', align: 'end',
            formatter: v => v > 0 ? v : '',
            font: { size: 11, weight: 'bold' },
            color: 'rgba(221,232,245,.8)',
            clamp: true
          }
        },
        layout: { padding: { top: 22 } }
      }
    });
  },

  line(key, canvasId, labels, datasets) {
    this.destroy(key);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    State.charts[key] = new Chart(ctx, {
      type: 'line',
      plugins: [ChartDataLabels],
      data: {
        labels,
        datasets: datasets.map(ds => ({
          ...ds,
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.4,
          pointBackgroundColor: ds.borderColor,
          pointBorderColor: 'rgba(6,16,30,.8)',
          pointBorderWidth: 2
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: this._tickStyle
          },
          y: {
            grid: this._gridStyle,
            border: { display: false },
            ticks: { ...this._tickStyle, precision: 0 }
          }
        },
        plugins: {
          legend: { position: 'bottom', labels: this._legendStyle },
          datalabels: { display: false }
        }
      }
    });
  }
};

// ================================================================
//  AET MODULE
// ================================================================
const AET = {
  f: { cliente: '', setor: '', criticidade: '', genero: '', mes: '', ano: '', gerente: '', q: '' },

  // Extrai mês (string '1'-'12') e ano (string '2024') da data ATUALIZACAO
  _mesAno(r) {
    if (!r.ATUALIZACAO) return { mes: '', ano: '' };
    const dt = new Date(String(r.ATUALIZACAO) + 'T00:00:00');
    if (isNaN(dt)) return { mes: '', ano: '' };
    return { mes: String(dt.getMonth() + 1), ano: String(dt.getFullYear()) };
  },

  load(data) {
    // Filtra por cliente se for usuário cliente
    State.aet = Auth.isClient()
      ? data.filter(r => (r.CLIENTE || '') === (State.session.cliente || ''))
      : data;

    Utils.fillSelect('aet-filter-setor',   Utils.unique(State.aet, 'SETOR'));
    Utils.fillSelect('aet-filter-gerente', Utils.unique(State.aet, 'GERENTE'));
    // Ano derivado de ATUALIZACAO
    const anos = [...new Set(State.aet.map(r => this._mesAno(r).ano).filter(Boolean))].sort();
    Utils.fillSelect('aet-filter-ano', anos);
    // Cliente (só admin vê)
    if (Auth.isAdmin()) Utils.fillSelect('aet-filter-cliente', Utils.unique(State.aet, 'CLIENTE'));
    this.apply();
  },

  onFilter() {
    this.f.cliente     = (document.getElementById('aet-filter-cliente') || {}).value || '';
    this.f.setor       = document.getElementById('aet-filter-setor').value;
    this.f.criticidade = document.getElementById('aet-filter-criticidade').value;
    this.f.genero      = document.getElementById('aet-filter-genero').value;
    this.f.mes         = document.getElementById('aet-filter-mes').value;
    this.f.ano         = document.getElementById('aet-filter-ano').value;
    this.f.gerente     = document.getElementById('aet-filter-gerente').value;
    this.apply();
  },

  search(q) { this.f.q = q; this.apply(); },

  clearFilters() {
    this.f = { cliente: '', setor: '', criticidade: '', genero: '', mes: '', ano: '', gerente: '', q: '' };
    ['aet-filter-cliente','aet-filter-setor','aet-filter-criticidade','aet-filter-genero',
     'aet-filter-mes','aet-filter-ano','aet-filter-gerente']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const s = document.getElementById('aet-search'); if (s) s.value = '';
    this.apply();
  },

  apply() {
    let d = [...State.aet];
    const f = this.f;
    if (f.cliente)     d = d.filter(r => (r.CLIENTE || '') === f.cliente);
    if (f.setor)       d = d.filter(r => r.SETOR === f.setor);
    if (f.criticidade) d = d.filter(r => (r.CRITICIDADE_ATUAL || '').toUpperCase() === f.criticidade.toUpperCase());
    if (f.genero)      d = d.filter(r => r.POSTO_GENERO === f.genero);
    if (f.mes)         d = d.filter(r => this._mesAno(r).mes === f.mes);
    if (f.ano)         d = d.filter(r => this._mesAno(r).ano === f.ano);
    if (f.gerente)     d = d.filter(r => r.GERENTE === f.gerente);
    if (f.q) {
      const q = f.q.toLowerCase();
      d = d.filter(r =>
        (r.SETOR        || '').toLowerCase().includes(q) ||
        (r.POSTO_TRABALHO || '').toLowerCase().includes(q) ||
        (r.GERENTE      || '').toLowerCase().includes(q)
      );
    }
    this.renderCards(d);
    this.renderCharts(d);
    this.renderTable(d);
  },

  cnt(data, crit) {
    return data.filter(r => (r.CRITICIDADE_ATUAL || '').toUpperCase() === crit.toUpperCase()).length;
  },

  renderCards(d) {
    document.getElementById('aet-total').textContent     = d.length;
    document.getElementById('aet-altissimo').textContent = this.cnt(d, 'ALTÍSSIMO RISCO');
    document.getElementById('aet-alto').textContent      = this.cnt(d, 'ALTO');
    document.getElementById('aet-moderado').textContent  = this.cnt(d, 'MODERADO');
    document.getElementById('aet-baixo').textContent     = this.cnt(d, 'BAIXO');
    document.getElementById('aet-extinto').textContent   = this.cnt(d, 'EXTINTO') + this.cnt(d, 'DESATIVADO');
  },

  renderCharts(d) {
    // Donut gênero
    const gens = ['Masculino','Feminino','Unissex','?'];
    Charts.donut('aetGenero', 'aet-chart-genero',
      ['Masculino','Feminino','Unissex','Indefinido'],
      gens.map(g => d.filter(r => r.POSTO_GENERO === g).length),
      ['#17B3CC','#a855f7','#22c55e','#6b7280']
    );

    // Stacked bar por setor — ordenado por total desc
    const crits  = ['ALTÍSSIMO RISCO','ALTO','MODERADO','BAIXO'];
    const allSet = Utils.unique(d, 'SETOR');
    const setores = allSet
      .map(s => ({
        s,
        total: d.filter(r => r.SETOR === s && crits.includes((r.CRITICIDADE_ATUAL || '').toUpperCase())).length
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(x => x.s);

    Charts.barStacked('aetCrit', 'aet-chart-crit', setores,
      crits.map(c => ({
        label: c.charAt(0) + c.slice(1).toLowerCase(),
        data: setores.map(s =>
          d.filter(r => r.SETOR === s && (r.CRITICIDADE_ATUAL || '').toUpperCase() === c).length
        ),
        backgroundColor: RISK_COLORS[c]
      }))
    );
  },

  renderTable(d) {
    const tbody   = document.getElementById('aet-tbody');
    const isAdmin = Auth.isAdmin();
    document.getElementById('aet-count').textContent = `${d.length} registro${d.length !== 1 ? 's' : ''}`;
    if (!d.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-loading">Nenhum registro encontrado.</td></tr>';
      return;
    }
    tbody.innerHTML = d.map(r => `
      <tr>
        <td>${Utils.esc(r.ID) || '—'}</td>
        <td>${Utils.esc(r.CLIENTE) || '—'}</td>
        <td>${Utils.esc(r.SETOR) || '—'}</td>
        <td title="${Utils.esc(r.POSTO_TRABALHO)}">${Utils.esc(Utils.truncate(r.POSTO_TRABALHO, 50))}</td>
        <td>${Utils.critBadge(r.CRITICIDADE_ATUAL)}</td>
        <td>${Utils.esc(r.POSTO_GENERO) || '—'}</td>
        <td>${Utils.esc(r.GERENTE) || '—'}</td>
        ${isAdmin ? `
        <td>
          <div class="action-group">
            <button class="btn-action btn-edit" onclick="Modal.openAET(${r._row})">Editar</button>
            <button class="btn-action btn-delete" onclick="AET.confirmDelete(${r._row})">Excluir</button>
          </div>
        </td>` : ''}
      </tr>`).join('');
  },

  async confirmDelete(rowNum) {
    const r = State.aet.find(x => x._row === rowNum);
    if (!r || !confirm(`Excluir o posto:\n"${r.POSTO_TRABALHO}"\n\nEsta ação não pode ser desfeita.`)) return;
    try {
      await API.delete(CONFIG.SHEETS.AET, rowNum);
      Utils.toast('Posto excluído com sucesso.', 'success');
      await App.loadAET();
    } catch (e) {
      Utils.toast('Erro ao excluir: ' + e.message, 'error');
    }
  }
};

// ================================================================
//  PA MODULE
// ================================================================
const PA = {
  f: { cliente: '', setor: '', criticidade: '', status: '', gerente: '', q: '' },

  getSem(r) { return Utils.semaforo(r); },

  load(data) {
    const raw = Auth.isClient()
      ? data.filter(r => (r.CLIENTE || '') === (State.session.cliente || ''))
      : data;
    State.pa = raw.map(r => ({ ...r, _sem: this.getSem(r) }));
    Utils.fillSelect('pa-filter-setor',   Utils.unique(State.pa, 'SETOR'));
    Utils.fillSelect('pa-filter-gerente', Utils.unique(State.pa, 'GERENTE'));
    if (Auth.isAdmin()) Utils.fillSelect('pa-filter-cliente', Utils.unique(State.pa, 'CLIENTE'));
    this.apply();
  },

  onFilter() {
    this.f.cliente     = (document.getElementById('pa-filter-cliente') || {}).value || '';
    this.f.setor       = document.getElementById('pa-filter-setor').value;
    this.f.criticidade = document.getElementById('pa-filter-criticidade').value;
    this.f.status      = document.getElementById('pa-filter-status').value;
    this.f.gerente     = document.getElementById('pa-filter-gerente').value;
    this.apply();
  },

  search(q) { this.f.q = q; this.apply(); },

  clearFilters() {
    this.f = { cliente: '', setor: '', criticidade: '', status: '', gerente: '', q: '' };
    ['pa-filter-cliente','pa-filter-setor','pa-filter-criticidade','pa-filter-status','pa-filter-gerente']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const s = document.getElementById('pa-search'); if (s) s.value = '';
    this.apply();
  },

  apply() {
    let d = [...State.pa];
    const f = this.f;
    if (f.cliente)     d = d.filter(r => (r.CLIENTE || '') === f.cliente);
    if (f.setor)       d = d.filter(r => r.SETOR === f.setor);
    if (f.criticidade) d = d.filter(r => (r.CRITICIDADE || '').toUpperCase() === f.criticidade.toUpperCase());
    if (f.status)      d = d.filter(r => r._sem.label === f.status.toUpperCase());
    if (f.gerente)     d = d.filter(r => r.GERENTE === f.gerente);
    if (f.q) {
      const q = f.q.toLowerCase();
      d = d.filter(r =>
        (r.SETOR         || '').toLowerCase().includes(q) ||
        (r.POSTO_TRABALHO|| '').toLowerCase().includes(q) ||
        (r.ACAO_CONTROLE || '').toLowerCase().includes(q) ||
        (r.RESPONSAVEL   || '').toLowerCase().includes(q)
      );
    }
    this.renderCards(d);
    this.renderCharts(d);
    this.renderTable(d);
  },

  renderCards(d) {
    const c = d.filter(r => r._sem.label === 'CONCLUÍDO').length;
    const a = d.filter(r => r._sem.label === 'ATRASADO').length;
    const e = d.filter(r => r._sem.label === 'EM ANDAMENTO').length;
    document.getElementById('pa-total').textContent     = d.length;
    document.getElementById('pa-concluido').textContent = c;
    document.getElementById('pa-atrasado').textContent  = a;
    document.getElementById('pa-andamento').textContent = e;
    document.getElementById('pa-pct').textContent = d.length ? Math.round(c / d.length * 100) + '%' : '—';

    const total = d.length || 1;
    const pct   = n => Math.round(n / total * 100) + '%';
    const cntCl = v => d.filter(r => (r.CLASSIFICACAO || '') === v).length;
    const norm = cntCl('Ação Normativa');
    const melh = cntCl('Sugestão de Melhoria');
    const eng  = cntCl('Engenharia');
    document.getElementById('pa-cl-normativa').textContent      = norm;
    document.getElementById('pa-cl-normativa-pct').textContent  = pct(norm);
    document.getElementById('pa-cl-melhoria').textContent       = melh;
    document.getElementById('pa-cl-melhoria-pct').textContent   = pct(melh);
    document.getElementById('pa-cl-engenharia').textContent     = eng;
    document.getElementById('pa-cl-engenharia-pct').textContent = pct(eng);
  },

  renderCharts(d) {
    const c = d.filter(r => r._sem.label === 'CONCLUÍDO').length;
    const a = d.filter(r => r._sem.label === 'ATRASADO').length;
    const e = d.filter(r => r._sem.label === 'EM ANDAMENTO').length;

    Charts.donut('paStatus', 'pa-chart-status',
      ['Concluído','Atrasado','Em Andamento'], [c, a, e],
      ['#22c55e','#ef4444','#f59e0b']
    );

    const crits = ['ALTÍSSIMO RISCO','ALTO','MODERADO','BAIXO'];
    Charts.bar('paCrit', 'pa-chart-crit',
      crits.map(x => x.charAt(0) + x.slice(1).toLowerCase()),
      [{
        label: 'Ações',
        data: crits.map(x => d.filter(r => (r.CRITICIDADE||'').toUpperCase() === x).length),
        backgroundColor: crits.map(x => RISK_COLORS[x]),
        borderRadius: 5
      }]
    );

    this.renderEvolucaoChart(d);
  },

  renderEvolucaoChart(d) {
    // Agrupa por mês de DATA_PREVISTA (últimos 12 com dados)
    const monthMap = {};
    d.forEach(r => {
      const dp = r.DATA_PREVISTA;
      if (!dp) return;
      const key = String(dp).slice(0, 7); // yyyy-mm
      if (!monthMap[key]) monthMap[key] = { c: 0, e: 0, a: 0, n: 0 };
      const label = r._sem.label;
      if (label === 'CONCLUÍDO')   monthMap[key].c++;
      else if (label === 'ATRASADO') monthMap[key].a++;
      else if (label === 'EM ANDAMENTO') monthMap[key].e++;
      else monthMap[key].n++;
    });

    const months = Object.keys(monthMap).sort().slice(-12);
    const MNOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const labels = months.map(m => {
      const parts = m.split('-');
      return MNOMES[parseInt(parts[1]) - 1] + '/' + parts[0].slice(2);
    });

    Charts.line('paEvolucao', 'pa-chart-evolucao', labels, [
      {
        label: 'Concluídas',
        data: months.map(m => monthMap[m].c),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,.12)',
        fill: true
      },
      {
        label: 'Em Andamento',
        data: months.map(m => monthMap[m].e),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,.08)',
        fill: true
      },
      {
        label: 'Atrasadas',
        data: months.map(m => monthMap[m].a),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,.08)',
        fill: true
      }
    ]);
  },

  renderTable(d) {
    const tbody   = document.getElementById('pa-tbody');
    const isAdmin = Auth.isAdmin();
    document.getElementById('pa-count').textContent = `${d.length} registro${d.length !== 1 ? 's' : ''}`;
    if (!d.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="table-loading">Nenhum registro encontrado.</td></tr>';
      return;
    }
    tbody.innerHTML = d.map(r => `
      <tr>
        <td>${Utils.esc(r.CLIENTE) || '—'}</td>
        <td>${Utils.esc(r.SETOR) || '—'}</td>
        <td title="${Utils.esc(r.POSTO_TRABALHO)}">${Utils.esc(Utils.truncate(r.POSTO_TRABALHO, 35))}</td>
        <td>${Utils.critBadge(r.CRITICIDADE)}</td>
        <td title="${Utils.esc(r.ACAO_CONTROLE)}">${Utils.esc(Utils.truncate(r.ACAO_CONTROLE, 70))}</td>
        <td>${Utils.esc(r.RESPONSAVEL || r.GERENTE) || '—'}</td>
        <td>${Utils.formatDate(r.DATA_PREVISTA)}</td>
        <td><span class="semaforo ${r._sem.cls}">${r._sem.label}</span></td>
        ${isAdmin ? `
        <td>
          <div class="action-group">
            <button class="btn-action btn-edit" onclick="Modal.openPA(${r._row})">Editar</button>
            <button class="btn-action btn-delete" onclick="PA.confirmDelete(${r._row})">Excluir</button>
          </div>
        </td>` : ''}
      </tr>`).join('');
  },

  async confirmDelete(rowNum) {
    if (!confirm('Excluir esta ação de controle?\n\nEsta ação não pode ser desfeita.')) return;
    try {
      await API.delete(CONFIG.SHEETS.PA, rowNum);
      Utils.toast('Ação excluída com sucesso.', 'success');
      await App.loadPA();
    } catch (e) {
      Utils.toast('Erro ao excluir: ' + e.message, 'error');
    }
  }
};

// ================================================================
//  MODAL
// ================================================================
const Modal = {
  open(title, html) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML    = html;
    document.getElementById('modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('modal').classList.remove('open');
    document.body.style.overflow = '';
    State.editTarget = null;
  },

  closeOnOverlay(e) {
    if (e.target === document.getElementById('modal')) this.close();
  },

  openAET(rowNum) {
    const r = State.aet.find(x => x._row === rowNum);
    if (!r) return;
    State.editTarget = { sheet: 'AET', rowNum, orig: r };

    const yrs    = ['2024','2023','2022','2021','2020','2019'];
    const yFields = yrs.map(y => {
      const key = `CRITICIDADE_${y}`;
      const v   = r[key] || '';
      const opts = ['','ALTÍSSIMO RISCO','ALTO','MODERADO','BAIXO','AUSÊNCIA DE RISCO']
        .map(c => `<option value="${c}"${c === v ? ' selected' : ''}>${c || '—'}</option>`).join('');
      return `<div class="form-group"><label>Criticidade ${y}</label><select id="me-${key}">${opts}</select></div>`;
    }).join('');

    const genOpts = ['','Masculino','Feminino','Unissex']
      .map(g => `<option value="${g}"${g === (r.POSTO_GENERO||'') ? ' selected' : ''}>${g || 'Selecione…'}</option>`).join('');

    const clienteOpts = ['', ...Options.get('CLIENTE')]
      .map(c => `<option value="${c}"${c === (r.CLIENTE||'') ? ' selected' : ''}>${c || 'Selecione…'}</option>`).join('');

    this.open('Editar Posto de Trabalho', `
      <div class="form-grid" id="modal-form-aet">
        <div class="form-group">
          <label>Cliente</label>
          <select id="me-CLIENTE">${clienteOpts}</select>
        </div>
        <div class="form-group">
          <label>Setor *</label>
          <input type="text" id="me-SETOR" value="${Utils.esc(r.SETOR)}" required>
        </div>
        <div class="form-group">
          <label>Posto de Trabalho *</label>
          <input type="text" id="me-POSTO_TRABALHO" value="${Utils.esc(r.POSTO_TRABALHO)}" required>
        </div>
        <div class="form-group">
          <label>Criticidade Atual *</label>
          <select id="me-CRITICIDADE_ATUAL">
            <option value="">Selecione…</option>
            ${Utils.critOpts(r.CRITICIDADE_ATUAL)}
          </select>
        </div>
        <div class="form-group">
          <label>Gênero do Posto</label>
          <select id="me-POSTO_GENERO">${genOpts}</select>
        </div>
        <div class="form-group">
          <label>Gerente</label>
          <input type="text" id="me-GERENTE" value="${Utils.esc(r.GERENTE)}">
        </div>
        <div class="form-group">
          <label>Atualização</label>
          <input type="text" id="me-ATUALIZACAO" value="${Utils.esc(r.ATUALIZACAO)}">
        </div>
        ${yFields}
        <div class="form-group form-full">
          <label>Observações</label>
          <textarea id="me-OBSERVACOES" rows="3">${Utils.esc(r.OBSERVACOES)}</textarea>
        </div>
        <div class="form-group form-full">
          <label>Condição para Unissex</label>
          <textarea id="me-CONDICAO_UNISSEX" rows="2">${Utils.esc(r.CONDICAO_UNISSEX)}</textarea>
        </div>
        <div class="form-actions form-full">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Cancelar</button>
          <button type="button" class="btn-primary" onclick="Modal.saveAET()">Salvar</button>
        </div>
      </div>`);
  },

  async saveAET() {
    const get = id => (document.getElementById('me-' + id) || {}).value || '';
    const data = {
      ...State.editTarget.orig,
      CLIENTE:           get('CLIENTE'),
      SETOR:             get('SETOR'),
      POSTO_TRABALHO:    get('POSTO_TRABALHO'),
      CRITICIDADE_ATUAL: get('CRITICIDADE_ATUAL'),
      POSTO_GENERO:      get('POSTO_GENERO'),
      GERENTE:           get('GERENTE'),
      ATUALIZACAO:       get('ATUALIZACAO'),
      CRITICIDADE_2024:  get('CRITICIDADE_2024'),
      CRITICIDADE_2023:  get('CRITICIDADE_2023'),
      CRITICIDADE_2022:  get('CRITICIDADE_2022'),
      CRITICIDADE_2021:  get('CRITICIDADE_2021'),
      CRITICIDADE_2020:  get('CRITICIDADE_2020'),
      CRITICIDADE_2019:  get('CRITICIDADE_2019'),
      OBSERVACOES:       get('OBSERVACOES'),
      CONDICAO_UNISSEX:  get('CONDICAO_UNISSEX')
    };
    if (!data.SETOR || !data.POSTO_TRABALHO) {
      Utils.toast('Preencha os campos obrigatórios.', 'error'); return;
    }
    try {
      await API.update(CONFIG.SHEETS.AET, State.editTarget.rowNum, data);
      Utils.toast('Posto atualizado!', 'success');
      this.close();
      await App.loadAET();
    } catch (e) {
      Utils.toast('Erro ao salvar: ' + e.message, 'error');
    }
  },

  openPA(rowNum) {
    const r = State.pa.find(x => x._row === rowNum);
    if (!r) return;
    State.editTarget = { sheet: 'PA', rowNum, orig: r };

    const classOpts = ['','Ação Normativa','Sugestão de Melhoria','Engenharia']
      .map(v => `<option value="${v}"${v === (r.CLASSIFICACAO||'') ? ' selected' : ''}>${v || 'Selecione…'}</option>`).join('');
    const statusOpts = [
      { v: '',          l: 'Selecione…' },
      { v: 'CONCLUÍDO', l: 'Concluído' },
      { v: 'EM ANDAMENTO', l: 'Em Andamento' },
      { v: 'NÃO INICIADO', l: 'Não Iniciado' }
    ].map(o => `<option value="${o.v}"${o.v === (r.STATUS||'') ? ' selected' : ''}>${o.l}</option>`).join('');
    const clienteOpts = ['', ...Options.get('CLIENTE')]
      .map(c => `<option value="${c}"${c === (r.CLIENTE||'') ? ' selected' : ''}>${c || 'Selecione…'}</option>`).join('');

    this.open('Editar Ação de Controle', `
      <div class="form-grid">
        <div class="form-group">
          <label>Cliente</label>
          <select id="me-CLIENTE">${clienteOpts}</select>
        </div>
        <div class="form-group">
          <label>Setor *</label>
          <input type="text" id="me-SETOR" value="${Utils.esc(r.SETOR)}" required>
        </div>
        <div class="form-group">
          <label>Posto de Trabalho</label>
          <input type="text" id="me-POSTO_TRABALHO" value="${Utils.esc(r.POSTO_TRABALHO)}">
        </div>
        <div class="form-group">
          <label>Criticidade</label>
          <select id="me-CRITICIDADE"><option value="">Selecione…</option>${Utils.critOpts(r.CRITICIDADE, true)}</select>
        </div>
        <div class="form-group">
          <label>Classificação</label>
          <select id="me-CLASSIFICACAO">${classOpts}</select>
        </div>
        <div class="form-group">
          <label>Gerente</label>
          <input type="text" id="me-GERENTE" value="${Utils.esc(r.GERENTE)}">
        </div>
        <div class="form-group">
          <label>Responsável</label>
          <input type="text" id="me-RESPONSAVEL" value="${Utils.esc(r.RESPONSAVEL)}">
        </div>
        <div class="form-group">
          <label>Estimativa de Valor (R$)</label>
          <input type="number" id="me-ESTIMATIVA_VALOR" value="${Utils.esc(r.ESTIMATIVA_VALOR)}" step="0.01" min="0">
        </div>
        <div class="form-group">
          <label>Data Prevista</label>
          <input type="date" id="me-DATA_PREVISTA" value="${Utils.dateValue(r.DATA_PREVISTA)}">
        </div>
        <div class="form-group">
          <label>Data Conclusão</label>
          <input type="date" id="me-DATA_CONCLUSAO" value="${Utils.dateValue(r.DATA_CONCLUSAO)}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="me-STATUS">${statusOpts}</select>
        </div>
        <div class="form-group form-full">
          <label>Ação de Controle *</label>
          <textarea id="me-ACAO_CONTROLE" rows="4">${Utils.esc(r.ACAO_CONTROLE)}</textarea>
        </div>
        <div class="form-group form-full">
          <label>Observações</label>
          <textarea id="me-OBSERVACOES" rows="3">${Utils.esc(r.OBSERVACOES)}</textarea>
        </div>
        <div class="form-actions form-full">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Cancelar</button>
          <button type="button" class="btn-primary" onclick="Modal.savePA()">Salvar</button>
        </div>
      </div>`);
  },

  async savePA() {
    const get = id => (document.getElementById('me-' + id) || {}).value || '';
    const data = {
      ...State.editTarget.orig,
      CLIENTE:          get('CLIENTE'),
      SETOR:            get('SETOR'),
      POSTO_TRABALHO:   get('POSTO_TRABALHO'),
      CRITICIDADE:      get('CRITICIDADE'),
      CLASSIFICACAO:    get('CLASSIFICACAO'),
      GERENTE:          get('GERENTE'),
      RESPONSAVEL:      get('RESPONSAVEL'),
      ESTIMATIVA_VALOR: get('ESTIMATIVA_VALOR'),
      DATA_PREVISTA:    get('DATA_PREVISTA'),
      DATA_CONCLUSAO:   get('DATA_CONCLUSAO'),
      STATUS:           get('STATUS'),
      ACAO_CONTROLE:    get('ACAO_CONTROLE'),
      OBSERVACOES:      get('OBSERVACOES')
    };
    if (!data.SETOR) { Utils.toast('Informe o setor.', 'error'); return; }
    try {
      await API.update(CONFIG.SHEETS.PA, State.editTarget.rowNum, data);
      Utils.toast('Ação atualizada!', 'success');
      this.close();
      await App.loadPA();
    } catch (e) {
      Utils.toast('Erro ao salvar: ' + e.message, 'error');
    }
  }
};

// ================================================================
//  FISIO MODULE
// ================================================================
function calcFaixaEtaria(idade) {
  const i = parseInt(idade) || 0;
  if (i < 29) return '18-28';
  if (i < 39) return '29-38';
  if (i < 49) return '39-48';
  if (i < 59) return '49-58';
  return '59+';
}

const FISIO = {
  f: { cliente: '', setor: '', mes: '', ano: '', parecer: '', genero: '', q: '' },

  load(data) {
    State.fisio = Auth.isClient()
      ? data.filter(r => (r.CLIENTE || '') === (State.session.cliente || ''))
      : data;
    Utils.fillSelect('fisio-filter-setor', Utils.unique(State.fisio, 'SETOR'));
    Utils.fillSelect('fisio-filter-ano',   Utils.unique(State.fisio, 'ANO').map(String));
    if (Auth.isAdmin()) Utils.fillSelect('fisio-filter-cliente', Utils.unique(State.fisio, 'CLIENTE'));
    this.apply();
  },

  onFilter() {
    this.f.cliente = (document.getElementById('fisio-filter-cliente') || {}).value || '';
    this.f.setor   = document.getElementById('fisio-filter-setor').value;
    this.f.mes     = document.getElementById('fisio-filter-mes').value;
    this.f.ano     = document.getElementById('fisio-filter-ano').value;
    this.f.parecer = document.getElementById('fisio-filter-parecer').value;
    this.f.genero  = document.getElementById('fisio-filter-genero').value;
    this.apply();
  },

  search(q) { this.f.q = q; this.apply(); },

  clearFilters() {
    this.f = { cliente: '', setor: '', mes: '', ano: '', parecer: '', genero: '', q: '' };
    ['fisio-filter-cliente','fisio-filter-setor','fisio-filter-mes','fisio-filter-ano',
     'fisio-filter-parecer','fisio-filter-genero']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const s = document.getElementById('fisio-search'); if (s) s.value = '';
    this.apply();
  },

  apply() {
    let d = [...State.fisio];
    const f = this.f;
    if (f.cliente) d = d.filter(r => (r.CLIENTE || '') === f.cliente);
    if (f.setor)   d = d.filter(r => r.SETOR === f.setor);
    // MES armazenado como número (1-12); comparar como string
    if (f.mes)     d = d.filter(r => String(r.MES || '') === f.mes);
    if (f.ano)     d = d.filter(r => String(r.ANO || '') === f.ano);
    if (f.parecer) d = d.filter(r => (r.PARECER || '') === f.parecer);
    if (f.genero)  d = d.filter(r => (r.GENERO || '') === f.genero);
    if (f.q) {
      const q = f.q.toLowerCase();
      d = d.filter(r =>
        (r.NOME  || '').toLowerCase().includes(q) ||
        (r.SETOR || '').toLowerCase().includes(q)
      );
    }
    this.renderCards(d);
    this.renderCharts(d);
    this.renderTable(d);
  },

  cnt(data, field, val) {
    return data.filter(r => (r[field] || '') === val).length;
  },

  renderCards(d) {
    const aprov  = this.cnt(d, 'PARECER', 'Aprovado');
    const restri = this.cnt(d, 'PARECER', 'Aprovado com Restrição');
    const reprov = this.cnt(d, 'PARECER', 'Reprovado');
    const total  = d.length || 1;
    const pct    = n => Math.round(n / total * 100) + '%';

    document.getElementById('fisio-total').textContent        = d.length;
    document.getElementById('fisio-aprovado').textContent     = aprov;
    document.getElementById('fisio-aprovado-pct').textContent = pct(aprov);
    document.getElementById('fisio-restricao').textContent    = restri;
    document.getElementById('fisio-restricao-pct').textContent= pct(restri);
    document.getElementById('fisio-reprovado').textContent    = reprov;
    document.getElementById('fisio-reprovado-pct').textContent= pct(reprov);
    document.getElementById('fisio-pct-aprov').textContent    =
      d.length ? Math.round((aprov + restri) / d.length * 100) + '%' : '—';
  },

  renderCharts(d) {
    // Donut gênero (3D animado via CSS)
    const masc = this.cnt(d, 'GENERO', 'Masculino');
    const fem  = this.cnt(d, 'GENERO', 'Feminino');
    Charts.donut('fisioGenero', 'fisio-chart-genero',
      ['Masculino', 'Feminino'], [masc, fem],
      ['#17B3CC', '#a855f7']
    );

    // Bar faixa etária
    const faixas = ['18-28','29-38','39-48','49-58','59+'];
    const faixaCores = ['#17B3CC','#22c55e','#f59e0b','#ef4444','#a855f7'];
    Charts.bar('fisioFaixa', 'fisio-chart-faixa',
      faixas,
      [{
        label: 'Atendimentos',
        data: faixas.map(fx => d.filter(r => (r.FAIXA_ETARIA || '') === fx).length),
        backgroundColor: faixaCores,
        borderRadius: 6
      }]
    );

    // Linha evolução mensal
    const monthMap = {};
    d.forEach(r => {
      const dp = r.DATA_EXAME;
      if (!dp) return;
      const key = String(dp).slice(0, 7);
      if (!monthMap[key]) monthMap[key] = { aprov: 0, restri: 0, reprov: 0 };
      const p = r.PARECER || '';
      if (p === 'Aprovado') monthMap[key].aprov++;
      else if (p === 'Aprovado com Restrição') monthMap[key].restri++;
      else if (p === 'Reprovado') monthMap[key].reprov++;
    });

    const months = Object.keys(monthMap).sort().slice(-12);
    const MNOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const labels = months.map(m => {
      const parts = m.split('-');
      return MNOMES[parseInt(parts[1]) - 1] + '/' + parts[0].slice(2);
    });

    Charts.line('fisioEvolucao', 'fisio-chart-evolucao', labels, [
      { label: 'Aprovados',            data: months.map(m => monthMap[m].aprov),
        borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.12)',  fill: true },
      { label: 'Aprov. c/ Restrição',  data: months.map(m => monthMap[m].restri),
        borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.08)', fill: true },
      { label: 'Reprovados',           data: months.map(m => monthMap[m].reprov),
        borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.08)',  fill: true },
    ]);
  },

  renderTable(d) {
    const tbody   = document.getElementById('fisio-tbody');
    const isAdmin = Auth.isAdmin();
    document.getElementById('fisio-count').textContent = `${d.length} registro${d.length !== 1 ? 's' : ''}`;
    if (!d.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="table-loading">Nenhum registro encontrado.</td></tr>';
      return;
    }
    const parecerBadge = p => {
      const map = {
        'Aprovado':              'badge-baixo',
        'Aprovado com Restrição':'badge-moderado',
        'Reprovado':             'badge-alto'
      };
      return `<span class="badge ${map[p] || 'badge-extinto'}">${Utils.esc(p) || '—'}</span>`;
    };
    tbody.innerHTML = d.map(r => `
      <tr>
        <td>${Utils.esc(r.CLIENTE) || '—'}</td>
        <td>${Utils.esc(r.NOME) || '—'}</td>
        <td>${Utils.esc(r.SETOR) || '—'}</td>
        <td>${Utils.formatDate(r.DATA_EXAME)}</td>
        <td>${Utils.esc(r.MES) || '—'}</td>
        <td>${Utils.esc(r.GENERO) || '—'}</td>
        <td>${Utils.esc(r.IDADE) || '—'}</td>
        <td>${Utils.esc(r.FAIXA_ETARIA) || '—'}</td>
        <td>${parecerBadge(r.PARECER)}</td>
        ${isAdmin ? `
        <td>
          <div class="action-group">
            <button class="btn-action btn-delete" onclick="FISIO.confirmDelete(${r._row})">Excluir</button>
          </div>
        </td>` : ''}
      </tr>`).join('');
  },

  async confirmDelete(rowNum) {
    if (!confirm('Excluir este registro de admissional?\n\nEsta ação não pode ser desfeita.')) return;
    try {
      await API.delete(CONFIG.SHEETS.FISIO, rowNum);
      Utils.toast('Registro excluído.', 'success');
      await App.loadFisio();
    } catch (e) {
      Utils.toast('Erro ao excluir: ' + e.message, 'error');
    }
  }
};

// ================================================================
//  FORMS (novos registros)
// ================================================================
const Forms = {
  async submitAET(e) {
    e.preventDefault();
    const btn  = document.getElementById('btn-submit-aet');
    const data = Object.fromEntries(new FormData(e.target).entries());
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await API.create(CONFIG.SHEETS.AET, data);
      Utils.toast('Posto criado com sucesso!', 'success');
      e.target.reset();
      Options.initAll();
      await App.loadAET();
    } catch (err) {
      Utils.toast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Salvar Lançamento';
    }
  },

  autoFaixaEtaria(idade) {
    const el = document.getElementById('f-fisio-FAIXA_ETARIA');
    if (el) el.value = idade ? calcFaixaEtaria(idade) : '';
  },

  resetFisio() {
    const el = document.getElementById('f-fisio-FAIXA_ETARIA');
    if (el) el.value = '';
  },

  async submitFISIO(e) {
    e.preventDefault();
    const btn  = document.getElementById('btn-submit-fisio');
    const data = Object.fromEntries(new FormData(e.target).entries());
    // Garante faixa etária calculada
    if (data.IDADE && !data.FAIXA_ETARIA) {
      data.FAIXA_ETARIA = calcFaixaEtaria(data.IDADE);
    }
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await API.create(CONFIG.SHEETS.FISIO, data);
      Utils.toast('Admissional registrado com sucesso!', 'success');
      e.target.reset();
      Options.initAll();
      await App.loadFisio();
    } catch (err) {
      Utils.toast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Salvar Admissional';
    }
  },

  async submitPA(e) {
    e.preventDefault();
    const btn  = document.getElementById('btn-submit-pa');
    const data = Object.fromEntries(new FormData(e.target).entries());
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await API.create(CONFIG.SHEETS.PA, data);
      Utils.toast('Ação criada com sucesso!', 'success');
      e.target.reset();
      Options.initAll();
      await App.loadPA();
    } catch (err) {
      Utils.toast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Salvar Ação';
    }
  }
};

// ================================================================
//  CLIENT MANAGER (admin only)
// ================================================================
const ClientMgr = {
  _clients: [],

  async open() {
    document.getElementById('clientModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    await this.render();
  },

  close() {
    document.getElementById('clientModal').classList.remove('open');
    document.body.style.overflow = '';
  },

  closeOnOverlay(e) {
    if (e.target === document.getElementById('clientModal')) this.close();
  },

  async render() {
    const body = document.getElementById('clientModalBody');
    body.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Carregando…</p>';
    try {
      this._clients = await API.readClients();
    } catch (e) {
      body.innerHTML = `<p style="color:var(--danger)">Erro: ${Utils.esc(e.message)}</p>`;
      return;
    }
    const rows = this._clients.filter(r => r.TIPO !== 'admin').map(r => `
      <div class="client-row">
        <div class="client-row-info">
          <strong>${Utils.esc(r.NOME)}</strong>
          <span>Usuário: <b>${Utils.esc(r.USUARIO)}</b> · Senha: ${Utils.esc(r.SENHA)} · Cliente: ${Utils.esc(r.CLIENTE) || '—'}</span>
        </div>
        <span class="client-row-badge">${r.ATIVO ? 'Ativo' : 'Inativo'}</span>
        <button class="btn-action btn-delete" onclick="ClientMgr.remove(${r._row})">Excluir</button>
      </div>`).join('');

    body.innerHTML = `
      <div class="client-list">${rows || '<p style="color:var(--text-muted);text-align:center">Nenhum cliente cadastrado.</p>'}</div>
      <div class="client-add-form">
        <h4>➕ Novo Cliente</h4>
        <div class="client-form-row">
          <div class="form-group">
            <label>Nome</label>
            <input type="text" id="nc-nome" placeholder="Nome completo">
          </div>
          <div class="form-group">
            <label>Identificador (CLIENTE)</label>
            <input type="text" id="nc-cliente" placeholder="Ex: Garoto, FabricaX">
          </div>
        </div>
        <div class="client-form-row">
          <div class="form-group">
            <label>Usuário</label>
            <input type="text" id="nc-usuario" placeholder="login do cliente">
          </div>
          <div class="form-group">
            <label>Senha</label>
            <input type="text" id="nc-senha" placeholder="senha">
          </div>
        </div>
        <div class="form-actions" style="margin-top:12px;padding-top:12px">
          <button class="btn-secondary" onclick="ClientMgr.close()">Fechar</button>
          <button class="btn-primary" onclick="ClientMgr.add()">Cadastrar Cliente</button>
        </div>
      </div>`;
  },

  async add() {
    const nome    = (document.getElementById('nc-nome')   || {}).value || '';
    const cliente = (document.getElementById('nc-cliente')|| {}).value || '';
    const usuario = (document.getElementById('nc-usuario')|| {}).value || '';
    const senha   = (document.getElementById('nc-senha')  || {}).value || '';

    if (!nome || !usuario || !senha) {
      Utils.toast('Preencha Nome, Usuário e Senha.', 'error'); return;
    }
    try {
      await API.createClient({ NOME: nome, USUARIO: usuario, SENHA: senha,
                               TIPO: 'cliente', CLIENTE: cliente, ATIVO: true });
      // Adiciona às opções locais e atualiza os selects nos formulários
      if (cliente) {
        Options.add('CLIENTE', cliente);
        Options.populate('f-aet-CLIENTE', 'CLIENTE');
        Options.populate('f-pa-CLIENTE',  'CLIENTE');
      }
      Utils.toast(`Cliente "${nome}" cadastrado!`, 'success');
      await this.render();
    } catch (e) {
      Utils.toast('Erro: ' + e.message, 'error');
    }
  },

  async remove(rowNum) {
    const c = this._clients.find(x => x._row === rowNum);
    if (!c || !confirm(`Excluir o cliente "${c.NOME}"?\n\nEsta ação não pode ser desfeita.`)) return;
    try {
      await API.deleteClient(rowNum);
      Utils.toast('Cliente excluído.', 'success');
      await this.render();
    } catch (e) {
      Utils.toast('Erro: ' + e.message, 'error');
    }
  }
};

// ================================================================
//  NAV SETUP
// ================================================================
function setupNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      requestAnimationFrame(() => {
        Object.values(State.charts).forEach(c => { if (c) c.resize(); });
      });
    });
  });

  document.querySelectorAll('.lanc-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lanc-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.form-card').forEach(f => f.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.form).classList.add('active');
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { Modal.close(); ClientMgr.close(); }
  });
}

// ================================================================
//  APP
// ================================================================
const App = {
  async loadAET() {
    try {
      const data = await API.read(CONFIG.SHEETS.AET);
      AET.load(data);
    } catch (e) {
      const el = document.getElementById('aet-tbody');
      if (el) el.innerHTML =
        `<tr><td colspan="8" class="table-loading">Erro: ${Utils.esc(e.message)}</td></tr>`;
    }
  },

  async loadPA() {
    try {
      const data = await API.read(CONFIG.SHEETS.PA);
      PA.load(data);
    } catch (e) {
      const el = document.getElementById('pa-tbody');
      if (el) el.innerHTML =
        `<tr><td colspan="9" class="table-loading">Erro: ${Utils.esc(e.message)}</td></tr>`;
    }
  },

  async loadFisio() {
    try {
      const data = await API.readFisio();
      FISIO.load(data);
    } catch (e) {
      const el = document.getElementById('fisio-tbody');
      if (el) el.innerHTML =
        `<tr><td colspan="10" class="table-loading">Erro: ${Utils.esc(e.message)}</td></tr>`;
    }
  },

  async refresh() {
    const btn = document.getElementById('btnRefresh');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    await Promise.all([this.loadAET(), this.loadPA(), this.loadFisio()]);
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    const lu = document.getElementById('lastUpdate');
    if (lu) lu.textContent = 'Atualizado às ' +
      new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  init() {
    setupNav();
    Options.initAll();

    // Verificar sessão existente
    const existing = Auth.get();
    if (existing) {
      State.session = existing;
      Auth.applySession();
      return;
    }

    // Mostrar tela de login
    document.getElementById('loginScreen').style.display = 'flex';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
