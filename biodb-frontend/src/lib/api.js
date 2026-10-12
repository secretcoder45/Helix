import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { API_URL } from './config'
import { SIGNED_OUT_EVENT, clearToken, getToken } from './session'

export { API_URL }

const client = axios.create({ baseURL: API_URL })

// Read the token per request rather than once, so signing in or out takes
// effect immediately for every hook.
client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// A 401 on a request that carried a token means the session ended (expired,
// signed out elsewhere, password changed). Drop it and let the app react.
client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && error.config?.headers?.Authorization) {
      clearToken()
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
    }
    return Promise.reject(error)
  },
)

/** The server's explanation for a failed request, for showing to the user. */
export function errorMessage(error, fallback = 'Something went wrong. Try again.') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (!error?.response) return 'Can’t reach the server. It may be waking up — try again in a moment.'
  return fallback
}

export function useDatabases() {
  return useQuery({
    queryKey: ['databases'],
    queryFn: async () => {
      const { data } = await client.get('/databases')
      return data
    },
    staleTime: Infinity,
  })
}

export function useSearch(database, query, limit = 10) {
  return useQuery({
    queryKey: ['search', database, query, limit],
    queryFn: async () => {
      const { data } = await client.post('/search', { query, database, limit })
      return data.results
    },
    enabled: Boolean(database && query && query.trim().length > 1),
    staleTime: 60_000,
    retry: 1,
  })
}

export function useChat() {
  return useMutation({
    mutationFn: async (query) => {
      const { data } = await client.post('/chat', { query })
      return data
    },
  })
}

