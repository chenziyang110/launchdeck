import { createObservationService } from '../observations.js';

export function createProjectHandlers(options = {}) {
  const listProjects = options.listProjects ?? (async () => []);
  const inspectProject = options.inspectProject ?? (async ({ target }) => ({ target, status: 'unknown' }));
  const observations = options.observations ?? createObservationService();

  return Object.freeze({
    'project.list': async ({ request }) => {
      const limit = request.input.limit ?? 80;
      const allProjects = [...await listProjects({ request })]
        .sort((left, right) => String(left.alias ?? left.projectId).localeCompare(String(right.alias ?? right.projectId)));
      const page = observations.page({
        kind: 'project-list',
        resourceId: 'registered-projects',
        query: withoutCursor(request.input),
        items: allProjects,
        limit,
        cursor: request.input.cursor
      });
      return {
        outcome: successOutcome('projects_listed', `Found ${page.items.length} registered project(s).`),
        resource: {
          kind: 'projectCollection',
          id: null,
          status: 'available',
          projectRef: null,
          taskRef: null,
          runId: null,
          data: { projects: page.items, nextCursor: page.nextCursor }
        },
        effects: noEffects(),
        error: null,
        nextActions: []
      };
    },
    'project.inspect': async (context) => {
      const project = context.inputs?.projectContext?.project;
      const inspection = await inspectProject({
        project,
        target: context.request.input.target,
        request: context.request
      });
      return {
        outcome: successOutcome('project_inspected', 'Project target inspection completed.'),
        resource: {
          kind: 'inspection',
          id: inspection.id ?? null,
          status: inspection.status ?? 'unknown',
          projectRef: project?.projectId ?? project?.id ?? null,
          taskRef: inspection.taskRef ?? null,
          runId: inspection.runId ?? null,
          data: { inspection }
        },
        effects: noEffects(),
        error: null,
        nextActions: []
      };
    }
  });
}

function withoutCursor(input) {
  const { cursor: _cursor, ...query } = input;
  return query;
}

function successOutcome(code, message) {
  return { kind: 'succeeded', code, message, reusedExistingRun: false };
}

function noEffects() {
  return { certainty: 'none', changed: false, evidenceRefs: [] };
}
