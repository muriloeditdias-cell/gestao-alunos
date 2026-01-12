// ======================= SUPABASE (UMD) =======================
const supabaseUrl = 'https://tfhepryxbfbpfljtfryg.supabase.co'
const supabaseKey = 'sb_publishable_eR6QRHgsbqbDvzoQ3JJeeA_qbzRAn8T'
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey)

// ======================= HELPERS UI =======================
function show(el){ el?.classList.remove('hidden') }
function hide(el){ el?.classList.add('hidden') }

function setLoginError(msg){
  const box = document.getElementById('loginError')
  if (!box) return
  if (!msg) { hide(box); box.textContent = ''; return }
  box.textContent = msg
  show(box)
}

// ======================= TOGGLE GRADE =======================
function setGradeOpen(isOpen){
  const box = document.getElementById('gradeContainer')
  const icon = document.getElementById('toggleGradeIcon')
  if (!box || !icon) return

  if (isOpen) {
    box.classList.remove('closed')
    icon.textContent = '▲'
  } else {
    box.classList.add('closed')
    icon.textContent = '▼'
  }
}

// precisa existir pro onclick do HTML
window.toggleGrade = function(){
  const box = document.getElementById('gradeContainer')
  if (!box) return
  const aberto = !box.classList.contains('closed')
  setGradeOpen(!aberto)
}

// ======================= LOGIN (SUPABASE AUTH) =======================
window.login = async function(){
  const email = (document.getElementById('loginEmail')?.value || '').trim()
  const password = document.getElementById('loginSenha')?.value || ''

  if (!email || !password) {
    setLoginError('Informe email e senha.')
    return
  }

  setLoginError('')
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password })
  if (error) {
    setLoginError(error.message)
    return
  }

  // limpa senha
  const senhaEl = document.getElementById('loginSenha')
  if (senhaEl) senhaEl.value = ''
}

window.logout = async function(){
  await supabaseClient.auth.signOut()
}

// controla UI
async function applyAuthUI(){
  const app = document.getElementById('app')
  const loginModal = document.getElementById('loginModal')
  if (!app || !loginModal) return

  const { data: { session } } = await supabaseClient.auth.getSession()

  if (session) {
    hide(loginModal)
    show(app)

    // inicializa grade aberta
    setGradeOpen(true)

    // carrega dados
    atualizarAgendaUI()
    await listarAlunos()
  } else {
    hide(app)
    show(loginModal)
  }
}

supabaseClient.auth.onAuthStateChange(() => {
  applyAuthUI()
})

// ======================= CONFIG / HORÁRIOS =======================
const LIMITE_POR_SLOT = 15

