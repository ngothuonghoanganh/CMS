# Data Query DSL

Page queries are finite data, not executable expressions. A query identifies a
local collection and contains bounded filters, sort fields, offset, and limit.
The client never sends MongoDB, SQL, GraphQL, regex, aggregation, or arbitrary
JavaScript to the server.

```ts
{
  id: 'query-id',
  source: { type: 'collection', collectionId: 'products-id' },
  filters: [{ field: 'featured', operator: 'equals', value: true }],
  sort: [{ field: 'createdAt', direction: 'desc' }],
  offset: 0,
  limit: 6
}
```

The supported operators are `equals`, `notEquals`, `contains`, `startsWith`,
`gt`, `gte`, `lt`, `lte`, `in`, `notIn`, and `exists`. The service checks the
collection, field, field type, operator, value shape, tenant ownership, and
bounded pagination before resolving the query. The current contract caps
filters and limit values and defaults list queries to a small page.

Collection List resolves one query once and repeats one persisted item
template. It never issues a request per child component. Relations remain
bounded local references; external data providers can be added later through
the provider-agnostic `DataSourceDescriptor` without changing builder payloads.

Query definitions live in the page composition. A query change is part of the
page draft and therefore requires page publish. The rows returned by a query
are not copied into the page bundle: Review resolves draft versions and public
delivery resolves published versions.
