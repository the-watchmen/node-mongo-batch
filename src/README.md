# batch

MongoDB (Mongo) is extremely functional and can be astonishingly fast when queries are run against query specific collections.

The result of this principle is that Mongo projects often have many query specific collections that contain denormalized data in terms of a normalized object model. These query specific collections need to be constructed and groomed as normalized data is updated from various actions (web, file, etc). Sometimes we refer to these query specific collections as [materialized views](https://en.wikipedia.org/wiki/Materialized_view)

The components in this folder support these activities by facilitating the conversion of data from one or more normalized or intermediate Mongo collections into query specific collections. This framework builds on [Mongo's highly functional aggregation pipeline feature](https://docs.mongodb.com/manual/aggregation/).

Batch actions are executed by what we refer to as _Ingesters_, which are invoked from the command line on machines with Node/NPM installed that have network access to the Mongo database being manipulated.

An Ingester will start with a single source input collection, run it thru an aggregation pipeline, optionally "joining" it with additional collections using the Mongo [$lookup](https://docs.mongodb.com/manual/reference/operator/aggregation/lookup/) feature, and either <a href='https://en.wikipedia.org/wiki/Merge_(SQL)'>upserting</a> (or in some cases completely replacing) a target output collection.

## Configurable Ingester

The primary component here is [a reusable ingester](./ingester.js) that can be configured for the task at hand.

### Command Line Parameters

* `sourceName`: name of the source input collection
* `targetName`: name of the target output collection
* `batchSize`: batch size to use with Mongo cursor operations
* `thresh`: threshold to use for dumping progress log messages to stdout
* `skip`: "skip" to use for query
* `limit`: "limit" to use for query
* `query`: query to use for filtering input collection

### Parameters

* `debugName`: tag to use to identify debug log messages
* `sourceName`: name of the mongo input collection
* `targetName`: name of the mongo output collection
* `targetIndices`: information to use to generate indexes for target collection
* `steps`: steps to use for the aggregation pipeline
* `postProcess`: (optional) post-processing function to use instead of Mongo's [`$out`](https://docs.mongodb.com/manual/reference/operator/aggregation/out/#pipe._S_out) operator
