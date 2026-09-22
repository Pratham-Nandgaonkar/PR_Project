const { Octokit } = require('@octokit/rest');
const config = require('../config');

let apiCallCount = 0;

const octokit = new Octokit({
  auth: config.github && config.github.token ? config.github.token : undefined,
});

// Hook into octokit request to track apiCallCount
octokit.hook.wrap('request', async (request, options) => {
  apiCallCount++;
  try {
    return await request(options);
  } catch (error) {
    if (error.status === 403 && error.message.includes('rate limit')) {
      console.error('GitHub API rate limit exceeded.');
    }
    throw error;
  }
});

function getApiCallCount() {
  return apiCallCount;
}

function resetApiCallCount() {
  apiCallCount = 0;
}

async function fetchPullRequests(owner, repo, state = 'open', perPage = 100, filters = []) {
  if (filters && filters.length > 0) {
    const filterQuery = filters.join(' ');
    const stateFilter = state === 'all' ? '' : `state:${state}`;
    const q = `repo:${owner}/${repo} type:pr ${stateFilter} ${filterQuery}`.trim();
    const response = await octokit.search.issuesAndPullRequests({
      q,
      per_page: perPage,
    });
    return response.data.items.map(issue => ({
      ...issue,
      head: { ref: null },
      base: { ref: null },
      merged_at: issue.pull_request?.merged_at || null,
      draft: issue.draft || false,
    }));
  }

  const response = await octokit.pulls.list({
    owner,
    repo,
    state,
    per_page: perPage,
  });
  return response.data;
}

async function fetchPRComments(owner, repo, prNumber) {
  return await octokit.paginate(octokit.pulls.listReviewComments, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
}

async function fetchCheckRuns(owner, repo, ref) {
  return await octokit.paginate(octokit.checks.listForRef, {
    owner,
    repo,
    ref,
    per_page: 100,
  });
}

async function fetchReviews(owner, repo, prNumber) {
  return await octokit.paginate(octokit.pulls.listReviews, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
}

async function fetchPRCommits(owner, repo, prNumber) {
  return await octokit.paginate(octokit.pulls.listCommits, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
}

async function fetchPREvents(owner, repo, issueNumber) {
  return await octokit.paginate(octokit.issues.listEvents, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
}

async function fetchPRDetail(owner, repo, prNumber) {
  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  return data;
}

async function getRateLimit() {
  const { data } = await octokit.rateLimit.get();
  return {
    limit: data.rate.limit,
    remaining: data.rate.remaining,
    reset: data.rate.reset,
  };
}

module.exports = {
  fetchPullRequests,
  fetchPRDetail,
  fetchPRComments,
  fetchCheckRuns,
  fetchReviews,
  fetchPRCommits,
  fetchPREvents,
  getRateLimit,
  getApiCallCount,
  resetApiCallCount,
};
