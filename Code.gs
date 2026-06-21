// ================================================================
//  ERGO X — Google Apps Script (Code.gs)
//
//  PASSO 1: Substitua pelo ID da sua Planilha Google.
//  PASSO 2: Execute setupSheets() UMA VEZ para criar as abas e
//           o usuário admin padrão (admin / ergo2025).
//  PASSO 3: Implante como Web App (Executar como: Eu,
//           Quem tem acesso: Qualquer pessoa) e cole a URL em app.js.
// ================================================================

const SPREADSHEET_ID = '16Xfx3xdWNJIeZlRMwnl7VdZmGHHzE68NtG4CGq8LcXU';

const SHEET_NAMES = {
  AET:      'BD_AET',
  PA:       'BD_PA',
  CLIENTES: 'BD_CLIENTES',
  FISIO:    'BD_FISIO'
};

const HEADERS = {
  BD_AET: [
    'ID', 'CLIENTE', 'SETOR', 'POSTO_TRABALHO', 'CRITICIDADE_ATUAL',
    'CRITICIDADE_2024', 'CRITICIDADE_2023', 'CRITICIDADE_2022',
    'CRITICIDADE_2021', 'CRITICIDADE_2020', 'CRITICIDADE_2019',
    'POSTO_GENERO', 'ATUALIZACAO', 'GERENTE', 'OBSERVACOES', 'CONDICAO_UNISSEX'
  ],
  BD_PA: [
    'ID', 'CLIENTE', 'SETOR', 'POSTO_TRABALHO', 'CRITICIDADE', 'ACAO_CONTROLE',
    'CLASSIFICACAO', 'ESTIMATIVA_VALOR', 'GERENTE', 'RESPONSAVEL',
    'DATA_PREVISTA', 'DATA_CONCLUSAO', 'STATUS', 'OBSERVACOES'
  ],
  BD_CLIENTES: [
    'ID', 'NOME', 'USUARIO', 'SENHA', 'TIPO', 'CLIENTE', 'ATIVO'
  ],
  BD_FISIO: [
    'ID', 'CLIENTE', 'NOME', 'SETOR', 'DATA_EXAME', 'MES', 'ANO',
    'GENERO', 'IDADE', 'FAIXA_ETARIA', 'PARECER', 'OBSERVACOES'
  ]
};

// ================================================================
//  ENTRY POINT
// ================================================================
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'login') {
      return jsonOk(verifyLogin(
        String(e.parameter.usuario || ''),
        String(e.parameter.senha   || '')
      ));
    }

    const sheetKey = e.parameter.sheet;
    const name     = SHEET_NAMES[sheetKey];
    if (!name) throw new Error('Sheet inválida: ' + sheetKey);

    let result;
    if (action === 'read') {
      result = readSheet(name);
    } else if (action === 'create') {
      const data = decodePayload(e.parameter.data);
      result = createRow(name, data);
    } else if (action === 'update') {
      const rowNum = parseInt(e.parameter.rowNum, 10);
      const data   = decodePayload(e.parameter.data);
      result = updateRow(name, rowNum, data);
    } else if (action === 'delete') {
      const rowNum = parseInt(e.parameter.rowNum, 10);
      result = deleteRow(name, rowNum);
    } else {
      throw new Error('Ação desconhecida: ' + action);
    }

    return jsonOk(result);
  } catch (err) {
    return jsonErr(err.message);
  }
}

// ================================================================
//  LOGIN
// ================================================================
function verifyLogin(usuario, senha) {
  try {
    const sheet = getSheet('BD_CLIENTES');
    const vals  = sheet.getDataRange().getValues();
    if (vals.length < 2) return { ok: false, error: 'Nenhum usuário cadastrado' };

    const h   = vals[0];
    const idx = function(f) { return h.indexOf(f); };

    for (var i = 1; i < vals.length; i++) {
      var row      = vals[i];
      var rowUser  = String(row[idx('USUARIO')] || '');
      var rowPass  = String(row[idx('SENHA')]   || '');
      var ativoRaw = row[idx('ATIVO')];
      var ativo    = !(ativoRaw === false ||
                       String(ativoRaw).toLowerCase() === 'false' ||
                       String(ativoRaw) === '0' ||
                       String(ativoRaw).toUpperCase() === 'NÃO');

      if (rowUser === usuario && rowPass === senha) {
        if (!ativo) return { ok: false, error: 'Usuário inativo' };
        return {
          ok:      true,
          nome:    String(row[idx('NOME')]    || usuario),
          tipo:    String(row[idx('TIPO')]    || 'cliente'),
          cliente: String(row[idx('CLIENTE')] || '')
        };
      }
    }
    return { ok: false, error: 'Usuário ou senha incorretos' };
  } catch (e) {
    return { ok: false, error: 'Erro: ' + e.message };
  }
}

// ================================================================
//  CRUD
// ================================================================
function readSheet(name) {
  const sheet = getSheet(name);
  const vals  = sheet.getDataRange().getValues();
  if (vals.length < 2) return [];

  const headers = vals[0];
  return vals.slice(1)
    .map((row, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, j) => {
        const v = row[j];
        obj[h] = v instanceof Date
          ? Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd')
          : v;
      });
      return obj;
    })
    .filter(r => r.ID || r.SETOR || r.USUARIO);
}

function createRow(name, data) {
  const sheet   = getSheet(name);
  const headers = getHeaders(name);
  data.ID = sheet.getLastRow();
  const row = headers.map(h => data[h] !== undefined ? data[h] : '');
  sheet.appendRow(row);
  return { id: data.ID, rowNum: sheet.getLastRow() };
}

function updateRow(name, rowNum, data) {
  const sheet    = getSheet(name);
  const headers  = getHeaders(name);
  const existing = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  const newRow   = headers.map((h, i) =>
    (data[h] !== undefined && data[h] !== null) ? data[h] : existing[i]
  );
  sheet.getRange(rowNum, 1, 1, newRow.length).setValues([newRow]);
  return { updated: true, rowNum };
}

function deleteRow(name, rowNum) {
  getSheet(name).deleteRow(rowNum);
  return { deleted: true, rowNum };
}

// ================================================================
//  SETUP — Execute UMA VEZ após criar a planilha.
// ================================================================
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  Object.entries(HEADERS).forEach(([sheetName, headers]) => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);

      if (sheetName === 'BD_CLIENTES') {
        const defs = { ID: 1, NOME: 'Administrador', USUARIO: 'admin',
                       SENHA: 'ergo2025', TIPO: 'admin', CLIENTE: '', ATIVO: true };
        sheet.appendRow(headers.map(h => defs[h] !== undefined ? defs[h] : ''));
        Logger.log('Conta admin criada: admin / ergo2025');
      }
      Logger.log('Cabeçalhos criados em: ' + sheetName);
    } else {
      Logger.log(sheetName + ' já possui dados — pulando.');
    }
  });

  Logger.log('Setup concluído!');
}

// ================================================================
//  HELPERS
// ================================================================
function getSheet(name) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Aba não encontrada: ' + name);
  return sheet;
}

function getHeaders(name) {
  const sheet = getSheet(name);
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function decodePayload(b64) {
  const bytes = Utilities.base64Decode(b64);
  const str   = Utilities.newBlob(bytes).getDataAsString('UTF-8');
  return JSON.parse(str);
}

function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonErr(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
