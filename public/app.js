/**
 * Client Bunny — Frontend Logic
 * Multi-Screen CRM, Deep Cascading Hunt Selector, Lists Management, and SVG UI
 */

let allLeads = [];
let allLists = [];
let locationsHierarchy = {};
let worldwideCountries = [];

let currentFilter = 'all';
let currentCityFilter = 'all';
let currentListFilter = 'all';
let currentScreen = 'leads';

// DOM Elements
const sidebarLeadCount = document.getElementById('sidebarLeadCount');
const sidebarListsCount = document.getElementById('sidebarListsCount');
const breadcrumbTitle = document.getElementById('breadcrumbTitle');
const headerHuntBtn = document.getElementById('headerHuntBtn');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const toastEl = document.getElementById('toast');

// Navigation
const navLeads = document.getElementById('navLeads');
const navHunt = document.getElementById('navHunt');
const navLists = document.getElementById('navLists');
const navAnalytics = document.getElementById('navAnalytics');

// Screens
const screenLeads = document.getElementById('screenLeads');
const screenHunt = document.getElementById('screenHunt');
const screenLists = document.getElementById('screenLists');
const screenAnalytics = document.getElementById('screenAnalytics');

// Leads Table Elements
const leadsTbody = document.getElementById('leadsTbody');
const searchInput = document.getElementById('searchInput');
const filterPills = document.getElementById('filterPills');
const cityFilterSelect = document.getElementById('cityFilterSelect');
const listFilterSelect = document.getElementById('listFilterSelect');
const showingCount = document.getElementById('showingCount');

// Stats Elements
const statTotal = document.getElementById('statTotal');
const statNoWebsite = document.getElementById('statNoWebsite');
const statHighTicket = document.getElementById('statHighTicket');
const statRepRisk = document.getElementById('statRepRisk');

const countAll = document.getElementById('countAll');
const countNoWeb = document.getElementById('countNoWeb');
const countHigh = document.getElementById('countHigh');
const countRisk = document.getElementById('countRisk');

// Hunt Console Elements
const huntForm = document.getElementById('huntForm');
const huntListSelect = document.getElementById('huntListSelect');
const toggleNewListBtn = document.getElementById('toggleNewListBtn');
const inlineNewListBox = document.getElementById('inlineNewListBox');
const newListNameInput = document.getElementById('newListNameInput');
const newListDescInput = document.getElementById('newListDescInput');

const huntCountry = document.getElementById('huntCountry');
const huntRegion = document.getElementById('huntRegion');
const huntCity = document.getElementById('huntCity');
const huntArea = document.getElementById('huntArea');
const customAreaBox = document.getElementById('customAreaBox');
const customAreaInput = document.getElementById('customAreaInput');

const pathCountry = document.getElementById('pathCountry');
const pathRegion = document.getElementById('pathRegion');
const pathCity = document.getElementById('pathCity');
const pathArea = document.getElementById('pathArea');

const huntNiche = document.getElementById('huntNiche');
const huntLimit = document.getElementById('huntLimit');
const jobsList = document.getElementById('jobsList');
const startHuntSubmitBtn = document.getElementById('startHuntSubmitBtn');
const startHuntBtnText = document.getElementById('startHuntBtnText');

// Lists Screen
const listsContainer = document.getElementById('listsContainer');
const createNewListScreenBtn = document.getElementById('createNewListScreenBtn');

// Drawer Elements
const leadDrawer = document.getElementById('leadDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const drawerTitle = document.getElementById('drawerTitle');
const drawerBody = document.getElementById('drawerBody');

// ==========================================================
// 1. INITIALIZATION
// ==========================================================
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initSidebarToggle();
    initNicheChips();
    bindEvents();

    // Parallel fetch initialization
    await Promise.all([
        fetchLocations(),
        fetchLists(),
        fetchStats(),
        fetchCities(),
        fetchLeads(),
        fetchJobs()
    ]);
});

function initSidebarToggle() {
    if (!toggleSidebarBtn) return;
    toggleSidebarBtn.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-collapsed');
        const arrow = document.getElementById('sidebarToggleArrow');
        if (document.body.classList.contains('sidebar-collapsed')) {
            if (arrow) arrow.setAttribute('d', 'M13 9l3 3-3 3');
        } else {
            if (arrow) arrow.setAttribute('d', 'M15 9l-3 3 3 3');
        }
    });
}

