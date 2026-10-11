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

// Live Hunt Streaming Banner Elements
const liveHuntBanner = document.getElementById('liveHuntBanner');
const liveHuntQuery = document.getElementById('liveHuntQuery');
const liveHuntStatusText = document.getElementById('liveHuntStatusText');
const liveHuntCounter = document.getElementById('liveHuntCounter');

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

    // Hunt Form Submit (Real-time SSE Live Streaming)
    huntForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Resolve Target List
        let targetListName = huntListSelect.value;
        if (inlineNewListBox.style.display !== 'none' && newListNameInput.value.trim()) {
            targetListName = newListNameInput.value.trim();
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
        startHuntBtnText.textContent = `Hunting & Enriching Leads...`;
        startHuntSubmitBtn.querySelector('svg').outerHTML = `
            <svg class="btn-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
            </svg>
        `;

        // Switch immediately to Leads screen and focus on target list
        currentListFilter = targetListName;
        listFilterSelect.value = targetListName;
        switchScreen('leads');

        // Show Live Hunt Banner
        if (liveHuntBanner) {
            liveHuntBanner.style.display = 'flex';
            if (liveHuntQuery) liveHuntQuery.textContent = `${niche} in ${area || city}`;
            if (liveHuntStatusText) liveHuntStatusText.textContent = 'Launching Google Maps scraper & 2-Tier AI waterfall...';
            if (liveHuntCounter) liveHuntCounter.textContent = '0 Leads Found';
        }

        showToast(`Hunting "${niche}" in ${area || city}. Streaming leads in real-time...`);

        // Connect Server-Sent Events (SSE) Stream
        const params = new URLSearchParams({
            listName: targetListName,
            country: country || '',
            state: state || '',
            city: city || '',
            area: area || '',
            niche: niche || '',
            limit: String(limit)
        });

        let streamedCount = 0;
        const sseUrl = `/api/hunt/stream?${params.toString()}`;
        const eventSource = new EventSource(sseUrl);

        function restoreHuntBtn() {
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

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'start') {
                    if (liveHuntStatusText) liveHuntStatusText.textContent = data.message || 'Extracting GMB listings...';
                } else if (data.type === 'lead') {
                    streamedCount++;
                    const lead = data.lead;
                    if (liveHuntCounter) liveHuntCounter.textContent = `${streamedCount} Leads Found`;
                    if (liveHuntStatusText) liveHuntStatusText.textContent = `Auto-enriched: ${lead.title}`;

                    // Insert or update lead in allLeads
                    const existingIndex = allLeads.findIndex(l => l.id === lead.id || l.place_id === lead.place_id);
                    if (existingIndex >= 0) {
                        allLeads[existingIndex] = lead;
                    } else {
                        allLeads.unshift(lead);
                    }

                    // Dynamically render table with animated incoming glow
                    applyFilters(lead.id);
                    updateStatsLocally();
                } else if (data.type === 'done') {
                    eventSource.close();
                    restoreHuntBtn();
                    if (liveHuntStatusText) liveHuntStatusText.textContent = `Completed! ${data.total_found} leads discovered & fully enriched.`;
                    showToast(`Hunt finished! Found ${data.total_found} leads with unified contact profiles.`);
                    fetchStats();
                    fetchCities();
                    fetchLists();
                    fetchJobs();
                    setTimeout(() => {
                        if (liveHuntBanner) liveHuntBanner.style.display = 'none';
                    }, 5000);
                } else if (data.type === 'error') {
                    eventSource.close();
                    restoreHuntBtn();
                    if (liveHuntStatusText) liveHuntStatusText.textContent = `Error: ${data.message}`;
                    showToast('Hunt error: ' + data.message);
                }
            } catch (parseErr) {
                console.error('Error handling SSE stream chunk:', parseErr);
            }
        };

        eventSource.onerror = (err) => {
            console.error('SSE connection interrupted:', err);
            eventSource.close();
            restoreHuntBtn();
            fetchLeads();
            fetchStats();
        };
    });

    closeDrawerBtn.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);
}

