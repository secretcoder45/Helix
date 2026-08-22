import { useEffect, useState } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function App() {
  const [databases, setDatabases] = useState({})
  const [activeTab, setActiveTab] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    axios
      .get(`${API_URL}/databases`)
      .then((res) => {
        setDatabases(res.data)
        setActiveTab(Object.keys(res.data)[0])
      })
      .catch((err) => console.error('Failed to load databases:', err))
  }, [])

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim() || !activeTab) return

    setLoading(true)
    setSearched(true)
    try {
      const response = await axios.post(`${API_URL}/search`, {
        query: searchQuery,
        database: activeTab,
        limit: 10,
      })
      setResults(response.data.results)
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-700">
      <header className="bg-black/10 py-10 px-5 text-center text-white">
        <h1 className="text-4xl font-semibold">🧬 Unified Bioinformatics Database</h1>
        <p className="mt-2 opacity-90">Search genomics, proteins, and more in one place</p>
      </header>

      <main className="max-w-3xl mx-auto my-6 px-5">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 bg-white rounded-lg p-4 mb-5 shadow">
          {Object.entries(databases).map(([key, db]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-2 rounded-md font-medium transition-colors ${
                activeTab === key
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-indigo-100'
              }`}
            >
              {db.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg p-6 mb-6 shadow">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${databases[activeTab]?.name || 'database'}...`}
              className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-indigo-500 text-white rounded-md font-bold hover:bg-purple-700 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
          {databases[activeTab] && (
            <p className="text-gray-500 mt-3">{databases[activeTab].description}</p>
          )}
        </div>

        {/* Results */}
        <div className="grid gap-5 sm:grid-cols-2">
          {results.length > 0
            ? results.map((result, idx) => (
                <div key={idx} className="bg-white rounded-lg p-5 shadow">
                  <h3 className="text-indigo-500 font-semibold text-lg mb-2">{result.name}</h3>
                  <p className="text-gray-600 text-sm mb-2">{result.description}</p>
                  <small className="text-gray-400">{result.database}</small>
                  <a
                    href={result.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-2 text-indigo-500 font-bold hover:underline"
                  >
                    View Details →
                  </a>
                </div>
              ))
            : searched && !loading && (
                <p className="text-white">No results found</p>
              )}
        </div>
      </main>
    </div>
  )
}

export default App