const DIAS = [
  { key: 'seg', label: 'Seg' },
  { key: 'ter', label: 'Ter' },
  { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' },
  { key: 'sex', label: 'Sex' },
]

const SLOTS = [
  ['05:00','06:00'],
  ['06:00','07:00'],
  ['07:00','08:00'],
  ['08:00','09:00'],
  ['09:00','10:00'],
  ['10:00','11:30'],
  ['11:30','13:00'],
  ['13:00','15:00'],
  ['15:00','16:00'],
  ['16:00','17:00'],
  ['17:00','18:00'],
  ['18:00','19:00'],
  ['19:00','20:00'],
  ['20:00','21:00'],
]

const FECHADOS = {
  seg: new Set(['10:00-11:30','13:00-15:00']),
  qua: new Set(['10:00-11:30','13:00-15:00']),
  sex: new Set(['10:00-11:30','13:00-15:00']),
  ter: new Set(['10:00-11:30','11:30-13:00','13:00-15:00']),
  qui: new Set(['10:00-11:30','11:30-13:00','13:00-15:00']),
}

function slotKey(ini, fim){ return `${ini}-${fim}` }
function isFechado(diaKey, ini, fim){
  const set = FECHADOS[diaKey]
  return set ? set.has(slotKey(ini,fim)) : false
}

// ======================= STATE =======================
const agendaSelecionada = {}
let ultimoCountMap = null

// ======================= UTILS =======================
function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
function apenasDigitos(str){ return String(str ?? '').replace(/\D/g, '') }
function normTime(t){ return String(t ?? '').slice(0,5) }
function dataHojeISO(){ return new Date().toISOString().slice(0,10) }

function formatarBR(iso){
  if (!iso || iso === '-') return '-'
  const [y,m,d] = String(iso).split('-')
  if (!y || !m || !d) return '-'
  return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`
}

function extrairDiaVencimento(vencISO){
  if (!vencISO) return null
  const p = String(vencISO).split('-')
  if (p.length !== 3) return null
  return Number(p[2])
}

function competenciaFromYearMonth(y, m){
  return `${y}-${String(m).padStart(2,'0')}`
}

function addMonthsToCompetencia(comp, add){
  const [y,m] = comp.split('-').map(Number)
  const d = new Date(y, (m-1) + add, 1)
  return competenciaFromYearMonth(d.getFullYear(), d.getMonth()+1)
}

function vencimentoDoMes(dia, comp){
  if (!dia) return null
  const [y,m] = comp.split('-').map(Number)
  const ultimoDia = new Date(y, m, 0).getDate()
  const diaFinal = Math.min(Number(dia), ultimoDia)
  return `${y}-${String(m).padStart(2,'0')}-${String(diaFinal).padStart(2,'0')}`
}

function competenciaAtualPorDiaVenc(diaVenc){
  const hoje = new Date()
  const y = hoje.getFullYear()
  const m = hoje.getMonth() + 1
  const diaHoje = hoje.getDate()
  const compBase = competenciaFromYearMonth(y, m)
  if (!diaVenc) return compBase
  if (diaHoje > Number(diaVenc)) return addMonthsToCompetencia(compBase, 1)
  return compBase
}

function proximoVencimentoReal(diaVenc){
  const hoje = new Date()
  const y = hoje.getFullYear()
  const m = hoje.getMonth() + 1
  const compBase = competenciaFromYearMonth(y, m)
  if (!diaVenc) return null

  const vencEsteMes = vencimentoDoMes(diaVenc, compBase)
  const hojeISO = hoje.toISOString().slice(0,10)
  if (vencEsteMes && hojeISO <= vencEsteMes) return vencEsteMes
  return vencimentoDoMes(diaVenc, addMonthsToCompetencia(compBase, 1))
}

function getFreq(){
  const v = document.getElementById('freq_semana')?.value
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ======================= AGENDA UI =======================
function atualizarAgendaUI(){
  const wrap = document.getElementById('agendaSelecionada')
  const status = document.getElementById('agendaStatus')
  if (!wrap || !status) return

  const freq = getFreq()
  const dias = Object.keys(agendaSelecionada)

  wrap.innerHTML = ''
  dias
    .sort((a,b) => ['seg','ter','qua','qui','sex'].indexOf(a) - ['seg','ter','qua','qui','sex'].indexOf(b))
    .forEach(dia => {
      const info = agendaSelecionada[dia]
      const label = DIAS.find(x => x.key === dia)?.label || dia
      const tag = document.createElement('div')
      tag.className = 'tag'
      tag.innerHTML = `
        <span>${label}: ${info.ini}-${info.fim}</span>
        <button class="rm" type="button" title="Remover" onclick="removerDia('${dia}')">×</button>
      `
      wrap.appendChild(tag)
    })

  if (!freq) {
    status.textContent = 'Escolha a frequência e clique na grade para definir os dias/horários.'
    return
  }
  status.textContent = `Selecionados: ${dias.length}/${freq}. Clique na grade para adicionar/alterar.`
}

window.removerDia = function(dia){
  delete agendaSelecionada[dia]
  atualizarAgendaUI()
  renderGrade(ultimoCountMap || new Map())
}

window.limparAgenda = function(){
  Object.keys(agendaSelecionada).forEach(k => delete agendaSelecionada[k])
  atualizarAgendaUI()
  renderGrade(ultimoCountMap || new Map())
}

// ======================= AGENDA SUPABASE =======================
async function fetchAgenda(){
  const { data, error } = await supabaseClient
    .from('agenda_aluno')
    .select('dia_semana, hora_inicio, hora_fim')

  if (error) throw error
  return (data || []).map(r => ({
    dia_semana: r.dia_semana,
    hora_inicio: normTime(r.hora_inicio),
    hora_fim: normTime(r.hora_fim),
  }))
}

function buildCountMap(rows){
  const map = new Map()
  for (const r of rows){
    const k = `${r.dia_semana}|${r.hora_inicio}|${r.hora_fim}`
    map.set(k, (map.get(k) || 0) + 1)
  }
  return map
}

async function contarNoDiaSlot(dia, ini, fim){
  const { count, error } = await supabaseClient
    .from('agenda_aluno')
    .select('id', { count:'exact', head:true })
    .eq('dia_semana', dia)
    .eq('hora_inicio', ini)
    .eq('hora_fim', fim)

  if (error) throw error
  return count || 0
}

// ======================= VER ALUNOS DO HORÁRIO =======================
async function fetchAlunosDoSlot(dia, ini, fim){
  const { data, error } = await supabaseClient
    .from('agenda_aluno')
    .select(`
      aluno_id,
      alunos:aluno_id (
        id, nome, telefone, email, plano_tipo, freq_semana
      )
    `)
    .eq('dia_semana', dia)
    .eq('hora_inicio', ini)
    .eq('hora_fim', fim)

  if (error) throw error
  return (data || []).map(r => r.alunos).filter(Boolean)
}

window.verAlunosDoHorario = async function(dia, ini, fim){
  const diaLabel = DIAS.find(d => d.key === dia)?.label || dia
  try{
    const alunos = await fetchAlunosDoSlot(dia, ini, fim)
    const total = alunos.length

    const listaHtml = total
      ? alunos.map(a => `
          <div class="slot-aluno">
            <div class="slot-aluno-nome">${escapeHtml(a.nome || '-')}</div>
            <div class="slot-aluno-mini">${escapeHtml(a.plano_tipo || '-')} • ${escapeHtml(String(a.freq_semana ?? '-'))}x/sem</div>
            <div class="slot-aluno-mini">Tel: ${escapeHtml(a.telefone || '-')} • Email: ${escapeHtml(a.email || '-')}</div>
          </div>
        `).join('')
      : `<div class="slot-vazio">Nenhum aluno nesse horário.</div>`

    document.getElementById('modalTitulo').textContent = `Horário: ${diaLabel} ${ini}-${fim}`
    document.getElementById('modalConteudo').innerHTML = `
      <div class="slot-topline"><b>Vagas:</b> ${total}/${LIMITE_POR_SLOT}</div>
      <div class="slot-lista">${listaHtml}</div>
    `
    document.getElementById('modal').classList.remove('hidden')
  }catch(e){
    console.error(e)
    alert(`Erro ao carregar alunos do horário: ${e.message || e}`)
  }
}

// ======================= GRADE =======================
function cellDiv(text, cls){
  const d = document.createElement('div')
  d.className = cls
  d.textContent = text
  return d
}

function isSelecionado(dia, ini, fim){
  const sel = agendaSelecionada[dia]
  return sel && sel.ini === ini && sel.fim === fim
}

function renderGrade(countMap){
  ultimoCountMap = countMap
  const grade = document.getElementById('grade')
  if (!grade) return

  const grid = document.createElement('div')
  grid.className = 'grid'

  grid.appendChild(cellDiv('Horário', 'cell head time'))
  DIAS.forEach(d => grid.appendChild(cellDiv(d.label, 'cell head')))

  SLOTS.forEach(([ini, fim]) => {
    grid.appendChild(cellDiv(`${ini} - ${fim}`, 'cell time'))

    DIAS.forEach(d => {
      const fechado = isFechado(d.key, ini, fim)
      const k = `${d.key}|${ini}|${fim}`
      const qtd = countMap.get(k) || 0
      const cheio = qtd >= LIMITE_POR_SLOT
      const selecionado = isSelecionado(d.key, ini, fim)

      const cell = document.createElement('div')
      cell.className = 'cell'

      const box = document.createElement('div')
      box.className = 'slotbox'
      if (fechado) box.classList.add('fechado')
      else box.classList.add(cheio ? 'cheio' : 'aberto')
      if (selecionado) box.classList.add('sel')

      if (fechado) {
        box.innerHTML = `
          <div class="top"><span>FECHADO</span><span>—</span></div>
          <div class="sub">${d.label} • ${ini}-${fim}</div>
        `
      } else {
        box.innerHTML = `
          <div class="top">
            <span>${selecionado ? 'SELEC.' : (cheio ? 'CHEIO' : 'OK')}</span>
            <span>${qtd}/${LIMITE_POR_SLOT}</span>
          </div>
          <div class="sub">${d.label} • ${ini}-${fim}</div>
          <div class="slot-actions">
            <button class="mini" type="button" onclick="verAlunosDoHorario('${d.key}','${ini}','${fim}')">Ver</button>
          </div>
        `

        box.addEventListener('click', async (ev) => {
          if (ev.target && ev.target.classList.contains('mini')) return

          const freq = getFreq()
          if (!freq) return alert('Escolha a frequência (x/semana) antes de montar a agenda.')

          const jaTemDia = !!agendaSelecionada[d.key]
          const totalSel = Object.keys(agendaSelecionada).length
          if (!jaTemDia && totalSel >= freq) {
            return alert(`Você já selecionou ${totalSel}/${freq} dias. Remova um dia para adicionar outro.`)
          }

          try{
            const qtdAgora = await contarNoDiaSlot(d.key, ini, fim)
            if (qtdAgora >= LIMITE_POR_SLOT) {
              return alert(`CHEIO: ${d.label} ${ini}-${fim} (${qtdAgora}/${LIMITE_POR_SLOT})`)
            }
          }catch(e){
            console.error(e)
            return alert('Erro ao checar lotação (veja o console).')
          }

          agendaSelecionada[d.key] = { ini, fim }
          atualizarAgendaUI()
          renderGrade(ultimoCountMap || countMap)
        })
      }

      cell.appendChild(box)
      grid.appendChild(cell)
    })
  })

  grade.innerHTML = ''
  grade.appendChild(grid)
}

// ======================= PAGAMENTO =======================
async function fetchPagamentosCompetencias(comps){
  const { data, error } = await supabaseClient
    .from('pagamentos')
    .select('aluno_id, competencia, pago, data_pagamento')
    .in('competencia', comps)

  if (error) throw error
  return data || []
}

window.togglePagamentoMes = async function(alunoId, comp, btnEl){
  const statusAtual = btnEl?.dataset?.status === '1'
  const novoStatus = !statusAtual

  btnEl.disabled = true
  btnEl.textContent = '...'

  const payload = {
    aluno_id: alunoId,
    competencia: comp,
    pago: novoStatus,
    data_pagamento: novoStatus ? dataHojeISO() : null
  }

  const { error } = await supabaseClient
    .from('pagamentos')
    .upsert([payload], { onConflict: 'aluno_id,competencia' })

  if (error) {
    console.error(error)
    alert(`Erro ao atualizar pagamento: ${error.message}`)
    btnEl.disabled = false
    btnEl.textContent = statusAtual ? 'Pago' : 'Em aberto'
    return
  }

  await listarAlunos()
}

// ======================= LISTAR ALUNOS =======================
async function listarAlunos(){
  const busca = (document.getElementById('busca')?.value || '').trim()
  const filtro = document.getElementById('filtro')?.value || 'todos'

  const { data: alunos, error: errAlunos } = await supabaseClient
    .from('alunos')
    .select('id, nome, telefone, email, cpf, plano_tipo, freq_semana, valor, vencimento, observacoes')
    .order('nome', { ascending: true })

  if (errAlunos) {
    console.error(errAlunos)
    alert(`Erro ao listar alunos: ${errAlunos.message}`)
    return
  }

  // atualiza grade contagem
  const agendaRows = await fetchAgenda()
  renderGrade(buildCountMap(agendaRows))

  // pagamentos mês e próximo
  const hoje = new Date()
  const compAtual = competenciaFromYearMonth(hoje.getFullYear(), hoje.getMonth()+1)
  const compProx = addMonthsToCompetencia(compAtual, 1)
  const pagamentos = await fetchPagamentosCompetencias([compAtual, compProx])

  const pagMap = new Map()
  pagamentos.forEach(p => pagMap.set(`${p.aluno_id}|${p.competencia}`, p))

  const buscaLower = busca.toLowerCase()
  const tbody = document.getElementById('lista')
  tbody.innerHTML = ''

  alunos.forEach(aluno => {
    const nomeLower = String(aluno.nome || '').toLowerCase()
    if (busca && !nomeLower.includes(buscaLower)) return

    const diaVenc = extrairDiaVencimento(aluno.vencimento)
    const compAluno = competenciaAtualPorDiaVenc(diaVenc)

    const pag = pagMap.get(`${aluno.id}|${compAluno}`)
    const statusPago = pag?.pago === true

    if (filtro === 'pagos' && !statusPago) return
    if (filtro === 'abertos' && statusPago) return

    const proxISO = proximoVencimentoReal(diaVenc)
    const proxBR = formatarBR(proxISO)

    const planoShow = aluno.plano_tipo
      ? `${aluno.plano_tipo} • ${aluno.freq_semana || '-'}x/sem`
      : '-'

    const statusBtn = `
      <button class="btn ${statusPago ? 'pago' : 'aberto'}"
        data-status="${statusPago ? '1' : '0'}"
        onclick="togglePagamentoMes(${aluno.id}, '${compAluno}', this)"
        title="Competência: ${compAluno}"
      >${statusPago ? 'Pago' : 'Em aberto'}</button>
    `

    const perfilBtn = `<button class="btn perfil" onclick="abrirPerfil(${aluno.id})">Ver</button>`
    const excluirBtn = `<button class="btn danger" onclick="excluirAluno(${aluno.id}, '${escapeHtml(aluno.nome).replaceAll("'", "\\'")}')">Excluir</button>`

    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${escapeHtml(aluno.nome)}</td>
      <td>${escapeHtml(planoShow)}</td>
      <td>${escapeHtml(proxBR)}</td>
      <td class="acoes">${statusBtn}${perfilBtn}${excluirBtn}</td>
    `
    tbody.appendChild(tr)
  })
}

