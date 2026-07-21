import http from 'node:http';
const port = Number(process.argv[2]);
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true, pid: process.pid }));
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ ready: true, port, pid: process.pid })));