function initNavigation() {
    const navItems = [
        { el: navLeads, screen: 'leads', title: 'Leads' },
        { el: navHunt, screen: 'hunt', title: 'Hunt Launchpad' },
        { el: navLists, screen: 'lists', title: 'Lists' },
        { el: navAnalytics, screen: 'analytics', title: 'Analytics' }
    ];

    navItems.forEach(item => {
        if (!item.el) return;
        item.el.addEventListener('click', () => switchScreen(item.screen));
    });

    if (headerHuntBtn) {
        headerHuntBtn.addEventListener('click', () => switchScreen('hunt'));
    }

    if (createNewListScreenBtn) {
        createNewListScreenBtn.addEventListener('click', () => {
            switchScreen('hunt');
            inlineNewListBox.style.display = 'flex';
            newListNameInput.focus();
        });
    }
}

function switchScreen(screenName) {
    currentScreen = screenName;

    // Update active nav button
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const targetNav = document.querySelector(`.nav-item[data-screen="${screenName}"]`);
    if (targetNav) targetNav.classList.add('active');

    // Hide all screens, show target
    document.querySelectorAll('.screen-view').forEach(s => s.classList.remove('active'));

    if (screenName === 'leads') {
        screenLeads.classList.add('active');
        breadcrumbTitle.textContent = 'Leads';
        fetchLeads();
    } else if (screenName === 'hunt') {
        screenHunt.classList.add('active');
        breadcrumbTitle.textContent = 'Hunt Launchpad';
        fetchJobs();
    } else if (screenName === 'lists') {
        screenLists.classList.add('active');
        breadcrumbTitle.textContent = 'Lead Lists';
        renderLists();
    } else if (screenName === 'analytics') {
        screenAnalytics.classList.add('active');
        breadcrumbTitle.textContent = 'Analytics';
        renderAnalytics();
    }
}

function initNicheChips() {
    document.querySelectorAll('#nicheChips .chip').forEach(btn => {
        btn.addEventListener('click', () => {
            huntNiche.value = btn.dataset.val;
        });
    });
}

// ==========================================================
// 2. WORLDWIDE LOCATION TAXONOMY (CASCADING DROPDOWNS)
// ==========================================================
async function fetchLocations() {
    try {
        const res = await fetch('/api/locations');
        const data = await res.json();
        if (data.success) {
            worldwideCountries = data.countries || [];
            locationsHierarchy = data.hierarchy || {};
            populateCountryDropdown();
        }
    } catch (err) {
        console.error("Failed to load locations hierarchy:", err);
    }
}

function populateCountryDropdown() {
    huntCountry.innerHTML = '';
    worldwideCountries.forEach(country => {
        const opt = document.createElement('option');
        opt.value = country;
        opt.textContent = country;
        if (country === 'Pakistan') opt.selected = true;
        huntCountry.appendChild(opt);
    });

    huntCountry.addEventListener('change', handleCountryChange);
    huntRegion.addEventListener('change', handleRegionChange);
    huntCity.addEventListener('change', handleCityChange);
    huntArea.addEventListener('change', handleAreaChange);

    handleCountryChange();
}

function handleCountryChange() {
    const country = huntCountry.value;
    pathCountry.textContent = country || 'Country';

    const regionsObj = locationsHierarchy[country] || null;
    huntRegion.innerHTML = '';

    if (regionsObj && Object.keys(regionsObj).length > 0) {
        Object.keys(regionsObj).forEach((reg, idx) => {
            const opt = document.createElement('option');
            opt.value = reg;
            opt.textContent = reg;
            if (idx === 0) opt.selected = true;
            huntRegion.appendChild(opt);
        });
    } else {
        const opt = document.createElement('option');
        opt.value = 'General';
        opt.textContent = 'Central / Capital Region';
        huntRegion.appendChild(opt);
    }

    handleRegionChange();
}

