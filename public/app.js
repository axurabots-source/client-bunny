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
const navInbox = document.getElementById('navInbox');
const navAnalytics = document.getElementById('navAnalytics');

// Screens
const screenLeads = document.getElementById('screenLeads');
const screenHunt = document.getElementById('screenHunt');
const screenLists = document.getElementById('screenLists');
const screenInbox = document.getElementById('screenInbox');
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
const startHuntSubmitBtn = document.getElementById('startHuntSubmitBtn') || document.getElementById('startHuntBtn');
const startHuntBtnText = document.getElementById('startHuntBtnText') || (startHuntSubmitBtn ? startHuntSubmitBtn.querySelector('span') : null);

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
    initEmailSettings();
    bindEvents();
    initPWA();

    // Parallel fetch initialization
    await Promise.all([
        fetchLocations(),
        fetchLists(),
        fetchStats(),
        fetchCities(),
        fetchLeads(),
        fetchJobs(),
        fetchInboxStats()
    ]);
});

// ==========================================================
// 1.1. PROGRESSIVE WEB APP (PWA) INITIALIZATION
// ==========================================================
let deferredPwaPrompt = null;

function initPWA() {
    const installBtn = document.getElementById('pwaInstallBtn');
    const offlineBadge = document.getElementById('pwaOfflineBadge');

    // 1. Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                    console.log('[PWA] Service Worker registered successfully! Scope:', registration.scope);
                })
                .catch((err) => {
                    console.warn('[PWA] Service Worker registration failed:', err);
                });
        });
    }

    // 2. Capture beforeinstallprompt for in-app install button
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPwaPrompt = e;

        if (installBtn) {
            installBtn.style.display = 'inline-flex';
            installBtn.addEventListener('click', async () => {
                if (!deferredPwaPrompt) return;
                deferredPwaPrompt.prompt();
                const choiceResult = await deferredPwaPrompt.userChoice;
                console.log('[PWA] Install prompt outcome:', choiceResult.outcome);
                deferredPwaPrompt = null;
                installBtn.style.display = 'none';
            });
        }
    });

    // 3. Handle appinstalled event
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] Client Bunny installed as desktop/mobile standalone app.');
        showToast('🎉 Client Bunny installed successfully!');
        if (installBtn) installBtn.style.display = 'none';
        deferredPwaPrompt = null;
    });

    // 4. Online / Offline network listeners
    function updateNetworkStatus(e) {
        const isOnline = (e && e.type === 'offline') ? false : ((e && e.type === 'online') ? true : navigator.onLine);
        if (offlineBadge) {
            offlineBadge.style.display = isOnline ? 'none' : 'inline-flex';
        }
        if (!isOnline) {
            showToast('⚡ Offline Mode: Working with cached records.');
        } else {
            console.log('[PWA] Device is online.');
        }
    }

    window.addEventListener('online', (e) => updateNetworkStatus(e));
    window.addEventListener('offline', (e) => updateNetworkStatus(e));
    updateNetworkStatus();

    // 5. Handle PWA Shortcut URL Params (e.g. /?screen=hunt)
    const urlParams = new URLSearchParams(window.location.search);
    const screenTarget = urlParams.get('screen');
    if (screenTarget && ['leads', 'hunt', 'lists', 'inbox', 'analytics'].includes(screenTarget)) {
        setTimeout(() => switchScreen(screenTarget), 100);
    }
}

function initSidebarToggle() {
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', () => {
            if (window.innerWidth <= 900) {
                document.body.classList.toggle('mobile-nav-open');
            } else {
                document.body.classList.toggle('sidebar-collapsed');
                const arrow = document.getElementById('sidebarToggleArrow');
                if (document.body.classList.contains('sidebar-collapsed')) {
                    if (arrow) arrow.setAttribute('d', 'M13 9l3 3-3 3');
                } else {
                    if (arrow) arrow.setAttribute('d', 'M15 9l-3 3 3 3');
                }
            }
        });
    }

    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => {
            document.body.classList.remove('mobile-nav-open');
        });
    }
}

