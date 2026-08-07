const args = process.argv.slice(2);
const portArgumentIndex = args.indexOf('--port');
const requestedPort = portArgumentIndex >= 0 ? args[portArgumentIndex + 1] : undefined;
const port = Number(process.env.PORT ?? requestedPort ?? 4173);
const healthUrl = process.env.HEALTH_URL ?? `http://127.0.0.1:${port}/health.json`;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(JSON.stringify({ status: 'error', message: 'PORT must be an integer between 1 and 65535' }));
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    const payload = await response.json();
    const healthy = response.ok && payload.status === 'ok' && payload.service === 'daymark';
    console.log(JSON.stringify({ status: healthy ? 'ok' : 'error', url: healthUrl, response: payload }));
    if (!healthy) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'error', url: healthUrl, message: error.message }));
    process.exitCode = 1;
  }
}
