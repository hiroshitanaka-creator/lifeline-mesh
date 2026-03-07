const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Cloud Run Server is working!');
});
const port = process.env.PORT || 8080;
server.listen(port);