function initNavigation() {
    const navItems = [
        { el: navLeads, screen: 'leads', title: 'Leads' },
        { el: navHunt, screen: 'hunt', title: 'Hunt Launchpad' },
        { el: navLists, screen: 'lists', title: 'Lists' },
        { el: navInbox, screen: 'inbox', title: 'Omnichannel Inbox' },
        { el: navAnalytics, screen: 'analytics', title: 'Analytics' }
    ];

    navItems.forEach(item => {
        if (!item.el) return;
        item.el.addEventListener('click', () => {
            document.body.classList.remove('mobile-nav-open');
            switchScreen(item.screen);
        });
    });

    // Mobile Bottom Navigation Dock Items
    const bnavItems = [
        { el: document.getElementById('bnavLeads'), screen: 'leads' },
        { el: document.getElementById('bnavHunt'), screen: 'hunt' },
        { el: document.getElementById('bnavLists'), screen: 'lists' },
        { el: document.getElementById('bnavInbox'), screen: 'inbox' },
        { el: document.getElementById('bnavAnalytics'), screen: 'analytics' }
    ];

    bnavItems.forEach(item => {
        if (!item.el) return;
        item.el.addEventListener('click', () => {
            document.body.classList.remove('mobile-nav-open');
            switchScreen(item.screen);
        });
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

    // Update active nav button (Desktop Sidebar)
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const targetNav = document.querySelector(`.nav-item[data-screen="${screenName}"]`);
    if (targetNav) targetNav.classList.add('active');

    // Update active nav button (Mobile Bottom Bar)
    document.querySelectorAll('.bnav-item').forEach(btn => btn.classList.remove('active'));
    const targetBnav = document.querySelector(`.bnav-item[data-screen="${screenName}"]`);
    if (targetBnav) targetBnav.classList.add('active');

    // Hide all screens, show target
    document.querySelectorAll('.screen-view').forEach(s => s.classList.remove('active'));

    if (screenName === 'inbox') {
        document.body.classList.add('inbox-mode');
        screenInbox.classList.add('active');
        breadcrumbTitle.textContent = 'Omnichannel Inbox';

        // WhatsApp Mobile: always start on the chats list view on mobile screens
        if (window.innerWidth <= 768) {
            document.body.classList.remove('mobile-inbox-open');
            activeConversationId = null;
        }

        loadInboxConversations();
        fetchInboxStats();
    } else {
        document.body.classList.remove('inbox-mode');
        document.body.classList.remove('mobile-inbox-open');
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
}

function initNicheChips() {

    // Limit pill buttons
    document.querySelectorAll('.limit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.limit-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (huntLimit) huntLimit.value = btn.getAttribute('data-limit');
        });
    });

    // Niche chips
    document.querySelectorAll('.niche-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.niche-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            if (huntNiche) huntNiche.value = chip.getAttribute('data-niche');
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
    if (pathCountry) pathCountry.textContent = country || 'Country';

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
    if (pathRegion) pathRegion.textContent = region || 'Region';

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
    if (pathCity) pathCity.textContent = city || 'City';

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
        if (pathArea) pathArea.textContent = area || 'Area';
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
            const bnavListsCount = document.getElementById('bnavListsCount');
            if (bnavListsCount) bnavListsCount.textContent = allLists.length;
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
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button class="btn btn-primary" style="flex: 1; justify-content: center; font-size: 12px; padding: 6px 10px;" onclick="viewListLeads('${escapeHtml(l.name)}')">
                    <span>View Leads</span>
                </button>
                <button class="btn btn-secondary" style="flex: 1; justify-content: center; font-size: 12px; padding: 6px 10px;" title="Add more leads to this list" onclick="reHuntList('${escapeHtml(l.name)}')">
                    <span>⚡ Re-Hunt</span>
                </button>
                <button class="btn btn-secondary btn-danger-hover" style="font-size: 12px; padding: 6px 10px;" title="Delete list & remove its leads from DB" onclick="deleteList(${l.id}, '${escapeHtml(l.name)}')">
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
            if (statTotal) statTotal.textContent = total;
            if (sidebarLeadCount) sidebarLeadCount.textContent = total;
            const bnavLeadCount = document.getElementById('bnavLeadCount');
            if (bnavLeadCount) bnavLeadCount.textContent = total;

            const sentToday = data.stats.emails_sent_today !== undefined ? data.stats.emails_sent_today : 0;
            const dailyLimit = data.stats.daily_limit || 30;
            const statEmailsTodayEl = document.getElementById('statEmailsSentToday');
            if (statEmailsTodayEl) {
                statEmailsTodayEl.textContent = `${sentToday} / ${dailyLimit} limit`;
            }

            const statRepliesEl = document.getElementById('statRepliesReceived');
            if (statRepliesEl) {
                statRepliesEl.textContent = data.stats.replies_received || 0;
            }

            const statEnrichedEl = document.getElementById('statEnrichedPercent');
            if (statEnrichedEl) {
                statEnrichedEl.textContent = `${data.stats.enriched_percent || 0}%`;
            }

            if (statNoWebsite) statNoWebsite.textContent = data.stats.no_website_count || 0;
            if (statHighTicket) statHighTicket.textContent = data.stats.high_ticket_count || 0;
            if (statRepRisk) statRepRisk.textContent = data.stats.low_rating_count || 0;
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
                        description: (newListDescInput && newListDescInput.value) ? newListDescInput.value.trim() : '',
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
            if (startHuntSubmitBtn) {
                startHuntSubmitBtn.disabled = false;
                const svg = startHuntSubmitBtn.querySelector('svg');
                if (svg) {
                    svg.outerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="22" y1="12" x2="18" y2="12"></line>
                            <line x1="6" y1="12" x2="2" y2="12"></line>
                            <line x1="12" y1="6" x2="12" y2="2"></line>
                            <line x1="12" y1="22" x2="12" y2="18"></line>
                        </svg>
                    `;
                }
            }
            if (startHuntBtnText) {
                startHuntBtnText.textContent = 'Start Live Hunt';
            }
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
                    const newCount = data.newLeadsCount !== undefined ? data.newLeadsCount : (data.total_found || 0);
                    const skipped = data.skippedDuplicates || 0;
                    
                    if (newCount === 0) {
                        if (liveHuntStatusText) liveHuntStatusText.textContent = data.message || 'Area fully covered. All businesses already saved in this list.';
                        showToast(data.message || 'Area fully covered. No duplicate leads added.');
                    } else {
                        if (liveHuntStatusText) liveHuntStatusText.textContent = `Completed! ${newCount} new leads added (${skipped} duplicates skipped).`;
                        showToast(`Hunt finished! Added ${newCount} new verified leads (${skipped} skipped).`);
                    }
                    if (liveHuntCounter) liveHuntCounter.textContent = `${newCount} New Added`;
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

    
    // Update Active List Bar
    const activeListNameDisplay = document.getElementById('activeListNameDisplay');
    const activeListCountDisplay = document.getElementById('activeListCountDisplay');
    const reHuntListBtn = document.getElementById('reHuntListBtn');
    
    if (activeListNameDisplay) {
        activeListNameDisplay.textContent = currentListFilter === 'all' ? 'All Campaign Lists' : currentListFilter;
    }
    if (activeListCountDisplay) {
        activeListCountDisplay.textContent = filtered.length + ' leads isolated';
    }
    if (reHuntListBtn) {
        reHuntListBtn.style.display = currentListFilter === 'all' ? 'none' : 'inline-flex';
    }

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
    const bnavLeadCount = document.getElementById('bnavLeadCount');
    if (bnavLeadCount) bnavLeadCount.textContent = allLeads.length;
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
        leadsTbody.innerHTML = `<tr><td colspan="6" class="table-loading">No leads found matching current criteria.</td></tr>`;
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
                        </span>
                        <span style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                            ${escapeHtml(district + city)} ${lead.phone ? `• ${escapeHtml(lead.phone)}` : ''}
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
                    <div class="pain-tags">
                        ${painBadges || '<span style="color: var(--text-muted); font-size: 12px;">No urgent risks</span>'}
                    </div>
                </td>
                <td>
                    ${firstDm ? `
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <span style="font-weight: 600; color: #18181B; font-size: 13px;">${escapeHtml(firstDm.full_name)}</span>
                            <span style="font-size: 11px; color: #71717A;">${escapeHtml(firstDm.title_role || 'Owner / Director')}</span>
                            ${firstDm.email ? `<span style="font-size: 11px; color: #15803D; font-weight: 500;">✉ ${escapeHtml(firstDm.email)}</span>` : '<span style="font-size: 11px; color: #A1A1AA;">Email unlisted</span>'}
                        </div>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <span style="font-size: 12px; color: #A1A1AA;">No DM discovered</span>
                            <a href="javascript:void(0)" onclick="event.stopPropagation(); triggerRowDeepEnrich(${lead.id}, this);" style="font-size: 11px; color: #2563EB; text-decoration: underline;">Run Deep Enrich →</a>
                        </div>
                    `}
                </td>
                <td>
                    <span class="badge-status badge-status-${lead.status || 'new'}">${lead.status || 'new'}</span>
                </td>
                <td style="text-align: right;" onclick="event.stopPropagation();">
                    <div class="table-action-cluster">
                        <button class="btn-row-action" title="Deep Enrich (Crawl website + Search Dork)" onclick="triggerRowDeepEnrich(${lead.id}, this)">
                            <span>⚡ Enrich</span>
                        </button>
                        <button class="btn-row-action" title="Generate or Review AI Pitch (Editable)" onclick="openPitchModal(${lead.id})">
                            <span>✨ Pitch</span>
                        </button>
                        <button class="btn-row-action primary" title="Send or Queue Cold Email" onclick="openEmailComposerModal(${lead.id})">
                            <span>✉️ Email</span>
                        </button>
                        <button class="btn-row-action" title="View Full Dossier" onclick="openLeadDetail(${lead.id})">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </button>
                    </div>
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
        ? `<p style="font-size: 13px; color: var(--text-secondary);">No individual decision makers discovered yet. Run Full Waterfall Enrich below.</p>`
        : dms.map(dm => `
            <div class="detail-box" style="margin-bottom: 8px; border-left: 3px solid #18181B;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <strong style="font-size: 14px;">${escapeHtml(dm.full_name)}</strong>
                    <span style="font-size: 11px; padding: 2px 6px; background: #E4E4E7; border-radius: 4px; font-weight: 500;">${dm.confidence_score}% Confidence</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">
                    <span style="font-weight: 500; color: #000;">${escapeHtml(dm.title_role || 'Owner / Director')}</span> • <span style="color: #71717A;">${escapeHtml(dm.email_source || 'Verified Source')}</span>
                </div>
                ${dm.email ? `<div style="font-size: 13px; margin-bottom: 3px;">Direct Personal Email: <strong style="color: #000;">${escapeHtml(dm.email)}</strong> ${dm.confidence_score >= 80 ? '<span style="font-size: 10px; color: #15803D; background: #DCFCE7; padding: 1px 6px; border-radius: 3px; margin-left: 6px;">Verified SMTP 250 OK</span>' : ''}</div>` : '<div style="font-size: 12px; color: #A1A1AA; margin-bottom: 3px;">Direct personal email unlisted.</div>'}
                ${dm.phone ? `<div style="font-size: 13px; margin-bottom: 3px;">Direct Phone: <strong>${escapeHtml(dm.phone)}</strong></div>` : ''}
                ${dm.whatsapp_number ? `<div style="font-size: 13px; margin-bottom: 3px;">Personal WhatsApp: <a href="https://wa.me/${escapeHtml(dm.whatsapp_number.replace(/\D/g, ''))}" target="_blank" class="whatsapp-badge" style="padding: 1px 6px; font-size: 11px;">${escapeHtml(dm.whatsapp_number)}</a></div>` : ''}
                <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                    ${dm.linkedin_url ? `<a href="${dm.linkedin_url}" target="_blank" class="web-link" style="font-size: 11px; font-weight: 500;">Personal LinkedIn Profile</a>` : ''}
                    ${dm.facebook_url ? `<a href="${dm.facebook_url}" target="_blank" class="web-link" style="font-size: 11px; font-weight: 500;">Personal Facebook Profile</a>` : ''}
                    ${dm.twitter_url ? `<a href="${dm.twitter_url}" target="_blank" class="web-link" style="font-size: 11px; font-weight: 500;">Personal Twitter/X Profile</a>` : ''}
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
                    <div style="display: flex; gap: 6px;">
                        <button class="pitch-copy-btn" id="copyPitchBtn" onclick="copyPitchText(this)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"></path></svg>
                            <span>Copy Pitch</span>
                        </button>
                        <button class="pitch-copy-btn" id="regenPitchBtn_${lead.id}" onclick="triggerGeneratePitch(${lead.id})" title="Re-generate tailored pitch">
                            <span>🔄 Re-generate</span>
                        </button>
                    </div>
                </div>
                <div class="pitch-body-text" id="pitchBodyText">${escapeHtml(lead.ai_pitch)}</div>
                <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
                    <button class="btn btn-primary btn-sm" onclick="openEmailComposerModal(${lead.id})" style="font-size: 12px; padding: 5px 12px;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                        <span>Dispatch This Pitch Via Email</span>
                    </button>
                </div>
            </div>
        </div>
    ` : `
        <div class="detail-section">
            <div class="pitch-box" style="background: #FAFAFA; border: 1px dashed var(--border-light); text-align: center; padding: 18px 14px;">
                <div style="font-size: 13px; font-weight: 600; color: #18181B; margin-bottom: 4px;">⚡ Token Saver Mode (AI Pitch On-Demand)</div>
                <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; max-width: 440px; margin-left: auto; margin-right: auto;">
                    Pitches are not generated automatically to conserve your Groq/Gemini tokens. Click below when you are ready to craft a tailored offer for this business.
                </p>
                <button class="btn btn-primary" id="generatePitchBtn_${lead.id}" onclick="triggerGeneratePitch(${lead.id})" style="font-size: 12px; padding: 6px 14px; margin: 0 auto;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    <span>✨ Generate AI Cold Pitch</span>
                </button>
            </div>
        </div>
    `;

    drawerBody.innerHTML = `
        <div class="detail-section">
            <span class="detail-heading">ACTIONS & OUTREACH TOOLS</span>
            <div style="display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="openEmailComposerModal(${lead.id})" style="background: #000; color: #fff;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    <span>✉️ Send Cold Email</span>
                </button>
                <button class="btn btn-secondary" id="fullEnrichBtn" onclick="triggerFullEnrich(${lead.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    <span>Full Waterfall Enrich (Owner Finder)</span>
                </button>
                ${(lead.whatsapp_number || lead.phone) ? `
                    <a href="https://wa.me/${escapeHtml((lead.whatsapp_number || lead.phone).replace(/\D/g, ''))}" target="_blank" class="btn btn-secondary" style="border-color: #22C55E; color: #15803D; font-weight: 600; text-decoration: none;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                        </svg>
                        <span>${lead.whatsapp_number ? 'WhatsApp (' + escapeHtml(lead.whatsapp_number) + ')' : 'Chat on WhatsApp (' + escapeHtml(lead.phone) + ')'}</span>
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
            <span class="detail-heading">COMPANY / BUSINESS INFORMATION</span>
            <div class="detail-box">
                <div><strong>Company Name:</strong> ${escapeHtml(lead.title || 'N/A')}</div>
                <div><strong>Category:</strong> ${escapeHtml(lead.category || 'N/A')}</div>
                <div><strong>Target List:</strong> ${escapeHtml(lead.list_name || 'General')}</div>
                <div><strong>Location:</strong> ${escapeHtml((lead.district_area ? lead.district_area + ', ' : '') + (lead.city || '') + (lead.country ? ', ' + lead.country : ''))}</div>
                <div><strong>Address:</strong> ${escapeHtml(lead.address || 'N/A')}</div>
                <div><strong>Phone:</strong> ${escapeHtml(lead.phone || 'N/A')}</div>
                ${lead.company_email ? `<div><strong>Company General Inbox:</strong> <span style="font-weight: 600; color: #18181B;">${escapeHtml(lead.company_email)}</span> <span style="font-size: 10px; background: #F4F4F5; padding: 2px 5px; border-radius: 3px; color: #71717A;">General Inbox</span></div>` : ''}
                ${lead.whatsapp_number ? `<div><strong>Company WhatsApp:</strong> <a href="https://wa.me/${escapeHtml(lead.whatsapp_number.replace(/\D/g, ''))}" target="_blank" class="whatsapp-badge" style="padding: 1px 6px;">${escapeHtml(lead.whatsapp_number)}</a></div>` : ''}
                <div><strong>Website:</strong> ${lead.website ? `<a href="${lead.website}" target="_blank" class="web-link">${escapeHtml(lead.website)}</a>` : '<span style="color: #71717A;">None (Pain Point)</span>'}</div>
                <div><strong>Reputation:</strong> ★ ${lead.review_rating || 0} (${lead.review_count || 0} reviews)</div>
                <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                    ${lead.company_facebook ? `<a href="${lead.company_facebook}" target="_blank" class="web-link" style="font-size: 11px;">Company Facebook Page</a>` : ''}
                    ${lead.company_linkedin ? `<a href="${lead.company_linkedin}" target="_blank" class="web-link" style="font-size: 11px;">Company LinkedIn Page</a>` : ''}
                    ${lead.company_instagram ? `<a href="${lead.company_instagram}" target="_blank" class="web-link" style="font-size: 11px;">Company Instagram Handle</a>` : ''}
                </div>
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
            <span class="detail-heading">DECISION MAKERS & OWNERS (${dms.length})</span>
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


window.reHuntList = function(listName) {
    switchScreen('hunt');
    if (huntListSelect) huntListSelect.value = listName;
    const found = allLists.find(x => x.name === listName);
    if (found) {
        if (found.target_niche && huntNiche) huntNiche.value = found.target_niche;
        if (found.target_country && huntCountry) {
            huntCountry.value = found.target_country;
            handleCountryChange();
            setTimeout(() => {
                if (found.target_city && huntCity) {
                    huntCity.value = found.target_city;
                    handleCityChange();
                }
            }, 300);
        }
    }
    showToast('Ready to re-hunt into list: "' + listName + '". Duplicates will be skipped!');
};

window.reHuntCurrentList = function() {
    if (currentListFilter && currentListFilter !== 'all') {
        const found = allLists.find(l => l.name === currentListFilter);
        window.reHuntList(
            currentListFilter, 
            found ? found.target_country : '', 
            found ? found.target_city : '', 
            found ? found.target_niche : ''
        );
    } else {
        switchScreen('hunt');
    }
};

// ==========================================================
// MODULE 5: OUTREACH & FRONTEND EMAIL/SMTP CONFIGURATION
// ==========================================================

const SMTP_STORAGE_KEY = 'client_bunny_smtp_config';

function getSmtpConfig() {
    try {
        const raw = localStorage.getItem(SMTP_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
        senderName: '',
        user: '',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        pass: ''
    };
}

function saveSmtpConfig(config) {
    localStorage.setItem(SMTP_STORAGE_KEY, JSON.stringify(config));
    updateEmailStatusBadge();
}

function updateEmailStatusBadge() {
    const config = getSmtpConfig();
    const dot = document.getElementById('emailStatusDot');
    const badgeText = document.getElementById('emailStatusBadgeText');
    if (!dot || !badgeText) return;

    if (config.user && config.pass) {
        dot.className = 'status-dot connected';
        badgeText.textContent = config.user;
    } else {
        dot.className = 'status-dot disconnected';
        badgeText.textContent = 'Email Settings';
    }
}

function initEmailSettings() {
    updateEmailStatusBadge();

    // Header Button
    const emailSettingsBtn = document.getElementById('emailSettingsBtn');
    if (emailSettingsBtn) {
        emailSettingsBtn.addEventListener('click', openEmailSettingsModal);
    }

    // Modal Close buttons
    const closeSmtpModalBtn = document.getElementById('closeSmtpModalBtn');
    const cancelSmtpModalBtn = document.getElementById('cancelSmtpModalBtn');
    if (closeSmtpModalBtn) closeSmtpModalBtn.addEventListener('click', closeEmailSettingsModal);
    if (cancelSmtpModalBtn) cancelSmtpModalBtn.addEventListener('click', closeEmailSettingsModal);

    // Save Settings
    const saveSmtpBtn = document.getElementById('saveSmtpBtn');
    if (saveSmtpBtn) {
        saveSmtpBtn.addEventListener('click', () => {
            const senderName = document.getElementById('smtpSenderName').value.trim();
            const user = document.getElementById('smtpSenderEmail').value.trim();
            const host = document.getElementById('smtpHost').value.trim() || 'smtp.gmail.com';
            const port = parseInt(document.getElementById('smtpPort').value.trim(), 10) || 465;
            const secure = document.getElementById('smtpSecure').value === 'true';
            const pass = document.getElementById('smtpPass').value.trim();

            if (!user) {
                showToast('Please enter your sender email address.');
                return;
            }
            if (!pass) {
                showToast('Please enter your SMTP / App Password.');
                return;
            }

            saveSmtpConfig({ senderName, user, host, port, secure, pass });
            showToast('✅ Email settings saved securely in your browser!');
            closeEmailSettingsModal();
        });
    }

    // Test Connection
    const testSmtpBtn = document.getElementById('testSmtpBtn');
    if (testSmtpBtn) {
        testSmtpBtn.addEventListener('click', async () => {
            const senderName = document.getElementById('smtpSenderName').value.trim();
            const user = document.getElementById('smtpSenderEmail').value.trim();
            const host = document.getElementById('smtpHost').value.trim() || 'smtp.gmail.com';
            const port = parseInt(document.getElementById('smtpPort').value.trim(), 10) || 465;
            const secure = document.getElementById('smtpSecure').value === 'true';
            const pass = document.getElementById('smtpPass').value.trim();

            if (!user || !pass) {
                showToast('Enter both email and app password to test.');
                return;
            }

            const statusBanner = document.getElementById('smtpTestStatus');
            const btnText = document.getElementById('testSmtpBtnText');
            btnText.textContent = 'Testing connection...';
            testSmtpBtn.disabled = true;
            statusBanner.style.display = 'block';
            statusBanner.style.background = '#F4F4F5';
            statusBanner.style.color = '#18181B';
            statusBanner.style.border = '1px solid #E4E4E7';
            statusBanner.textContent = 'Connecting to ' + host + ':' + port + '...';

            try {
                const res = await fetch('/api/email/test-connection', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        smtpConfig: { senderName, user, host, port, secure, pass }
                    })
                });
                const data = await res.json();
                if (data.success) {
                    statusBanner.style.background = '#ECFDF5';
                    statusBanner.style.color = '#065F46';
                    statusBanner.style.border = '1px solid #A7F3D0';
                    statusBanner.textContent = '✅ ' + data.message;
                    saveSmtpConfig({ senderName, user, host, port, secure, pass });
                } else {
                    statusBanner.style.background = '#FEF2F2';
                    statusBanner.style.color = '#991B1B';
                    statusBanner.style.border = '1px solid #FECACA';
                    statusBanner.textContent = '❌ Connection failed: ' + (data.error || 'Check host, port and app password.');
                }
            } catch (err) {
                statusBanner.style.background = '#FEF2F2';
                statusBanner.style.color = '#991B1B';
                statusBanner.style.border = '1px solid #FECACA';
                statusBanner.textContent = '❌ Network error testing SMTP: ' + err.message;
            } finally {
                btnText.textContent = '🔌 Test Connection';
                testSmtpBtn.disabled = false;
            }
        });
    }

    // Toggle Password Visibility
    const togglePassBtn = document.getElementById('toggleSmtpPassBtn');
    if (togglePassBtn) {
        togglePassBtn.addEventListener('click', () => {
            const passInput = document.getElementById('smtpPass');
            if (passInput.type === 'password') {
                passInput.type = 'text';
                togglePassBtn.textContent = 'Hide';
            } else {
                passInput.type = 'password';
                togglePassBtn.textContent = 'Show';
            }
        });
    }

    // Presets
    const presetGmailBtn = document.getElementById('presetGmailBtn');
    if (presetGmailBtn) {
        presetGmailBtn.addEventListener('click', () => {
            document.getElementById('smtpHost').value = 'smtp.gmail.com';
            document.getElementById('smtpPort').value = '465';
            document.getElementById('smtpSecure').value = 'true';
            showToast('Applied Gmail preset (Port 465 SSL)');
        });
    }

    const presetZohoBtn = document.getElementById('presetZohoBtn');
    if (presetZohoBtn) {
        presetZohoBtn.addEventListener('click', () => {
            document.getElementById('smtpHost').value = 'smtp.zoho.com';
            document.getElementById('smtpPort').value = '465';
            document.getElementById('smtpSecure').value = 'true';
            showToast('Applied Zoho preset (Port 465 SSL)');
        });
    }

    // Composer Close
    const closeComposerModalBtn = document.getElementById('closeComposerModalBtn');
    const cancelComposerBtn = document.getElementById('cancelComposerBtn');
    if (closeComposerModalBtn) closeComposerModalBtn.addEventListener('click', closeEmailComposerModal);
    if (cancelComposerBtn) cancelComposerBtn.addEventListener('click', closeEmailComposerModal);

    // Composer Submit Send
    const sendEmailSubmitBtn = document.getElementById('sendEmailSubmitBtn');
    if (sendEmailSubmitBtn) {
        sendEmailSubmitBtn.addEventListener('click', sendColdEmailSubmit);
    }
}

window.openEmailSettingsModal = function() {
    const config = getSmtpConfig();
    document.getElementById('smtpSenderName').value = config.senderName || '';
    document.getElementById('smtpSenderEmail').value = config.user || '';
    document.getElementById('smtpHost').value = config.host || 'smtp.gmail.com';
    document.getElementById('smtpPort').value = config.port || 465;
    document.getElementById('smtpSecure').value = config.secure ? 'true' : 'false';
    document.getElementById('smtpPass').value = config.pass || '';

    const statusBanner = document.getElementById('smtpTestStatus');
    if (statusBanner) statusBanner.style.display = 'none';

    document.getElementById('emailSettingsModalOverlay').style.display = 'flex';
};

window.closeEmailSettingsModal = function() {
    document.getElementById('emailSettingsModalOverlay').style.display = 'none';
};

// Current Active Lead for Composer
let activeComposerLead = null;

window.openEmailComposerModal = function(leadId, prefilledSubject = null, prefilledBody = null) {
    const lead = allLeads.find(l => l.id == leadId);
    if (!lead) {
        showToast('Lead details not found.');
        return;
    }
    activeComposerLead = lead;

    const config = getSmtpConfig();
    const warning = document.getElementById('composerSmtpWarning');
    const fromDisplay = document.getElementById('composerFromDisplay');
    const recipientInput = document.getElementById('composerRecipientEmail');
    const subjectInput = document.getElementById('composerSubject');
    const bodyInput = document.getElementById('composerBody');
    const modalTitle = document.getElementById('composerModalTitle');

    if (!config.user || !config.pass) {
        warning.style.display = 'block';
        fromDisplay.textContent = 'Not configured';
        fromDisplay.style.color = '#EF4444';
    } else {
        warning.style.display = 'none';
        fromDisplay.textContent = (config.senderName ? config.senderName + ' ' : '') + '<' + config.user + '>';
        fromDisplay.style.color = '#18181B';
    }

    modalTitle.textContent = 'Send Cold Email to ' + (lead.title || 'Lead');

    // Determine best recipient email
    let recipientEmail = '';
    if (lead.decision_makers && lead.decision_makers.length > 0) {
        const withEmail = lead.decision_makers.find(d => d.email && d.email.includes('@'));
        if (withEmail) recipientEmail = withEmail.email;
    }
    if (!recipientEmail) {
        recipientEmail = lead.company_email || lead.email || '';
    }
    recipientInput.value = recipientEmail;

    // Subject
    if (prefilledSubject) {
        subjectInput.value = prefilledSubject;
    } else if (lead.multi_channel_pitch && lead.multi_channel_pitch.subject_line) {
        subjectInput.value = lead.multi_channel_pitch.subject_line;
    } else {
        subjectInput.value = 'quick question re: ' + (lead.title || 'your business');
    }

    // Body
    if (prefilledBody) {
        bodyInput.value = prefilledBody;
    } else if (lead.multi_channel_pitch && lead.multi_channel_pitch.email_body) {
        bodyInput.value = lead.multi_channel_pitch.email_body;
    } else if (lead.ai_pitch) {
        bodyInput.value = lead.ai_pitch;
    } else {
        const ownerName = (lead.decision_makers && lead.decision_makers[0] && lead.decision_makers[0].full_name) ? lead.decision_makers[0].full_name : 'Team';
        bodyInput.value = `Hi ${ownerName},\n\nI was looking into ${lead.title} in ${lead.city || 'your area'} and noticed key opportunities to increase your high-intent local customer inquiries.\n\nWould you be open to a quick 3-minute walkthrough showing how we've helped similar businesses scale their client pipeline?\n\nBest regards,\n${config.senderName || 'Growth Team'}`;
    }

    document.getElementById('emailComposerModalOverlay').style.display = 'flex';
};

window.closeEmailComposerModal = function() {
    document.getElementById('emailComposerModalOverlay').style.display = 'none';
    activeComposerLead = null;
};

async function sendColdEmailSubmit() {
    if (!activeComposerLead) return;

    const config = getSmtpConfig();
    if (!config.user || !config.pass) {
        showToast('Please configure your Email Settings first.');
        openEmailSettingsModal();
        return;
    }

    const to = document.getElementById('composerRecipientEmail').value.trim();
    const subject = document.getElementById('composerSubject').value.trim();
    const message = document.getElementById('composerBody').value.trim();

    if (!to || !to.includes('@')) {
        showToast('Please enter a valid recipient email address.');
        return;
    }
    if (!subject) {
        showToast('Please enter an email subject line.');
        return;
    }
    if (!message) {
        showToast('Please enter the email message body.');
        return;
    }

    const submitBtn = document.getElementById('sendEmailSubmitBtn');
    const submitText = document.getElementById('sendEmailSubmitText');
    submitBtn.disabled = true;
    submitText.textContent = 'Sending email...';

    try {
        const res = await fetch(`/api/leads/${activeComposerLead.id}/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                smtpConfig: config,
                to,
                subject,
                message,
                decisionMakerId: (activeComposerLead.decision_makers && activeComposerLead.decision_makers[0]) ? activeComposerLead.decision_makers[0].id : null
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast('✅ Cold email sent to ' + to + ' successfully!');
            closeEmailComposerModal();

            // Update lead locally
            activeComposerLead.status = 'emailed';
            renderLeadsTable();

            // If drawer open for this lead, refresh
            if (leadDrawer.classList.contains('open')) {
                fetch(`/api/leads/${activeComposerLead.id}`)
                    .then(r => r.json())
                    .then(d => { if (d.lead) renderDrawerContent(d.lead); });
            }
        } else {
            showToast('❌ Failed: ' + (data.error || 'Could not deliver email.'));
        }
    } catch (err) {
        showToast('❌ Error sending email: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitText.textContent = 'Send Cold Email';
    }
}

// --------------------------------------------------------
// MODULE 7: 1-CLICK ACTIONS & AI PITCH MODAL ENGINE
// --------------------------------------------------------
let activePitchLead = null;
let currentPitchChannel = 'email';

window.openPitchModal = async function(leadId) {
    const lead = allLeads.find(l => l.id == leadId);
    if (!lead) {
        showToast('Lead details not found.');
        return;
    }
    activePitchLead = lead;
    currentPitchChannel = 'email';

    const modal = document.getElementById('aiPitchModalOverlay');
    const titleEl = document.getElementById('pitchModalTitle');
    const subjectGroup = document.getElementById('pitchSubjectGroup');
    const subjectInput = document.getElementById('pitchModalSubject');
    const bodyInput = document.getElementById('pitchModalBody');
    const regenBtn = document.getElementById('modalRegenPitchBtn');

    titleEl.textContent = `Personalized Pitch: ${lead.title}`;
    modal.style.display = 'flex';

    // Reset tabs to email by default
    document.querySelectorAll('.channel-tab-btn').forEach(btn => btn.classList.remove('active'));
    const emailTab = document.getElementById('tabEmailPitch');
    if (emailTab) emailTab.classList.add('active');
    if (subjectGroup) subjectGroup.style.display = 'block';

    // If pitch doesn't exist yet, generate on-demand using 3-step framework
    if (!lead.ai_pitch && (!lead.multi_channel_pitch || !lead.multi_channel_pitch.email_body)) {
        bodyInput.value = '⚡ Generating tailored pitch using Groq/Gemini 3-Step Framework...';
        subjectInput.value = 'Generating subject line...';
        if (regenBtn) regenBtn.disabled = true;

        try {
            const res = await fetch(`/api/leads/${leadId}/pitch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                lead.ai_pitch = data.pitch;
                lead.multi_channel_pitch = data.multiChannel;
                showToast('✨ AI pitch generated successfully!');
            } else {
                bodyInput.value = 'Failed to generate pitch: ' + (data.error || 'Unknown error');
                return;
            }
        } catch (err) {
            bodyInput.value = 'Error generating pitch: ' + err.message;
            return;
        } finally {
            if (regenBtn) regenBtn.disabled = false;
        }
    }

    populatePitchModalFields();
};

window.switchPitchChannel = function(channel) {
    currentPitchChannel = channel;
    document.querySelectorAll('.channel-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.channel === channel);
    });

    const subjectGroup = document.getElementById('pitchSubjectGroup');
    if (subjectGroup) {
        subjectGroup.style.display = channel === 'email' ? 'block' : 'none';
    }

    populatePitchModalFields();
};

function populatePitchModalFields() {
    if (!activePitchLead) return;
    const lead = activePitchLead;
    const subjectInput = document.getElementById('pitchModalSubject');
    const bodyInput = document.getElementById('pitchModalBody');
    const multi = lead.multi_channel_pitch || {};

    if (currentPitchChannel === 'email') {
        subjectInput.value = multi.subject_line || `quick question re: ${lead.title}`;
        bodyInput.value = multi.email_body || lead.ai_pitch || '';
    } else if (currentPitchChannel === 'linkedin') {
        bodyInput.value = multi.linkedin_note || `Hi ${lead.gmb_owner_name || 'there'}, noticed ${lead.title} in ${lead.city || 'your area'}. Let's connect!`;
    } else if (currentPitchChannel === 'whatsapp') {
        bodyInput.value = multi.whatsapp_quick_msg || `Hi ${lead.gmb_owner_name || 'there'}! Reached out regarding ${lead.title}.`;
    }
}

window.closePitchModal = function() {
    const modal = document.getElementById('aiPitchModalOverlay');
    if (modal) modal.style.display = 'none';
    activePitchLead = null;
};

window.copyModalPitchText = function(btn) {
    const bodyInput = document.getElementById('pitchModalBody');
    if (!bodyInput) return;
    const text = bodyInput.value.trim();
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = `<span style="color:#15803D; font-weight:600;">✓ Copied</span>`;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
        showToast('Pitch copied to clipboard!');
    }).catch(err => {
        showToast('Copy failed: ' + err.message);
    });
};

