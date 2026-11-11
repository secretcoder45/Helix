// Kept dependency-free on purpose: the landing page needs the API URL (to
// wake the backend early) but must not pull axios or react-query into the
// first-load bundle just to read one string.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Every API path is under /v1. API_URL itself (the server) is what /health
// and the "can't reach the server" message use.
export const API_BASE = `${API_URL}/v1`
