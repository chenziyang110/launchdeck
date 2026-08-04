const port = Number(process.env.PORT || 3402);
const url = `http://127.0.0.1:${port}/api/health`;

try {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || payload.status !== 'ok') throw new Error(`health check returned ${response.status}`);
  console.log(JSON.stringify(payload));
} catch (error) {
  console.error(`Health check failed for ${url}: ${error.message}`);
  process.exitCode = 1;
}
