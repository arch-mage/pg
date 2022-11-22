# pg

[postgres][postgres] client for [deno][deno].

[postgres]: https://www.postgresql.org
[deno]: https://deno.land

## table of contents

 - [single connection](#single-connection)
 - [connection pooling](#connection-pooling)
 - [transaction](#transaction)
 - [prepared statement](#prepared-statement)
 - [browser](#browser)

## single connection

Connect a `Client` to do simple database query.

```ts
import { Client } from './mod.ts'

// except 'user', other options are optional
const client = await Client.connect({
  user: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  password: 'password',
})
```

fetch all rows using _Promise_ api.


```ts
const rows = await client.query('SELECT * FROM sometable')
console.log(rows)
```

or fetch one by one using _iterator_ api.

```ts
for await (const row of client.query('SELECT * FROM sometable')) {
  console.log(row)
  break // it is safe to break or return early
}
```

close the connection.

```ts
client.close()
```

or use `shutdown` to close the `Client` gracefully. It will wait for all running
queries to be done before closing the `Client`.

```ts
await client.shutdown()
```

## connection pooling

If a single `Client` connection is not enough, use a `Pool` to use multiple connection at once.

First, you need to create a `Pool`. It will connect a `Client` on demand.

```ts
import { Pool } from './mod.ts'

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  password: 'password',
})
```

Acquire one or more `Client` from the `Pool`.

```ts
const client = await pool.acquire()
```

You can use client like above examples.

```ts
const rows = await client.query('SELECT * FROM sometable WHERE id IN ($1, $2)', [1, 2])
console.log(rows)
for await (const row of client.query('SELECT * FROM sometable')) {
  console.log(row)
}
```

Don't forget to release the `Client` to the `Pool`.

```ts
pool.release(client)
```


To be safe, use a `try finally` block.

```ts
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  password: 'password',
})
const client = await pool.acquire()

try {
  const rows = await client.query('SELECT * FROM sometable')
  console.log(rows)
  for await (const row of client.query('SELECT * FROM sometable')) {
    console.log(row)
  }
} finally {
  pool.release(client)
}
```

Or use `Pool.query` method a shorthand of acquiring a client, doing query and
then release the client.

```ts
const rows = await pool.query('SELECT * FROM sometable')
console.log(rows)
for await (const row of pool.query('SELECT * FROM sometable')) {
  console.log(row)
}
```

Obviously, those example does not demonstrate use case of connection pooling
since everything is done sequentially. Connection pooling is needed if you need
to do multiple queries concurrently.

```ts
const results = await Promise.all([
  // no await here
  pool.query('SELECT * FROM sometable'),
  pool.query('SELECT * FROM sometable'),
  pool.query('SELECT * FROM sometable'),
  pool.query('SELECT * FROM sometable'),
  pool.query('SELECT * FROM sometable'),
])
console.log(results)
```

It works with _iterator_ api too.

```ts
async function iterate(pool: Pool, query: string) {
  for await (const row of pool.query(query)) {
    console.log(row)
  }
}

await Promise.all([
  // no await here
  iterate(pool, 'SELECT * FROM sometable'),
  iterate(pool, 'SELECT * FROM sometable'),
  iterate(pool, 'SELECT * FROM sometable'),
  iterate(pool, 'SELECT * FROM sometable'),
  iterate(pool, 'SELECT * FROM sometable'),
])
```

## transaction

A transaction can be created by sending a `BEGIN` command.

```ts
import { Client } from './mod.ts'

const client = await Client.connect({ user: 'postgres' })

try {
  await client.query('BEGIN')
  const rows = await client.query(
    'INSERT INTO sometable(name) VALUES ($1) RETURNING id',
    ['name']
  )
  await client.query('SELECT * FROM sometable WHERE id = $1', rows[0].id)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.shutdown()
}
```

**IMPORTANT**: Do not send `BEGIN` with `Pool.query`. Instead, acquire a
`Client` first then do a transaction with the `Client`.

## prepared statement

Prepare a query by giving it a name.

```ts
await client.prepare('named', 'SELECT * FROM sometable WHERE id = $1')
```

Execute the query either with _Promise_ api or _iterator_ api.

```ts
const rows = await client.execute('named', [1])
console.log(rows)
for await (const row of client.execute('named', [1])) {
  console.log(row)
}
```

Deallocate the prepared statement when no longer needed.

```ts
await client.deallocate('named')
```

## browser

It's possible to connecto to a postgres backend from browser as long you provide a
connection interface that satisfies:

```ts
interface Conn {
  readonly writable: WritableStream<Uint8Array>
  readonly readable: ReadableStream<Uint8Array>
  close(): void
}
```

where `writable` should write/send a byte array to postgres backend, `readable`
should read/receive a byte array from postgres backend and `close` should close
the connection.

For example, if somehow you expose a raw postgres connection via websocket and
you have a function like:

```ts
function intoConn(socket: WebSocket): Conn {
  // somehow turn or wrap a socket to satisfy Conn
}
```

Then, use the `Conn` with a `Client`:

```ts
const client = await Client.fromConn(intoConn(socket))
```

_Voilà!!!_, you have a direct access from a browser!

If you crazy enough.