// ==========================================================
// 6. LEADS TABLE RENDERING & FILTERING
// ==========================================================
function applyFilters(incomingLeadId = null) {
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

    renderTable(filtered, incomingLeadId);
    updateFilterCounts();
}

function updateFilterCounts() {
    countAll.textContent = allLeads.length;
    countNoWeb.textContent = allLeads.filter(l => (l.pain_points || []).includes('no_website')).length;
    countHigh.textContent = allLeads.filter(l => (l.pain_points || []).includes('high_ticket_spender')).length;
    countRisk.textContent = allLeads.filter(l => (l.pain_points || []).includes('reputation_risk')).length;
}

function updateStatsLocally() {
    updateFilterCounts();
    if (statTotal) statTotal.textContent = allLeads.length;
    if (sidebarLeadCount) sidebarLeadCount.textContent = allLeads.length;
    const noWeb = allLeads.filter(l => (l.pain_points || []).includes('no_website')).length;
    const high = allLeads.filter(l => (l.pain_points || []).includes('high_ticket_spender')).length;
    const rep = allLeads.filter(l => (l.pain_points || []).includes('reputation_risk')).length;
    if (statNoWebsite) statNoWebsite.textContent = noWeb;
    if (statHighTicket) statHighTicket.textContent = high;
    if (statRepRisk) statRepRisk.textContent = rep;
}

function getDirectMapsUrl(lead) {
    if (!lead) return '#';
    // 1. Official Google Place ID
    if (lead.place_id && typeof lead.place_id === 'string' && lead.place_id.startsWith('ChIJ')) {
        return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(lead.place_id)}`;
    }
    // 2. Direct place/share link
    if (lead.gmb_link && typeof lead.gmb_link === 'string') {
        if ((lead.gmb_link.includes('/maps/place/') || lead.gmb_link.includes('maps.app.goo.gl') || lead.gmb_link.includes('cid=')) && !lead.gmb_link.includes('/maps/search/')) {
            return lead.gmb_link;
        }
    }
    // 3. Fallback direct place entity canonical link
    const title = (lead.title || '').replace(/[\/\\]/g, ' ').replace(/\s+/g, ' ').trim();
    const locParts = [];
    if (lead.district_area && !title.toLowerCase().includes(lead.district_area.toLowerCase())) {
        locParts.push(lead.district_area);
    }
    if (lead.city && !title.toLowerCase().includes(lead.city.toLowerCase())) {
        locParts.push(lead.city);
    }
    if (lead.country && !title.toLowerCase().includes(lead.country.toLowerCase())) {
        locParts.push(lead.country);
    }
    const query = locParts.length > 0 ? `${title}, ${locParts.join(', ')}` : title;
    return `https://www.google.com/maps/place/${encodeURIComponent(query)}/`;
}

