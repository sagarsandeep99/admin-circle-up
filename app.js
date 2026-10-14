// ─── LOCAL STATE STATE REPOSITORY ────────────────────────
let allParticipants = [];
let allVenues = [];
let allEvents = [];
let deleteTarget = { type: null, id: null, name: null };

const PRICING_MATRIX = {
  "Early Bird – Male": 1800, "Early Bird – Female": 1000,
  "General – Male": 2100, "General – Female": 1300
};

// ─── CONTROLLER BOOT ACTION ──────────────────────────────
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.querySelector('#loginPage .btn-primary');

  errEl.classList.add('hidden');
  btn.textContent = 'Verifying Account...';
  btn.disabled = true;

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  btn.textContent = 'Sign In';
  btn.disabled = false;

  if (error) {
    errEl.textContent = 'Access rejected. Validate credentials or active registration state.';
    errEl.classList.remove('hidden');
    return;
  }
  if (data.session) showApp();
}

async function handleLogout() {
  await db.auth.signOut();
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('loginPage').classList.remove('hidden');
}

async function showApp() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  setTimeout(async () => {
    await loadAllDataPools();
  }, 150);
}

// ─── DATA SYNC OPERATORS ─────────────────────────────────
async function loadAllDataPools() {
  await Promise.all([loadVenues(), loadEvents(), loadParticipants()]);
  populateEventDropdowns();
  renderDashboard();
  renderEvents();
  renderParticipants();
  renderVenues();
}

async function loadVenues() {
  const { data } = await db.from('venues').select('*').order('venue_name', { ascending: true });
  allVenues = data || [];
}

async function loadEvents() {
  const { data } = await db.from('events').select('*, venues(*)').order('event_date', { ascending: true });
  allEvents = data || [];
}

async function loadParticipants() {
  const { data } = await db.from('participants').select('*, events(*, venues(*))').order('created_at', { ascending: false });
  allParticipants = data || [];
}

// ─── INTERFACE NAVIGATION ───────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  document.getElementById(`${tabId}Section`).classList.remove('hidden');
  document.getElementById(`nav-${tabId}`).classList.add('active');
  
  if(tabId === 'dashboard') renderDashboard();
}

function navigateToPastEvents() {
  document.getElementById('eventTimelineFilter').value = 'past';
  switchTab('events');
}

