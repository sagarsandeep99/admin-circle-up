// ─── STATE ───────────────────────────────────────────────
let allParticipants = [], allVenues = [], allEvents = [], allCrue = [];
let allVenueCities = [], allVenueAreas = [];
let deleteTarget = { type: null, id: null };

const PRICING_MATRIX = {
  'Early Bird – Male': 1800, 'Early Bird – Female': 1000,
  'General – Male': 2100, 'General – Female': 1300
};
const MODALS = ['participantModal', 'eventModal', 'venueModal', 'crueModal', 'deleteModal'];

// ─── HELPERS ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => d.split('-').reverse().join('/');
const digits = s => String(s ?? '').replace(/\D/g, '');
const todayStr = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const isUpcoming = e => e.event_date >= todayStr();
const countFor = eventId => allParticipants.filter(p => (p.event_ids && p.event_ids.includes(eventId)) || p.event_id === eventId).length;
const emptyRow = (cols, msg) => `<tr><td colspan="${cols}" class="empty-cell">${msg}</td></tr>`;

function showModal(id) { $(id).classList.remove('hidden'); document.body.classList.add('modal-open'); }
function hideModal(id) { $(id).classList.add('hidden'); if (!MODALS.some(m => !$(m).classList.contains('hidden'))) document.body.classList.remove('modal-open'); }

function showToast(msg, type = 'success') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => el.classList.add('hidden'), 4000);
}

function checkRequired(fields) {
  const missing = [];
  fields.forEach(([el, label]) => {
    const bad = !el.value.trim();
    el.classList.toggle('invalid', bad);
    if (bad) missing.push(label);
  });
  if (missing.length) showToast(`Please fill in these fields: ${missing.join(', ')}`, 'error');
  return !missing.length;
}
function flagInvalid(el, msg) { el.classList.add('invalid'); showToast(msg, 'error'); return false; }

async function saveRecord(table, id, payload, label, btn, closeFn) {
  btn.disabled = true;
  const { error } = id
    ? await db.from(table).update(payload).eq('id', id)
    : await db.from(table).insert([payload]);
  btn.disabled = false;
  if (error) {
    console.error(error);
    showToast(error.code === '23505' ? `That ${label} already exists (duplicate code/ID).` : `Could not save ${label}: ${error.message}`, 'error');
    return;
  }
  showToast(`${label[0].toUpperCase() + label.slice(1)} saved successfully!`);
  closeFn();
  await loadAllDataPools();
}

// ─── AUTH ────────────────────────────────────────────────
async function handleLogin() {
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const errEl = $('loginError'), btn =$('loginBtn');
  errEl.classList.add('hidden');
  if (!email || !password) { errEl.textContent = 'Enter your email and password.'; errEl.classList.remove('hidden'); return; }

  btn.textContent = 'Verifying Account...';
  btn.disabled = true;
  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw error || new Error('No session');
    showApp();
  } catch (err) {
    errEl.textContent = 'Sign-in failed. Check your email and password.';
    errEl.classList.remove('hidden');
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
}

function showLogin() {
  allParticipants = []; allVenues = []; allEvents = []; allCrue = [];
  MODALS.forEach(m => $(m).classList.add('hidden'));
  document.body.classList.remove('modal-open');
  $('mainApp').classList.add('hidden');
  $('loginPage').classList.remove('hidden');$('loginPassword').value = '';
}

async function handleLogout() {
  await db.auth.signOut();
  showLogin();
}

async function showApp() {
  $('loginPage').classList.add('hidden');$('mainApp').classList.remove('hidden');
  switchTab('dashboard');
  await loadAllDataPools();
}

function toggleLoginPassword() {
  const input = $('loginPassword');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('eyeIconOpen').classList.toggle('hidden', show);$('eyeIconClosed').classList.toggle('hidden', !show);
}

