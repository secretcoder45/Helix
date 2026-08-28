import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const client = axios.create({ baseURL: API_URL })

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

// ---- Projects ----

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await client.get('/projects')
      return data
    },
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
