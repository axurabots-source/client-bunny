/**
 * Client Bunny Frontend Logic
 * Minimal, Fast, Monochrome UI
 */

let allLeads = [];
let currentFilter = 'all';

// DOM Elements
const leadsTbody = document.getElementById('leadsTbody');
const searchInput = document.getElementById('searchInput');
const filterPills = document.getElementById('filterPills');
const reingestBtn = document.getElementById('reingestBtn');
const toastEl = document.getElementById('toast');

const statTotal = document.getElementById('statTotal');
const statNoWebsite = document.getElementById('statNoWebsite');
const statHighTicket = document.getElementById('statHighTicket');
const statRepRisk = document.getElementById('statRepRisk');

const countAll = document.getElementById('countAll');
const countNoWeb = document.getElementById('countNoWeb');
const countHigh = document.getElementById('countHigh');
const countRisk = document.getElementById('countRisk');
const showingCount = document.getElementById('showingCount');

// Drawer Elements
const leadDrawer = document.getElementById('leadDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const drawerTitle = document.getElementById('drawerTitle');
const drawerBody = document.getElementById('drawerBody');

// 1. Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchStats();
    fetchLeads();
    bindEvents();
});

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

    reingestBtn.addEventListener('click', async () => {
        reingestBtn.disabled = true;
        reingestBtn.textContent = 'Syncing...';
        showToast('Syncing dentists_in_lahore.csv with Supabase...');
        
        try {
            const res = await fetch('/api/ingest', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast(`✅ Synced! ${data.stats.upserted} leads updated in Supabase.`);
                await fetchStats();
                await fetchLeads();
            } else {
                showToast('❌ Sync failed: ' + data.error);
            }
        } catch (err) {
            showToast('❌ Network error syncing data');
        } finally {
            reingestBtn.disabled = false;
            reingestBtn.textContent = 'Sync dentists.csv';
        }
    });

    closeDrawerBtn.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);
}

// 2. Fetch Stats
async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (data.success && data.stats) {
            statTotal.textContent = data.stats.total_leads || 0;
            statNoWebsite.textContent = data.stats.no_website_count || 0;
            statHighTicket.textContent = data.stats.high_ticket_count || 0;
            statRepRisk.textContent = data.stats.low_rating_count || 0;
        }
    } catch (err) {
        console.error('Error fetching stats:', err);
    }
}

// 3. Fetch Leads
async function fetchLeads() {
    try {
        const res = await fetch('/api/leads?limit=100');
        const data = await res.json();
        if (data.success) {
            allLeads = data.leads;
            updateFilterCounts();
            applyFilters();
        }
    } catch (err) {
        leadsTbody.innerHTML = `<tr><td colspan="5" class="table-loading">Failed to load leads from Supabase.</td></tr>`;
    }
}

// 4. Update Filter Tab Counts
function updateFilterCounts() {
    let noWeb = 0;
    let high = 0;
    let risk = 0;

    allLeads.forEach(lead => {
        const pts = getPainPoints(lead);
        if (pts.includes('no_website')) noWeb++;
        if (pts.includes('high_ticket_spender')) high++;
        if (pts.includes('reputation_risk')) risk++;
    });

    countAll.textContent = allLeads.length;
    countNoWeb.textContent = noWeb;
    countHigh.textContent = high;
    countRisk.textContent = risk;
}

// 5. Apply Search & Active Filter
function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();

    const filtered = allLeads.filter(lead => {
        const pts = getPainPoints(lead);

        // Filter tab match
        if (currentFilter === 'no_website' && !pts.includes('no_website')) return false;
        if (currentFilter === 'high_ticket_spender' && !pts.includes('high_ticket_spender')) return false;
        if (currentFilter === 'reputation_risk' && !pts.includes('reputation_risk')) return false;

        // Query match
        if (query) {
            const nameMatch = (lead.title || '').toLowerCase().includes(query);
            const addressMatch = (lead.address || '').toLowerCase().includes(query);
            const phoneMatch = (lead.phone || '').toLowerCase().includes(query);
            return nameMatch || addressMatch || phoneMatch;
        }

        return true;
    });

    renderTable(filtered);
}