function renderTable(leads, incomingLeadId = null) {
    showingCount.textContent = `Showing ${leads.length} of ${allLeads.length} leads`;

    if (leads.length === 0) {
        leadsTbody.innerHTML = `<tr><td colspan="5" class="table-loading">No leads found matching current criteria.</td></tr>`;
        return;
    }

    leadsTbody.innerHTML = leads.map(lead => {
        const isIncoming = incomingLeadId && lead.id === incomingLeadId;
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
        const mapsUrl = getDirectMapsUrl(lead);
        const firstDm = (lead.decision_makers && lead.decision_makers.length > 0) ? lead.decision_makers[0] : null;

        return `
            <tr class="${isIncoming ? 'lead-row-incoming' : ''}" onclick="openLeadDetail(${lead.id})">
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
                        <span class="lead-category">
                            ${escapeHtml(lead.category || 'Local Business')} • <span style="color: #71717A;">${escapeHtml(lead.list_name || 'General')}</span>
                            ${lead.whatsapp_number ? ` • <a href="https://wa.me/${escapeHtml(lead.whatsapp_number.replace(/\D/g, ''))}" target="_blank" class="whatsapp-badge" onclick="event.stopPropagation();">WA: ${escapeHtml(lead.whatsapp_number)}</a>` : ''}
                            ${firstDm ? ` • <span style="color: #18181B; font-weight: 500;">DM: ${escapeHtml(firstDm.full_name)}</span>` : ''}
                        </span>
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
    const mapsUrl = getDirectMapsUrl(lead);

    const dms = lead.decision_makers || [];
    const dmHtml = dms.length === 0 
        ? `<p style="font-size: 13px; color: var(--text-secondary);">No contacts discovered yet. Run Full Waterfall Enrich below.</p>`
        : dms.map(dm => `
            <div class="detail-box" style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <strong>${escapeHtml(dm.full_name)}</strong>
                    <span style="font-size: 11px; padding: 2px 6px; background: #E4E4E7; border-radius: 4px;">${dm.confidence_score}% Confidence</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">${escapeHtml(dm.title_role || 'Decision Maker')} (${escapeHtml(dm.email_source || 'Search')})</div>
                ${dm.email ? `<div style="font-size: 13px; margin-bottom: 2px;">Email: <strong>${escapeHtml(dm.email)}</strong> ${dm.confidence_score >= 80 ? '<span style="font-size: 10px; color: #15803D; background: #DCFCE7; padding: 1px 6px; border-radius: 3px; margin-left: 6px;">Verified SMTP 250 OK</span>' : ''}</div>` : ''}
                ${dm.phone ? `<div style="font-size: 13px; margin-bottom: 2px;">Phone: <strong>${escapeHtml(dm.phone)}</strong></div>` : ''}
                ${dm.whatsapp_number ? `<div style="font-size: 13px; margin-bottom: 2px;">WhatsApp: <a href="https://wa.me/${escapeHtml(dm.whatsapp_number.replace(/\D/g, ''))}" target="_blank" class="whatsapp-badge" style="padding: 1px 6px; font-size: 11px;">${escapeHtml(dm.whatsapp_number)}</a></div>` : ''}
                <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                    ${dm.linkedin_url ? `<a href="${dm.linkedin_url}" target="_blank" class="web-link" style="font-size: 11px;">LinkedIn Profile</a>` : ''}
                    ${dm.facebook_url ? `<a href="${dm.facebook_url}" target="_blank" class="web-link" style="font-size: 11px;">Facebook Page</a>` : ''}
                    ${dm.instagram_url ? `<a href="${dm.instagram_url}" target="_blank" class="web-link" style="font-size: 11px;">Instagram Profile</a>` : ''}
                    ${dm.twitter_url ? `<a href="${dm.twitter_url}" target="_blank" class="web-link" style="font-size: 11px;">Twitter/X Profile</a>` : ''}
                </div>
            </div>
        `).join('');

    const pitchSection = lead.ai_pitch ? `
        <div class="detail-section">
            <div class="pitch-box">
                <div class="pitch-box-header">
                    <span class="pitch-tag">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        AI PERSONALIZED B2B PITCH (GROQ / GEMINI)
                    </span>
                    <button class="pitch-copy-btn" id="copyPitchBtn" onclick="copyPitchText(this)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"></path></svg>
                        <span>Copy Pitch</span>
                    </button>
                </div>
                <div class="pitch-body-text" id="pitchBodyText">${escapeHtml(lead.ai_pitch)}</div>
            </div>
        </div>
    ` : '';

    drawerBody.innerHTML = `
        <div class="detail-section">
            <span class="detail-heading">ACTIONS & ENRICHMENT TOOLS</span>
            <div style="display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap;">
                <button class="btn btn-primary" id="fullEnrichBtn" onclick="triggerFullEnrich(${lead.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    <span>Full Waterfall Enrich (AI + Dork + Crawl)</span>
                </button>
                ${lead.whatsapp_number ? `
                    <a href="https://wa.me/${escapeHtml(lead.whatsapp_number.replace(/\D/g, ''))}" target="_blank" class="btn btn-secondary" style="border-color: #22C55E; color: #15803D; font-weight: 600; text-decoration: none;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                        </svg>
                        <span>WhatsApp (${escapeHtml(lead.whatsapp_number)})</span>
                    </a>
                ` : ''}
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

        ${pitchSection}

        <div class="detail-section">
            <span class="detail-heading">BUSINESS INFORMATION</span>
            <div class="detail-box">
                <div><strong>Category:</strong> ${escapeHtml(lead.category || 'N/A')}</div>
                <div><strong>Target List:</strong> ${escapeHtml(lead.list_name || 'General')}</div>
                <div><strong>Location:</strong> ${escapeHtml((lead.district_area ? lead.district_area + ', ' : '') + (lead.city || '') + (lead.country ? ', ' + lead.country : ''))}</div>
                <div><strong>Address:</strong> ${escapeHtml(lead.address || 'N/A')}</div>
                <div><strong>Phone:</strong> ${escapeHtml(lead.phone || 'N/A')}</div>
                ${lead.whatsapp_number ? `<div><strong>WhatsApp:</strong> <a href="https://wa.me/${escapeHtml(lead.whatsapp_number.replace(/\D/g, ''))}" target="_blank" class="whatsapp-badge" style="padding: 1px 6px;">${escapeHtml(lead.whatsapp_number)}</a></div>` : ''}
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


window.copyPitchText = function(btn) {
    const textEl = document.getElementById('pitchBodyText');
    if (!textEl) return;
    const text = textEl.innerText.trim();
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span style="color:#15803D; font-weight:600;">Copied!</span>`;
        setTimeout(() => { btn.innerHTML = orig; }, 2500);
        showToast('AI cold pitch copied to clipboard!');
    }).catch(err => {
        showToast('Copy failed: ' + err.message);
    });
};

window.triggerFullEnrich = async function(id) {
    const btn = document.getElementById('fullEnrichBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>Running Waterfall (AI+Dork+Crawl)...</span>`;
    }
    showToast('Executing automated 2-tier waterfall enrichment...');

    try {
        const res = await fetch(`/api/leads/${id}/full-enrich`, { method: 'POST' });
        const data = await res.json();
        if (data.success && data.lead) {
            showToast('Full Waterfall Enrichment complete!');
            renderDrawerContent(data.lead);
            const idx = allLeads.findIndex(l => l.id === data.lead.id);
            if (idx >= 0) {
                allLeads[idx] = data.lead;
            } else {
                allLeads.unshift(data.lead);
            }
            applyFilters(data.lead.id);
            updateStatsLocally();
        } else {
            showToast('Enrichment error: ' + (data.error || 'Execution failed'));
        }
    } catch (err) {
        showToast('Network error during enrichment: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                <span>Full Waterfall Enrich (AI + Dork + Crawl)</span>
            `;
        }
    }
};

window.triggerCrawl = async function(id) {
    const btn = document.getElementById('crawlBtn');
    btn.disabled = true;
    btn.innerHTML = `<span>Crawling 3 Pages...</span>`;
    showToast('Crawling website for contact details...');

    try {
        const res = await fetch(`/api/leads/${id}/enrich`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            const numEmails = (data.crawlResult?.emails || []).length;
            const numContacts = (data.crawlResult?.contacts || data.crawlResult?.doctor_names || []).length;
            showToast(`Crawl Complete! Found ${numEmails} emails, ${numContacts} contacts/leaders.`);
            renderDrawerContent(data.lead);
            fetchLeads();
        } else {
            showToast('Crawl failed: ' + data.error);
        }
    } catch (err) {
        showToast('Network error during crawling: ' + err.message);
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
            const numLi = (data.dorkResult?.linkedinProfiles || []).length;
            const numFb = (data.dorkResult?.facebookUrls || []).length;
            const numEm = (data.dorkResult?.directEmails || []).length;
            showToast(`Dork Complete! Found ${numLi} LinkedIn, ${numFb} FB, ${numEm} emails.`);
            renderDrawerContent(data.lead);
            fetchLeads();
        } else {
            showToast('Dork failed: ' + data.error);
        }
    } catch (err) {
        showToast('Network error during dorking: ' + err.message);
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
