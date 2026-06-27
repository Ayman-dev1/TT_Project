const http = require('http');

const data = JSON.stringify({ ip: '127.0.0.1' });

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/unblock-ip',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('RESPONSE:', body);
    });
});

req.on('error', (e) => {
    console.error('ERROR:', e.message);
});

req.write(data);
req.end();
