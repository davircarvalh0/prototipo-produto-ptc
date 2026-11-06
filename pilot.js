'use strict';

function initialPilot() {
  return { clock: `${baseDate}T09:00`, reservations: [], offers: [], messages: [], requests: [] };
}

const pilotDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const pilotTime = (date, time) => new Date(`${date}T${time}:00-03:00`).getTime();
const pilotNow = () => new Date(`${pilot.clock}:00-03:00`).getTime();
const pilotId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const pilotDate = () => pilot.clock.slice(0, 10);
const pilotOpen = event => ['A confirmar', 'Confirmado'].includes(event.status);
const pilotFilter = p => p && (!state.clinic || state.clinic === p.clinic) && (!state.physio || state.physio === p.physio) && matchesPatient(p);
const pilotWhen = (date, time) => `${format(date, {day: '2-digit', month: '2-digit'})} às ${time}`;
const pilotMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const pilotOverlap = (a, b) => Math.abs(pilotMinutes(a) - pilotMinutes(b)) < 50;

function cancellationStatus(event) {
  return pilotTime(event.date, event.time) - pilotNow() < 86400000
    ? 'Cancelamento tardio'
    : 'Cancelado com antecedência';
}

function pilotMessage(key, pid, type, title, body, extra = {}) {
  if (pilot.messages.some(message => message.key === key)) return;
  pilot.messages.unshift({ key, pid, type, title, body, at: pilot.clock, ...extra });
}

function reservationFor(pid) {
  return pilot.reservations.find(reservation => reservation.pid === pid && reservation.active);
}

function reservesDay(reservation, date) {
  return date >= reservation.start && reservation.days.includes(from(date).getDay());
}

function reservedConflict(patient, date, time, offer) {
  return pilot.reservations.some(reservation => {
    const owner = person(reservation.pid);
    if (!reservation.active || !owner || owner.physio !== patient.physio || !reservesDay(reservation, date) || !pilotOverlap(reservation.time, time)) return false;
    if (owner.id === patient.id && person(owner.id).renew === 'Autorizado' && reservation.time === time) return false;
    return !(offer?.owner === owner.id && offer.pid === patient.id && offer.date === date && offer.time === time);
  });
}

function pilotOccurrences(start, end) {
  const holds = [];
  for (const reservation of pilot.reservations.filter(item => item.active && pilotFilter(person(item.pid)))) {
    for (let day = from(start); iso(day) <= end; day = addDays(day, 1)) {
      const date = iso(day);
      if (date < pilotDate() || !reservesDay(reservation, date)) continue;
      const covered = events.some(event => event.date === date && activeEvent(event) && event.time === reservation.time && (event.pid === reservation.pid || event.loanFor === reservation.pid));
      if (!covered) holds.push({pid: reservation.pid, date, time: reservation.time, hold: true, status: reservation.released.includes(date) ? 'Avulsa disponível' : 'Horário reservado'});
    }
  }
  return holds;
}

function updatePilot() {
  for (const p of people) {
    if (p.pay !== 'Convênio' || p.total >= 10 || p.session < 3 || p.renew !== 'Acompanhar') continue;
    p.renew = 'Preparar relatório';
  }
  for (const event of events.filter(pilotOpen)) {
    const until = pilotTime(event.date, event.time) - pilotNow();
    if (until <= 0 || until > 86400000) continue;
    const p = person(event.pid);
    pilotMessage(`reminder:${event.id}:${event.date}:${event.time}`, p.id, 'reminder', 'Lembrete de sessão', `Olá, ${p.name.split(' ')[0]}! Sua sessão na unidade ${p.clinic} está marcada para ${pilotWhen(event.date, event.time)}. Você pode confirmar, cancelar ou pedir outro horário.`, {eventId: event.id});
  }
  for (const p of people) {
    if (p.pay !== 'Convênio' || p.session !== 5) continue;
    const reservation = reservationFor(p.id);
    let schedule = 'A recepção pode conversar com você sobre a retomada e o seu horário.';
    if (p.resumedOn) schedule = `Seu retorno no horário habitual está marcado para ${format(p.resumedOn, {day: '2-digit', month: '2-digit'})}.`;
    else if (reservation) schedule = `Seu horário habitual (${reservation.days.map(day => pilotDays[day]).join(' e ')}, às ${reservation.time}) está reservado para a retomada.`;
    const authorization = p.total >= 10 ? 'O novo lote já foi autorizado.' : 'A equipe avisará quando houver retorno do convênio.';
    pilotMessage(`fifth:${p.id}`, p.id, 'notice', 'Acompanhamento após a 5ª sessão', `Olá, ${p.name.split(' ')[0]}! As próximas sessões dão continuidade ao plano de acompanhamento. Converse com seu fisioterapeuta sobre as orientações para esta etapa. ${schedule} ${authorization}`);
  }
  for (const offer of pilot.offers) {
    if (offer.status === 'Pendente' && pilotTime(offer.date, offer.time) <= pilotNow()) offer.status = 'Expirada';
  }
}