function handleRegionChange() {
    const country = huntCountry.value;
    const region = huntRegion.value;
    pathRegion.textContent = region || 'Region';

    const regionsObj = locationsHierarchy[country] || {};
    const citiesObj = regionsObj[region] || null;
    huntCity.innerHTML = '';

    if (citiesObj && Object.keys(citiesObj).length > 0) {
        Object.keys(citiesObj).forEach((c, idx) => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            if (idx === 0) opt.selected = true;
            huntCity.appendChild(opt);
        });
    } else {
        const opt = document.createElement('option');
        opt.value = 'Central';
        opt.textContent = 'Capital / Major Metro';
        huntCity.appendChild(opt);
    }

    const customCityOpt = document.createElement('option');
    customCityOpt.value = '__custom__';
    customCityOpt.textContent = 'Custom City...';
    huntCity.appendChild(customCityOpt);

    handleCityChange();
}

function handleCityChange() {
    const country = huntCountry.value;
    const region = huntRegion.value;
    const city = huntCity.value;
    pathCity.textContent = city || 'City';

    huntArea.innerHTML = '';

    const regionsObj = locationsHierarchy[country] || {};
    const citiesObj = regionsObj[region] || {};
    const areasList = citiesObj[city] || null;

    if (areasList && areasList.length > 0) {
        areasList.forEach((area, idx) => {
            const opt = document.createElement('option');
            opt.value = area;
            opt.textContent = area;
            if (idx === 0) opt.selected = true;
            huntArea.appendChild(opt);
        });
    } else {
        const opt = document.createElement('option');
        opt.value = 'Downtown';
        opt.textContent = 'Central Commercial District';
        huntArea.appendChild(opt);
    }

    const customAreaOpt = document.createElement('option');
    customAreaOpt.value = '__custom__';
    customAreaOpt.textContent = 'Custom Specific Area / Sector...';
    huntArea.appendChild(customAreaOpt);

    handleAreaChange();
}

function handleAreaChange() {
    const area = huntArea.value;
    if (area === '__custom__') {
        customAreaBox.style.display = 'block';
        pathArea.textContent = customAreaInput.value || 'Custom Area';
    } else {
        customAreaBox.style.display = 'none';
        pathArea.textContent = area || 'Area';
    }
}

if (customAreaInput) {
    customAreaInput.addEventListener('input', () => {
        pathArea.textContent = customAreaInput.value.trim() || 'Custom Area';
    });
}

// ==========================================================
// 3. TARGET LISTS MANAGEMENT
// ==========================================================
async function fetchLists() {
    try {
        const res = await fetch('/api/lists');
        const data = await res.json();
        if (data.success && data.lists) {
            allLists = data.lists;
            sidebarListsCount.textContent = allLists.length;
            populateListSelects();
            renderLists();
        }
    } catch (err) {
        console.error("Failed to load lead lists:", err);
    }
}

function populateListSelects() {
    // 1. Hunt Select
    huntListSelect.innerHTML = '';
    if (allLists.length === 0) {
        const opt = document.createElement('option');
        opt.value = 'General Ingestion';
        opt.textContent = 'General Ingestion (0 leads)';
        huntListSelect.appendChild(opt);
    } else {
        allLists.forEach((l, idx) => {
            const opt = document.createElement('option');
            opt.value = l.name;
            opt.textContent = `${l.name} (${l.lead_count || 0} leads)`;
            if (idx === 0) opt.selected = true;
            huntListSelect.appendChild(opt);
        });
    }

    // 2. Leads Screen Filter Select
    listFilterSelect.innerHTML = '<option value="all">All Lists</option>';
    allLists.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.name;
        opt.textContent = `${l.name} (${l.lead_count || 0})`;
        listFilterSelect.appendChild(opt);
    });
}

