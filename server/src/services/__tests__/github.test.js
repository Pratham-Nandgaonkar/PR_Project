const github = require('../github');

describe('GitHub Service - fetchPullRequests Pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch single page when limit <= 100', async () => {
    const mockPulls = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, number: i + 1 }));
    vi.spyOn(github.octokit.pulls, 'list').mockResolvedValue({ data: mockPulls });

    const results = await github.fetchPullRequests('owner', 'repo', 'open', 50);

    expect(results).toHaveLength(50);
    expect(github.octokit.pulls.list).toHaveBeenCalledTimes(1);
    expect(github.octokit.pulls.list).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      state: 'open',
      per_page: 50,
      page: 1,
    });
  });

  it('should paginate across multiple pages when limit > 100 (e.g., 250 PRs)', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, number: i + 1 }));
    const page2 = Array.from({ length: 100 }, (_, i) => ({ id: i + 101, number: i + 101 }));
    const page3 = Array.from({ length: 50 }, (_, i) => ({ id: i + 201, number: i + 201 }));

    vi.spyOn(github.octokit.pulls, 'list')
      .mockResolvedValueOnce({ data: page1 })
      .mockResolvedValueOnce({ data: page2 })
      .mockResolvedValueOnce({ data: page3 });

    const results = await github.fetchPullRequests('owner', 'repo', 'all', 250);

    expect(results).toHaveLength(250);
    expect(github.octokit.pulls.list).toHaveBeenCalledTimes(3);
    expect(github.octokit.pulls.list).toHaveBeenNthCalledWith(1, {
      owner: 'owner',
      repo: 'repo',
      state: 'all',
      per_page: 100,
      page: 1,
    });
    expect(github.octokit.pulls.list).toHaveBeenNthCalledWith(2, {
      owner: 'owner',
      repo: 'repo',
      state: 'all',
      per_page: 100,
      page: 2,
    });
    expect(github.octokit.pulls.list).toHaveBeenNthCalledWith(3, {
      owner: 'owner',
      repo: 'repo',
      state: 'all',
      per_page: 50,
      page: 3,
    });
  });

  it('should stop paginating when fewer items than per_page are returned', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, number: i + 1 }));
    const page2 = Array.from({ length: 35 }, (_, i) => ({ id: i + 101, number: i + 101 }));

    vi.spyOn(github.octokit.pulls, 'list')
      .mockResolvedValueOnce({ data: page1 })
      .mockResolvedValueOnce({ data: page2 });

    const results = await github.fetchPullRequests('owner', 'repo', 'all', 500);

    expect(results).toHaveLength(135);
    expect(github.octokit.pulls.list).toHaveBeenCalledTimes(2);
  });

  it('should paginate with filters using search API', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, number: i + 1, draft: false }));
    const page2 = Array.from({ length: 20 }, (_, i) => ({ id: i + 101, number: i + 101, draft: false }));

    vi.spyOn(github.octokit.search, 'issuesAndPullRequests')
      .mockResolvedValueOnce({ data: { items: page1, total_count: 120 } })
      .mockResolvedValueOnce({ data: { items: page2, total_count: 120 } });

    const results = await github.fetchPullRequests('owner', 'repo', 'open', 200, ['label:bug']);

    expect(results).toHaveLength(120);
    expect(github.octokit.search.issuesAndPullRequests).toHaveBeenCalledTimes(2);
    expect(github.octokit.search.issuesAndPullRequests).toHaveBeenNthCalledWith(1, {
      q: 'repo:owner/repo type:pr state:open label:bug',
      per_page: 100,
      page: 1,
    });
    expect(github.octokit.search.issuesAndPullRequests).toHaveBeenNthCalledWith(2, {
      q: 'repo:owner/repo type:pr state:open label:bug',
      per_page: 100,
      page: 2,
    });
  });

  it('should parse structured sync_filters from repository settings', async () => {
    const page1 = [{ id: 1, number: 1, draft: false }];
    vi.spyOn(github.octokit.search, 'issuesAndPullRequests')
      .mockResolvedValueOnce({ data: { items: page1, total_count: 1 } });

    const structuredFilters = [
      { filter_type: 'author', filter_value: 'alice' },
      { filter_type: 'label', filter_value: 'core team' },
      { filter_type: 'base_branch', filter_value: 'main' },
    ];

    const results = await github.fetchPullRequests('owner', 'repo', 'open', 50, structuredFilters);

    expect(results).toHaveLength(1);
    expect(github.octokit.search.issuesAndPullRequests).toHaveBeenCalledWith({
      q: 'repo:owner/repo type:pr state:open author:alice label:"core team" base:main',
      per_page: 50,
      page: 1,
    });
  });
});

describe('GitHub Service - verifyRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return exists: true and data when repository exists on GitHub', async () => {
    vi.spyOn(github.octokit.repos, 'get').mockResolvedValueOnce({
      data: {
        owner: { login: 'expressjs' },
        name: 'express',
        full_name: 'expressjs/express',
        private: false,
        description: 'Fast, unopinionated, minimalist web framework',
      },
    });

    const result = await github.verifyRepository('expressjs', 'express');

    expect(result.exists).toBe(true);
    expect(result.data.fullName).toBe('expressjs/express');
    expect(result.data.owner).toBe('expressjs');
    expect(result.data.name).toBe('express');
    expect(github.octokit.repos.get).toHaveBeenCalledWith({
      owner: 'expressjs',
      repo: 'express',
    });
  });

  it('should return exists: false with error message when repository is not found (404)', async () => {
    const error404 = new Error('Not Found');
    error404.status = 404;
    vi.spyOn(github.octokit.repos, 'get').mockRejectedValueOnce(error404);

    const result = await github.verifyRepository('invaliduser', 'invalidrepo');

    expect(result.exists).toBe(false);
    expect(result.error).toContain('was not found on GitHub');
  });

  it('should throw rate limit error when GitHub returns 403 rate limit', async () => {
    const error403 = new Error('API rate limit exceeded');
    error403.status = 403;
    vi.spyOn(github.octokit.repos, 'get').mockRejectedValueOnce(error403);

    await expect(github.verifyRepository('owner', 'repo')).rejects.toThrow('rate limit');
  });
});