function pilotFinish(message) {
  persist();
  $('#modal').close();
  render();
  notify(message);
}

function pilotDaysField(selected = [2, 4]) {
  return `<fieldset class="pilot-days"><legend>Dias do horário recorrente</legend>${[1, 2, 3, 4, 5, 6].map(day => `<label><input type="checkbox" name="pilot-day" value="${day}" ${selected.includes(day) ? 'checked' : ''}> ${pilotDays[day]}</label>`).join('')}</fieldset>`;
}

function pilotScheduleFields(start, time, days) {
  return `<div class="form-grid"><div class="field"><label for="pilot-start">Primeira data possível</label><input type="date" id="pilot-start" min="${pilotDate()}" value="${start}" required></div><div class="field"><label for="pilot-time">Horário</label><input type="time" id="pilot-time" min="07:00" max="19:00" value="${time}" required></div></div>${pilotDaysField(days)}`;
}

function readPilotSchedule() {
  return {start: $('#pilot-start').value, time: $('#pilot-time').value, days: [...document.querySelectorAll('[name=pilot-day]:checked')].map(input => Number(input.value))};
}

function pilotReport(p) {
  openModal(`<h2>Relatório de evolução</h2><p>${esc(p.name)} · ${esc(p.physio)}</p><form id="pilot-form"><div class="field"><label for="pilot-report">Síntese do relatório fictício</label><textarea id="pilot-report" rows="4" maxlength="500" required>${esc(p.report || '')}</textarea></div>${modalActions('<button type="submit" class="primary">Validar relatório</button>')}</form>`);
  $('#pilot-form').onsubmit = event => {
    event.preventDefault();
    p.report = $('#pilot-report').value.trim();
    if (!p.report) return;
    p.renew = 'Relatório pronto';
    pilotFinish('Relatório validado. A recepção pode registrar o envio pelo portal.');
  };
}

function pilotSendRenewal(p) {
  const current = reservationFor(p.id);
  const upcoming = events.filter(event => event.pid === p.id && pilotOpen(event) && event.date >= pilotDate()).sort((a, b) => a.date.localeCompare(b.date));
  const after = iso(addDays(from(upcoming.at(-1)?.date ?? pilotDate()), 1));
  openModal(`<h2>Registrar envio e reservar horário</h2><p>${esc(p.name)} · ${esc(p.physio)}</p><p>Registre a solicitação feita no portal na 3ª ou 4ª sessão, conforme o convênio. A reserva será usada para a retomada após a liberação.</p><form id="pilot-form">${pilotScheduleFields(current?.start > pilotDate() ? current.start : after, current?.time || p.routine?.time || upcoming[0]?.time || '10:00', current?.days || p.routine?.days)}<label><input type="checkbox" style="width:auto" required> Confirmei o envio no portal do convênio</label><p class="error" id="pilot-error" role="alert"></p>${modalActions('<button type="submit" class="primary">Registrar envio e reserva</button>')}</form>`);
  $('#pilot-form').onsubmit = event => {
    event.preventDefault();
    const schedule = readPilotSchedule();
    if (!current && schedule.start < after) {
      $('#pilot-error').textContent = 'Inicie a reserva após as sessões já agendadas no lote atual.';
      return;
    }
    const conflict = events.some(item => item.pid !== p.id && activeEvent(item) && person(item.pid)?.physio === p.physio && reservesDay(schedule, item.date) && pilotOverlap(schedule.time, item.time) && item.loanFor !== p.id);
    const another = pilot.reservations.some(item => item.active && item.pid !== p.id && person(item.pid)?.physio === p.physio && item.days.some(day => schedule.days.includes(day)) && pilotOverlap(item.time, schedule.time));
    if (!schedule.days.length || conflict || another) {
      $('#pilot-error').textContent = !schedule.days.length ? 'Escolha os dias do horário recorrente.' : 'O profissional já tem um compromisso nesse horário. Ajuste a reserva.';
      return;
    }
    if (current) Object.assign(current, schedule);
    else pilot.reservations.push({...schedule, pid: p.id, active: true, released: []});
    p.renew = 'Em análise';
    pilotFinish('Envio registrado e horário recorrente reservado.');
  };
}

