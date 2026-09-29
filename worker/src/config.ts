import { RUNNERS, type DispatcherConfig, type Runner, type WorkerEnv } from './types';
const csv = (raw: string | undefined) => [...new Set((raw ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean))];
export function configFromEnv(env: WorkerEnv): DispatcherConfig {
  const repositories = csv(env.TRUSTED_REPOSITORIES);
  const actors = csv(env.TRUSTED_ACTORS);
  if (!repositories.length || repositories.some(x => !/^[\w.-]+\/[\w.-]+$/.test(x))) throw new Error('invalid_repository_allowlist');
  if (!actors.length || actors.some(x => !/^[A-Za-z0-9_.-]+$/.test(x))) throw new Error('invalid_actor_allowlist');
  const runnerOrder: Runner[] = [];
  for (const item of csv(env.DISPATCH_RUNNERS ?? 'home,waiting')) {
    const runner = RUNNERS.find(x => x === item);
    if (!runner) throw new Error('invalid_provider');
    runnerOrder.push(runner);
  }
  if (runnerOrder[0] !== 'home') throw new Error('home_must_be_first_provider');
  const paid = env.ENABLE_PAID_FALLBACKS ?? 'false';
  if (!['true', 'false'].includes(paid)) throw new Error('invalid_paid_policy');
  const workflowFile = env.GITHUB_WORKFLOW_FILE ?? 'black-box-ci.yml';
  const workflowRef = env.GITHUB_WORKFLOW_REF ?? 'main';
  if (!/^[\w.-]+\.ya?ml$/.test(workflowFile) || !/^[\w/-]+$/.test(workflowRef)) throw new Error('invalid_workflow_configuration');
  return { trustedRepositories: new Set(repositories), trustedActors: new Set(actors), runnerOrder, paidFallbacksEnabled: paid === 'true', workflowFile, workflowRef, homeRunnerLabel: env.HOME_RUNNER_LABEL ?? 'black-box-linux', githubApiBaseUrl: 'https://api.github.com', maxAttempts: 3 };
}
export function selectRunner(config: DispatcherConfig, available: ReadonlySet<Runner>): Runner {
  return config.runnerOrder.find(x => x !== 'waiting' && available.has(x) && (x === 'home' || config.paidFallbacksEnabled)) ?? 'waiting';
}
