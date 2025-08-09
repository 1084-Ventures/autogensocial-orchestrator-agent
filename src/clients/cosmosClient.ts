import { CosmosClient, Database, Container } from "@azure/cosmos";

const endpoint = process.env.COSMOSDB_ENDPOINT;
const key = process.env.COSMOSDB_KEY;
const databaseId = process.env.COSMOSDB_DATABASE_ID;
const containerId = process.env.COSMOSDB_BRANDS_CONTAINER_ID;

if (!endpoint || !key || !databaseId || !containerId) {
  throw new Error("Missing CosmosDB environment variables.");
}

const client = new CosmosClient({ endpoint, key });

export function getBrandsContainer(): Container {
  const database: Database = client.database(databaseId);
  return database.container(containerId);
}