function renderLists() {
    if (!listsContainer) return;
    if (allLists.length === 0) {
        listsContainer.innerHTML = `<div class="table-loading">No lead lists found. Create your first list in Hunt Launchpad.</div>`;
        return;
    }

    listsContainer.innerHTML = allLists.map(l => `
        <div class="list-card">
            <div>
                <h3 class="list-card-title">${escapeHtml(l.name)}</h3>
                <p class="list-card-desc">${escapeHtml(l.description || 'Target lead group')}</p>
            </div>
            <div class="list-meta">
                <div class="list-meta-row">
                    <span>Target Niche:</span>
                    <strong>${escapeHtml(l.target_niche || 'Various')}</strong>
                </div>
                <div class="list-meta-row">
                    <span>Location:</span>
                    <strong>${escapeHtml(l.target_city || l.target_country || 'Worldwide')}</strong>
                </div>
                <div class="list-meta-row">
                    <span>Leads Extracted:</span>
                    <strong>${l.lead_count || 0}</strong>
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-secondary" style="flex: 1; justify-content: center;" onclick="viewListLeads('${escapeHtml(l.name)}')">
                    <span>View Leads</span>
                </button>
                <button class="btn btn-secondary btn-danger-hover" title="Delete list & remove its leads from DB" onclick="deleteList(${l.id}, '${escapeHtml(l.name)}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                    <span>Delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

window.viewListLeads = function(listName) {
    currentListFilter = listName;
    listFilterSelect.value = listName;
    switchScreen('leads');
    applyFilters();
};

window.deleteList = async function(id, name) {
    const confirmed = confirm(`Are you sure you want to permanently delete list "${name}" and all of its leads from Supabase? This action cannot be undone.`);
    if (!confirmed) return;

    showToast(`Deleting list "${name}" from database...`);

    try {
        const res = await fetch(`/api/lists/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Deleted list "${name}" and ${data.leadsDeleted} leads from database.`);
            if (currentListFilter === name) {
                currentListFilter = 'all';
                listFilterSelect.value = 'all';
            }
            await Promise.all([
                fetchLists(),
                fetchStats(),
                fetchCities(),
                fetchLeads()
            ]);
        } else {
            showToast('Delete error: ' + (data.error || 'Failed to delete list'));
        }
    } catch (err) {
        showToast('Network error deleting list.');
    }
};

// ==========================================================
// 4. DATA FETCHING & FILTERING
// ==========================================================
async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (data.success && data.stats) {
            const total = data.stats.total_leads || 0;
            statTotal.textContent = total;
            sidebarLeadCount.textContent = total;
            statNoWebsite.textContent = data.stats.no_website_count || 0;
            statHighTicket.textContent = data.stats.high_ticket_count || 0;
            statRepRisk.textContent = data.stats.low_rating_count || 0;
        }
    } catch (err) {
        console.error("Failed to load stats:", err);
    }
}

async function fetchCities() {
    try {
        const res = await fetch('/api/cities');
        const data = await res.json();
        if (data.success && data.cities) {
            cityFilterSelect.innerHTML = '<option value="all">All Cities</option>';
            data.cities.forEach(city => {
                const opt = document.createElement('option');
                opt.value = city;
                opt.textContent = city;
                cityFilterSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Failed to load cities:", err);
    }
}

async function fetchLeads() {
    try {
        let url = `/api/leads?limit=100`;
        if (currentCityFilter !== 'all') url += `&city=${encodeURIComponent(currentCityFilter)}`;
        if (currentListFilter !== 'all') url += `&list_name=${encodeURIComponent(currentListFilter)}`;

        const res = await fetch(url);
        const data = await res.json();
        if (data.success && data.leads) {
            allLeads = data.leads;
            applyFilters();
        }
    } catch (err) {
        leadsTbody.innerHTML = `<tr><td colspan="5" class="table-loading">Failed to load leads from Supabase.</td></tr>`;
    }
}

async function fetchJobs() {
    try {
        const res = await fetch('/api/jobs');
        const data = await res.json();
        if (data.success && data.jobs) {
            renderJobs(data.jobs);
        }
    } catch (err) {
        console.error("Failed to load jobs:", err);
    }
}

function renderJobs(jobs) {
    if (!jobsList) return;
    if (jobs.length === 0) {
        jobsList.innerHTML = `<div class="job-empty">No extraction sessions logged yet.</div>`;
        return;
    }

    jobsList.innerHTML = jobs.map(j => {
        const timeAgo = formatTimeAgo(new Date(j.created_at));
        const statusBadge = j.status === 'completed' 
            ? `<span class="job-status-badge completed">Completed</span>`
            : `<span class="job-status-badge running">Running</span>`;

        return `
            <div class="job-card">
                <div class="job-header">
                    <span class="job-query">${escapeHtml(j.query)}</span>
                    ${statusBadge}
                </div>
                <div class="job-meta">
                    <span>${j.city}</span>
                    <span>•</span>
                    <span>${j.total_found || 0} leads</span>
                    <span>•</span>
                    <span>${timeAgo}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================================
// 5. EVENT HANDLERS & HUNT SUBMIT
// ==========================================================
function bindEvents() {
    searchInput.addEventListener('input', applyFilters);

    filterPills.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        applyFilters();
    });

    cityFilterSelect.addEventListener('change', (e) => {
        currentCityFilter = e.target.value;
        fetchLeads();
    });

    listFilterSelect.addEventListener('change', (e) => {
        currentListFilter = e.target.value;
        fetchLeads();
    });

    toggleNewListBtn.addEventListener('click', () => {
        const isHidden = inlineNewListBox.style.display === 'none' || !inlineNewListBox.style.display;
        inlineNewListBox.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) newListNameInput.focus();
    });

    // Hunt Form Submit
    huntForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Resolve Target List
        let targetListName = huntListSelect.value;
        if (inlineNewListBox.style.display !== 'none' && newListNameInput.value.trim()) {
            targetListName = newListNameInput.value.trim();
            // Create list in Supabase
            try {
                await fetch('/api/lists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: targetListName,
                        description: newListDescInput.value.trim(),
                        country: huntCountry.value,
                        region: huntRegion.value,
                        city: huntCity.value,
                        area: huntArea.value === '__custom__' ? customAreaInput.value.trim() : huntArea.value,
                        niche: huntNiche.value.trim()
                    })
                });
            } catch (err) {}
        }

        if (!targetListName) {
            targetListName = 'General Ingestion';
        }

        const country = huntCountry.value;
        const state = huntRegion.value;
        const city = huntCity.value === '__custom__' ? (customAreaInput.value || 'Central') : huntCity.value;
        const area = huntArea.value === '__custom__' ? customAreaInput.value.trim() : huntArea.value;
        const niche = huntNiche.value.trim();
        let limit = parseInt(huntLimit.value, 10) || 35;
        if (limit > 45) limit = 45; // Enforce anti-ban cap max 45

        if (!city || !niche) {
            showToast('Please provide City and Niche.');
            return;
        }

        // Set Loading state with SVG spinner
        startHuntSubmitBtn.disabled = true;
        startHuntBtnText.textContent = `Hunting Leads in ${area || city}...`;
        startHuntSubmitBtn.querySelector('svg').outerHTML = `
            <svg class="btn-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
            </svg>
        `;

        showToast(`Started deep extraction for "${niche}" in ${area || city}, ${country}...`);

        try {
            const res = await fetch('/api/hunt/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    listName: targetListName,
                    country,
                    state,
                    city,
                    area,
                    niche,
                    limit
                })
            });

            const data = await res.json();
            if (data.success) {
                showToast(`Extracted ${data.job.total_found} leads in ${area || city}!`);
                
                await Promise.all([
                    fetchStats(),
                    fetchCities(),
                    fetchLists(),
                    fetchJobs()
                ]);

                // Switch to Leads screen filtered by the new list
                currentListFilter = targetListName;
                listFilterSelect.value = targetListName;
                setTimeout(() => {
                    switchScreen('leads');
                }, 1000);
            } else {
                showToast('Hunt error: ' + (data.error || 'Execution failed'));
            }
        } catch (err) {
            showToast('Network error while running hunt.');
        } finally {
            startHuntSubmitBtn.disabled = false;
            startHuntBtnText.textContent = 'Start Lead Hunt';
            startHuntSubmitBtn.querySelector('svg').outerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="22" y1="12" x2="18" y2="12"></line>
                    <line x1="6" y1="12" x2="2" y2="12"></line>
                    <line x1="12" y1="6" x2="12" y2="2"></line>
                    <line x1="12" y1="22" x2="12" y2="18"></line>
                </svg>
            `;
        }
    });

    closeDrawerBtn.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);
}

// ==========================================================
// 6. LEADS TABLE RENDERING & FILTERING
// ==========================================================
function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();

    let filtered = allLeads.filter(lead => {
        // Text Search
        const matchTitle = (lead.title || '').toLowerCase().includes(query);
        const matchAddress = (lead.address || '').toLowerCase().includes(query);
        const matchDistrict = (lead.district_area || '').toLowerCase().includes(query);
        const matchPhone = (lead.phone || '').toLowerCase().includes(query);
        const matchesQuery = !query || matchTitle || matchAddress || matchDistrict || matchPhone;

        // Pain Point Filter Pill
        let matchesPill = true;
        const painPoints = Array.isArray(lead.pain_points) ? lead.pain_points : [];
        if (currentFilter === 'no_website') {
            matchesPill = painPoints.includes('no_website');
        } else if (currentFilter === 'high_ticket_spender') {
            matchesPill = painPoints.includes('high_ticket_spender');
        } else if (currentFilter === 'reputation_risk') {
            matchesPill = painPoints.includes('reputation_risk');
        }

        return matchesQuery && matchesPill;
    });

    renderTable(filtered);
    updateFilterCounts();
}

function updateFilterCounts() {
    countAll.textContent = allLeads.length;
    countNoWeb.textContent = allLeads.filter(l => (l.pain_points || []).includes('no_website')).length;
    countHigh.textContent = allLeads.filter(l => (l.pain_points || []).includes('high_ticket_spender')).length;
    countRisk.textContent = allLeads.filter(l => (l.pain_points || []).includes('reputation_risk')).length;
}

function renderTable(leads) {
    showingCount.textContent = `Showing ${leads.length} of ${allLeads.length} leads`;

    if (leads.length === 0) {
        leadsTbody.innerHTML = `<tr><td colspan="5" class="table-loading">No leads found matching current criteria.</td></tr>`;
        return;
    }

    leadsTbody.innerHTML = leads.map(lead => {
        const painPoints = Array.isArray(lead.pain_points) ? lead.pain_points : [];
        const painBadges = painPoints.map(p => {
            const label = formatPainPoint(p);
            const isUrgent = p === 'no_website' || p === 'reputation_risk';
            return `<span class="tag-pill ${isUrgent ? 'tag-urgent' : ''}">${escapeHtml(label)}</span>`;
        }).join('');

        const rating = lead.review_rating ? parseFloat(lead.review_rating).toFixed(1) : '—';
        const reviews = lead.review_count || 0;
        const district = lead.district_area ? `${lead.district_area}, ` : '';
        const city = lead.city || 'Lahore';
        const mapsUrl = lead.gmb_link || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.title} ${lead.district_area ? lead.district_area + ' ' : ''}${lead.city || ''} ${lead.country || ''}`.trim())}`;

        return `
            <tr onclick="openLeadDetail(${lead.id})">
                <td>
                    <div class="lead-title-box">
                        <div class="lead-title-row">
                            <span class="lead-name">${escapeHtml(lead.title)}</span>
                            <a href="${mapsUrl}" target="_blank" class="maps-badge" title="Verify listing on Google Maps" onclick="event.stopPropagation();">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                    <circle cx="12" cy="10" r="3"></circle>
                                </svg>
                                <span>Maps</span>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </a>
                        </div>
                        <span class="lead-category">${escapeHtml(lead.category || 'Local Business')} • <span style="color: #71717A;">${escapeHtml(lead.list_name || 'General')}</span></span>
                    </div>
                </td>
                <td>
                    <div class="reputation-box">
                        <span class="rating-badge">★ ${rating}</span>
                        <span class="reviews-count">${reviews} reviews</span>
                    </div>
                </td>
                <td>
                    <div class="reputation-box">
                        <span style="font-weight: 500;">${escapeHtml(district + city)}</span>
                        <span style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(lead.phone || 'No phone recorded')}</span>
                    </div>
                </td>
                <td>
                    <div class="pain-tags">
                        ${painBadges || '<span style="color: var(--text-muted); font-size: 12px;">No urgent risks</span>'}
                    </div>
                </td>
                <td style="text-align: right;" onclick="event.stopPropagation();">
                    <button class="btn btn-secondary" onclick="openLeadDetail(${lead.id})">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        <span>Inspect</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================================
