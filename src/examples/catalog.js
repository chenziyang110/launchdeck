import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LaunchdeckError } from '../errors.js';

export const CATALOG_FIELDS = Object.freeze([
  'id',
  'title',
  'stack',
  'theme',
  'requirements',
  'ports',
  'sourcePath'
]);

export const APPROVED_EXAMPLE_IDS = Object.freeze([
  'vite-react-habit-tracker',
  'nextjs-blog-manager',
  'nestjs-url-shortener',
  'fastapi-inventory',
  'django-events',
  'go-webhook-inbox',
  'spring-boot-orders',
  'aspnet-library-catalog',
  'docker-compose-helpdesk',
  'node-python-issue-tracker'
]);

const APPROVED_STACKS_AND_THEMES = Object.freeze({
  'vite-react-habit-tracker': Object.freeze({ stack: 'Vite + React', theme: 'habit tracking' }),
  'nextjs-blog-manager': Object.freeze({ stack: 'Next.js', theme: 'blog management' }),
  'nestjs-url-shortener': Object.freeze({ stack: 'NestJS', theme: 'URL shortening' }),
  'fastapi-inventory': Object.freeze({ stack: 'FastAPI', theme: 'inventory' }),
  'django-events': Object.freeze({ stack: 'Django', theme: 'events' }),
  'go-webhook-inbox': Object.freeze({ stack: 'Go', theme: 'webhook inbox' }),
  'spring-boot-orders': Object.freeze({ stack: 'Spring Boot', theme: 'orders' }),
  'aspnet-library-catalog': Object.freeze({ stack: 'ASP.NET Core', theme: 'library catalog' }),
  'docker-compose-helpdesk': Object.freeze({ stack: 'Docker Compose', theme: 'helpdesk' }),
  'node-python-issue-tracker': Object.freeze({
    stack: 'Node.js + Python monorepo',
    theme: 'issue tracking'
  })
});

const CATALOG_RELATIVE_PATH = path.join('examples', 'sample-projects', 'catalog.json');
const SOURCE_ROOT_RELATIVE_PATH = path.join('examples', 'sample-projects');
const DEFAULT_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FORBIDDEN_FIELD_NAMES = new Set([
  'score',
  'rank',
  'answer',
  'evaluation',
  'telemetry'
]);

export function loadCatalog({ rootDir = DEFAULT_ROOT_DIR } = {}) {
  if (typeof rootDir !== 'string' || rootDir.trim() === '') {
    throw catalogInvalid('Catalog root must be a non-empty directory path.');
  }

  const projectRoot = path.resolve(rootDir);
  const catalogPath = path.resolve(projectRoot, CATALOG_RELATIVE_PATH);
  const sourceRoot = path.resolve(projectRoot, SOURCE_ROOT_RELATIVE_PATH);
  const rawCatalog = readCatalog(catalogPath);

  validateCatalogShape(rawCatalog, catalogPath);
  validateSourceInventory(sourceRoot, catalogPath);

  const sourceRootReal = realDirectory(sourceRoot, catalogPath, 'source root');
  const entries = rawCatalog.map((entry, index) => {
    validateEntry(entry, index, projectRoot, sourceRoot, sourceRootReal, catalogPath);
    return deepFreeze({
      id: entry.id,
      title: entry.title,
      stack: entry.stack,
      theme: entry.theme,
      requirements: [...entry.requirements],
      ports: [...entry.ports],
      sourcePath: entry.sourcePath
    });
  });

  validateUniqueValues(entries, 'id', catalogPath);
  validateUniquePorts(entries, catalogPath);
  return Object.freeze(entries);
}

function readCatalog(catalogPath) {
  let source;
  try {
    source = fs.readFileSync(catalogPath, 'utf8');
  } catch (error) {
    throw catalogInvalid('Unable to read the packaged example catalog.', {
      catalogPath,
      cause: error.code ?? error.name
    });
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw catalogInvalid('The packaged example catalog is not valid JSON.', {
      catalogPath,
      cause: error.name
    });
  }
}

function validateCatalogShape(catalog, catalogPath) {
  if (!Array.isArray(catalog)) {
    throw catalogInvalid('The example catalog must be a top-level array.', { catalogPath });
  }
  if (catalog.length !== APPROVED_EXAMPLE_IDS.length) {
    throw catalogInvalid('The example catalog must contain exactly ten entries.', {
      catalogPath,
      expectedCount: APPROVED_EXAMPLE_IDS.length,
      actualCount: catalog.length
    });
  }

  for (const [index, entry] of catalog.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw catalogInvalid(`Catalog entry ${index} must be an object.`, { catalogPath, index });
    }
    const keys = Object.keys(entry);
    if (keys.length !== CATALOG_FIELDS.length || keys.some((key) => !CATALOG_FIELDS.includes(key))) {
      throw catalogInvalid(`Catalog entry ${index} contains an unsupported field.`, {
        catalogPath,
        index,
        fields: keys
      });
    }
    if (keys.some((key) => FORBIDDEN_FIELD_NAMES.has(key.toLowerCase()))) {
      throw catalogInvalid(`Catalog entry ${index} contains forbidden evaluation metadata.`, {
        catalogPath,
        index
      });
    }
    if (entry.id !== APPROVED_EXAMPLE_IDS[index]) {
      throw catalogInvalid('The example catalog must preserve the approved ten-entry order.', {
        catalogPath,
        index,
        expectedId: APPROVED_EXAMPLE_IDS[index],
        actualId: entry.id
      });
    }
  }
}