function compatibleWait(entry, date, time, owner) {
  const patient = person(entry.pid);
  return entry.status === 'Disponível' && patient && patient.id !== owner.id && patient.clinic === owner.clinic && patient.physio === owner.physio &&
    entry.days.includes(from(date).getDay()) && time >= entry.start && pilotMinutes(time) + 50 <= pilotMinutes(entry.end);
}

function pilotOfferSlot(owner, date, time, loan, originalEventId) {
  const reservation = loan ? reservationFor(owner.id) : null;
  if (pilotTime(date, time) <= pilotNow()) return notify('Escolha uma vaga futura no relógio do piloto.');
  const existing = pilot.offers.find(item => item.date === date && item.time === time && person(item.pid)?.physio === owner.physio && item.status === 'Pendente');
  if (existing) return notify(`A oferta para ${person(existing.pid).name} aguarda resposta no WhatsApp simulado.`);
  const permission = loan ? {owner: owner.id, date, time} : null;
  const candidates = waiting.filter(entry => compatibleWait(entry, date, time, owner) && !checkBooking(entry.pid, date, time, undefined, permission && {...permission, pid: entry.pid}));
  openModal(`<h2>${loan ? 'Oferecer vaga avulsa' : 'Oferecer vaga cancelada'}</h2><p>${pilotWhen(date, time)} · ${esc(owner.clinic)} · ${esc(owner.physio)}</p>${loan ? '<p>A oferta vale para uma sessão. A reserva recorrente continua vinculada ao paciente original.</p>' : ''}${candidates.length ? `<form id="pilot-form"><div class="field"><label for="pilot-candidate">Paciente compatível</label><select id="pilot-candidate" required>${options(candidates.map(item => ({value: item.pid, label: person(item.pid).name})))}</select></div>${modalActions('<button type="submit" class="primary">Oferecer pelo WhatsApp</button>')}</form>` : `<div class="notice"><p>Nenhum paciente da lista está disponível e autorizado nesse horário.</p></div>${modalActions()}`}`);
  if (!candidates.length) return;
  $('#pilot-form').onsubmit = event => {
    event.preventDefault();
    const pid = Number($('#pilot-candidate').value);
    const id = pilotId();
    if (reservation && !reservation.released.includes(date)) reservation.released.push(date);
    pilot.offers.push({id, pid, owner: loan ? owner.id : null, date, time, originalEventId, status: 'Pendente'});
    pilotMessage(`offer:${id}`, pid, 'offer', 'Oferta da lista de espera', `Surgiu uma vaga de fisioterapia em ${pilotWhen(date, time)}, na unidade ${owner.clinic}. Você pode aceitar essa sessão avulsa ou recusar.`, {offerId: id});
    pilotFinish('Oferta disponível na caixa de mensagens do WhatsApp simulado.');
  };
}

function pilotHold(pid, date) {
  const p = person(pid);
  const reservation = reservationFor(p.id);
  if (!reservation) return;
  let action = '';
  if (p.renew === 'Em análise') action = '<button id="pilot-release" class="primary">Oferecer só neste dia</button>';
  if (p.renew === 'Autorizado') action = '<button id="pilot-resume" class="primary">Agendar retomada</button>';
  openModal(`<h2>Horário recorrente</h2><p>${esc(p.name)} · ${pilotWhen(date, reservation.time)}</p><p>${esc(p.renew)} · ${reservation.days.map(day => pilotDays[day]).join(' e ')}</p>${modalActions(action)}`);
  if ($('#pilot-release')) $('#pilot-release').onclick = () => { $('#modal').close(); pilotOfferSlot(p, date, reservation.time, true); };
  if ($('#pilot-resume')) $('#pilot-resume').onclick = () => { $('#modal').close(); resumePilot(p); };
}

function nextPilotSlots(patient, schedule, count) {
  const slots = [];
  for (let i = 0; i < 60 && slots.length < count; i++) {
    const date = iso(addDays(from(schedule.start > pilotDate() ? schedule.start : pilotDate()), i));
    if (reservesDay(schedule, date) && pilotTime(date, schedule.time) > pilotNow() && !checkBooking(patient.id, date, schedule.time)) slots.push(date);
  }
  return slots;
}