// ─── DATA ────────────────────────────────────────────────
async function loadAllDataPools() {
  const [v, e, p, c, cityResult, areaResult] = await Promise.all([
    db.from('venues').select('*').order('venue_name', { ascending: true }),
    db.from('events').select('*, venues(*)').order('event_date', { ascending: true }),
    db.from('participants').select('*, events(*, venues(*))').order('created_at', { ascending: false }),
    db.from('crue').select('*').order('name', { ascending: true }),
    db.from('venue_cities').select('id, name, state_name, city_code, sort_order').order('sort_order', { ascending: true }).order('name', { ascending: true }),
    db.from('venue_areas').select('id, city_id, name, area_code, sort_order').order('sort_order', { ascending: true }).order('name', { ascending: true })
  ]);
  if (v.error || e.error || p.error || c.error) {
    console.error(v.error || e.error || p.error || c.error);
    showToast('Could not load some data. Check your connection or access.', 'error');
  }
  allVenues = v.data || allVenues;
  allEvents = e.data || allEvents;
  allParticipants = p.data || allParticipants;
  allCrue = c.data || allCrue;

  if (cityResult.error || areaResult.error) {
    console.error('Could not load venue city/area lists:', cityResult.error || areaResult.error);
    allVenueCities = [];
    allVenueAreas = [];
    showToast('City/area lists could not load. Run the venue cities/areas SQL in Supabase.', 'error');
  } else {
    allVenueCities = cityResult.data || [];
    allVenueAreas = areaResult.data || [];
  }

  populateEventDropdowns();
  renderDashboard();
  renderEvents();
  renderParticipants();
  renderVenues();
  renderCrue();
}

// ─── NAVIGATION ──────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(n => n.classList.remove('active'));
  $(`${tabId}Section`)?.classList.remove('hidden');
  $(`nav-${tabId}`)?.classList.add('active');
  $(`mob-nav-${tabId}`)?.classList.add('active');
  window.scrollTo(0, 0);
}

function navigateToPastEvents() {
  $('eventTimelineFilter').value = 'past';
  renderEvents();
  switchTab('events');
}

// ─── DASHBOARD ───────────────────────────────────────────
function renderDashboard() {
  const paid = allParticipants.filter(p => p.payment_status === 'Paid');
  const revenue = paid.reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);
  const stats = [
    ['Participants', allParticipants.length],
    ['Paid', paid.length],
    ['Collected', '₹' + revenue.toLocaleString('en-IN')],
    ['Upcoming Events', allEvents.filter(isUpcoming).length],
    ['CrUE Members', allCrue.length]
  ];
  $('statsGrid').innerHTML = stats.map(([l, v]) => `<div class="stat-card"><span>${l}</span><strong>${v}</strong></div>`).join('');

  renderUpcomingEventBanner();

  const recent = allParticipants.slice(0, 6);
  $('recentTableBody').innerHTML = recent.length ? recent.map(p => `
    <tr>
      <td data-label="CUE ID"><span class="cue-id">${esc(p.cue_id)}</span></td>
      <td data-label="Full Name">${esc(p.name)}</td>
      <td data-label="Gender">${genderBadge(p.gender)}</td>
      <td data-label="Pass Type">${esc(p.ticket_type)}</td>
      <td data-label="Payment">${paymentBadge(p.payment_status)}</td>
      <td data-label="Status">${attendanceBadge(p.attendance_status)}</td>
    </tr>`).join('') : emptyRow(6, 'No participant entries recorded.');
}

function renderUpcomingEventBanner() {
  const box = $('upcomingEventContainer');
  const live = allEvents.filter(isUpcoming);

  if (!allEvents.length) {
    box.innerHTML = `<div class="upcoming-event-banner"><div class="event-details"><h3>No Events Yet</h3></div></div>`;
    return;
  }
  if (!live.length) {
    box.innerHTML = `<div class="upcoming-event-banner"><div class="event-details"><h3>No Upcoming Events</h3><p>All events are in the past.</p></div>
      <div class="banner-side"><a href="#" class="banner-corner-link" onclick="navigateToPastEvents(); return false;">View Past Events →</a></div></div>`;
    return;
  }

  const ev = live[0];
  const roster = allParticipants.filter(p => (p.event_ids && p.event_ids.includes(ev.id)) || p.event_id === ev.id);
  const males = roster.filter(p => p.gender === 'Male').length;
  const [y, m, d] = ev.event_date.split('-').map(Number);
  const dateStr = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  box.innerHTML = `
    <div class="upcoming-event-banner">
      <div class="event-details">
        <p class="banner-eyebrow">Next Event</p>
        <h3>${dateStr}</h3>
        <p>Venue: <strong>${esc(ev.venues?.venue_name || 'Unassigned')}${ev.venues?.city ? ` (${esc(ev.venues.city)})` : ''}</strong></p>
        <p>Participants: <strong>${roster.length} participants</strong> · ${males} male / ${roster.length - males} female</p>
      </div>
      <div class="banner-side">
        <span class="event-status-pill">Upcoming</span>
        <a href="#" class="banner-corner-link" onclick="navigateToPastEvents(); return false;">View Past Events →</a>
      </div>
    </div>`;
}