function validateSourceInventory(sourceRoot, catalogPath) {
  let entries;
  try {
    entries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  } catch (error) {
    throw catalogInvalid('The packaged example source root is unavailable.', {
      catalogPath,
      sourceRoot,
      cause: error.code ?? error.name
    });
  }

  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expectedDirectories = [...APPROVED_EXAMPLE_IDS].sort();
  if (directories.length !== expectedDirectories.length ||
      directories.some((name, index) => name !== expectedDirectories[index])) {
    throw catalogInvalid('The example source root must contain exactly the approved ten directories.', {
      catalogPath,
      sourceRoot,
      expectedDirectories,
      actualDirectories: directories
    });
  }
}

function validateEntry(entry, index, projectRoot, sourceRoot, sourceRootReal, catalogPath) {
  const expected = APPROVED_STACKS_AND_THEMES[entry.id];
  if (!expected) {
    throw catalogInvalid(`Catalog entry ${index} has an unapproved ID '${entry.id}'.`, {
      catalogPath,
      index
    });
  }

  for (const field of ['id', 'title', 'stack', 'theme']) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      throw catalogInvalid(`Catalog entry ${index} requires a non-empty ${field}.`, {
        catalogPath,
        index,
        field
      });
    }
  }
  if (entry.stack !== expected.stack || entry.theme !== expected.theme) {
    throw catalogInvalid(`Catalog entry ${index} does not match the approved stack and theme.`, {
      catalogPath,
      index,
      id: entry.id,
      expectedStack: expected.stack,
      expectedTheme: expected.theme
    });
  }

  if (!Array.isArray(entry.requirements) || entry.requirements.length === 0 ||
      entry.requirements.some((requirement) => typeof requirement !== 'string' || requirement.trim() === '')) {
    throw catalogInvalid(`Catalog entry ${index} requires non-empty requirement strings.`, {
      catalogPath,
      index
    });
  }

  if (!Array.isArray(entry.ports) || entry.ports.length === 0 ||
      entry.ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65_535)) {
    throw catalogInvalid(`Catalog entry ${index} requires valid numeric ports.`, {
      catalogPath,
      index
    });
  }

  const expectedSourcePath = path.posix.join('examples/sample-projects', entry.id);
  if (entry.sourcePath !== expectedSourcePath || entry.sourcePath.includes('\\')) {
    throw catalogInvalid(`Catalog entry ${index} must point to its approved source directory.`, {
      catalogPath,
      index,
      expectedSourcePath,
      actualSourcePath: entry.sourcePath
    });
  }

  const sourcePath = path.resolve(projectRoot, entry.sourcePath);
  if (!isInside(sourceRoot, sourcePath) || sourcePath !== path.join(sourceRoot, entry.id)) {
    throw catalogInvalid(`Catalog entry ${index} source path escapes the sample root.`, {
      catalogPath,
      index,
      sourcePath
    });
  }

  let sourceStat;
  try {
    sourceStat = fs.lstatSync(sourcePath);
  } catch (error) {
    throw catalogInvalid(`Catalog entry ${index} source directory is unavailable.`, {
      catalogPath,
      index,
      sourcePath,
      cause: error.code ?? error.name
    });
  }
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
    throw catalogInvalid(`Catalog entry ${index} source path must be a real directory.`, {
      catalogPath,
      index,
      sourcePath
    });
  }

  const sourcePathReal = realDirectory(sourcePath, catalogPath, `source for ${entry.id}`);
  if (!isInside(sourceRootReal, sourcePathReal) || sourcePathReal !== path.join(sourceRootReal, entry.id)) {
    throw catalogInvalid(`Catalog entry ${index} source directory resolves outside the sample root.`, {
      catalogPath,
      index,
      sourcePath
    });
  }
}

function validateUniqueValues(entries, field, catalogPath) {
  const values = entries.map((entry) => entry[field]);
  if (new Set(values).size !== values.length) {
    throw catalogInvalid(`Catalog ${field} values must be unique.`, { catalogPath, field });
  }
}

function validateUniquePorts(entries, catalogPath) {
  const ports = entries.flatMap((entry) => entry.ports);
  if (new Set(ports).size !== ports.length) {
    throw catalogInvalid('Catalog ports must be unique across all examples.', { catalogPath, ports });
  }
}

function realDirectory(targetPath, catalogPath, label) {
  try {
    return fs.realpathSync(targetPath);
  } catch (error) {
    throw catalogInvalid(`The packaged ${label} cannot be resolved.`, {
      catalogPath,
      targetPath,
      cause: error.code ?? error.name
    });
  }
}

function isInside(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function catalogInvalid(message, details = undefined) {
  return new LaunchdeckError('example_catalog_invalid', message, details);
}
