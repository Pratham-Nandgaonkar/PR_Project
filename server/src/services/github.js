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

function buildFilterQuery(filters) {
  if (!filters || !Array.isArray(filters)) return '';
  return filters.map(f => {
    if (typeof f === 'string') return f.trim();
    if (f && typeof f === 'object') {
      const val = (f.filter_value || '').trim();
      if (!val) return '';
      if (f.filter_type === 'author') return `author:${val}`;
      if (f.filter_type === 'label') return `label:"${val}"`;
      if (f.filter_type === 'base_branch') return `base:${val}`;
      return `${f.filter_type}:${val}`;
    }
    return '';
  }).filter(Boolean).join(' ');
}

async function fetchPullRequests(owner, repo, state = 'open', limit = 100, filters = []) {
  const targetLimit = parseInt(limit, 10) || 100;
  const maxPerPage = 100;
  const results = [];
  const seen = new Set();
  let page = 1;

  const filterQuery = buildFilterQuery(filters);
  if (filterQuery) {
    const stateFilter = state === 'all' ? '' : `state:${state}`;
    const q = `repo:${owner}/${repo} type:pr ${stateFilter} ${filterQuery}`.trim();

    while (results.length < targetLimit) {
      const perPage = Math.min(maxPerPage, targetLimit - results.length);
      try {
        const response = await octokit.search.issuesAndPullRequests({
          q,
          per_page: perPage,
          page,
        });

        const items = response.data?.items || [];
        if (items.length === 0) break;

        for (const issue of items) {
          if (!seen.has(issue.id)) {
            seen.add(issue.id);
            results.push({
              ...issue,
              head: { ref: null },
              base: { ref: null },
              merged_at: issue.pull_request?.merged_at || null,
              draft: issue.draft || false,
            });
          }
        }

        if (items.length < perPage || results.length >= targetLimit) break;
        if (response.data?.total_count && results.length >= response.data.total_count) break;
        page++;
      } catch (err) {
        if (results.length > 0) {
          console.warn(`[GitHub] Stopped searching PRs at page ${page} due to error:`, err.message);
          break;
        }
        throw err;
      }
    }

    return results.slice(0, targetLimit);
  }

  while (results.length < targetLimit) {
    const perPage = Math.min(maxPerPage, targetLimit - results.length);
    try {
      const response = await octokit.pulls.list({
        owner,
        repo,
        state,
        per_page: perPage,
        page,
      });

      const items = response.data || [];
      if (items.length === 0) break;

      for (const item of items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          results.push(item);
        }
      }

      if (items.length < perPage || results.length >= targetLimit) break;
      page++;
    } catch (err) {
      if (results.length > 0) {
        console.warn(`[GitHub] Stopped fetching PRs at page ${page} due to error:`, err.message);
        break;
      }
      throw err;
    }
  }

  return results.slice(0, targetLimit);
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

async function verifyRepository(owner, repo) {
  try {
    const { data } = await octokit.repos.get({
      owner,
      repo,
    });
    return {
      exists: true,
      data: {
        owner: data.owner?.login || owner,
        name: data.name || repo,
        fullName: data.full_name,
        isPrivate: data.private || false,
        description: data.description || '',
      },
    };
  } catch (error) {
    if (error.status === 404) {
      return {
        exists: false,
        error: `Repository "${owner}/${repo}" was not found on GitHub. Please check the owner and repository name.`,
      };
    }
    if (error.status === 403 && error.message?.toLowerCase().includes('rate limit')) {
      const err = new Error('GitHub API rate limit exceeded. Please try again later.');
      err.status = 403;
      throw err;
    }
    throw error;
  }
}

module.exports = {
  verifyRepository,
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
  octokit,
};
