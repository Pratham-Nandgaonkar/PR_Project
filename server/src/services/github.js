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

async function fetchPullRequests(owner, repo, state = 'open', perPage = 100) {
  const response = await octokit.pulls.list({
    owner,
    repo,
    state,
    per_page: perPage,
  });
  return response.data;
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
  fetchReviews,
  fetchPRCommits,
  fetchPREvents,
  getRateLimit,
  getApiCallCount,
  resetApiCallCount,
};
