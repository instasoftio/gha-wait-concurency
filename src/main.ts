import * as core from '@actions/core'
import {Octokit} from '@octokit/core'
import {createActionAuth} from '@octokit/auth-action'
import {wait} from './wait'
import {components} from '@octokit/openapi-types'

const octokit = new Octokit()

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function authOctokitClient(): Promise<void> {
  const auth = createActionAuth()
  const authentication = await auth()
  await octokit.auth(authentication.token)
}

async function createOctokitClient(): Promise<Octokit> {
  const ghToken = core.getInput('GITHUB_TOKEN')
  return new Octokit({auth: ghToken})
}

async function fetchRuns(
  octokitClient: Octokit,
  workflowId: string
): Promise<components['schemas']['workflow-run'][]> {
  // TODO do we need to paginate?
  const responseInProgress = await octokitClient.request(
    'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
    {
      owner: 'instasoftio',
      repo: 'car-sharing',
      workflow_id: workflowId,
      status: 'in_progress',
      per_page: 100
    }
  )
  const responseQueued = await octokitClient.request(
    'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
    {
      owner: 'instasoftio',
      repo: 'car-sharing',
      workflow_id: workflowId,
      status: 'queued',
      per_page: 100
    }
  )
  const responseWaiting = await octokitClient.request(
    'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
    {
      owner: 'instasoftio',
      repo: 'car-sharing',
      workflow_id: workflowId,
      status: 'waiting',
      per_page: 100
    }
  )
  return [
    ...responseInProgress.data.workflow_runs,
    ...responseQueued.data.workflow_runs,
    ...responseWaiting.data.workflow_runs
  ]
}

async function logs(octokitClient: Octokit, workflowId: string): Promise<void> {
  const response = await octokitClient.request(
    'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
    {
      owner: 'instasoftio',
      repo: 'car-sharing',
      workflow_id: workflowId,
      per_page: 100
    }
  )
  core.info('All:')
  core.info(
    JSON.stringify(
      response.data.workflow_runs.map(r => ({
        id: r.id,
        createdAt: r.created_at,
        status: r.status
      }))
    )
  )
}

async function ready(
  octokitClient: Octokit,
  workflowId: string,
  runId: number,
  platform: string
): Promise<boolean> {
  await logs(octokitClient, workflowId)

  const runs = await fetchRuns(octokitClient, workflowId)
  core.info(`platform: ${platform}`)
  runs.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  core.info('first elem:')
  core.info(`${runs[0].id}, ${runs[0].created_at}`)
  core.info('all elems:')
  core.info(
    JSON.stringify(runs.map(r => ({id: r.id, createdAt: r.created_at})))
  )
  // we should never get here
  if (runs.length === 0) {
    core.info('found 0 runs')
    return false
  }
  return runs[0].id === runId
}

async function run(): Promise<void> {
  try {
    // await authOctokitClient()
    const octokitClient = await createOctokitClient()
    const workflowId = core.getInput('workflowId')
    const runId = parseInt(core.getInput('runId')) // ${{ github.run_id }}
    const platform = core.getInput('platform')
    core.info(
      `Waiting for other workflows to finish: "${workflowId}"+"${runId}"+"${platform}"`
    )
    const five_hours = 5 * 60 * 60 * 1e3
    const timeout = new Date().getTime() + five_hours
    while (new Date().getTime() <= timeout) {
      if (await ready(octokitClient, workflowId, runId, platform)) {
        core.info('found run')
        return
      }
      await wait(5e3)
    }
    core.setFailed('timeout, no run id has been found for a while')
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

// async function run(): Promise<void> {
//   try {
//     const ms: string = core.getInput('milliseconds')
//     core.debug(`Waiting ${ms} milliseconds ...`) // debug is only output if you set the secret `ACTIONS_RUNNER_DEBUG` to true
//
//     core.debug(new Date().toTimeString())
//     await wait(parseInt(ms, 10))
//     core.debug(new Date().toTimeString())
//
//     core.setOutput('time', new Date().toTimeString())
//   } catch (error) {
//     core.setFailed(error.message)
//   }
// }