function getPainPoints(lead) {
    if (!lead.pain_points) return [];
    if (Array.isArray(lead.pain_points)) return lead.pain_points;
    try {
        return JSON.parse(lead.pain_points);
    } catch (e) {
        return [];
    }
}

// 6. Render Table
function renderTable(leads) {
    showingCount.textContent = `Showing ${leads.length} of ${allLeads.length} leads`;

    if (leads.length === 0) {
        leadsTbody.innerHTML = `
            <tr>
                <td colspan="5" class="table-loading">No leads matching your current criteria.</td>
            </tr>
        `;
        return;
    }

    leadsTbody.innerHTML = leads.map(lead => {
        const pts = getPainPoints(lead);
        const hasWeb = lead.website && lead.website.trim() !== '' && lead.website !== 'null';

        const webHtml = hasWeb 
            ? `<a href="${escapeHtml(lead.website)}" target="_blank" class="web-link" onclick="event.stopPropagation()">${escapeHtml(cleanUrl(lead.website))}</a>`
            : `<span class="no-web-pill">NO WEBSITE</span>`;

        const painHtml = pts.length > 0 
            ? pts.map(p => {
                const label = formatPainPoint(p);
                const isUrgent = p === 'no_website' || p === 'reputation_risk';
                return `<span class="tag-pill ${isUrgent ? 'tag-urgent' : ''}">${label}</span>`;
            }).join('')
            : `<span style="color: var(--text-muted); font-size: 12px;">Standard Profile</span>`;

        return `
            <tr onclick="openLeadDetail('${lead.id}')">
                <td>
                    <div class="lead-title-box">
                        <span class="lead-name">${escapeHtml(lead.title)}</span>
                        <span class="lead-category">${escapeHtml(lead.category || 'Dentist')} • ${escapeHtml(lead.city || 'Lahore')}</span>
                    </div>
                </td>
                <td>
                    <div class="reputation-box">
                        <span class="rating-badge">★ ${lead.review_rating || '0.0'}</span>
                        <span class="reviews-count">${lead.review_count || 0} reviews</span>
                    </div>
                </td>
                <td>${webHtml}</td>
                <td><div class="pain-tags">${painHtml}</div></td>
                <td style="text-align: right;">
                    <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="event.stopPropagation(); openLeadDetail('${lead.id}')">
                        Inspect
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 7. Drawer Details
async function openLeadDetail(leadId) {
    try {
        const res = await fetch(`/api/leads/${leadId}`);
        const data = await res.json();
        if (!data.success || !data.lead) return;

        const lead = data.lead;
        const pts = getPainPoints(lead);

        drawerTitle.textContent = lead.title;

        drawerBody.innerHTML = `
            <div class="detail-section">
                <span class="detail-heading">CONTACT & LOCATION</span>
                <div class="detail-box">
                    <div><strong>Phone:</strong> ${lead.phone || 'Not available'}</div>
                    <div style="margin-top: 4px;"><strong>Address:</strong> ${lead.address || 'Lahore'}</div>
                    <div style="margin-top: 4px;"><strong>Website:</strong> ${lead.website ? `<a href="${escapeHtml(lead.website)}" target="_blank" class="web-link">${escapeHtml(lead.website)}</a>` : '<span class="no-web-pill">Missing</span>'}</div>
                    ${lead.gmb_owner_name ? `<div style="margin-top: 4px;"><strong>GMB Owner:</strong> ${escapeHtml(lead.gmb_owner_name)}</div>` : ''}
                </div>
            </div>

            <div class="detail-section">
                <span class="detail-heading">DETECTED PAIN POINTS</span>
                <div class="detail-box">
                    ${pts.length > 0 ? pts.map(p => `<div>• <strong>${formatPainPoint(p)}</strong></div>`).join('') : '<div>No major flags detected.</div>'}
                </div>
            </div>

            <div class="detail-section">
                <span class="detail-heading">DISCOVERED DECISION MAKERS</span>
                <div class="detail-box">
                    ${lead.decision_makers && lead.decision_makers.length > 0 
                        ? lead.decision_makers.map(dm => `
                            <div><strong>${escapeHtml(dm.full_name)}</strong> (${escapeHtml(dm.title_role || 'Owner')})</div>
                            ${dm.email ? `<div>Email: <a href="mailto:${escapeHtml(dm.email)}" class="web-link">${escapeHtml(dm.email)}</a></div>` : ''}
                            ${dm.phone ? `<div>Phone: ${escapeHtml(dm.phone)}</div>` : ''}
                        `).join('<hr style="margin: 8px 0; border: none; border-top: 1px solid var(--border-light);"/>')
                        : '<div style="color: var(--text-secondary);">No contacts discovered yet. Ready for Website Crawler & Dork Resolver.</div>'}
                </div>
            </div>

            <div class="detail-section">
                <span class="detail-heading">PIPELINE ACTIONS</span>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${lead.website ? `
                        <button class="btn btn-primary" id="crawlBtn_${lead.id}" onclick="triggerCrawl('${lead.id}')">
                            🕸️ Crawl Website for Contacts (Module 3)
                        </button>
                    ` : ''}
                    <button class="btn btn-secondary" id="dorkBtn_${lead.id}" onclick="triggerDork('${lead.id}')">
                        🕵️ Google Dork for Owner (Module 4)
                    </button>
                    <div style="display: flex; gap: 8px;">
                        ${lead.website ? `<a href="${escapeHtml(lead.website)}" target="_blank" class="btn btn-secondary">Visit Website</a>` : ''}
                        ${lead.gmb_link ? `<a href="${escapeHtml(lead.gmb_link)}" target="_blank" class="btn btn-secondary">Open Google Maps</a>` : ''}
                    </div>
                </div>
            </div>
        `;

        leadDrawer.classList.add('open');
        drawerOverlay.classList.add('open');
    } catch (err) {
        console.error('Error opening drawer:', err);
    }
}

async function triggerDork(leadId) {
    const btn = document.getElementById(`dorkBtn_${leadId}`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Running Dork Search...';
    }
    showToast('Running zero-cost dorks on Google/Search...');

    try {
        const res = await fetch(`/api/leads/${leadId}/dork`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            const count = (data.dorkResult.linkedinProfiles.length + data.dorkResult.facebookUrls.length);
            showToast(`✅ Dork complete! Found ${count} public profiles.`);
            await openLeadDetail(leadId); // Refresh drawer
            await fetchLeads(); // Refresh table status
        } else {
            showToast('❌ Dork error: ' + data.error);
        }
    } catch (err) {
        showToast('❌ Network error during dork resolution');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🕵️ Google Dork for Owner (Module 4)';
        }
    }
}

async function triggerCrawl(leadId) {
    const btn = document.getElementById(`crawlBtn_${leadId}`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Crawling pages...';
    }
    showToast('Starting deep crawl on website...');

    try {
        const res = await fetch(`/api/leads/${leadId}/enrich`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            const foundCount = (data.crawlResult.emails.length + data.crawlResult.doctor_names.length);
            showToast(`✅ Crawl finished! Found ${foundCount} contact points.`);
            await openLeadDetail(leadId); // Refresh drawer
            await fetchLeads(); // Refresh table status
        } else {
            showToast('❌ Crawl error: ' + data.error);
        }
    } catch (err) {
        showToast('❌ Network error crawling website');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🕸️ Crawl Website for Contacts (Module 3)';
        }
    }
}

function closeDrawer() {
    leadDrawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
}

// 8. Utilities
function formatPainPoint(code) {
    switch (code) {
        case 'no_website': return 'No Website';
        case 'low_rating': return 'Low Rating';
        case 'reputation_risk': return 'Reputation Risk';
        case 'under_leveraged': return 'Under-leveraged';
        case 'high_ticket_spender': return 'High Budget';
        default: return code;
    }
}

function cleanUrl(url) {
    if (!url) return '';
    return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3500);
}