// ─── EVENTS ──────────────────────────────────────────────
function renderEvents() {
  const mode = $('eventTimelineFilter').value;
  let list = allEvents.filter(e => mode === 'all' || (mode === 'upcoming' ? isUpcoming(e) : !isUpcoming(e)));
  if (mode === 'past') list = [...list].reverse();

  $('eventsTableBody').innerHTML = list.length ? list.map(e => `
    <tr>
      <td data-label="Event ID"><strong>#EVT-${e.id}</strong></td>
      <td data-label="Date">${fmtDate(e.event_date)}</td>
      <td data-label="Venue">${esc(e.venues?.venue_name || 'Error')}</td>
      <td data-label="City">${esc(e.venues?.city || '')}</td>
      <td data-label="Participants"><span class="cue-id">${countFor(e.id)} Assigned</span></td>
      <td class="actions-cell"><div class="action-btns">
        <button class="btn-edit" onclick="openEventModal(${e.id})">Edit</button>
        <button class="btn-del" onclick="initiateDelete('event', ${e.id})">Delete</button>
      </div></td>
    </tr>`).join('') : emptyRow(6, 'No events match the selected timeline.');
}

function openEventModal(id = null) {
  $('eVenue').innerHTML = '<option value="">-- Choose Venue --</option>' +
    allVenues.map(v => `<option value="${v.id}">${esc(v.venue_name)} (${esc(v.city)})</option>`).join('');
  ['eDate', 'eVenue'].forEach(i => $(i).classList.remove('invalid'));

  const target = id ? allEvents.find(e => e.id === id) : null;
  $('eventModalTitle').textContent = target ? 'Edit Event' : 'Add Event';
  $('eventIdHidden').value = target?.id ?? '';
  $('eDate').value = target?.event_date ?? '';
  $('eVenue').value = target?.venue_id ?? '';
  showModal('eventModal');
}
function closeEventModal() { hideModal('eventModal'); }

async function saveEvent(btn) {
  const dateEl = $('eDate'), venueEl =$('eVenue');
  if (!checkRequired([[dateEl, 'Event Date'], [venueEl, 'Venue']])) return;
  await saveRecord('events', $('eventIdHidden').value, { event_date: dateEl.value, venue_id: parseInt(venueEl.value, 10) }, 'event', btn, closeEventModal);
}

// ─── PARTICIPANTS ────────────────────────────────────────
function renderParticipants() {
  const q = $('pSearch').value.toLowerCase().trim();
  const ev = $('filterEvent').value, gender = $('filterGender').value, pay =$('filterPayment').value;

  const list = allParticipants.filter(p => {
    const text = (p.name || '').toLowerCase().includes(q) || String(p.phone ?? '').includes(q) ||
      (p.email || '').toLowerCase().includes(q) || (p.cue_id || '').toLowerCase().includes(q) || (p.payment_id || '').toLowerCase().includes(q);
    const eventIds = p.event_ids || (p.event_id ? [p.event_id] : []);
    const eventOk = ev === 'all' ? true : ev === 'unassigned' ? eventIds.length === 0 : eventIds.includes(parseInt(ev, 10));
    return text && eventOk && (gender === 'all' || p.gender === gender) && (pay === 'all' || p.payment_status === pay);
  });

  $('pCount').textContent = `Showing ${list.length} of ${allParticipants.length} participants`;
  $('participantsTableBody').innerHTML = list.length ? list.map(p => {
    const eventIds = p.event_ids || (p.event_id ? [p.event_id] : []);
    const assignedEvents = eventIds.map(id => allEvents.find(e => e.id === id)).filter(Boolean);
    const dest = assignedEvents.length
      ? esc(assignedEvents.map(e => `${fmtDate(e.event_date)} - ${e.venues?.venue_name || 'Venue'}`).join(', '))
      : '<span style="color:var(--amber);font-weight:700;">TBD / Unassigned</span>';
    return `
    <tr>
      <td data-label="CUE ID"><span class="cue-id">${esc(p.cue_id)}</span></td>
      <td data-label="Name"><strong>${esc(p.name)}</strong></td>
      <td data-label="Contact">+91 ${esc(p.phone)}<br><span class="sub">${esc(p.email || 'No Email')}</span></td>
      <td data-label="Gender">${genderBadge(p.gender)}</td>
      <td data-label="Ticket Type">${esc(p.ticket_type)}<br><span class="sub">₹${esc(p.amount_paid)}</span></td>
      <td data-label="Event"><span style="font-size:12px;">${dest}</span></td>
      <td data-label="Payment">${paymentBadge(p.payment_status)}</td>
      <td data-label="Payment ID"><span class="sub">${esc(p.payment_id || '-')}</span></td>
      <td data-label="Attendance">${attendanceBadge(p.attendance_status)}</td>
      <td class="actions-cell"><div class="action-btns">
        <button class="btn-edit" onclick="openParticipantModal(${p.id})">Edit</button>
        <button class="btn-del" onclick="initiateDelete('participant', ${p.id})">Delete</button>
      </div></td>
    </tr>`;
  }).join('') : emptyRow(10, 'No participants match the active filters.');
}

