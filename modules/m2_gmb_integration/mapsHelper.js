/**
 * Google Maps Direct / Canonical Link Helper
 * Generates direct listing URLs that open the business profile panel (just like a Share link)
 * instead of opening the multi-result search page.
 */

function formatDirectMapsLink(lead) {
    if (!lead) return '';

    // 1. If lead has an official Google Place ID (ChIJ...)
    if (lead.place_id && typeof lead.place_id === 'string' && lead.place_id.startsWith('ChIJ')) {
        return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(lead.place_id)}`;
    }

    // 2. If lead has a direct Google CID
    const cid = lead.cid || (lead.raw_data && lead.raw_data.cid);
    if (cid) {
        return `https://maps.google.com/?cid=${encodeURIComponent(cid)}`;
    }

    // 3. If lead already has a direct /maps/place/ or share link (and not /maps/search/)
    if (lead.gmb_link && typeof lead.gmb_link === 'string') {
        if ((lead.gmb_link.includes('/maps/place/') || lead.gmb_link.includes('maps.app.goo.gl') || lead.gmb_link.includes('cid=')) && !lead.gmb_link.includes('/maps/search/')) {
            return lead.gmb_link;
        }
    }

    // 4. Construct canonical Google Maps Place URL: https://www.google.com/maps/place/<Title>,+<Address>/
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

    const placeQuery = locParts.length > 0 ? `${title}, ${locParts.join(', ')}` : title;
    return `https://www.google.com/maps/place/${encodeURIComponent(placeQuery)}/`;
}

module.exports = {
    formatDirectMapsLink
};