// 7. SLIDE-OVER LEAD DETAIL DRAWER
// ==========================================================
window.openLeadDetail = async function(id) {
    drawerTitle.textContent = 'Loading profile...';
    drawerBody.innerHTML = '<div class="table-loading">Fetching lead dossier from Supabase...</div>';
    
    leadDrawer.classList.add('open');
    drawerOverlay.classList.add('open');

    try {
        const res = await fetch(`/api/leads/${id}`);
        const data = await res.json();
        if (data.success && data.lead) {
            renderDrawerContent(data.lead);
        } else {
            drawerBody.innerHTML = '<div class="table-loading">Lead not found.</div>';
        }
    } catch (err) {
        drawerBody.innerHTML = '<div class="table-loading">Error fetching details.</div>';
    }
};

function renderDrawerContent(lead) {
    drawerTitle.textContent = lead.title;
    const mapsUrl = lead.gmb_link || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.title} ${lead.district_area ? lead.district_area + ' ' : ''}${lead.city || ''} ${lead.country || ''}`.trim())}`;

    const dms = lead.decision_makers || [];
    const dmHtml = dms.length === 0 
        ? `<p style="font-size: 13px; color: var(--text-secondary);">No contacts discovered yet. Run Website Crawler or Google Dork below.</p>`
        : dms.map(dm => `
            <div class="detail-box" style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <strong>${escapeHtml(dm.full_name)}</strong>
                    <span style="font-size: 11px; padding: 2px 6px; background: #E4E4E7; border-radius: 4px;">${dm.confidence_score}% Confidence</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">${escapeHtml(dm.title_role || 'Decision Maker')} (${escapeHtml(dm.email_source || 'Search')})</div>
                ${dm.email ? `<div style="font-size: 13px;">Email: <strong>${escapeHtml(dm.email)}</strong></div>` : ''}
                ${dm.phone ? `<div style="font-size: 13px;">Phone: <strong>${escapeHtml(dm.phone)}</strong></div>` : ''}
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    ${dm.linkedin_url ? `<a href="${dm.linkedin_url}" target="_blank" class="web-link" style="font-size: 11px;">LinkedIn Profile</a>` : ''}
                    ${dm.facebook_url ? `<a href="${dm.facebook_url}" target="_blank" class="web-link" style="font-size: 11px;">Facebook Page</a>` : ''}
                </div>
            </div>
        `).join('');

    drawerBody.innerHTML = `
        <div class="detail-section">
            <span class="detail-heading">ACTIONS & ENRICHMENT TOOLS</span>
            <div style="display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap;">
                <a href="${mapsUrl}" target="_blank" class="btn btn-secondary" style="text-decoration: none;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>View on Google Maps</span>
                </a>
                <button class="btn btn-secondary" id="crawlBtn" onclick="triggerCrawl(${lead.id})" ${!lead.website ? 'disabled' : ''}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                    <span>Crawl Website</span>
                </button>
                <button class="btn btn-secondary" id="dorkBtn" onclick="triggerDork(${lead.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <span>Google Dork</span>
                </button>
            </div>
            ${!lead.website ? '<span style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Website crawl unavailable (no website recorded).</span>' : ''}
        </div>

        <div class="detail-section">
            <span class="detail-heading">BUSINESS INFORMATION</span>
            <div class="detail-box">
                <div><strong>Category:</strong> ${escapeHtml(lead.category || 'N/A')}</div>
                <div><strong>Target List:</strong> ${escapeHtml(lead.list_name || 'General')}</div>
                <div><strong>Location:</strong> ${escapeHtml((lead.district_area ? lead.district_area + ', ' : '') + (lead.city || '') + (lead.country ? ', ' + lead.country : ''))}</div>
                <div><strong>Address:</strong> ${escapeHtml(lead.address || 'N/A')}</div>
                <div><strong>Phone:</strong> ${escapeHtml(lead.phone || 'N/A')}</div>
                <div><strong>Website:</strong> ${lead.website ? `<a href="${lead.website}" target="_blank" class="web-link">${escapeHtml(lead.website)}</a>` : '<span style="color: #71717A;">None (Pain Point)</span>'}</div>
                <div><strong>Reputation:</strong> ★ ${lead.review_rating || 0} (${lead.review_count || 0} reviews)</div>
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center;">
                    <strong>Google Maps Source:</strong>
                    <a href="${mapsUrl}" target="_blank" class="web-link" style="display: inline-flex; align-items: center; gap: 4px;">
                        <span>Verify Live on Maps</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    </a>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <span class="detail-heading">DECISION MAKERS & CONTACTS (${dms.length})</span>
            <div id="decisionMakersBox">
                ${dmHtml}
            </div>
        </div>
    `;
}


