const http = require('http');

const url = 'http://localhost:5000/api/chats-active-contacts?email=ali@example.com&role=patient';

http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log('Status Code:', res.statusCode);
        console.log('Response Body:', data);
        try {
            console.log('Parsed JSON:', JSON.parse(data));
        } catch (e) {
            console.log('Not a valid JSON');
        }
    });
}).on('error', (err) => {
    console.error('Error calling endpoint:', err.message);
});
