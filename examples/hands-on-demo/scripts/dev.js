const port = process.env.PORT ?? '4317';

console.log(`demo dev process started on port ${port}`);

let tick = 0;
const interval = setInterval(() => {
  tick += 1;
  console.log(`demo heartbeat ${tick}`);
}, 500);

function shutdown(signal) {
  console.log(`demo dev process received ${signal}`);
  clearInterval(interval);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
