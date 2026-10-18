/**
 * Automated Test: Omnichannel Inbox Full Flow
 * Tests WhatsApp webhook, Meta webhook, conversations listing, reply dispatch, and read status.
 */

const axios = require('axios');

async function testInbox() {
    console.log('🧪 Testing Omnichannel Unified Inbox Endpoints...');
    const baseUrl = 'http://localhost:3000/api';

    try {
        // 1. WhatsApp Inbound Webhook
        console.log('\n[1/5] Testing WhatsApp Inbound Webhook...');
        const waPayload = {
            from: '+923001234567@s.whatsapp.net',
            pushName: 'Dr. Bilal Dental',
            message: {
                conversation: 'Hello! I received your pitch regarding our dental clinic website. What are your charges?'
            },
            messageTimestamp: Math.floor(Date.now() / 1000)
        };

        const waRes = await axios.post(`${baseUrl}/webhooks/whatsapp`, waPayload, {
            headers: {
                'x-webhook-secret': 'cb_wa_secret_2026',
                'Content-Type': 'application/json'
            }
        });
        console.log('✅ WhatsApp Webhook Response:', waRes.data);

        // 2. Instagram Inbound Webhook
        console.log('\n[2/5] Testing Instagram Inbound Webhook...');
        const igPayload = {
            object: 'instagram',
            entry: [{
                id: 'page_123',
                time: Date.now(),
                messaging: [{
                    sender: { id: 'ig_prospect_999' },
                    recipient: { id: 'client_bunny_agency' },
                    timestamp: Date.now(),
                    message: {
                        text: 'Hey! Saw your Google Maps analysis. Can we jump on a 5-min call tomorrow?'
                    }
                }]
            }]
        };

        const igRes = await axios.post(`${baseUrl}/webhooks/instagram`, igPayload);
        console.log('✅ Instagram Webhook Response:', igRes.data);

        // 3. List Conversations
        console.log('\n[3/5] Listing Conversations in Inbox...');
        const convListRes = await axios.get(`${baseUrl}/inbox/conversations`);
        console.log(`✅ Fetched ${convListRes.data.count} conversations:`);
        convListRes.data.conversations.forEach(c => {
            console.log(`   - [${c.channel.toUpperCase()}] ${c.contact_name}: "${c.last_message_preview}" (Unread: ${c.unread_count})`);
        });

        if (convListRes.data.conversations.length === 0) {
            throw new Error('No conversations found in inbox!');
        }

        const targetConv = convListRes.data.conversations[0];

        // 4. Send Reply from Unified Inbox
        console.log(`\n[4/5] Sending Outbound Reply to Conversation #${targetConv.id} (${targetConv.channel})...`);
        const replyRes = await axios.post(`${baseUrl}/inbox/conversations/${targetConv.id}/reply`, {
            message: 'Thanks for reaching out! Here is a 3-minute video breakdown of our strategy.',
            channel: targetConv.channel
        });
        console.log('✅ Reply sent successfully:', replyRes.data.message.body);

        // 5. Mark as read
        console.log('\n[5/5] Marking Conversation as Read...');
        await axios.post(`${baseUrl}/inbox/conversations/${targetConv.id}/read`);
        const statsRes = await axios.get(`${baseUrl}/inbox/stats`);
        console.log('✅ Updated Inbox Stats:', statsRes.data.stats);

        console.log('\n🎉 ALL INBOX BACKEND FLOWS TESTED SUCCESSFULLY!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Inbox test failed:', (err.response && err.response.data) || err.message);
        process.exit(1);
    }
}

testInbox();
