"""
The API's routes, one module per area. main.py mounts each of them under
/v1, and again at the old unversioned paths for existing clients.

Every route is a plain `def`, never `async def`. They all do blocking work —
HTTP calls to UniProt/NCBI through `requests`, database queries, password
hashing — and FastAPI runs plain `def` routes in a thread pool. Declared
`async`, that blocking work ran on the event loop itself and stalled every
other request: a health check sent during one uncached gene lookup waited
3.3 s for it. test_concurrency.py guards against it coming back.
"""
