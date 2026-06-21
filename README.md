# ErgoX — Sistema de Gestão Ergonômica

Sistema web com 3 abas para gestão de AET e Planos de Ação, conectado ao Google Sheets via Apps Script.

---

## Estrutura de arquivos

```
ErgoX/
├── index.html      ← App principal
├── style.css       ← Estilos (paleta ErgoX)
├── app.js          ← Toda a lógica (CRUD, gráficos, filtros)
├── Code.gs         ← Google Apps Script (API)
└── assets/
    └── logo.png    ← Coloque aqui a logo ErgoX
```

---

## Configuração (passo a passo)

### 1. Criar a Planilha Google

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma nova planilha
2. Copie o **ID** da URL:
   ```
   https://docs.google.com/spreadsheets/d/  <<< ESTE_ID_AQUI >>>  /edit
   ```

### 2. Configurar o Apps Script

1. Na planilha, vá em **Extensões → Apps Script**
2. Apague o código padrão e cole o conteúdo de `Code.gs`
3. Substitua `'SEU_ID_AQUI'` pelo ID da planilha copiado no passo anterior
4. Salve (`Ctrl+S`)
5. No menu, clique em **Executar → setupSheets** — isso cria as abas `BD_AET` e `BD_PA` com os cabeçalhos certos
   - Autorize as permissões quando solicitado

### 3. Implantar como Web App

1. Clique em **Implantar → Nova implantação**
2. Tipo: **App da Web**
3. Configurações:
   - **Executar como:** Eu (seu e-mail)
   - **Quem tem acesso:** Qualquer pessoa
4. Clique em **Implantar** e copie a **URL** gerada

### 4. Conectar o frontend

1. Abra `app.js`
2. Na linha abaixo, substitua o placeholder pela URL copiada:
   ```js
   API_URL: 'COLE_AQUI_A_URL_DO_APPS_SCRIPT',
   ```
   Ficará assim:
   ```js
   API_URL: 'https://script.google.com/macros/s/ABC123.../exec',
   ```

### 5. Adicionar a logo

Coloque o arquivo `logo.png` da ErgoX dentro da pasta `assets/`.

### 6. Hospedar no GitHub Pages

1. Crie um repositório no GitHub
2. Faça upload dos arquivos (`index.html`, `style.css`, `app.js`, `assets/logo.png`)
3. Vá em **Settings → Pages → Branch: main → Save**
4. A URL do sistema será: `https://seu-usuario.github.io/nome-do-repo`

---

## Estrutura das abas no Google Sheets

### BD_AET
| Campo | Descrição |
|-------|-----------|
| ID | Gerado automaticamente |
| SETOR | Nome do setor |
| POSTO_TRABALHO | Nome do posto |
| CRITICIDADE_ATUAL | ALTO / MODERADO / BAIXO / AUSÊNCIA DE RISCO / EXTINTO |
| CRITICIDADE_2024 … 2019 | Histórico por ano |
| POSTO_GENERO | Masculino / Feminino / Unissex / ? |
| ATUALIZACAO | Status de atualização |
| GERENTE | Nome do gerente |
| OBSERVACOES | Observações livres |
| CONDICAO_UNISSEX | Condições para o posto ser Unissex |

### BD_PA
| Campo | Descrição |
|-------|-----------|
| ID | Gerado automaticamente |
| SETOR | Nome do setor |
| POSTO_TRABALHO | Nome do posto |
| CRITICIDADE | ALTO / MODERADO / BAIXO |
| ACAO_CONTROLE | Descrição da ação ergonômica |
| CLASSIFICACAO | Ação Normativa / Sugestão de Melhoria / Engenharia |
| ESTIMATIVA_VALOR | Valor estimado em R$ |
| GERENTE | Nome do gerente |
| RESPONSAVEL | Responsável pela ação |
| DATA_PREVISTA | Data prevista (YYYY-MM-DD) |
| DATA_CONCLUSAO | Data de conclusão (YYYY-MM-DD) |
| STATUS | OK (concluído) ou vazio |
| OBSERVACOES | Observações livres |
| EFICACIA | Avaliação de eficácia |

> O **semáforo** é calculado automaticamente pelo sistema:
> - 🟢 **CONCLUÍDO** — STATUS = OK ou DATA_CONCLUSAO preenchida
> - 🔴 **ATRASADO** — DATA_PREVISTA ultrapassada sem conclusão
> - 🟡 **EM ANDAMENTO** — demais casos

---

## Funcionalidades

| Aba | O que faz |
|-----|-----------|
| **Análise Ergonômica** | Cards com totais por criticidade, gráfico de gênero, gráfico de criticidade por setor, tabela filtrável com edição e exclusão |
| **Planos de Ação** | Cards com status das ações (%), gráficos de status e criticidade, tabela com semáforo, edição e exclusão |
| **Lançamentos** | Formulários para criar novos postos (AET) e novas ações (PA) |

---

## Observações técnicas

- Todas as operações de escrita usam requisições **GET** para evitar problemas de CORS com o Apps Script
- Os dados são codificados em **Base64 UTF-8** antes de serem enviados ao servidor
- A logo é exibida via `assets/logo.png`; se o arquivo não existir, o nome "ERGOX" é exibido como fallback
