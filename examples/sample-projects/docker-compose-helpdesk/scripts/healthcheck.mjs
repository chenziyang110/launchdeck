import http from 'node:http';

const port = Number(process.env.PORT ?? 3000);
const request = http.get({
  hostname: '127.0.0.1',
  path: '/health',
  port,
  timeout: 2000,
}, (response) => {
  let body = '';
  response.setEncoding('utf8');
  response.on('data', (chunk) => { body += chunk; });
  response.on('end', () => {
    try {
      const payload = JSON.parse(body);
      process.exitCode = response.statusCode === 200 && payload.status === 'ok' ? 0 : 1;
    } catch {
      process.exitCode = 1;
    }
  });
});

request.on('error', () => { process.exitCode = 1; });
request.on('timeout', () => {
  request.destroy();
  process.exitCode = 1;
});
