import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchRepositories } from '../lib/api';

const RepositoryContext = createContext(null);

export function RepositoryProvider({ children }) {
  const [repositories, setRepositories] = useState([]);
  const [selectedRepoId, setSelectedRepoId] = useState(() => {
    const saved = localStorage.getItem('selectedRepoId');
    return saved ? parseInt(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  const loadRepos = useCallback(async () => {
    try {
      setLoading(true);
      const repos = await fetchRepositories();
      setRepositories(repos);
      // Auto-select first if none selected or current doesn't exist
      if (repos.length > 0 && (!selectedRepoId || !repos.find(r => r.id === selectedRepoId))) {
        setSelectedRepoId(repos[0].id);
      }
    } catch (err) {
      console.error('Failed to load repositories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRepos(); }, [loadRepos]);

  useEffect(() => {
    if (selectedRepoId) {
      localStorage.setItem('selectedRepoId', selectedRepoId.toString());
    }
  }, [selectedRepoId]);

  const selectedRepo = repositories.find(r => r.id === selectedRepoId);

  return (
    <RepositoryContext.Provider value={{
      repositories,
      selectedRepo,
      selectedRepoId,
      setSelectedRepoId,
      loading,
      refetch: loadRepos,
    }}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepository() {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('useRepository must be used within RepositoryProvider');
  return ctx;
}