window.triggerCrawl = async function(id) {
    const btn = document.getElementById('crawlBtn');
    btn.disabled = true;
    btn.innerHTML = `<span>Crawling 3 Pages...</span>`;
    showToast('Crawling website for contact details...');

    try {
        const res = await fetch(`/api/leads/${id}/enrich`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(`Crawl Complete! Found ${data.crawlResult.emails.length} emails, ${data.crawlResult.contacts.length} doctors/names.`);
            renderDrawerContent(data.lead);
            fetchLeads();
        } else {
            showToast('Crawl failed: ' + data.error);
        }
    } catch (err) {
        showToast('Network error during crawling.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>Crawl Website</span>`;
    }
};

window.triggerDork = async function(id) {
    const btn = document.getElementById('dorkBtn');
    btn.disabled = true;
    btn.innerHTML = `<span>Searching Bing/LinkedIn...</span>`;
    showToast('Resolving owner profiles via Search Dorks...');

    try {
        const res = await fetch(`/api/leads/${id}/dork`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(`Dork Complete! Found ${data.dorkResult.linkedinProfiles.length} LinkedIn profiles, ${data.dorkResult.facebookUrls.length} FB pages.`);
            renderDrawerContent(data.lead);
            fetchLeads();
        } else {
            showToast('Dork failed: ' + data.error);
        }
    } catch (err) {
        showToast('Network error during dorking.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>Google Dork</span>`;
    }
};

function closeDrawer() {
    leadDrawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
}

// ==========================================================
// 8. UTILITIES
// ==========================================================
function formatPainPoint(tag) {
    const map = {
        'no_website': 'No Website (Urgent)',
        'reputation_risk': 'Reputation Risk (Low Stars)',
        'high_ticket_spender': 'High Budget / Spender',
        'low_rating': 'Sub-par Rating',
        'unclaimed_listing': 'Unclaimed GMB'
    };
    return map[tag] || tag.replace(/_/g, ' ');
}

function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3500);
}