function resumePilot(p) {
  const reservation = reservationFor(p.id);
  if (!reservation) return sessionForm(null, {pid: p.id});
  const scheduled = events.filter(event => event.pid === p.id && pilotOpen(event)).length;
  const remaining = p.total - p.session - scheduled;
  const dates = nextPilotSlots(p, reservation, remaining);
  if (!dates.length || dates.length !== remaining) return notify('Não há horários suficientes para agendar o saldo. Confira a agenda e as vagas avulsas já aceitas.');
  openModal(`<h2>Retomar no horário habitual</h2><p>${esc(p.name)} · ${reservation.time}</p><p>${dates.map(date => format(date, {day: '2-digit', month: '2-digit'})).join(' · ')}</p>${modalActions('<button class="primary" id="pilot-confirm-resume">Agendar sessões autorizadas</button>')}`);
  $('#pilot-confirm-resume').onclick = () => {
    if (p.renew !== 'Autorizado' || !reservation.active || dates.some(date => checkBooking(p.id, date, reservation.time))) return notify('A disponibilidade mudou. Confira a reserva novamente.');
    for (const date of dates) events.push({id: Date.now() + events.length, pid: p.id, date, time: reservation.time, status: 'A confirmar'});
    reservation.active = false;
    p.resumedOn = dates[0];
    pilotMessage(`resume:${p.id}:${dates[0]}`, p.id, 'notice', 'Retomada confirmada', `A clínica marcou o retorno em ${pilotWhen(dates[0], reservation.time)}, no seu horário habitual.`);
    pilotFinish('Sessões autorizadas agendadas no horário habitual.');
  };
}

function pilotVideo(p) {
  openModal(`<h2>Compartilhar vídeo de exercício</h2><p>${esc(p.name)} · ${esc(p.physio)}</p><form id="pilot-form"><div class="field"><label for="pilot-video-url">Link HTTPS escolhido pelo fisioterapeuta</label><input id="pilot-video-url" type="url" placeholder="https://…" required></div><div class="field"><label for="pilot-video-text">Orientação individual</label><textarea id="pilot-video-text" rows="3" maxlength="350" required></textarea></div><p class="error" id="pilot-error" role="alert"></p>${modalActions('<button class="primary" type="submit">Compartilhar na simulação</button>')}</form>`);
  $('#pilot-form').onsubmit = event => {
    event.preventDefault();
    const url = $('#pilot-video-url').value.trim();
    const note = $('#pilot-video-text').value.trim();
    if (!safePilotVideo(url) || !note) { $('#pilot-error').textContent = 'Informe um link HTTPS e escreva a orientação.'; return; }
    pilotMessage(`video:${pilotId()}`, p.id, 'video', 'Vídeo de acompanhamento', `${p.physio}: ${note}`, {url});
    pilotFinish('Vídeo disponível na caixa de mensagens do WhatsApp simulado.');
  };
}