// ✅ EXPÕE DIRETO (SEM LOOP)
window.listarAlunos = listarAlunos

// ======================= PERFIL =======================
window.abrirPerfil = async function(id){
  const { data: aluno, error } = await supabaseClient
    .from('alunos')
    .select('id, nome, telefone, email, cpf, plano_tipo, freq_semana, valor, vencimento, observacoes')
    .eq('id', id)
    .single()

  if (error) {
    console.error(error)
    alert(`Erro ao abrir perfil: ${error.message}`)
    return
  }

  const { data: agenda, error: errAgenda } = await supabaseClient
    .from('agenda_aluno')
    .select('dia_semana, hora_inicio, hora_fim')
    .eq('aluno_id', id)

  if (errAgenda) {
    console.error(errAgenda)
    alert(`Erro ao carregar agenda: ${errAgenda.message}`)
    return
  }

  const diaVenc = extrairDiaVencimento(aluno.vencimento)
  const compAluno = competenciaAtualPorDiaVenc(diaVenc)

  const { data: pag, error: errPag } = await supabaseClient
    .from('pagamentos')
    .select('pago, data_pagamento')
    .eq('aluno_id', id)
    .eq('competencia', compAluno)
    .maybeSingle()

  if (errPag) {
    console.error(errPag)
    alert(`Erro ao carregar pagamento: ${errPag.message}`)
    return
  }

  const comecouBR = formatarBR(aluno.vencimento)
  const pagouBR = pag?.pago ? formatarBR(pag?.data_pagamento) : '-'
  const proxBR = formatarBR(proximoVencimentoReal(diaVenc))
  const statusTxt = pag?.pago ? `Pago (${compAluno})` : `Em aberto (${compAluno})`

  const telefoneDigits = apenasDigitos(aluno.telefone)
  const wppLink = telefoneDigits ? `https://wa.me/55${telefoneDigits}` : null

  const agendaTxt = (agenda || []).map(a => {
    const lbl = DIAS.find(d => d.key === a.dia_semana)?.label || a.dia_semana
    return `${lbl}: ${normTime(a.hora_inicio)}-${normTime(a.hora_fim)}`
  }).join('<br>') || '-'

  document.getElementById('modalTitulo').textContent = `Perfil: ${aluno.nome}`
  document.getElementById('modalConteudo').innerHTML = `
    <div class="perfil-grid">
      <div><span class="label">Começou em</span><span class="value">${escapeHtml(comecouBR)}</span></div>
      <div><span class="label">Próxima mensalidade</span><span class="value">${escapeHtml(proxBR)}</span></div>

      <div><span class="label">Status (competência)</span><span class="value">${escapeHtml(statusTxt)}</span></div>
      <div><span class="label">Dia que pagou</span><span class="value">${escapeHtml(pagouBR)}</span></div>

      <div><span class="label">Plano</span><span class="value">${escapeHtml(aluno.plano_tipo || '-')}</span></div>
      <div><span class="label">Frequência</span><span class="value">${escapeHtml(String(aluno.freq_semana ?? '-'))}x/sem</span></div>

      <div><span class="label">Telefone</span><span class="value">${escapeHtml(aluno.telefone || '-')}</span></div>
      <div><span class="label">Email</span><span class="value">${escapeHtml(aluno.email || '-')}</span></div>

      <div><span class="label">CPF</span><span class="value">${escapeHtml(aluno.cpf || '-')}</span></div>
      <div><span class="label">Valor</span><span class="value">${aluno.valor ?? '-'}</span></div>

      <div class="full"><span class="label">Agenda</span><span class="value">${agendaTxt}</span></div>
      <div class="full"><span class="label">Observações</span><span class="value">${escapeHtml(aluno.observacoes || '-')}</span></div>
    </div>

    ${wppLink ? `<a class="link" href="${wppLink}" target="_blank">Abrir WhatsApp</a>` : ''}
  `
  document.getElementById('modal').classList.remove('hidden')
}