window.regenerateCurrentModalPitch = async function() {
    if (!activePitchLead) return;
    const leadId = activePitchLead.id;
    const regenBtn = document.getElementById('modalRegenPitchBtn');
    const regenText = document.getElementById('modalRegenPitchText');
    const bodyInput = document.getElementById('pitchModalBody');

    if (regenBtn) regenBtn.disabled = true;
    if (regenText) regenText.textContent = '🔄 Generating...';

    try {
        const res = await fetch(`/api/leads/${leadId}/pitch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            activePitchLead.ai_pitch = data.pitch;
            activePitchLead.multi_channel_pitch = data.multiChannel;
            populatePitchModalFields();
            showToast('✨ Fresh 3-step pitch generated!');
        } else {
            showToast('Generation failed: ' + (data.error || 'Server error'));
        }
    } catch (err) {
        showToast('Error: ' + err.message);
    } finally {
        if (regenBtn) regenBtn.disabled = false;
        if (regenText) regenText.textContent = '🔄 Regenerate';
    }
};

window.transferPitchToEmailComposer = function() {
    if (!activePitchLead) return;
    const leadId = activePitchLead.id;
    const subject = document.getElementById('pitchModalSubject').value;
    const body = document.getElementById('pitchModalBody').value;

    closePitchModal();
    openEmailComposerModal(leadId, subject, body);
};

window.triggerRowDeepEnrich = async function(leadId, btn) {
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span>⏳ Enriching...</span>`;
    showToast(`Running Deep Enrich (Website Crawler + Dorker) on lead #${leadId}...`);

    try {
        const res = await fetch(`/api/leads/${leadId}/enrich`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success && data.lead) {
            showToast(`Deep Enrich complete for ${data.lead.title}!`);
            const idx = allLeads.findIndex(l => l.id == leadId);
            if (idx >= 0) allLeads[idx] = data.lead;
            applyFilters(leadId);
            fetchStats();
        } else {
            showToast('Enrich error: ' + (data.error || 'Failed'));
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    } catch (err) {
        showToast('Enrich network error: ' + err.message);
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};

// Legacy drawer trigger alias
window.triggerGeneratePitch = async function(leadId) {
    await openPitchModal(leadId);
};

// ==========================================================
// MODULE 10: OMNICHANNEL UNIFIED INBOX LOGIC
// ==========================================================
let allInboxConversations = [];
let activeConversationId = null;
let currentInboxChannelFilter = 'all';
let activeConversationLeadId = null;

// Fetch global unread stats for badges
window.fetchInboxStats = async function() {
    try {
        const res = await fetch('/api/inbox/stats');
        const data = await res.json();
        if (data.success && data.stats) {
            const unread = data.stats.totalUnread || 0;
            const sidebarBadge = document.getElementById('sidebarInboxCount');
            const bnavBadge = document.getElementById('bnavInboxCount');

            if (sidebarBadge) {
                sidebarBadge.textContent = unread;
                sidebarBadge.style.display = unread > 0 ? 'inline-block' : 'none';
            }
            if (bnavBadge) {
                bnavBadge.textContent = unread;
                bnavBadge.style.display = unread > 0 ? 'inline-block' : 'none';
            }
        }
    } catch (err) {
        console.warn('[Inbox] fetchInboxStats error:', err.message);
    }
};

// Load conversations list with scroll preservation & change detection
let lastThreadsHash = '';

window.loadInboxConversations = async function(silent = false) {
    const listEl = document.getElementById('inboxThreadsList');
    if (!listEl) return;

    if (!silent && allInboxConversations.length === 0) {
        listEl.innerHTML = '<div class="table-loading" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading conversations...</div>';
    }

    try {
        const url = `/api/inbox/conversations?channel=${encodeURIComponent(currentInboxChannelFilter)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.success) {
            allInboxConversations = data.conversations || [];
            
            // Check if thread data changed
            const currentHash = allInboxConversations.map(c => `${c.id}:${c.last_message_at}:${c.unread_count}`).join('|');
            if (silent && currentHash === lastThreadsHash) {
                return; // Content unchanged, avoid DOM rewrite and scroll reset
            }
            lastThreadsHash = currentHash;
            renderInboxThreads(silent);
        } else {
            if (!silent) listEl.innerHTML = `<div style="padding: 20px; font-size: 13px; color: #DC2626; text-align: center;">Error loading chats: ${escapeHtml(data.error || 'Server error')}</div>`;
        }
    } catch (err) {
        if (!silent) listEl.innerHTML = `<div style="padding: 20px; font-size: 13px; color: #DC2626; text-align: center;">Network error: ${escapeHtml(err.message)}</div>`;
    }
};

// Helper: Extract 2-letter uppercase initials from name
function getInboxInitials(str) {
    if (!str) return '?';
    const clean = str.replace(/[+@#\-_.]/g, ' ').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase() || '?';
}

// Render conversations list with search filtering and preserved scroll
function renderInboxThreads(preserveScroll = false) {
    const listEl = document.getElementById('inboxThreadsList');
    if (!listEl) return;

    const savedScrollTop = preserveScroll ? listEl.scrollTop : 0;
    const searchVal = (document.getElementById('inboxSearchInput')?.value || '').trim().toLowerCase();

    let filtered = allInboxConversations;
    if (searchVal) {
        filtered = filtered.filter(c => {
            const name = (c.contact_name || c.participant_name || '').toLowerCase();
            const contact = (c.contact_identifier || c.participant_contact || '').toLowerCase();
            const title = (c.lead_title || '').toLowerCase();
            const lastMsg = (c.last_message_preview || '').toLowerCase();
            return name.includes(searchVal) || contact.includes(searchVal) || title.includes(searchVal) || lastMsg.includes(searchVal);
        });
    }

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div style="padding: 40px 16px; text-align: center; color: var(--text-muted);">
                <div style="font-size: 32px; margin-bottom: 10px;">📬</div>
                <div style="font-weight: 700; font-size: 14px; color: var(--text-primary); margin-bottom: 4px;">No conversations found</div>
                <p style="font-size: 12px; line-height: 1.5; margin: 0 auto; max-width: 220px; color: var(--text-secondary);">
                    ${searchVal ? 'No messages match your search filter.' : 'Incoming messages from WhatsApp, Instagram, and Email will appear here in real time.'}
                </p>
                <button type="button" class="btn btn-secondary btn-sm" onclick="openChannelsModal()" style="margin-top: 14px; gap: 6px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    <span>Connect Channels</span>
                </button>
            </div>
        `;
        return;
    }

    listEl.innerHTML = filtered.map(c => {
        const isActive = c.id === activeConversationId;
        const channel = (c.channel || 'whatsapp').toLowerCase();
        const avatarClass = channel === 'whatsapp' ? 'avatar-whatsapp' : channel === 'instagram' ? 'avatar-instagram' : 'avatar-email';
        const dotClass = channel === 'whatsapp' ? 'dot-whatsapp' : channel === 'instagram' ? 'dot-instagram' : 'dot-email';
        const dotIcon = channel === 'whatsapp' ? '💬' : channel === 'instagram' ? '📸' : '✉️';

        const displayName = escapeHtml(c.contact_name || c.participant_name || c.contact_identifier || c.participant_contact || 'Prospect');
        const contactSub = escapeHtml(c.contact_identifier || c.participant_contact || '');
        const initials = getInboxInitials(displayName);

        const leadTag = c.lead_title ? `<span class="thread-lead-badge" title="${escapeHtml(c.lead_title)}">${escapeHtml(c.lead_title)}</span>` : '';
        const preview = escapeHtml(c.last_message_preview || 'No messages');
        const timeAgo = c.last_message_at ? formatTimeAgo(new Date(c.last_message_at)) : '';
        const unreadPill = (c.unread_count > 0) ? `<span class="thread-unread-pill">${c.unread_count}</span>` : '';

        return `
            <div class="thread-item ${isActive ? 'active' : ''} ${c.unread_count > 0 ? 'unread' : ''}" onclick="openConversation('${c.id}')">
                <div class="thread-avatar ${avatarClass}">
                    ${initials}
                    <div class="thread-channel-dot ${dotClass}" title="${channel.toUpperCase()}">${dotIcon}</div>
                </div>
                <div class="thread-body">
                    <div class="thread-top">
                        <strong class="thread-name">${displayName}</strong>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span class="thread-time">${timeAgo}</span>
                            <button type="button" class="thread-delete-btn" title="Delete conversation" onclick="deleteConversationById('${c.id}', event)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div class="thread-sub-row">
                        ${leadTag}
                        <span class="thread-contact-sub">${contactSub}</span>
                    </div>
                    <div class="thread-preview-row">
                        <span class="thread-preview">${preview}</span>
                        ${unreadPill}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (preserveScroll && savedScrollTop > 0) {
        listEl.scrollTop = savedScrollTop;
    }

    // Auto-select first thread on desktop if none selected
    if (!activeConversationId && filtered.length > 0 && window.innerWidth > 768) {
        openConversation(filtered[0].id, false);
    }
}

// Open and select conversation thread
window.openConversation = async function(id, silent = false) {
    activeConversationId = id;

    // Toggle active thread styling
    renderInboxThreads(true);

    // Responsive: switch to chat view on mobile screens with history push
    if (window.innerWidth <= 768) {
        document.body.classList.add('mobile-inbox-open');
        try {
            history.pushState({ inMobileChat: true, conversationId: id }, '');
        } catch (e) {}
    }

    const emptyView = document.getElementById('inboxEmptyView');
    const activeView = document.getElementById('inboxActiveChat');
    const msgContainer = document.getElementById('chatMessagesContainer');

    if (emptyView) emptyView.style.display = 'none';
    if (activeView) activeView.style.display = 'flex';

    if (!silent && msgContainer && (!msgContainer.children.length || msgContainer.querySelector('.table-loading'))) {
        msgContainer.innerHTML = '<div class="table-loading" style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px;">Loading message stream...</div>';
    }

    try {
        const res = await fetch(`/api/inbox/conversations/${id}`);
        const data = await res.json();

        if (!data.success || !data.conversation) {
            if (!silent) showToast('Failed to load conversation: ' + (data.error || 'Not found'));
            return;
        }

        const conv = data.conversation;
        const messages = conv.messages || data.messages || [];

        // Set Lead Context
        activeConversationLeadId = conv.lead_id;

        // Populate Chat Header
        const nameEl = document.getElementById('activeChatName');
        const avatarEl = document.getElementById('activeChatAvatar');
        const channelBadge = document.getElementById('activeChatChannelBadge');
        const metaEl = document.getElementById('activeChatMeta');
        const leadBtn = document.getElementById('viewLeadProfileFromChatBtn');
        const replyIndicator = document.getElementById('replyChannelIndicator');

        const contactTitle = conv.contact_name || conv.participant_name || conv.contact_identifier || conv.participant_contact || 'Prospect';
        const contactIdentifier = conv.contact_identifier || conv.participant_contact || '';
        const initials = getInboxInitials(contactTitle);

        const channel = (conv.channel || 'whatsapp').toLowerCase();
        const avatarClass = channel === 'whatsapp' ? 'avatar-whatsapp' : channel === 'instagram' ? 'avatar-instagram' : 'avatar-email';
        const chIcon = channel === 'whatsapp' ? '💬' : channel === 'instagram' ? '📸' : '✉️';

        if (avatarEl) {
            avatarEl.className = `chat-avatar ${avatarClass}`;
            avatarEl.textContent = initials;
        }
        if (nameEl) nameEl.textContent = contactTitle;

        if (channelBadge) {
            channelBadge.className = `chat-channel-badge ${channel}`;
            channelBadge.textContent = `${chIcon} ${channel.toUpperCase()}`;
        }

        if (metaEl) {
            let metaParts = [];
            if (contactIdentifier) metaParts.push(contactIdentifier);
            if (conv.lead_title) metaParts.push(conv.lead_title);
            if (conv.lead_city) metaParts.push(conv.lead_city);
            metaEl.textContent = metaParts.join(' • ') || 'Direct conversation';
        }

        if (leadBtn) {
            leadBtn.style.display = conv.lead_id ? 'inline-flex' : 'none';
        }

        if (replyIndicator) {
            replyIndicator.innerHTML = `${chIcon} Replying via <strong>${channel.toUpperCase()}</strong> (${escapeHtml(contactIdentifier)})`;
        }

        // Render Messages History (force scroll to bottom on fresh manual open)
        renderChatMessages(messages, conv, !silent);

        // Mark read on server
        fetch(`/api/inbox/conversations/${id}/read`, { method: 'POST' }).catch(() => {});

        // Refresh stats badge
        fetchInboxStats();

        // Focus & auto-size composer textarea
        if (!silent) {
            const chatInput = document.getElementById('chatReplyInput');
            if (chatInput) {
                setTimeout(() => {
                    chatInput.focus();
                    if (window.autoResizeChatInput) window.autoResizeChatInput(chatInput);
                }, 50);
            }
        }

    } catch (err) {
        if (!silent) showToast('Error loading conversation: ' + err.message);
    }
};

// Media attachment & Lightbox state
let activeChatAttachment = null;

// Lightbox modal controls
window.openChatImageLightbox = function(url) {
    const overlay = document.getElementById('imageLightbox');
    const img = document.getElementById('lightboxImg');
    const downloadBtn = document.getElementById('lightboxDownloadBtn');
    if (!overlay || !img) return;

    img.src = url;
    if (downloadBtn) {
        downloadBtn.href = url;
        downloadBtn.setAttribute('download', url.split('/').pop() || 'photo.jpg');
    }
    overlay.style.display = 'flex';
};

window.closeChatImageLightbox = function(e) {
    const overlay = document.getElementById('imageLightbox');
    if (overlay) overlay.style.display = 'none';
};

// File Attachment Handler (Photos & Documents)
window.handleChatFileUpload = function(input) {
    if (!input || !input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const base64 = e.target.result;
        activeChatAttachment = {
            filename: file.name,
            base64: base64,
            isImage: file.type.startsWith('image/')
        };

        const previewContainer = document.getElementById('chatAttachPreview');
        const previewImg = document.getElementById('chatAttachPreviewImg');
        const previewName = document.getElementById('chatAttachName');

        if (previewContainer && previewImg && previewName) {
            previewName.textContent = file.name;
            if (activeChatAttachment.isImage) {
                previewImg.src = base64;
                previewImg.style.display = 'block';
            } else {
                previewImg.style.display = 'none';
            }
            previewContainer.style.display = 'flex';
        }
    };
    reader.readAsDataURL(file);
};

window.removeChatAttachment = function() {
    activeChatAttachment = null;
    const previewContainer = document.getElementById('chatAttachPreview');
    const input = document.getElementById('chatFileInput');
    if (previewContainer) previewContainer.style.display = 'none';
    if (input) input.value = '';
};

// Rich Message Formatter: Converts URLs, Markdown links, Images, and Photos into interactive elements
window.formatChatMessageBody = function(raw) {
    if (!raw) return '';
    let text = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    
    // 1. Markdown images: ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/uploads\/)[^\s\)]+)\)/gi, (m, alt, url) => {
        return `<div class="chat-media-card"><img src="${url}" alt="${alt || 'Photo'}" class="chat-bubble-img" onclick="openChatImageLightbox('${url}')" loading="lazy" /><span class="chat-img-zoom-hint">🔍 Click to zoom</span></div>`;
    });

    // 2. Direct bracket image URLs e.g. [https://.../photo.png]
    text = text.replace(/\[(https?:\/\/[^\s\]]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s\]]*)?)\]/gi, (m, url) => {
        if (/p\.gif|tracking|\/o\//i.test(url)) {
            return ''; // Hide 1x1 tracking pixel
        }
        return `<div class="chat-media-card"><img src="${url}" alt="Photo" class="chat-bubble-img" onclick="openChatImageLightbox('${url}')" loading="lazy" /><span class="chat-img-zoom-hint">🔍 Click to zoom</span></div>`;
    });

    // 3. Email image references like [image: Google]
    text = text.replace(/\[image:\s*([^\]]+)\]/gi, (m, name) => {
        return `<span class="chat-image-ref-badge">🖼️ <strong>${name}</strong></span>`;
    });

    // 4. Markdown links: [Title](url)
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/gi, (m, title, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${title} ↗</a>`;
    });

    // 5. Bracketed URLs: [https://...]
    text = text.replace(/\[(https?:\/\/[^\s\]]+)\]/gi, (m, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url} ↗</a>`;
    });

    // 6. Google angle-bracket URLs: &lt;https://...&gt;
    text = text.replace(/&lt;(https?:\/\/(?:(?!&gt;)[\S])+?)&gt;/gi, (m, url) => {
        const cleanHref = url.replace(/&amp;/g, '&');
        return `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer" class="chat-link">${url} ↗</a>`;
    });

    // 7. Direct standalone image URLs ending with image extensions (not inside HTML tags)
    text = text.replace(/(^|\s)(https?:\/\/[^\s<>"'\)]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s<>"'\)]*)?)/gi, (m, prefix, url) => {
        if (/p\.gif|tracking|\/o\//i.test(url)) {
            return prefix;
        }
        return `${prefix}<div class="chat-media-card"><img src="${url}" alt="Photo" class="chat-bubble-img" onclick="openChatImageLightbox('${url}')" loading="lazy" /><span class="chat-img-zoom-hint">🔍 Click to zoom</span></div>`;
    });

    // 8. Plain standalone URLs not already inside quotes/href/src
    text = text.replace(/(^|[^"'>])(https?:\/\/[^\s<>\)"]+)/gi, (m, prefix, url) => {
        return `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url} ↗</a>`;
    });

    // 9. Convert newlines
    text = text.replace(/\n/g, '<br>');
    return text;
};

// Render message bubbles in chat stream with date separators and intelligent scroll preservation
function renderChatMessages(messages, conv, forceScrollBottom = false) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
                <div style="font-size: 36px; margin-bottom: 8px;">💬</div>
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">No messages yet</div>
                <p style="font-size: 12px; max-width: 280px; margin: 0 auto; color: var(--text-secondary); line-height: 1.4;">
                    Send a reply below to initiate or follow up with ${escapeHtml(conv.contact_name || 'this prospect')}.
                </p>
            </div>
        `;
        return;
    }

    const wasNearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 140;
    const isFirstLoad = !container.children.length || container.querySelector('.table-loading');

    let lastDateStr = null;
    let html = '';

    messages.forEach(m => {
        const isOutbound = m.direction === 'outbound';
        const rowClass = isOutbound ? 'outbound' : 'inbound';
        const senderLabel = isOutbound ? 'You' : escapeHtml(conv.contact_name || conv.participant_name || conv.contact_identifier || 'Prospect');
        const msgDate = m.created_at ? new Date(m.created_at) : new Date();
        const timeStr = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Date separator calculation
        const dateKey = msgDate.toDateString();
        if (dateKey !== lastDateStr) {
            lastDateStr = dateKey;
            const now = new Date();
            const isToday = now.toDateString() === dateKey;
            const yesterday = new Date();
            yesterday.setDate(now.getDate() - 1);
            const isYesterday = yesterday.toDateString() === dateKey;
            const dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : msgDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            html += `<div class="chat-date-separator"><span>${dateLabel}</span></div>`;
        }

        const subjectHtml = (m.subject && conv.channel === 'email') 
            ? `<div style="font-weight: 600; font-size: 12px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid rgba(0,0,0,0.06); opacity: 0.9;">Subject: ${escapeHtml(m.subject)}</div>` 
            : '';
        const rawBody = m.body || m.message_body || m.subject || '';
        const textHtml = formatChatMessageBody(rawBody);
        const checkmarks = isOutbound 
            ? '<span class="chat-checkmarks" title="Read / Delivered">✓✓</span>' 
            : '';

        html += `
            <div class="chat-bubble-row ${rowClass}">
                <div class="chat-bubble ${rowClass}">
                    ${subjectHtml}
                    <div class="chat-msg-text">${textHtml}</div>
                    <div class="chat-msg-meta">
                        <span class="chat-msg-time">${timeStr}</span>
                        ${checkmarks}
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Scroll down if forced, on first load, or if user was already at the bottom
    if (forceScrollBottom || isFirstLoad || wasNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

// Delete Active Conversation
window.deleteActiveConversation = async function() {
    if (!activeConversationId) return;
    if (!confirm('Are you sure you want to delete this entire conversation and all its messages?')) return;

    const idToDelete = activeConversationId;
    try {
        const res = await fetch(`/api/inbox/conversations/${idToDelete}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('✓ Conversation deleted');
            activeConversationId = null;
            allInboxConversations = allInboxConversations.filter(c => c.id != idToDelete);
            
            const emptyView = document.getElementById('inboxEmptyView');
            const activeView = document.getElementById('inboxActiveChat');
            if (emptyView) emptyView.style.display = 'flex';
            if (activeView) activeView.style.display = 'none';

            renderInboxThreads(false);
            fetchInboxStats();
        } else {
            showToast('Delete error: ' + (data.error || 'Failed'));
        }
    } catch (err) {
        showToast('Delete network error: ' + err.message);
    }
};

// Delete Conversation by ID from thread list item
window.deleteConversationById = async function(id, e) {
    if (e) e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;

    try {
        const res = await fetch(`/api/inbox/conversations/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('✓ Conversation deleted');
            if (activeConversationId == id) {
                activeConversationId = null;
                const emptyView = document.getElementById('inboxEmptyView');
                const activeView = document.getElementById('inboxActiveChat');
                if (emptyView) emptyView.style.display = 'flex';
                if (activeView) activeView.style.display = 'none';
            }
            allInboxConversations = allInboxConversations.filter(c => c.id != id);
            renderInboxThreads(true);
            fetchInboxStats();
        } else {
            showToast('Delete error: ' + (data.error || 'Failed'));
        }
    } catch (err) {
        showToast('Delete network error: ' + err.message);
    }
};

// Mobile back button action to return to list (WhatsApp Mobile style)
window.closeMobileChat = function() {
    document.body.classList.remove('mobile-inbox-open');
    if (window.innerWidth <= 768) {
        activeConversationId = null;
        renderInboxThreads(true);
    }
};

// Handle hardware / browser Back button on mobile devices
window.addEventListener('popstate', (e) => {
    if (document.body.classList.contains('mobile-inbox-open')) {
        document.body.classList.remove('mobile-inbox-open');
        if (window.innerWidth <= 768) {
            activeConversationId = null;
            renderInboxThreads(true);
        }
    }
});

// Filter by channel tabs
window.filterInboxChannel = function(channel, btn) {
    currentInboxChannelFilter = channel;

    document.querySelectorAll('.inbox-tab-btn').forEach(b => {
        if (b.getAttribute('data-channel') === channel) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    // Reset active conversation on channel switch to avoid mismatch
    activeConversationId = null;
    loadInboxConversations();
};

// Send reply in active conversation
window.sendActiveChatReply = async function() {
    if (!activeConversationId) {
        showToast('Please select a conversation first.');
        return;
    }

    const input = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('sendReplyBtn');
    if (!input) return;

    const messageText = input.value.trim();
    if (!messageText && !activeChatAttachment) {
        showToast('Please write a message or attach a photo before sending.');
        input.focus();
        return;
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span>Sending...</span>';
    }

    try {
        let mediaUrl = null;
        if (activeChatAttachment) {
            try {
                const uploadRes = await fetch('/api/inbox/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: activeChatAttachment.filename,
                        base64: activeChatAttachment.base64
                    })
                });
                const uploadData = await uploadRes.json();
                if (uploadData.success) {
                    mediaUrl = uploadData.url;
                }
            } catch (upErr) {
                console.warn('Failed to upload attachment:', upErr.message);
            }
        }

        const res = await fetch(`/api/inbox/conversations/${activeConversationId}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: messageText,
                mediaUrl: mediaUrl
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast('✓ Reply dispatched successfully!');
            input.value = '';
            if (window.autoResizeChatInput) window.autoResizeChatInput(input);

            // Optimistically append outbound bubble
            const container = document.getElementById('chatMessagesContainer');
            if (container) {
                const now = new Date();
                const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const fullOutboundText = mediaUrl ? `![Photo](${mediaUrl})\n${messageText}`.trim() : messageText;
                const bubbleHtml = `
                    <div class="chat-bubble-row outbound">
                        <div class="chat-bubble outbound">
                            <div class="chat-msg-text">${formatChatMessageBody(fullOutboundText)}</div>
                            <div class="chat-msg-meta">
                                <span class="chat-msg-time">${timeStr}</span>
                                <span class="chat-checkmarks" title="Delivered">✓✓</span>
                            </div>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', bubbleHtml);
                container.scrollTop = container.scrollHeight;
            }

            // Clear attachment preview
            removeChatAttachment();

            // Refresh list in background
            loadInboxConversations(true);
        } else {
            showToast('Reply failed: ' + (data.error || 'Server error'));
        }
    } catch (err) {
        showToast('Network error sending reply: ' + err.message);
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            `;
        }
    }
};

// Auto-expanding chat textarea (WhatsApp Web behavior)
window.autoResizeChatInput = function(el) {
    const input = el || document.getElementById('chatReplyInput');
    if (!input) return;
    
    // Temporarily reset height to auto to compute natural scrollHeight
    input.style.height = 'auto';
    
    const minHeight = 40;
    const maxHeight = 140; // Expands up to ~6 lines before internal scrolling
    const scrollH = input.scrollHeight;
    
    if (scrollH <= minHeight) {
        input.style.height = minHeight + 'px';
        input.style.overflowY = 'hidden';
    } else if (scrollH >= maxHeight) {
        input.style.height = maxHeight + 'px';
        input.style.overflowY = 'auto';
    } else {
        input.style.height = scrollH + 'px';
        input.style.overflowY = 'hidden';
    }
};

// Enter key binding & Auto-resize listeners
function initChatInputHandlers() {
    const input = document.getElementById('chatReplyInput');
    if (input && !input.dataset.handlersAttached) {
        input.dataset.handlersAttached = 'true';
        input.addEventListener('input', () => {
            window.autoResizeChatInput(input);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendActiveChatReply();
            }
        });
        window.autoResizeChatInput(input);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatInputHandlers);
} else {
    initChatInputHandlers();
}

// Real-time silent poller for Unified Inbox (every 4 seconds when inbox screen is open)
if (window.inboxPollTimer) clearInterval(window.inboxPollTimer);
window.inboxPollTimer = setInterval(async () => {
    if (typeof currentScreen !== 'undefined' && currentScreen === 'inbox') {
        await loadInboxConversations(true);
        if (activeConversationId) {
            try {
                const res = await fetch(`/api/inbox/conversations/${activeConversationId}`);
                const data = await res.json();
                if (data.success && data.conversation) {
                    const conv = data.conversation;
                    const msgs = conv.messages || [];
                    const container = document.getElementById('chatMessagesContainer');
                    const currentBubbleCount = container ? container.querySelectorAll('.chat-bubble-row').length : 0;
                    if (msgs.length !== currentBubbleCount) {
                        renderChatMessages(msgs, conv, false);
                    }
                }
            } catch (e) {}
        }
        fetchInboxStats();
    }
}, 4000);

// AI Suggest contextual reply
window.suggestAIReplyForCurrentChat = async function() {
    if (!activeConversationId) {
        showToast('Please select an active chat first.');
        return;
    }

    const input = document.getElementById('chatReplyInput');
    if (!input) return;

    showToast('✨ Generating AI reply based on conversation context...');

    try {
        if (activeConversationLeadId) {
            const res = await fetch(`/api/leads/${activeConversationLeadId}`);
            const data = await res.json();
            if (data.success && data.lead) {
                const lead = data.lead;
                const painPoints = (lead.pain_points || []).map(p => formatPainPoint(p)).join(', ');
                const suggestion = `Hi ${lead.gmb_owner_name || 'there'}! Thanks for getting back to me. I'd love to share a quick 2-minute Loom breakdown showing how we can solve ${painPoints || 'client acquisition bottlenecks'} for ${lead.title}. Are you open to reviewing it this week?`;
                input.value = suggestion;
                input.focus();
                if (window.autoResizeChatInput) window.autoResizeChatInput(input);
                showToast('✨ High-converting AI reply inserted!');
                return;
            }
        }

        // Generic fallback
        input.value = `Hi there! Thank you for your reply. Could you let me know what day this week works best for a quick 10-minute discovery call? Looking forward to connecting.`;
        input.focus();
        if (window.autoResizeChatInput) window.autoResizeChatInput(input);
        showToast('✨ AI reply suggestion inserted!');
    } catch (err) {
        showToast('AI suggestion error: ' + err.message);
    }
};