function formatTimeAgo(date) {
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderAnalytics() {
    const list = document.getElementById('analyticsOpportunityList');
    if (!list) return;

    const noWeb = allLeads.filter(l => (l.pain_points || []).includes('no_website')).length;
    const high = allLeads.filter(l => (l.pain_points || []).includes('high_ticket_spender')).length;
    const rep = allLeads.filter(l => (l.pain_points || []).includes('reputation_risk')).length;
    const total = allLeads.length || 1;

    list.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px; margin-top: 16px;">
            <div>
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                    <span>Website Design Candidates (No Website)</span>
                    <strong>${noWeb} (${Math.round((noWeb/total)*100)}%)</strong>
                </div>
                <div style="height: 6px; background: #F4F4F5; border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${(noWeb/total)*100}%; background: #000;"></div>
                </div>
            </div>
            <div>
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                    <span>High-Ticket Retainer Prospects</span>
                    <strong>${high} (${Math.round((high/total)*100)}%)</strong>
                </div>
                <div style="height: 6px; background: #F4F4F5; border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${(high/total)*100}%; background: #000;"></div>
                </div>
            </div>
            <div>
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                    <span>Review Recovery Pitch (Reputation Risk)</span>
                    <strong>${rep} (${Math.round((rep/total)*100)}%)</strong>
                </div>
                <div style="height: 6px; background: #F4F4F5; border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${(rep/total)*100}%; background: #000;"></div>
                </div>
            </div>
        </div>
    `;
}
