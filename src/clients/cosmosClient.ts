import { CosmosClient, Database, Container } from "@azure/cosmos";

const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
const databaseId = process.env.COSMOS_DB_NAME;
const brandsContainerId = process.env.COSMOS_DB_CONTAINER_BRAND;
const postsContainerId = process.env.COSMOS_DB_CONTAINER_POSTS;

if (!connectionString || !databaseId || !brandsContainerId || !postsContainerId) {
  throw new Error("Missing CosmosDB environment variables.");
}

const client = new CosmosClient(connectionString);
const database: Database = client.database(databaseId);

export function getBrandsContainer(): Container {
  return database.container(brandsContainerId);
}

export function getPostsContainer(): Container {
  return database.container(postsContainerId);
}