function openParticipantModal(id = null) {
  populateEventDropdowns();
  document.querySelectorAll('#participantModal .invalid').forEach(el => el.classList.remove('invalid'));
  const t = id ? allParticipants.find(p => p.id === id) : null;

  $('pModalTitle').textContent = t ? 'Edit Profile Information' : 'Add Participant';
  $('pIdHidden').value = t?.id ?? '';
  $('pCueId').value = t?.cue_id ?? '';
  $('pCueId').disabled = false; // CUE ID is user entry field$('pName').value = t?.name ?? '';
  $('pPhone').value = t?.phone ?? '';
  $('pEmail').value = t?.email ?? '';
  $('pInstagram').value = t?.instagram_id ?? '';
  $('pGender').value = t?.gender ?? 'Male';
  $('pTicketType').value = t ? (t.ticket_type.split(' – ')[0] || 'General') : 'Early Bird';
  $('pPaymentId').value = t?.payment_id ?? '';

  const eventSelect = $('pEventAssignment');
  const assignedIds = t?.event_ids || (t?.event_id ? [t.event_id] : []);
  [...eventSelect.options].forEach(opt => {
    opt.selected = assignedIds.includes(parseInt(opt.value, 10));
  });

  $('pPaymentStatus').value = t?.payment_status ?? 'Pending';
  $('pAttendanceStatus').value = t?.attendance_status ?? 'Registered';
  $('pNotes').value = t?.notes ?? '';
  if (t) $('pAmount').value = t.amount_paid; else updateTicketAndPrice();
  showModal('participantModal');
}
function closeParticipantModal() { hideModal('participantModal'); }

function updateTicketAndPrice() {
  const key = `${$('pTicketType').value} – ${$('pGender').value}`;
  $('pAmount').value = PRICING_MATRIX[key] || 1500;
}

async function saveParticipant(btn) {
  const cueEl = $('pCueId'), nameEl = $('pName'), phoneEl =$('pPhone'), emailEl = $('pEmail'), amountEl =$('pAmount');
  if (!checkRequired([[cueEl, 'CUE ID'], [nameEl, 'Full Name'], [phoneEl, 'Phone Number']])) return;

  const phone = digits(phoneEl.value);
  if (phone.length !== 10) return flagInvalid(phoneEl, 'Please enter a valid 10-digit phone number.');
  const email = emailEl.value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return flagInvalid(emailEl, 'Please enter a valid email address.');
  const amount = parseFloat(amountEl.value) || 0;
  if (amount < 0) return flagInvalid(amountEl, 'Amount cannot be negative.');

  const eventSelect = $('pEventAssignment');
  const event_ids = [...eventSelect.selectedOptions].map(o => parseInt(o.value, 10)).filter(Boolean);

  const gender = $('pGender').value;
  const payload = {
    cue_id: cueEl.value.trim().toUpperCase(),
    name: nameEl.value.trim(),
    phone,
    email: email || null,
    instagram_id: $('pInstagram').value.trim().replace(/^@/, '') || null,
    gender,
    ticket_type: `${$('pTicketType').value} – ${gender}`,
    amount_paid: amount,
    event_ids: event_ids.length ? event_ids : null,
    event_id: event_ids[0] || null, // backward compatibility
    payment_id: $('pPaymentId').value.trim() || null,
    payment_status: $('pPaymentStatus').value,
    attendance_status: $('pAttendanceStatus').value,
    notes: $('pNotes').value.trim() || null
  };
  await saveRecord('participants', $('pIdHidden').value, payload, 'participant', btn, closeParticipantModal);
}

// ─── VENUES ──────────────────────────────────────────────
function renderVenues() {
  const q = $('vSearch').value.toLowerCase().trim();
  const list = allVenues.filter(v => [v.venue_name, v.venue_code, v.city, v.nearest_area].some(f => (f || '').toLowerCase().includes(q)));

  $('venuesTableBody').innerHTML = list.length ? list.map(v => `
    <tr>
      <td data-label="VENUE ID"><span class="cue-id">${esc(v.venue_code)}</span></td>
      <td data-label="Venue Name"><strong>${esc(v.venue_name)}</strong></td>
      <td data-label="City">${esc(v.city)}</td>
      <td data-label="Area">${esc(v.nearest_area)}</td>
      <td data-label="Address & Contact" class="addr">
        <span class="sub" style="display:block;line-height:1.4;font-size:12px;">${esc(v.full_address)}</span>
        <span style="font-size:11px;color:#ff80ed;font-weight:500;display:block;margin-top:4px;">Mob: +91 ${esc(v.contact_number)}${v.landline_number ? `<br>LL: ${esc(v.landline_number)}` : ''}</span>
      </td>
      <td class="actions-cell"><div class="action-btns">
        <button class="btn-edit" onclick="openVenueModal(${v.id})">Edit</button>
        <button class="btn-del" onclick="initiateDelete('venue', ${v.id})">Delete</button>
      </div></td>
    </tr>`).join('') : emptyRow(6, 'No venues match your search.');
}

