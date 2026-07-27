const [launcherModuleUrl, launchdeckHome, buildIdentity] = process.argv.slice(2);

if (!launcherModuleUrl || !launchdeckHome || !buildIdentity) {
  throw new Error('launcher module URL, Launchdeck home, and build identity are required');
}

const { installStableLauncher } = await import(launcherModuleUrl);
const installed = await installStableLauncher({
  env: {
    ...process.env,
    LAUNCHDECK_HOME: launchdeckHome
  },
  buildIdentity
});

process.stdout.write(`${JSON.stringify(installed)}\n`);