export function useEntity(query) {
  return useQuery({
    queryKey: ['entity', query],
    queryFn: async () => {
      const { data } = await client.get(`/entity/${encodeURIComponent(query)}`)
      return data
    },
    enabled: Boolean(query && query.trim().length > 1),
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useLiterature(geneSymbol) {
  return useQuery({
    queryKey: ['literature', geneSymbol],
    queryFn: async () => {
      const { data } = await client.get(`/literature/${encodeURIComponent(geneSymbol)}`)
      return data.papers
    },
    enabled: Boolean(geneSymbol),
    staleTime: 10 * 60_000,
    retry: 1,
  })
}

export function useBatch() {
  return useMutation({
    mutationFn: async ({ identifiers, includeGene }) => {
      const { data } = await client.post('/batch', {
        identifiers,
        include_gene: Boolean(includeGene),
      })
      return data
    },
  })
}

// ---- BLAST ----
// Three hooks mirroring the three-endpoint async flow: submit once, poll
// status on an interval, fetch results once status says READY. Polling
// backs off to reduce load on both NCBI and our own free-tier backend for a
// search that can run minutes.

export function useBlastSubmit() {
  return useMutation({
    mutationFn: async ({ sequence, program, database }) => {
      const { data } = await client.post('/blast/submit', { sequence, program, database })
      return data
    },
  })
}

const TERMINAL_STATUSES = new Set(['READY', 'FAILED', 'UNKNOWN'])

export function useBlastStatus(rid) {
  return useQuery({
    queryKey: ['blast-status', rid],
    queryFn: async () => {
      const { data } = await client.get(`/blast/status/${rid}`)
      return data
    },
    enabled: Boolean(rid),
    refetchInterval: (query) =>
      TERMINAL_STATUSES.has(query.state.data?.status) ? false : 8000,
    retry: 2,
  })
}

export function useBlastResults(rid, ready) {
  return useQuery({
    queryKey: ['blast-results', rid],
    queryFn: async () => {
      const { data } = await client.get(`/blast/results/${rid}`)
      return data
    },
    enabled: Boolean(rid) && ready,
    staleTime: Infinity, // a finished search's results never change
  })
}

export function useAlign() {
  return useMutation({
    mutationFn: async ({ algorithm = 'needleman-wunsch', ...payload }) => {
      const { data } = await client.post(`/align/${algorithm}`, payload)
      return data
    },
  })
}

export function useSaveAlignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, alignment }) => {
      const { data } = await client.post(`/projects/${projectId}/alignments`, alignment)
      return data
    },
    onSuccess: (_d, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useRemoveAlignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, alignmentId }) => {
      const { data } = await client.delete(`/projects/${projectId}/alignments/${alignmentId}`)
      return data
    },
    onSuccess: (_d, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useProperties() {
  return useMutation({
    mutationFn: async (sequence) => {
      const { data } = await client.post('/properties', { sequence })
      return data
    },
  })
}

export function useDna() {
  return useMutation({
    mutationFn: async (payload) => {
      const { data } = await client.post('/dna', payload)
      return data
    },
  })
}

export function usePhylo() {
  return useMutation({
    mutationFn: async (payload) => {
      const { data } = await client.post('/phylo', payload)
      return data
    },
  })
}

export function useRestriction() {
  return useMutation({
    mutationFn: async (payload) => {
      const { data } = await client.post('/restriction', payload)
      return data
    },
  })
}

export function useAlphafold(accession) {
  return useQuery({
    queryKey: ['alphafold', accession],
    queryFn: async () => {
      const { data } = await client.get(`/alphafold/${encodeURIComponent(accession)}`)
      return data
    },
    enabled: Boolean(accession),
    retry: false,
    staleTime: 30 * 60_000,
  })
}

export function useVariant() {
  return useMutation({
    mutationFn: async ({ gene, variant }) => {
      const { data } = await client.post('/variant', { gene, variant })
      return data
    },
  })
}

export function usePrimers() {
  return useMutation({
    mutationFn: async (payload) => {
      const { data } = await client.post('/primers', payload)
      return data
    },
  })
}

// ---- Provenance & methods ----

/** The running build and current source releases — changes rarely. */
export function useServerProvenance() {
  return useQuery({
    queryKey: ['provenance'],
    queryFn: async () => {
      const { data } = await client.get('/provenance')
      return data
    },
    staleTime: 10 * 60_000,
    retry: 1,
  })
}

/** Methods text, references and records table for a project — the owner's
 * (by id) or a shared one (by share token). Always fresh: it describes the
 * project's current contents. */
export function useMethods({ projectId, shareToken }, enabled = true) {
  const path = shareToken ? `/shared/${shareToken}/methods` : `/projects/${projectId}/methods`
  return useQuery({
    queryKey: ['methods', shareToken ? `shared:${shareToken}` : projectId],
    queryFn: async () => {
      const { data } = await client.get(path)
      return data
    },
    enabled: Boolean(projectId || shareToken) && enabled,
    staleTime: 0,
  })
}

// ---- Accounts ----

export function useMe(token) {
  return useQuery({
    queryKey: ['me', token],
    queryFn: async () => {
      const { data } = await client.get('/auth/me')
      return data
    },
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
    retry: (count, error) => error?.response?.status !== 401 && count < 2,
  })
}

export function useSignIn() {
  return useMutation({
    mutationFn: async ({ mode, username, password }) => {
      const { data } = await client.post(mode === 'register' ? '/auth/register' : '/auth/login', {
        username,
        password,
      })
      return data
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload) => {
      const { data } = await client.post('/auth/password', payload)
      return data
    },
  })
}

export async function serverSignOut() {
  try {
    await client.post('/auth/logout')
  } catch {
    /* already signed out server-side; the local token is cleared regardless */
  }
}

// ---- Sharing ----

export function useShareProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, share }) => {
      const { data } = share
        ? await client.post(`/projects/${projectId}/share`)
        : await client.delete(`/projects/${projectId}/share`)
      return data
    },
    onSuccess: (_d, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useSharedProject(token) {
  return useQuery({
    queryKey: ['shared', token],
    queryFn: async () => {
      const { data } = await client.get(`/shared/${token}`)
      return data
    },
    enabled: Boolean(token),
    retry: false,
  })
}

// ---- Projects ----

export function useProjects(enabled = true) {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await client.get('/projects')
      return data
    },
    enabled,
  })
}

export function useProject(projectId) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data } = await client.get(`/projects/${projectId}`)
      return data
    },
    enabled: Boolean(projectId),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => {
      const { data } = await client.post('/projects', payload)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectId) => {
      const { data } = await client.delete(`/projects/${projectId}`)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useSaveItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, item }) => {
      const { data } = await client.post(`/projects/${projectId}/items`, item)
      return data
    },
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useSaveItemsBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, items }) => {
      const { data } = await client.post(`/projects/${projectId}/items/bulk`, { items })
      return data
    },
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useRemoveItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, itemId }) => {
      const { data } = await client.delete(`/projects/${projectId}/items/${itemId}`)
      return data
    },
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}
