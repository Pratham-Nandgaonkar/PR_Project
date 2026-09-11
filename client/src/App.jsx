import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { RepositoryProvider } from './hooks/useRepository';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import PRList from './pages/PRList';
import PRDetail from './pages/PRDetail';
import People from './pages/People';
import Trends from './pages/Trends';
import Settings from './pages/Settings';

export default function App() {
  return (
    <RepositoryProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/prs" element={<PRList />} />
          <Route path="/prs/:number" element={<PRDetail />} />
          <Route path="/people" element={<People />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </RepositoryProvider>
  );
}
