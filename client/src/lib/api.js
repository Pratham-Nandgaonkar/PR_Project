const BASE = '';

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || 'Request failed');
  }
  return res.json();
}

export const fetchRepositories = () => request('/api/repositories');
export const addRepository = (owner, name) => request('/api/repositories', {
  method: 'POST',
  body: JSON.stringify({ owner, name }),
});
export const deleteRepository = (id) => request(`/api/repositories/${id}`, { method: 'DELETE' });
export const triggerSync = (repoId) => request(`/api/sync/${repoId}`, { method: 'POST' });
export const fetchSyncStatus = (repoId) => request(`/api/sync/${repoId}/status`);
export const fetchPRs = (repoId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/prs/${repoId}${qs ? '?' + qs : ''}`);
};
export const fetchPRDetail = (repoId, number) => request(`/api/prs/${repoId}/${number}`);
export const fetchSummary = (repoId) => request(`/api/analytics/${repoId}/summary`);
export const fetchPeople = (repoId) => request(`/api/analytics/${repoId}/people`);
export const fetchTrends = (repoId) => request(`/api/analytics/${repoId}/trends`);
export const fetchBottlenecks = (repoId) => request(`/api/analytics/${repoId}/bottlenecks`);
