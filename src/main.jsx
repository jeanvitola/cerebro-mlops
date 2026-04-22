import React from 'react';
import { createRoot } from 'react-dom/client';
import CerebroMLOps from '../cerebro_mlops.jsx';

window.storage = window.storage || {
  async get(key) {
    const value = window.localStorage.getItem(key);
    return value === null ? null : { value };
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
  },
};

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CerebroMLOps />
  </React.StrictMode>
);