// ─── DASHBOARD RENDERING & MIDNIGHT CALCULATOR ───────────
function renderDashboard() {
  renderUpcomingEventBanner();

  const recent = [...allParticipants].slice(0, 6);
  const tbody = document.getElementById('recentTableBody');
  tbody.innerHTML = recent.length ? recent.map(p => {
    const eventContext = p.events 
      ? `${p.events.event_date.split('-').reverse().join('/')} (${p.events.venues?.venue_code || ''})`
      : '<span style="color:#fbbf24; font-weight:600;">TBD</span>';

    return `
      <tr>
        <td><span class="cue-id">${p.cue_id}</span></td>
        <td>${p.name}</td>
        <td>${genderBadge(p.gender)}</td>
        <td>${p.ticket_type}</td>
        <td>${paymentBadge(p.payment_status)}</td>
        <td>${attendanceBadge(p.attendance_status)}</td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94A3B8">No participant entries recorded.</td></tr>';
}

function renderUpcomingEventBanner() {
  const container = document.getElementById('upcomingEventContainer');
  if (!allEvents.length) {
    container.innerHTML = `<div class="upcoming-event-banner"><div class="event-details"><h3>No Scheduled Events Active</h3></div></div>`;
    return;
  }

  const systemNow = new Date();
  const midnightDeadlineThreshold = new Date(systemNow.getFullYear(), systemNow.getMonth(), systemNow.getDate(), 23, 59, 59, 999);

  const validLiveEvents = allEvents.filter(e => {
    const [year, month, day] = e.event_date.split('-').map(Number);
    const calculatedTargetMidnight = new Date(year, month - 1, day, 23, 59, 59, 999);
    return calculatedTargetMidnight >= midnightDeadlineThreshold;
  });

  if (!validLiveEvents.length) {
    container.innerHTML = `
      <div class="upcoming-event-banner">
        <div class="event-details">
          <h3>No Active Upcoming Schedules</h3>
          <p>All previously logged events have passed their midnight execution cutoff.</p>
        </div>
        <a href="#" class="banner-corner-link" onclick="navigateToPastEvents()">View Past Events →</a>
      </div>
    `;
    return;
  }

  const primaryEvent = validLiveEvents[0];
  const assignedRosterCount = allParticipants.filter(p => p.event_id === primaryEvent.id).length;

  const [y, m, d] = primaryEvent.event_date.split('-').map(Number);
  const eventDisplayDate = new Date(y, m - 1, d);
  const cleanFormattedString = eventDisplayDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  container.innerHTML = `
    <div class="upcoming-event-banner">
      <div class="event-details">
        <p style="text-transform: uppercase; letter-spacing: 0.1em; color: var(--neon-pink); font-weight:700; font-size:11px;">Next Calendar Matchup</p>
        <h3>${cleanFormattedString}</h3>
        <p>Venue Location: <strong>${primaryEvent.venues?.venue_name || 'Unassigned'} (${primaryEvent.venues?.city || ''})</strong></p>
        <p>Booked Capacity: <strong>${assignedRosterCount} Confirmed Members</strong></p>
      </div>
      <div style="text-align: right; display:flex; flex-direction:column; justify-content:space-between; align-items:flex-end;">
        <span class="event-status-pill">Active Live Monitor</span>
        <a href="#" class="banner-corner-link" style="margin-top:20px;" onclick="navigateToPastEvents()">View Past Events →</a>
      </div>
    </div>
  `;
}

// ─── EVENTS DOM CRUD CONTROLLERS ─────────────────────────
function renderEvents() {
  const viewMode = document.getElementById('eventTimelineFilter').value;
  const tbody = document.getElementById('eventsTableBody');
  const systemNow = new Date();
  const midnightDeadlineThreshold = new Date(systemNow.getFullYear(), systemNow.getMonth(), systemNow.getDate(), 23, 59, 59, 999);

  let filtered = allEvents.filter(e => {
    const [year, month, day] = e.event_date.split('-').map(Number);
    const eventMidnight = new Date(year, month - 1, day, 23, 59, 59, 999);
    if (viewMode === 'upcoming') return eventMidnight >= midnightDeadlineThreshold;
    if (viewMode === 'past') return eventMidnight < midnightDeadlineThreshold;
    return true;
  });

  tbody.innerHTML = filtered.length ? filtered.map(e => {
    const count = allParticipants.filter(p => p.event_id === e.id).length;
    return `
      <tr>
        <td><strong>#EVT-${e.id}</strong></td>
        <td>${e.event_date.split('-').reverse().join('/')}</td>
        <td>${e.venues?.venue_name || 'Error'}</td>
        <td>${e.venues?.city || ''}</td>
        <td><span class="cue-id">${count} Assigned</span></td>
        <td>
          <div class="action-btns">
            <button class="btn-edit" onclick="openEventModal(${e.id})">Edit</button>
            <button class="btn-del" onclick="initiateDelete('event', ${e.id}, '${e.event_date}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94A3B8">No schedule targets mapped matching selection criteria.</td></tr>';
}

function openEventModal(id = null) {
  const select = document.getElementById('eVenue');
  select.innerHTML = '<option value="">-- Choose Venue --</option>' + allVenues.map(v => `<option value="${v.id}">${v.venue_name} (${v.city})</option>`).join('');
  
  if (id) {
    document.getElementById('eventModalTitle').textContent = 'Modify Event Configuration';
    const target = allEvents.find(e => e.id === id);
    document.getElementById('eventIdHidden').value = target.id;
    document.getElementById('eDate').value = target.event_date;
    document.getElementById('eVenue').value = target.venue_id;
  } else {
    document.getElementById('eventModalTitle').textContent = 'Create Event Schedule';
    document.getElementById('eventIdHidden').value = '';
    document.getElementById('eDate').value = '';
    document.getElementById('eVenue').value = '';
  }
  document.getElementById('eventModal').classList.remove('hidden');
}

function closeEventModal() { document.getElementById('eventModal').classList.add('hidden'); }

async function saveEvent() {
  const id = document.getElementById('eventIdHidden').value;
  const eDateEl = document.getElementById('eDate');
  const eVenueEl = document.getElementById('eVenue');

  eDateEl.style.borderColor = '';
  eVenueEl.style.borderColor = '';

  let missingFields = [];
  if (!eDateEl.value) { eDateEl.style.borderColor = 'var(--red)'; missingFields.push('Event Date'); }
  if (!eVenueEl.value) { eVenueEl.style.borderColor = 'var(--red)'; missingFields.push('Venue'); }

  if (missingFields.length > 0) {
    showToast(`Please fill in the required fields: ${missingFields.join(', ')}`, 'error');
    return;
  }

  const dataPayload = { event_date: eDateEl.value, venue_id: parseInt(eVenueEl.value, 10) };
  let error;

  if (id) {
    ({ error } = await db.from('events').update(dataPayload).eq('id', id));
  } else {
    ({ error } = await db.from('events').insert([dataPayload]));
  }

  if (error) { 
    showToast('Failed to save event details.', 'error'); 
  } else {
    showToast('Event saved successfully!', 'success');
    closeEventModal();
    await loadAllDataPools();
  }
}

// ─── PARTICIPANTS DOM CRUD CONTROLLERS ───────────────────
function renderParticipants() {
  const query = document.getElementById('pSearch').value.toLowerCase().trim();
  const targetEventFilter = document.getElementById('filterEvent').value;
  const genderFilter = document.getElementById('filterGender').value;
  const paymentFilter = document.getElementById('filterPayment').value;
  const tbody = document.getElementById('participantsTableBody');

  let filtered = allParticipants.filter(p => {
    const textMatch = p.name.toLowerCase().includes(query) || String(p.phone).includes(query) || (p.email && p.email.toLowerCase().includes(query)) || p.cue_id.toLowerCase().includes(query);
    let eventMatch = true;
    if (targetEventFilter === 'unassigned') eventMatch = p.event_id === null;
    else if (targetEventFilter !== 'all') eventMatch = p.event_id === parseInt(targetEventFilter);

    const genderMatch = genderFilter === 'all' || p.gender === genderFilter;
    const paymentMatch = paymentFilter === 'all' || p.payment_status === paymentFilter;

    return textMatch && eventMatch && genderMatch && paymentMatch;
  });

  tbody.innerHTML = filtered.length ? filtered.map(p => {
    const destinationDesc = p.events 
      ? `${p.events.event_date.split('-').reverse().join('/')} - ${p.events.venues?.venue_name || 'Venue Info Error'}`
      : '<span style="color:var(--amber); font-weight:700;">TBD / Unassigned</span>';

    return `
      <tr>
        <td><span class="cue-id">${p.cue_id}</span></td>
        <td><strong>${p.name}</strong></td>
        <td>+91 ${p.phone}<br><span style="font-size:11px;color:var(--slate-light);">${p.email || 'No Email'}</span></td>
        <td>${genderBadge(p.gender)}</td>
        <td>${p.ticket_type}<br><span style="font-size:11px;color:var(--slate-light);">₹${p.amount_paid}</span></td>
        <td><span style="font-size:12px;">${destinationDesc}</span></td>
        <td>${paymentBadge(p.payment_status)}</td>
        <td>${attendanceBadge(p.attendance_status)}</td>
        <td>
          <div class="action-btns">
            <button class="btn-edit" onclick="openParticipantModal(${p.id})">Edit</button>
            <button class="btn-del" onclick="initiateDelete('participant', ${p.id}, '${p.name}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="9" style="text-align:center;padding:32px;color:#94A3B8">No participant matching filters active.</td></tr>';
}

function openParticipantModal(id = null) {
  populateEventDropdowns();
  if (id) {
    document.getElementById('pModalTitle').textContent = 'Edit Profile Information';
    const target = allParticipants.find(p => p.id === id);
    document.getElementById('pIdHidden').value = target.id;
    document.getElementById('pCueId').value = target.cue_id;
    document.getElementById('pCueId').disabled = true;
    document.getElementById('pName').value = target.name;
    document.getElementById('pPhone').value = target.phone;
    document.getElementById('pEmail').value = target.email || '';
    document.getElementById('pInstagram').value = target.instagram_id || '';
    document.getElementById('pGender').value = target.gender;
    const coreTicket = target.ticket_type.split(' – ')[0] || 'General';
    document.getElementById('pTicketType').value = coreTicket;
    document.getElementById('pAmount').value = target.amount_paid;
    document.getElementById('pEventAssignment').value = target.event_id || '';
    document.getElementById('pPaymentStatus').value = target.payment_status;
    document.getElementById('pAttendanceStatus').value = target.attendance_status;
    document.getElementById('pNotes').value = target.notes || '';
  } else {
    document.getElementById('pModalTitle').textContent = 'Register New Roster Participant';
    document.getElementById('pIdHidden').value = '';
    document.getElementById('pCueId').value = '';
    document.getElementById('pCueId').disabled = false;
    document.getElementById('pName').value = '';
    document.getElementById('pPhone').value = '';
    document.getElementById('pEmail').value = '';
    document.getElementById('pInstagram').value = '';
    document.getElementById('pNotes').value = '';
    document.getElementById('pPaymentStatus').value = 'Pending';
    document.getElementById('pAttendanceStatus').value = 'Registered';
    updateTicketAndPrice();
  }
  document.getElementById('participantModal').classList.remove('hidden');
}

function closeParticipantModal() { document.getElementById('participantModal').classList.add('hidden'); }

function updateTicketAndPrice() {
  const gender = document.getElementById('pGender').value;
  const ticketClass = document.getElementById('pTicketType').value;
  const compositeKey = `${ticketClass} – ${gender}`;
  document.getElementById('pAmount').value = PRICING_MATRIX[compositeKey] || 1500;
}

async function saveParticipant() {
  const id = document.getElementById('pIdHidden').value;
  const cueIdEl = document.getElementById('pCueId');
  const nameEl = document.getElementById('pName');
  const phoneEl = document.getElementById('pPhone');
  
  const email = document.getElementById('pEmail').value.trim();
  const instagram_id = document.getElementById('pInstagram').value.trim();
  const gender = document.getElementById('pGender').value;
  const baseTicket = document.getElementById('pTicketType').value;
  const amount_paid = parseFloat(document.getElementById('pAmount').value) || 0;
  const rawEventId = document.getElementById('pEventAssignment').value;
  const payment_status = document.getElementById('pPaymentStatus').value;
  const attendance_status = document.getElementById('pAttendanceStatus').value;
  const notes = document.getElementById('pNotes').value.trim();

  cueIdEl.style.borderColor = '';
  nameEl.style.borderColor = '';
  phoneEl.style.borderColor = '';

  let missingFields = [];
  if (!cueIdEl.value.trim()) { cueIdEl.style.borderColor = 'var(--red)'; missingFields.push('CUE ID'); }
  if (!nameEl.value.trim()) { nameEl.style.borderColor = 'var(--red)'; missingFields.push('Full Name'); }
  if (!phoneEl.value.replace(/[^0-9]/g, '')) { phoneEl.style.borderColor = 'var(--red)'; missingFields.push('Phone Number'); }

  if (missingFields.length > 0) {
    showToast(`Please fill in the required fields: ${missingFields.join(', ')}`, 'error');
    return;
  }

  const rawPhone = phoneEl.value.replace(/[^0-9]/g, '');
  if (rawPhone.length !== 10) {
    phoneEl.style.borderColor = 'var(--red)';
    showToast('Please enter a valid 10-digit phone number.', 'error');
    return;
  }

  const cue_id = cueIdEl.value.trim();
  const name = nameEl.value.trim();
  const phone = parseInt(rawPhone, 10);
  const ticket_type = `${baseTicket} – ${gender}`;
  const event_id = rawEventId ? parseInt(rawEventId) : null;

  const payload = { cue_id, name, phone, email: email || null, instagram_id: instagram_id || null, gender, ticket_type, amount_paid, event_id, payment_status, attendance_status, notes: notes || null };
  let error;

  if (id) {
    ({ error } = await db.from('participants').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('participants').insert([payload]));
  }

  if (error) { 
    showToast('Failed to save participant details.', 'error'); 
  } else {
    showToast('Participant details saved successfully!', 'success');
    closeParticipantModal();
    await loadAllDataPools();
  }
}

// ─── VENUES DOM CRUD CONTROLLERS ─────────────────────────
function renderVenues() {
  const query = document.getElementById('vSearch').value.toLowerCase().trim();
  const tbody = document.getElementById('venuesTableBody');

  let filtered = allVenues.filter(v => v.venue_name.toLowerCase().includes(query) || v.venue_code.toLowerCase().includes(query) || v.city.toLowerCase().includes(query) || v.nearest_area.toLowerCase().includes(query));

  tbody.innerHTML = filtered.length ? filtered.map(v => {
    const landlineStr = v.landline_number ? `<br><span style="font-size:11px;color:var(--slate-light);">LL: ${v.landline_number}</span>` : '';
    return `
      <tr>
        <td><span class="cue-id">${v.venue_code}</span></td>
        <td><strong>${v.venue_name}</strong></td>
        <td>${v.city}</td>
        <td>${v.nearest_area}</td>
        <td>
          <span style="font-size:12px;color:var(--slate-light); line-height:1.4; display:block;">${v.full_address}</span>
          <span style="font-size:11px;color:#ff80ed; font-weight:500; display:block; margin-top:4px;">Mob: +91 ${v.contact_number}${landlineStr}</span>
        </td>
        <td>
          <div class="action-btns">
            <button class="btn-edit" onclick="openVenueModal(${v.id})">Edit</button>
            <button class="btn-del" onclick="initiateDelete('venue', ${v.id}, '${v.venue_name}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94A3B8">No tracking locations matched lookup criteria.</td></tr>';
}

function openVenueModal(id = null) {
  if (id) {
    document.getElementById('vModalTitle').textContent = 'Modify Venue Specifics';
    const target = allVenues.find(v => v.id === id);
    document.getElementById('vIdHidden').value = target.id;
    document.getElementById('vCode').value = target.venue_code;
    document.getElementById('vCode').disabled = true;
    document.getElementById('vCity').value = target.city;
    document.getElementById('vName').value = target.venue_name;
    document.getElementById('vArea').value = target.nearest_area;
    document.getElementById('vAddress').value = target.full_address;
    document.getElementById('vContact').value = target.contact_number || '';
    document.getElementById('vLandline').value = target.landline_number || '';
    document.getElementById('vComment').value = target.notes || '';
  } else {
    document.getElementById('vModalTitle').textContent = 'Host Properties Entry';
    document.getElementById('vIdHidden').value = '';
    document.getElementById('vCode').value = '';
    document.getElementById('vCode').disabled = false;
    document.getElementById('vCity').value = '';
    document.getElementById('vName').value = '';
    document.getElementById('vArea').value = '';
    document.getElementById('vAddress').value = '';
    document.getElementById('vContact').value = '';
    document.getElementById('vLandline').value = '';
    document.getElementById('vComment').value = '';
  }
  document.getElementById('venueModal').classList.remove('hidden');
}

function closeVenueModal() { document.getElementById('venueModal').classList.add('hidden'); }

async function saveVenue() {
  const id = document.getElementById('vIdHidden').value;
  const vCodeEl = document.getElementById('vCode');
  const vCityEl = document.getElementById('vCity');
  const vNameEl = document.getElementById('vName');
  const vAreaEl = document.getElementById('vArea');
  const vAddressEl = document.getElementById('vAddress');
  const vContactEl = document.getElementById('vContact');
  
  const rawLandline = document.getElementById('vLandline').value.replace(/[^0-9]/g, '');
  const notes = document.getElementById('vComment').value.trim();

  const fields = [vCodeEl, vCityEl, vNameEl, vAreaEl, vAddressEl, vContactEl];
  fields.forEach(el => el.style.borderColor = '');

  let missingFields = [];
  if (!vCodeEl.value.trim()) { vCodeEl.style.borderColor = 'var(--red)'; missingFields.push('Venue Code'); }
  if (!vCityEl.value.trim()) { vCityEl.style.borderColor = 'var(--red)'; missingFields.push('City'); }
  if (!vNameEl.value.trim()) { vNameEl.style.borderColor = 'var(--red)'; missingFields.push('Venue Name'); }
  if (!vAreaEl.value.trim()) { vAreaEl.style.borderColor = 'var(--red)'; missingFields.push('Nearest Area'); }
  if (!vAddressEl.value.trim()) { vAddressEl.style.borderColor = 'var(--red)'; missingFields.push('Full Address'); }
  if (!vContactEl.value.replace(/[^0-9]/g, '')) { vContactEl.style.borderColor = 'var(--red)'; missingFields.push('Contact Number'); }

  if (missingFields.length > 0) {
    showToast(`Please fill in the required fields: ${missingFields.join(', ')}`, 'error');
    return;
  }

  const rawContact = vContactEl.value.replace(/[^0-9]/g, '');
  if (rawContact.length !== 10) {
    vContactEl.style.borderColor = 'var(--red)';
    showToast('Please enter a valid 10-digit contact number.', 'error');
    return;
  }

  const venue_code = vCodeEl.value.toUpperCase().trim();
  const city = vCityEl.value.trim();
  const venue_name = vNameEl.value.trim();
  const nearest_area = vAreaEl.value.trim();
  const full_address = vAddressEl.value.trim();
  const contact_number = parseInt(rawContact, 10);
  const landline_number = rawLandline ? parseInt(rawLandline, 10) : null;

  const dataObj = { venue_code, city, venue_name, nearest_area, full_address, contact_number, landline_number, notes: notes || null };
  let error;

  if (id) {
    ({ error } = await db.from('venues').update(dataObj).eq('id', id));
  } else {
    ({ error } = await db.from('venues').insert([dataObj]));
  }

  if (error) { 
    showToast('Failed to save venue details.', 'error'); 
  } else {
    showToast('Venue saved successfully!', 'success');
    closeVenueModal();
    await loadAllDataPools();
  }
}

// ─── REUSABLE UTILITIES & FILTER DROPDOWNS ───────────────
function populateEventDropdowns() {
  const masterSelectFilter = document.getElementById('filterEvent');
  const modalSelectAssignment = document.getElementById('pEventAssignment');

  masterSelectFilter.innerHTML = '<option value="all">All Events</option><option value="unassigned">TBD / Unassigned Only</option>';
  modalSelectAssignment.innerHTML = '<option value="">TBD / Event Not Fixed Yet</option>';

  allEvents.forEach(e => {
    const readableSegment = `${e.event_date.split('-').reverse().join('/')} - ${e.venues?.venue_name || 'Unknown'}`;
    masterSelectFilter.innerHTML += `<option value="${e.id}">${readableSegment}</option>`;
    modalSelectAssignment.innerHTML += `<option value="${e.id}">${readableSegment}</option>`;
  });
}

function initiateDelete(type, id, label) {
  deleteTarget = { type, id, name: label };
  document.getElementById('deleteTargetName').textContent = label;
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() { document.getElementById('deleteModal').classList.add('hidden'); }

async function confirmDelete() {
  const { type, id } = deleteTarget;
  let error;

  if (type === 'venue') ({ error } = await db.from('venues').delete().eq('id', id));
  if (type === 'event') ({ error } = await db.from('events').delete().eq('id', id));
  if (type === 'participant') ({ error } = await db.from('participants').delete().eq('id', id));

  if (error) { showToast('Dropping failed. Entity linked dynamically across contexts.', 'error'); } 
  else {
    showToast('Entity purged cleanly.', 'success');
    closeDeleteModal();
    await loadAllDataPools();
  }
}

// ─── METADATA GRAPHICAL CHIPS/BADGES ─────────────────────
function paymentBadge(s) {
  const map = { Paid: 'badge-paid', Pending: 'badge-pending', Refunded: 'badge-refunded' };
  return `<span class="badge ${map[s] || 'badge-pending'}">${s || 'Pending'}</span>`;
}

// ─── INTERACTIVE PASSWORD TOGGLE LOGIC ───────────────────
function toggleLoginPassword() {
  const passwordInput = document.getElementById('loginPassword');
  const openEye = document.getElementById('eyeIconOpen');
  const closedEye = document.getElementById('eyeIconClosed');
  
  if (!passwordInput || !openEye || !closedEye) return;
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    openEye.classList.add('hidden');
    closedEye.classList.remove('hidden');
  } else {
    passwordInput.type = 'password';
    closedEye.classList.add('hidden');
    openEye.classList.remove('hidden');
  }
}

function attendanceBadge(s) {
  const map = { Registered: 'badge-registered', Attended: 'badge-attended', 'No Show': 'badge-noshow', 'Event Over': 'badge-eventover' };
  return `<span class="badge ${map[s] || 'badge-registered'}">${s || 'Registered'}</span>`;
}

function genderBadge(g) {
  return `<span class="badge ${g === 'Male' ? 'badge-male' : 'badge-female'}">${g}</span>`;
}

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ─── INITIAL SYSTEM HOOKUP ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  db.auth.getSession().then(({ data: { session } }) => {
    if (session) showApp();
  });

  const applyNumericLock = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keypress', e => { if (!/[0-9]/.test(e.key)) e.preventDefault(); });
    el.addEventListener('input', function() { this.value = this.value.replace(/[^0-9]/g, ''); });
  };
  ['pPhone', 'vContact', 'vLandline'].forEach(applyNumericLock);

  document.querySelectorAll('input[type="date"]').forEach(dateInput => {
    dateInput.addEventListener('click', () => {
      try { dateInput.showPicker(); } catch (e) {}
    });
  });
});