window.fecharModal = function(){
  document.getElementById('modal').classList.add('hidden')
}
window.fecharModalCliqueFora = function(e){
  if (e.target?.id === 'modal') fecharModal()
}

// ======================= EXCLUIR =======================
window.excluirAluno = async function(id, nome){
  const ok = confirm(`Excluir o aluno "${nome}"? Essa ação não pode ser desfeita.`)
  if (!ok) return

  const { error } = await supabaseClient.from('alunos').delete().eq('id', id)
  if (error) {
    console.error(error)
    alert(`Erro ao excluir: ${error.message}`)
    return
  }

  await listarAlunos()
}

// ======================= ADICIONAR ALUNO + AGENDA =======================
window.adicionarAluno = async function(){
  const nome = document.getElementById('nome').value.trim()
  const telefone = document.getElementById('telefone').value.trim()
  const email = document.getElementById('email').value.trim()
  const cpf = document.getElementById('cpf').value.trim()
  const plano_tipo = document.getElementById('plano_tipo').value
  const freq_semana = Number(document.getElementById('freq_semana').value || 0)
  const valor = document.getElementById('valor').value
  const vencimento = document.getElementById('vencimento').value
  const observacoes = document.getElementById('observacoes').value.trim()

  if (!nome) return alert('Informe o nome do aluno.')
  if (!plano_tipo) return alert('Selecione o plano (mensal/anual).')
  if (!freq_semana) return alert('Selecione a frequência (1x..5x).')
  if (!vencimento) return alert('Informe a data de início (começou).')

  const diasEscolhidos = Object.keys(agendaSelecionada)
  if (diasEscolhidos.length !== freq_semana) {
    return alert(`Agenda incompleta: ${diasEscolhidos.length}/${freq_semana}. Complete na grade.`)
  }

  for (const dia of diasEscolhidos) {
    const { ini, fim } = agendaSelecionada[dia]
    if (isFechado(dia, ini, fim)) return alert(`Fechado: ${dia.toUpperCase()} ${ini}-${fim}`)
    const qtd = await contarNoDiaSlot(dia, ini, fim)
    if (qtd >= LIMITE_POR_SLOT) return alert(`CHEIO: ${dia.toUpperCase()} ${ini}-${fim} (${qtd}/${LIMITE_POR_SLOT})`)
  }

  const { data: alunoCriado, error: errAluno } = await supabaseClient
    .from('alunos')
    .insert([{
      nome,
      telefone: telefone || null,
      email: email || null,
      cpf: cpf || null,
      plano_tipo,
      freq_semana,
      valor: valor ? Number(valor) : null,
      vencimento,
      observacoes: observacoes || null
    }])
    .select('id')
    .single()

  if (errAluno) {
    console.error(errAluno)
    alert(`Erro ao adicionar aluno: ${errAluno.message}`)
    return
  }

  const alunoId = alunoCriado.id

  const rowsAgenda = diasEscolhidos.map(dia => ({
    aluno_id: alunoId,
    dia_semana: dia,
    hora_inicio: agendaSelecionada[dia].ini,
    hora_fim: agendaSelecionada[dia].fim
  }))

  const { error: errAgenda } = await supabaseClient.from('agenda_aluno').insert(rowsAgenda)
  if (errAgenda) {
    console.error(errAgenda)
    await supabaseClient.from('alunos').delete().eq('id', alunoId)
    alert(`Erro ao salvar agenda: ${errAgenda.message}`)
    return
  }

  document.getElementById('nome').value = ''
  document.getElementById('telefone').value = ''
  document.getElementById('email').value = ''
  document.getElementById('cpf').value = ''
  document.getElementById('observacoes').value = ''
  window.limparAgenda()

  await listarAlunos()
}

// ======================= INIT =======================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('freq_semana')?.addEventListener('change', atualizarAgendaUI)
  applyAuthUI()
})

function trocarTela(tela) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
  });

  document.getElementById(`screen-${tela}`).classList.add('active');
}