// Trigger manual IMAP email inbound sync
window.triggerEmailSync = async function(btn) {
    const origHtml = btn ? btn.innerHTML : null;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>⏳ Syncing IMAP...</span>`;
    }

    showToast('Connecting to IMAP server to fetch prospect emails...');

    try {
        const res = await fetch('/api/inbox/email/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.success) {
            showToast(`✓ Sync complete! ${data.syncedCount || 0} messages fetched.`);
            loadInboxConversations();
            fetchInboxStats();
        } else {
            const errStr = data.error || 'Check IMAP settings';
            showToast('Email sync notice: ' + errStr);
            if (errStr.toLowerCase().includes('not configured')) {
                openChannelsModal();
            }
        }
    } catch (err) {
        showToast('Sync network error: ' + err.message);
    } finally {
        if (btn && origHtml) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
};

// Open lead profile drawer from current chat
window.openLeadProfileFromCurrentChat = function() {
    if (activeConversationLeadId) {
        window.openLeadDetail(activeConversationLeadId);
    } else {
        showToast('No matched CRM lead associated with this conversation.');
    }
};

// ==========================================================
// CHANNELS MODAL (CONNECT EMAIL / WHATSAPP / INSTAGRAM)
// ==========================================================
window.openChannelsModal = async function() {
    const modal = document.getElementById('channelsModalOverlay');
    if (!modal) return;
    modal.style.display = 'flex';

    // Switch to first tab by default
    switchChannelSettingsTab('email');

    // Pre-fill existing channel settings from server
    try {
        const res = await fetch('/api/inbox/channels');
        const data = await res.json();
        if (data.success && data.channels && data.channels.email) {
            const emailCfg = data.channels.email.config || {};
            if (emailCfg.imap_host) document.getElementById('imapHost').value = emailCfg.imap_host;
            if (emailCfg.imap_port) document.getElementById('imapPort').value = emailCfg.imap_port;
            if (emailCfg.email || data.channels.email.emailAddress) {
                document.getElementById('imapEmail').value = emailCfg.email || data.channels.email.emailAddress;
            }
        }
    } catch (err) {
        console.warn('Could not fetch channel settings:', err.message);
    }
};

window.closeChannelsModal = function() {
    const modal = document.getElementById('channelsModalOverlay');
    if (modal) modal.style.display = 'none';
    if (window.waStatusPollTimer) {
        clearInterval(window.waStatusPollTimer);
        window.waStatusPollTimer = null;
    }
};

// Robust Tab Switcher for Channels Modal
window.switchChannelSettingsTab = window.switchChannelTab = function(tabName, btn) {
    const norm = (tabName || '').toLowerCase();
    const isEmail = norm.includes('email');
    const isWa = norm.includes('wa') || norm.includes('whats');
    const isIg = norm.includes('ig') || norm.includes('insta') || norm.includes('meta') || norm.includes('many');

    // 1. Toggle Tab Panes
    const emailPane = document.getElementById('chanTabEmail');
    const waPane = document.getElementById('chanTabWa');
    const igPane = document.getElementById('chanTabIg');

    if (emailPane) emailPane.style.display = isEmail ? 'block' : 'none';
    if (waPane) waPane.style.display = isWa ? 'block' : 'none';
    if (igPane) igPane.style.display = isIg ? 'block' : 'none';

    // 2. Toggle Active Tab Buttons
    document.querySelectorAll('.channel-tab-btn, .channel-nav-tab').forEach(b => b.classList.remove('active'));

    const targetBtn = btn || 
        (isEmail ? document.getElementById('tabChanEmail') : 
         isWa ? document.getElementById('tabChanWa') : 
         isIg ? document.getElementById('tabChanIg') : null);

    if (targetBtn) targetBtn.classList.add('active');

    // 3. Auto-populate current origin for Webhook URLs
    const origin = window.location.origin;
    const manychatUrlInput = document.getElementById('manychatWebhookUrlDisplay');
    if (manychatUrlInput) manychatUrlInput.value = `${origin}/api/webhooks/manychat`;

    // If switching to WhatsApp, check current status
    if (isWa) {
        checkWhatsAppStatus();
    }
};

// ==========================================================
// WHATSAPP LIVE BAILEYS QR CODE ENGINE
// ==========================================================

window.checkWhatsAppStatus = async function() {
    try {
        const res = await fetch('/api/whatsapp/status');
        const data = await res.json();
        updateWhatsAppUI(data);
    } catch (err) {
        console.warn('Could not check WhatsApp status:', err.message);
    }
};

function updateWhatsAppUI(data) {
    const statusDot = document.getElementById('waStatusDot');
    const statusText = document.getElementById('waStatusText');
    const disconnectBtn = document.getElementById('waDisconnectBtn');
    const qrPlaceholder = document.getElementById('waQrPlaceholder');
    const qrActive = document.getElementById('waQrActive');
    const connectedNotice = document.getElementById('waConnectedNotice');
    const connectedPhone = document.getElementById('waConnectedPhoneDisplay');
    const qrImage = document.getElementById('waQrImage');
    const qrSpinner = document.getElementById('waQrSpinner');

    if (data.status === 'connected') {
        if (statusDot) statusDot.style.backgroundColor = '#10B981';
        if (statusText) statusText.innerHTML = `Status: <span style="color: #15803D;">Connected (+${data.connectedUser || ''})</span>`;
        if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';

        if (qrPlaceholder) qrPlaceholder.style.display = 'none';
        if (qrActive) qrActive.style.display = 'none';
        if (connectedNotice) connectedNotice.style.display = 'block';
        if (connectedPhone) connectedPhone.textContent = `Linked Phone: +${data.connectedUser || 'Active'}`;

        if (window.waStatusPollTimer) {
            clearInterval(window.waStatusPollTimer);
            window.waStatusPollTimer = null;
        }
    } else if (data.status === 'qr_ready' && data.qr) {
        if (statusDot) statusDot.style.backgroundColor = '#F59E0B';
        if (statusText) statusText.innerHTML = `Status: <span style="color: #B45309;">Waiting for scan...</span>`;
        if (disconnectBtn) disconnectBtn.style.display = 'none';

        if (qrPlaceholder) qrPlaceholder.style.display = 'none';
        if (connectedNotice) connectedNotice.style.display = 'none';
        if (qrActive) qrActive.style.display = 'block';
        if (qrSpinner) qrSpinner.style.display = 'none';
        if (qrImage) {
            qrImage.src = data.qr;
            qrImage.style.display = 'block';
        }
    } else {
        // Disconnected or connecting
        if (statusDot) statusDot.style.backgroundColor = '#A1A1AA';
        if (statusText) statusText.innerHTML = `Status: Disconnected`;
        if (disconnectBtn) disconnectBtn.style.display = 'none';

        if (qrPlaceholder) qrPlaceholder.style.display = 'block';
        if (qrActive) qrActive.style.display = 'none';
        if (connectedNotice) connectedNotice.style.display = 'none';
    }
}

window.requestWhatsAppQr = async function() {
    const btn = document.getElementById('btnStartWaQr');
    const qrPlaceholder = document.getElementById('waQrPlaceholder');
    const qrActive = document.getElementById('waQrActive');
    const qrSpinner = document.getElementById('waQrSpinner');
    const qrImage = document.getElementById('waQrImage');

    if (qrPlaceholder) qrPlaceholder.style.display = 'none';
    if (qrActive) qrActive.style.display = 'block';
    if (qrSpinner) {
        qrSpinner.style.display = 'block';
        qrSpinner.textContent = 'Initializing secure WhatsApp session... Generating QR...';
    }
    if (qrImage) qrImage.style.display = 'none';

    try {
        const res = await fetch('/api/whatsapp/qr', { method: 'POST' });
        const data = await res.json();
        updateWhatsAppUI(data);

        // Start auto-poll every 2.5 seconds to detect phone scan
        if (!window.waStatusPollTimer) {
            window.waStatusPollTimer = setInterval(async () => {
                try {
                    const statusRes = await fetch('/api/whatsapp/status');
                    const statusData = await statusRes.json();
                    updateWhatsAppUI(statusData);

                    if (statusData.status === 'connected') {
                        showToast(`✓ WhatsApp Linked: +${statusData.connectedUser || 'Active'}`);
                        loadInboxConversations();
                        fetchInboxStats();
                    }
                } catch (e) {}
            }, 2500);
        }
    } catch (err) {
        showToast('Error requesting WhatsApp QR: ' + err.message);
        if (qrPlaceholder) qrPlaceholder.style.display = 'block';
        if (qrActive) qrActive.style.display = 'none';
    }
};

window.disconnectWhatsAppSession = async function() {
    if (!confirm('Are you sure you want to unlink and disconnect your WhatsApp?')) return;

    try {
        const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('✓ WhatsApp unlinked successfully.');
            updateWhatsAppUI({ status: 'disconnected' });
        } else {
            showToast('Disconnect error: ' + (data.error || 'Server error'));
        }
    } catch (err) {
        showToast('Error disconnecting: ' + err.message);
    }
};

// ==========================================================
// MANYCHAT INSTAGRAM BRIDGE
// ==========================================================

window.simulateManyChatInboundMessage = async function() {
    const btn = document.getElementById('sendManyChatTestMsgBtn');
    if (btn) btn.disabled = true;

    try {
        const payload = {
            user_id: 'manychat_user_' + Math.floor(Math.random() * 8999 + 1000),
            first_name: 'Dr. Bilal',
            last_name: 'Orthodontics',
            instagram_username: 'dr_bilal_ortho',
            phone: '+923019876543',
            message: 'Hello! I saw your proposal regarding our clinic Google Maps ranking. Can you share past client case studies?',
            channel: 'instagram'
        };

        const res = await fetch('/api/webhooks/manychat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            showToast('✓ ManyChat Instagram DM received & synced into Inbox!');
            loadInboxConversations();
            fetchInboxStats();
        } else {
            showToast('Simulation error: ' + (data.error || 'Server error'));
        }
    } catch (err) {
        showToast('Error simulating ManyChat: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.copyInputVal = function(elemId) {
    const el = document.getElementById(elemId);
    if (!el) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(el.value).then(() => {
            showToast('Copied to clipboard: ' + el.value);
        }).catch(() => {
            fallbackCopy(el);
        });
    } else {
        fallbackCopy(el);
    }
};

function fallbackCopy(el) {
    try {
        el.select();
        document.execCommand('copy');
        showToast('Copied to clipboard: ' + el.value);
    } catch (err) {
        showToast('Manual copy needed');
    }
}

// Bind keyboard shortcuts & search filter
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('inboxSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderInboxThreads();
        });
    }

    const replyTextarea = document.getElementById('chatReplyInput');
    if (replyTextarea) {
        replyTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendActiveChatReply();
            }
        });
    }

    // Close channels modal on backdrop click
    const channelsOverlay = document.getElementById('channelsModalOverlay');
    if (channelsOverlay) {
        channelsOverlay.addEventListener('click', (e) => {
            if (e.target === channelsOverlay) closeChannelsModal();
        });
    }
});