function safePilotVideo(url) {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

function pilotDischarge(p) {
  if (p.session < 10 || p.discharged) return;
  openModal(`<h2>Registrar alta</h2><p>${esc(p.name)} · 10 sessões concluídas. Registre a decisão do fisioterapeuta após a avaliação final.</p>${modalActions('<button class="primary" id="pilot-confirm-discharge">Confirmar alta</button>')}`);
  $('#pilot-confirm-discharge').onclick = () => {
    p.discharged = pilotDate();
    const reservation = reservationFor(p.id);
    if (reservation) reservation.active = false;
    pilotMessage(`discharge:${p.id}`, p.id, 'notice', 'Alta registrada', 'O fisioterapeuta registrou a alta após a avaliação final. Se tiver dúvidas sobre as orientações, fale com a equipe.');
    pilotFinish('Alta registrada pela equipe.');
  };
}

function pilotRequest(clinic) {
  const existing = pilot.requests.find(request => request.clinic === clinic && request.status !== 'Agendado');
  if (existing) return existing;
  const number = pilot.requests.length + 1;
  const request = {id: pilotId(), name: `Paciente piloto ${number}`, clinic, status: 'Pedido recebido'};
  pilot.requests.push(request);
  persist();
  return request;
}

function pilotIntake(request) {
  if (request.status === 'Pedido recebido') {
    openModal(`<h2>Registrar guia inicial</h2><p>${esc(request.name)} · ${esc(request.clinic)}</p><form id="pilot-form"><div class="field"><label for="pilot-guide">Referência fictícia da guia enviada no portal</label><input id="pilot-guide" maxlength="60" required></div>${modalActions('<button type="submit" class="primary">Registrar guia enviada</button>')}</form>`);
    $('#pilot-form').onsubmit = event => {
      event.preventDefault();
      request.guide = $('#pilot-guide').value.trim();
      if (!request.guide) return;
      request.status = 'Guia enviada';
      pilotFinish('Guia registrada. Aguarde a autorização do primeiro lote.');
    };
    return;
  }
  openModal(`<h2>Autorizar e agendar cinco sessões</h2><p>${esc(request.name)} · ${esc(request.clinic)} · guia ${esc(request.guide)}</p><p>Disponibilidade informada: ${esc(request.availability || 'A confirmar com o paciente')}</p><form id="pilot-form"><div class="field"><label for="pilot-prof">Fisioterapeuta</label><select id="pilot-prof">${options(clinicians)}</select></div>${pilotScheduleFields(pilotDate(), '10:00')}<label><input type="checkbox" style="width:auto" required> Confirmei a autorização das cinco sessões no portal</label><p class="error" id="pilot-error" role="alert"></p>${modalActions('<button type="submit" class="primary">Agendar primeiro lote</button>')}</form>`);
  $('#pilot-form').onsubmit = event => {
    event.preventDefault();
    const schedule = readPilotSchedule();
    const patient = {id: Math.max(0, ...people.map(p => p.id)) + 1, name: request.name, clinic: request.clinic, physio: $('#pilot-prof').value, pay: 'Convênio', session: 0, total: 5, renew: 'Acompanhar', preferred: `${schedule.days.map(day => pilotDays[day]).join(' e ')}, às ${schedule.time}`, routine: schedule};
    people.push(patient);
    const dates = nextPilotSlots(patient, schedule, 5);
    if (dates.length !== 5) {
      people.pop();
      $('#pilot-error').textContent = 'Escolha dias e horário com disponibilidade para as cinco sessões.';
      return;
    }
    for (const date of dates) events.push({id: Date.now() + events.length, pid: patient.id, date, time: schedule.time, status: 'A confirmar'});
    request.status = 'Agendado';
    pilotMessage(`initial:${patient.id}`, patient.id, 'notice', 'Primeiro lote agendado', `As cinco primeiras sessões foram autorizadas e marcadas. A primeira será em ${pilotWhen(dates[0], schedule.time)} na unidade ${patient.clinic}.`);
    pilotFinish('Primeiro lote autorizado e cinco sessões registradas na agenda.');
  };
}

function pilotPage() {
  const visible = pilot.offers.filter(offer => pilotFilter(person(offer.pid)));
  return head('Operação do piloto', 'Acompanhe os pedidos, as mensagens e os aceites da lista de espera.') + `
    <section class="panel pilot-panel"><div class="panel-head"><h2>Relógio da demonstração</h2><a href="assistant.html?inbox=1" target="_blank" rel="noopener">Abrir mensagens do WhatsApp</a></div>
      <form class="pilot-body pilot-clock" id="pilot-clock-form"><div class="field"><label for="pilot-clock">Data e hora em Recife</label><input id="pilot-clock" type="datetime-local" min="${pilot.clock}" value="${pilot.clock}" required></div><button type="submit" class="primary">Rodar automações</button><small>Avance o relógio para gerar lembretes das próximas 24 horas e atualizar as ofertas vencidas. As mensagens aparecem na caixa do assistente.</small></form>
    </section>
    <section class="panel pilot-panel"><div class="panel-head"><h2>Pedidos iniciais pelo WhatsApp</h2></div><div class="pilot-body">${pilot.requests.length ? pilot.requests.map(request => `<div class="pilot-row"><div><strong>${esc(request.name)}</strong><small>${esc(request.clinic)} · ${esc(request.status)}</small></div>${request.status !== 'Agendado' ? `<button data-pilot-intake="${esc(request.id)}">${request.status === 'Pedido recebido' ? 'Registrar guia' : 'Confirmar autorização'}</button>` : ''}</div>`).join('') : '<p>Escolha Primeiro atendimento e Convênio na simulação do WhatsApp para gerar um pedido.</p>'}</div></section>
    <section class="panel pilot-panel"><div class="panel-head"><h2>Ofertas de encaixe</h2></div><div class="pilot-body">${visible.length ? visible.map(offer => `<div class="pilot-row"><div><strong>${esc(person(offer.pid).name)}</strong><small>${pilotWhen(offer.date, offer.time)} · ${offer.owner ? 'Vaga avulsa de uma reserva' : 'Vaga da lista de espera'}</small></div>${badge(offer.status)}</div>`).join('') : '<p>As ofertas enviadas a partir da agenda e da lista de espera aparecem aqui.</p>'}</div></section>`;
}

function bindPilotPage() {
  const form = $('#pilot-clock-form');
  if (form) form.onsubmit = event => {
    event.preventDefault();
    const next = $('#pilot-clock').value;
    if (!next || next < pilot.clock) return notify('Escolha um horário igual ou posterior ao relógio atual.');
    pilot.clock = next;
    pilotFinish('Automações atualizadas. Confira as mensagens no assistente.');
  };
  document.querySelectorAll('[data-pilot-intake]').forEach(button => button.onclick = () => {
    const request = pilot.requests.find(item => item.id === button.dataset.pilotIntake);
    if (request && request.status !== 'Agendado') pilotIntake(request);
  });
  document.querySelectorAll('[data-hold]').forEach(button => button.onclick = () => pilotHold(Number(button.dataset.hold), button.dataset.date));
}

function pilotInbox() {
  return `<div class="pilot-inbox"><h2>Mensagens do piloto</h2>${pilot.messages.length ? `<div class="field"><label for="pilot-message">Selecione a mensagem e o paciente</label><select id="pilot-message"><option value="">Escolha uma mensagem…</option>${options(pilot.messages.map(message => ({value: message.key, label: `${message.title} · ${person(message.pid)?.name || 'Paciente'}`})))}</select></div><button id="pilot-open-message">Abrir conversa</button>` : '<p>As mensagens geradas no sistema gerencial aparecerão aqui.</p>'}</div>`;
}

function openPilotMessage(message) {
  if (!message) return;
  chatLog = [{who: 'bot', text: message.body, url: message.url}];
  chatStep = 'done';
  if (message.type === 'reminder') {
    chatEventId = message.eventId;
    chatScenario = 'confirm';
    $('#scenario').value = chatScenario;
    const event = events.find(item => item.id === message.eventId);
    if (event && pilotOpen(event) && pilotTime(event.date, event.time) > pilotNow() && message.key === `reminder:${event.id}:${event.date}:${event.time}`) chatStep = 'start';
    else chatLog.push({who: 'bot', text: 'Este horário já passou ou foi atualizado. Consulte a recepção para confirmar o atendimento.'});
  } else if (message.type === 'offer') {
    const offer = pilot.offers.find(item => item.id === message.offerId);
    if (offer?.status === 'Pendente') {
      activePilotOffer = offer.id;
      chatStep = 'offer';
    } else if (offer) chatLog.push({who: 'bot', text: `Situação da oferta: ${offer.status}.`});
  }
  drawChat();
}

let activePilotOffer;
async function respondPilotOffer(accept) {
  const apply = () => {
    try { restoreDemo(JSON.parse(localStorage.getItem('movimento-demo-v1'))); } catch { /* Continue with the in-memory demonstration. */ }
    const offer = pilot.offers.find(item => item.id === activePilotOffer);
    if (!offer || offer.status !== 'Pendente') return 'Esta oferta já foi atualizada. Consulte as mensagens do piloto.';
    if (pilotTime(offer.date, offer.time) <= pilotNow()) {
      offer.status = 'Expirada';
      persist();
      return 'O horário desta oferta já passou.';
    }
    if (!accept) {
      offer.status = 'Recusada';
      persist();
      return 'Recusa registrada. A clínica pode oferecer a vaga a outra pessoa.';
    }
    const reservation = offer.owner ? reservationFor(offer.owner) : null;
    const source = events.find(event => event.id === offer.originalEventId);
    const valid = (!offer.owner || (reservation?.released.includes(offer.date) && person(offer.owner).renew === 'Em análise')) && (!offer.originalEventId || (source && !activeEvent(source) && source.date === offer.date && source.time === offer.time));
    const error = valid ? checkBooking(offer.pid, offer.date, offer.time, undefined, offer) : 'A vaga não está mais disponível.';
    if (error) {
      offer.status = 'Indisponível';
      persist();
      return error;
    }
    events.push({id: Date.now() + events.length, pid: offer.pid, date: offer.date, time: offer.time, status: 'Confirmado', loanFor: offer.owner || undefined});
    offer.status = 'Aceita';
    persist();
    return `Sessão avulsa confirmada para ${pilotWhen(offer.date, offer.time)}.`;
  };
  const reply = navigator.locks ? await navigator.locks.request('movimento-pilot-offer', apply) : apply();
  chatLog.push({who: 'bot', text: reply});
  chatStep = 'done';
  drawChat();
}
