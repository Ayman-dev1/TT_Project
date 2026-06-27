const http = require('http');

const testCases = [
    { name: "English Greeting", payload: { symptoms: "hello" } },
    { name: "Arabic Greeting", payload: { symptoms: "مرحبا" } },
    { name: "English Help Guide", payload: { symptoms: "how to book" } },
    { name: "Arabic Cancellation Help", payload: { symptoms: "كيف الغي الحجز" } },
    { name: "Arabic Symptom Triage (Neurology)", payload: { symptoms: "عندي صداع نصفي شديد وتنميل في اليد" } },
    { name: "English Symptom Triage (Dermatology)", payload: { symptoms: "I have itchy skin and a red rash" } },
    { name: "Emergency Symptom Trigger (Cardiac)", payload: { symptoms: "I have severe chest pain and shortness of breath" } },
    { name: "Emergency Symptom Trigger (Psychiatry)", payload: { symptoms: "I want to die, having suicidal thoughts" } }
];

function sendPostRequest(payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const options = {
            hostname: '127.0.0.1',
            port: 5000,
            path: '/api/recommend-doc',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        data: JSON.parse(body)
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        raw: body
                    });
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(data);
        req.end();
    });
}

async function runTests() {
    console.log("============================================================");
    console.log("RUNNING API ENDPOINT VERIFICATION TESTS");
    console.log("============================================================");
    
    for (const tc of testCases) {
        console.log(`\n🚀 Running Test: ${tc.name}`);
        console.log(`   Payload: ${JSON.stringify(tc.payload)}`);
        try {
            const res = await sendPostRequest(tc.payload);
            console.log(`   Status Code: ${res.statusCode}`);
            if (res.data) {
                console.log(`   Response Status: ${res.data.status || 'N/A'}`);
                if (res.data.status === 'conversational') {
                    console.log(`   Conversational Message: ${res.data.message.substring(0, 100)}...`);
                } else if (res.data.status === 'emergency') {
                    console.log(`   Emergency Specialty: ${res.data.top_specialty}`);
                    console.log(`   Emergency Warning: ${res.data.message.substring(0, 150)}...`);
                } else if (res.data.status === 'success') {
                    console.log(`   Triage Specialty: ${res.data.top_specialty}`);
                    console.log(`   Matched Keywords: ${JSON.stringify(res.data.matched_symptoms)}`);
                    console.log(`   Report Summary: ${res.data.message.substring(0, 150)}...`);
                    console.log(`   Available Doctors Count: ${res.data.available_doctors.length}`);
                    if (res.data.available_doctors.length > 0) {
                        console.log(`   Recommending Doctor: ${res.data.available_doctors[0].name}`);
                    }
                } else {
                    console.log(`   Response: ${JSON.stringify(res.data)}`);
                }
            } else {
                console.log(`   Raw Response: ${res.raw}`);
            }
        } catch (err) {
            console.error(`   Error sending request: ${err.message}`);
        }
    }
    console.log("\n============================================================");
}

runTests();
