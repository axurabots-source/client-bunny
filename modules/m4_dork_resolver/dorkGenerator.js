/**
 * Google & Search Dork Query Generator
 * Creates multi-channel targeted queries for finding founders, owners, and direct emails.
 */

function generateDorkQueries(businessTitle, city = 'Lahore') {
    const cleanTitle = businessTitle.replace(/[^\w\s-]/g, '').trim();

    return {
        linkedinOwner: `"${cleanTitle}" "${city}" site:linkedin.com/in`,
        linkedinGeneral: `"${cleanTitle}" site:linkedin.com ("owner" OR "founder" OR "doctor" OR "director")`,
        facebookContact: `"${cleanTitle}" "${city}" site:facebook.com`,
        directEmail: `"${cleanTitle}" "${city}" ("@gmail.com" OR "@yahoo.com" OR "contact")`
    };
}

module.exports = {
    generateDorkQueries
};