function populateVenueCityDropdown(selectedCity = '') {
  const select = $('vCity');
  select.innerHTML = '<option value="">-- Select City --</option>' + allVenueCities.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('') + '<option value="__other__">Others</option>';
  const match = allVenueCities.find(c => c.name.toLowerCase() === String(selectedCity).toLowerCase());
  select.value = match ? match.name : (selectedCity ? '__other__' : '');
  $('vCityOther').value = selectedCity && !match ? selectedCity : '';
  $('vCityOtherGroup').classList.toggle('hidden', select.value !== '__other__');
  populateVenueStateDropdown(match?.state_name || '');
  populateVenueAreaDropdown(selectedCity, '');
  updateVenueCodePrefix();
}
function populateVenueStateDropdown(selectedState = '') {
  const states = [...new Set(allVenueCities.map(c => c.state_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const select = $('vState');
  select.innerHTML = '<option value="">-- Select State --</option>' + states.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('') + '<option value="__other__">Others</option>';
  const known = states.find(x => x.toLowerCase() === String(selectedState).toLowerCase());
  select.value = known || (selectedState ? '__other__' : '');
  $('vStateOtherGroup').classList.toggle('hidden', select.value !== '__other__');
  $('vStateOther').value = selectedState && !known ? selectedState : '';
}
function populateVenueAreaDropdown(cityName = '', selectedArea = '') {
  const select = $('vArea');
  const cityRow = allVenueCities.find(c => c.name.toLowerCase() === String(cityName).toLowerCase());
  // Only show areas linked to the selected city. For an unlisted/custom city,
  // show no predefined areas and allow the user to enter an area manually.
  const areas = [...allVenueAreas]
    .filter(a => cityRow && a.city_id === cityRow.id)
    .sort((a,b) => a.name.localeCompare(b.name));
  select.innerHTML = '<option value="">-- Select Area --</option>' + areas.map(a =>
    `<option value="${a.id}">${esc(a.name)}</option>`
  ).join('') + '<option value="__other__">Others</option>';
  const match = areas.find(a => a.name.toLowerCase() === String(selectedArea).toLowerCase());
  select.value = match ? String(match.id) : (selectedArea ? '__other__' : '');
  $('vAreaOther').value = selectedArea && !match ? selectedArea : '';
  $('vAreaOtherGroup').classList.toggle('hidden', select.value !== '__other__');
}

function onVenueStateChange() {
  const other = $('vState').value === '__other__';
  $('vStateOtherGroup').classList.toggle('hidden', !other);
  if (!other) $('vStateOther').value = '';
}
function onVenueCityChange() {
  const value = $('vCity').value;
  $('vCityOtherGroup').classList.toggle('hidden', value !== '__other__');
  if (value !== '__other__') $('vCityOther').value = '';
  const city = allVenueCities.find(c => c.name === value);
  // City selection updates State and filters Nearest Area to that city.
  if (city) populateVenueStateDropdown(city.state_name || '');
  else if (value === '__other__') { $('vState').value = ''; $('vStateOtherGroup').classList.add('hidden'); }
  const previousArea = getVenueAreaValue();
  populateVenueAreaDropdown(getVenueCityValue(), previousArea);
  updateVenueCodePrefix();
}
function onVenueAreaChange() {
  const value = $('vArea').value, other = value === '__other__';
  $('vAreaOtherGroup').classList.toggle('hidden', !other);
  if (!other) $('vAreaOther').value = '';
  // Selecting an area does not change City or State.
  updateVenueCodePrefix();
}
function getVenueCityValue() { return $('vCity').value === '__other__' ? $('vCityOther').value.trim() : $('vCity').value.trim(); }
function getVenueAreaValue() {
  if ($('vArea').value === '__other__') return $('vAreaOther').value.trim();
  return allVenueAreas.find(a => String(a.id) === $('vArea').value)?.name || '';
}
function getVenueStateValue() { return $('vState').value === '__other__' ? $('vStateOther').value.trim() : $('vState').value.trim(); }
function updateVenueCodePrefix() {
  const city = getVenueCityValue(), area = getVenueAreaValue();
  const cityCode = allVenueCities.find(c => c.name.toLowerCase() === city.toLowerCase())?.city_code || '';
  const cityRow = allVenueCities.find(c => c.name.toLowerCase() === city.toLowerCase());
  const areaCode = allVenueAreas.find(a => a.city_id === cityRow?.id && a.name.toLowerCase() === area.toLowerCase())?.area_code || '';
  $('vCodePrefix').value = cityCode ? `${cityCode}-${areaCode ? areaCode + '-' : ''}` : '';
  syncVenueCode();
}
function syncVenueCode() { $('vCode').value = `${$('vCodePrefix').value}${String($('vCodeNumber').value || '').trim()}`.toUpperCase(); }
function openVenueModal(id = null) {
  document.querySelectorAll('#venueModal .invalid').forEach(el => el.classList.remove('invalid'));
  const t = id ? allVenues.find(v => v.id === id) : null;
  $('vModalTitle').textContent = t ? 'Edit Venue' : 'Add Venue'; $('vIdHidden').value = t?.id ?? '';
  $('vName').value = t?.venue_name ?? ''; $('vAddress').value = t?.full_address ?? '';
  $('vContact').value = t?.contact_number ?? ''; $('vLandline').value = t?.landline_number ?? '';
  $('vComment').value = t?.notes ?? ''; $('vPincode').value = t?.pincode ?? '';
  populateVenueCityDropdown(t?.city ?? '');
  populateVenueAreaDropdown(t?.city ?? '', t?.nearest_area ?? '');
  if (t?.state_name) populateVenueStateDropdown(t.state_name);
  const existing = String(t?.venue_code || ''), m = existing.match(/^(.*-)(\d+)$/);
  $('vCodeNumber').value = m ? m[2] : '';
  if (m) $('vCodePrefix').value = m[1];
  $('vCodeNumber').oninput = syncVenueCode;
  if (!existing) updateVenueCodePrefix();
  $('vCode').value = existing || `${$('vCodePrefix').value}${$('vCodeNumber').value}`;
  showModal('venueModal');
}
function closeVenueModal() { hideModal('venueModal'); }
async function saveVenue(btn) {
  syncVenueCode();
  const contactEl = $('vContact'), landlineEl = $('vLandline');
  const city = getVenueCityValue(), area = getVenueAreaValue(), state = getVenueStateValue();
  if (!checkRequired([[$('vCode'), 'Venue ID'], [$('vName'), 'Venue Name'], [contactEl, 'Contact Number']])) return;
  if (!city) return flagInvalid($('vCity'), 'Please select or enter a city.');
  if (!area) return flagInvalid($('vArea'), 'Please select or enter an area.');
  if (!state) return flagInvalid($('vState'), 'Please select or enter a state.');
  const contact = digits(contactEl.value), landline = digits(landlineEl.value), pin = digits($('vPincode').value);
  if (contact.length !== 10) return flagInvalid(contactEl, 'Please enter a valid 10-digit contact number.');
  if (landline && (landline.length < 8 || landline.length > 11)) return flagInvalid(landlineEl, 'Landline must be 8–11 digits.');
  if (pin && pin.length !== 6) return flagInvalid($('vPincode'), 'PIN code must be 6 digits.');
  if (!/^.+-\d+$/.test($('vCode').value.trim())) return flagInvalid($('vCodeNumber'), 'Enter the numeric venue ID suffix.');
  const payload = { venue_code: $('vCode').value.trim().toUpperCase(), city, state_name: state, pincode: pin || null,
    venue_name: $('vName').value.trim(), nearest_area: area, full_address: $('vAddress').value.trim(),
    contact_number: contact, landline_number: landline || null, notes: $('vComment').value.trim() || null };
  await saveRecord('venues', $('vIdHidden').value, payload, 'venue', btn, closeVenueModal);
}
// ─── CRUE ────────────────────────────────────────────────
function renderCrue() {
  const q = $('crueSearch').value.toLowerCase().trim();
  const list = allCrue.filter(c => [c.name, c.phone, c.email, c.role].some(f => (f || '').toLowerCase().includes(q)));

  $('crueTableBody').innerHTML = list.length ? list.map(c => `
    <tr>
      <td data-label="Name"><strong>${esc(c.name)}</strong></td>
      <td data-label="Gender">${genderBadge(c.gender)}</td>
      <td data-label="Contact">+91 ${esc(c.phone)}<br><span class="sub">${esc(c.email || 'No Email')}</span></td>
      <td data-label="Role"><span class="cue-id">${esc(c.role)}</span></td>
      <td data-label="Notes">${esc(c.notes || '-')}</td>
      <td class="actions-cell"><div class="action-btns">
        <button class="btn-edit" onclick="openCrueModal(${c.id})">Edit</button>
        <button class="btn-del" onclick="initiateDelete('crue', ${c.id})">Delete</button>
      </div></td>
    </tr>`).join('') : emptyRow(6, 'No CrUE members match your search.');
}

function toggleCrueOtherRole() {
  const val = $('crueRole').value;
  const group = $('crueOtherRoleGroup');
  if (val === 'Other') {
    group.classList.remove('hidden');
  } else {
    group.classList.add('hidden');
    $('crueRoleOther').value = '';$('crueRoleOther').classList.remove('invalid');
  }
}

function openCrueModal(id = null) {
  document.querySelectorAll('#crueModal .invalid').forEach(el => el.classList.remove('invalid'));
  const t = id ? allCrue.find(c => c.id === id) : null;
  $('crueModalTitle').textContent = t ? 'Edit CrUE Member' : 'Add CrUE Member';
  $('crueIdHidden').value = t?.id ?? '';
  $('crueName').value = t?.name ?? '';
  $('crueGender').value = t?.gender ?? 'Male';
  $('cruePhone').value = t?.phone ?? '';
  $('crueEmail').value = t?.email ?? '';

  const role = t?.role ?? 'Cinematographer';
  const standardRoles = ['Cinematographer', 'Host', 'Director', 'Operations'];
  if (standardRoles.includes(role)) {
    $('crueRole').value = role;
    $('crueRoleOther').value = '';$('crueOtherRoleGroup').classList.add('hidden');
  } else {
    $('crueRole').value = 'Other';$('crueRoleOther').value = role;
    $('crueOtherRoleGroup').classList.remove('hidden');
  }
  $('crueNotes').value = t?.notes ?? '';
  showModal('crueModal');
}
function closeCrueModal() { hideModal('crueModal'); }

async function saveCrue(btn) {
  const nameEl = $('crueName'), phoneEl =$('cruePhone'), roleEl = $('crueRole'), roleOtherEl =$('crueRoleOther');
  let roleVal = roleEl.value;
  if (roleVal === 'Other') {
    if (!roleOtherEl.value.trim()) {
      roleOtherEl.classList.add('invalid');
      showToast('Please specify the custom role.', 'error');
      return;
    }
    roleVal = roleOtherEl.value.trim();
  }
  if (!checkRequired([[nameEl, 'Name'], [phoneEl, 'Phone Number']])) return;
  const phone = digits(phoneEl.value);
  if (phone.length !== 10) return flagInvalid(phoneEl, 'Please enter a valid 10-digit phone number.');

  const payload = {
    name: nameEl.value.trim(),
    gender: $('crueGender').value,
    phone,
    email: $('crueEmail').value.trim() || null,
    role: roleVal,
    notes: $('crueNotes').value.trim() || null
  };
  await saveRecord('crue', $('crueIdHidden').value, payload, 'crue member', btn, closeCrueModal);
}

// ─── DROPDOWNS ───────────────────────────────────────────
function populateEventDropdowns() {
  const filter = $('filterEvent'), assign =$('pEventAssignment');
  const prevFilter = filter.value;
  const prevAssignSelected = [...assign.selectedOptions].map(o => o.value);
  const opts = allEvents.map(e => `<option value="${e.id}">${esc(`${fmtDate(e.event_date)} -${e.venues?.venue_name || 'Unknown'}`)}</option>`).join('');

  filter.innerHTML = '<option value="all">All Events</option><option value="unassigned">TBD / Unassigned Only</option>' + opts;
  assign.innerHTML = opts;
  filter.value = [...filter.options].some(o => o.value === prevFilter) ? prevFilter : 'all';
  [...assign.options].forEach(opt => {
    if (prevAssignSelected.includes(opt.value)) opt.selected = true;
  });
}

// ─── DELETE ──────────────────────────────────────────────
function initiateDelete(type, id) {
  let label = '';
  if (type === 'venue') label = allVenues.find(v => v.id === id)?.venue_name;
  if (type === 'event') { const e = allEvents.find(x => x.id === id); label = e && `event on ${fmtDate(e.event_date)}`; }
  if (type === 'participant') label = allParticipants.find(p => p.id === id)?.name;
  if (type === 'crue') label = allCrue.find(c => c.id === id)?.name;
  deleteTarget = { type, id };
  $('deleteTargetName').textContent = label || `this ${type}`;
  showModal('deleteModal');
}
function closeDeleteModal() { hideModal('deleteModal'); }

async function confirmDelete(btn) {
  const { type, id } = deleteTarget;
  const table = { venue: 'venues', event: 'events', participant: 'participants', crue: 'crue' }[type];
  if (!table) return;
  btn.disabled = true;
  const { error } = await db.from(table).delete().eq('id', id);
  btn.disabled = false;
  if (error) {
    console.error(error);
    showToast(error.code === '23503'
      ? `Can't delete: this ${type} is still linked to other records.`
      : `Delete failed: ${error.message}`, 'error');
    return;
  }
  showToast('Record deleted.');
  closeDeleteModal();
  await loadAllDataPools();
}

// ─── BADGES ──────────────────────────────────────────────
function paymentBadge(s) {
  const map = { Paid: 'badge-paid', Pending: 'badge-pending', Refunded: 'badge-refunded' };
  return `<span class="badge ${map[s] || 'badge-pending'}">${esc(s || 'Pending')}</span>`;
}
function attendanceBadge(s) {
  const map = { Registered: 'badge-registered', Attended: 'badge-attended', 'No Show': 'badge-noshow', 'Event Over': 'badge-eventover' };
  return `<span class="badge ${map[s] || 'badge-registered'}">${esc(s || 'Registered')}</span>`;
}
function genderBadge(g) {
  return `<span class="badge ${g === 'Male' ? 'badge-male' : 'badge-female'}">${esc(g)}</span>`;
}

// ─── CSV / EXCEL EXPORT ──────────────────────────────────
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

function exportTableToCSV(type) {
  let filename, rows;
  if (type === 'participants') {
    filename = 'circleup_participants_roster.csv';
    rows = [['CUE ID', 'Full Name', 'Phone', 'Email', 'Instagram', 'Gender', 'Pass Type', 'Amount Paid', 'Event Assignment', 'Payment Status', 'Payment ID', 'Attendance Status', 'Notes']];
    allParticipants.forEach(p => {
      const eventIds = p.event_ids || (p.event_id ? [p.event_id] : []);
      const assignedEvents = eventIds.map(id => allEvents.find(e => e.id === id)).filter(Boolean);
      rows.push([
        p.cue_id, p.name, `+91 ${p.phone}`, p.email, p.instagram_id, p.gender, p.ticket_type, p.amount_paid,
        assignedEvents.length ? assignedEvents.map(e => `${e.event_date} (${e.venues?.venue_name || 'Venue'})`).join('; ') : 'Unassigned',
        p.payment_status, p.payment_id, p.attendance_status, p.notes
      ]);
    });
  } else if (type === 'events') {
    filename = 'circleup_events_schedule.csv';
    rows = [['Event ID', 'Date', 'Venue Name', 'City', 'Assigned Count']];
    allEvents.forEach(e => rows.push([`EVT-${e.id}`, e.event_date, e.venues?.venue_name || 'Unknown', e.venues?.city, countFor(e.id)]));
  } else if (type === 'venues') {
    filename = 'circleup_venues_directory.csv';
    rows = [['VENUE ID', 'Venue Name', 'City', 'Micro Area', 'Full Address', 'Contact Number', 'Landline', 'Notes']];
    allVenues.forEach(v => rows.push([v.venue_code, v.venue_name, v.city, v.nearest_area, v.full_address, `+91 ${v.contact_number}`, v.landline_number, v.notes]));
  } else if (type === 'crue') {
    filename = 'circleup_crue_directory.csv';
    rows = [['Name', 'Gender', 'Phone', 'Email', 'Role', 'Notes']];
    allCrue.forEach(c => rows.push([c.name, c.gender, `+91 ${c.phone}`, c.email, c.role, c.notes]));
  }

  const csv = '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Spreadsheet exported successfully!');
}

// ─── INIT ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  db.auth.getSession().then(({ data: { session } }) => { if (session) showApp(); });

  db.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') setTimeout(showLogin, 0);
  });

  ['loginEmail', 'loginPassword'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); }));

  ['pPhone', 'vContact', 'vLandline', 'cruePhone'].forEach(id => $(id).addEventListener('input', function () { this.value = digits(this.value); }));

  document.addEventListener('input', e => e.target.classList?.remove('invalid'));
  document.addEventListener('change', e => e.target.classList?.remove('invalid'));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') MODALS.forEach(m => hideModal(m));
  });
  MODALS.forEach(m => $(m).addEventListener('mousedown', e => { if (e.target ===$(m)) hideModal(m); }));

  document.querySelectorAll('input[type="date"]').forEach(d =>
    d.addEventListener('click', () => { try { d.showPicker(); } catch (_) {} }));
});