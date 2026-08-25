import axios from 'axios'
import { useQuery } from '@tanstack/react-query'

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
