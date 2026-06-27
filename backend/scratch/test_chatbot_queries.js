const http = require('http');

const queries = [
    "مرحبا",
    "كيف احجز موعد",
    "كيف الغي الحجز",
    "عندي مغص شديد وترجيع وإسهال",
    "عندي صداع نصفي شديد وتنميل في اليد",
    "حرارة مرتفعة لطفلي مع كحة مستمرة",
    "عندي وجع في أسنانى وضرسى بيوجعنى",
    "أنا حامل وعايزة أطمن على البيبي",
    "عندي وجع بطن",
    "انا تعبان",
    "ضرس",
    "حامل",
    "وجع سنان"
];

function sendQuery(symptoms) {
    return new Promise((resolve) => {
        const data = JSON.stringify({ symptoms });
        const options = {
            hostname: 'localhost',
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
                    const parsed = JSON.parse(body);
                    resolve({ symptoms, status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ symptoms, status: res.statusCode, raw: body });
                }
            });
        });

        req.on('error', (e) => {
            resolve({ symptoms, error: e.message });
        });

        req.write(data);
        req.end();
    });
}

async function runTests() {
    console.log("Starting Chatbot API queries test...");
    for (const q of queries) {
        const res = await sendQuery(q);
        console.log(`\n========================================`);
        console.log(`Input: "${q}"`);
        if (res.error) {
            console.log(`Error connecting to server: ${res.error}`);
        } else {
            console.log(`Status: ${res.status}`);
            if (res.data) {
                console.log(`Response Status: ${res.data.status}`);
                console.log(`Top Specialty: ${res.data.top_specialty}`);
                console.log(`Matched Symptoms: ${JSON.stringify(res.data.matched_symptoms)}`);
                if (res.data.error) {
                    console.log(`Error Field (HTML): Yes (length: ${res.data.error.length})`);
                    if (res.data.error.includes("لم أستطع فهم")) {
                        console.log("-> RESULT: FAILED TO IDENTIFY SYMPTOMS (عذراً، لم أستطع فهم الأعراض)");
                    } else {
                        console.log(`-> RESULT: ${res.data.error.replace(/<[^>]*>/g, '').slice(0, 100)}...`);
                    }
                } else {
                    console.log("-> RESULT: SUCCESSFUL RECOMMENDATION");
                }
            } else {
                console.log(`Raw Response: ${res.raw}`);
            }
        }
    }
}

runTests();
