import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { LockRepo, Owner } from "../lock-bot";

function makeOwnersSavable(owners: Owner[]): { name: string, created: string }[] {
  return owners.map(o => ({ name: o.name, created: o.created.toString() }));
}

function restoreOwners(dbOwners: { name: string, created: string }[]): Owner[] {
  return dbOwners?.map(o => ({ name: o.name, created: new Date(o.created) }));
}

export default class DynamoDBLockRepo implements LockRepo {
  constructor(
    private readonly documentClient: DocumentClient,
    private readonly resourcesTableName: string
  ) {}

  async getAll(
    channel: string,
    team: string
  ): Promise<Map<string, Owner[]>> {
    const result = await this.documentClient
      .query({
        TableName: this.resourcesTableName,
        KeyConditionExpression: "#group = :g",
        ExpressionAttributeValues: { ":g": `${team}#${channel}` },
        ExpressionAttributeNames: { "#group": "Group" },
      })
      .promise();
    const map = new Map<string, Owner[]>();
    if (result.Items) {
      result.Items.forEach((i) => {
        map.set(i.Resource, restoreOwners(i.Owners))
      });
    }
    return map;
  }

  async getOwners(
    resource: string,
    channel: string,
    team: string
  ): Promise<string[] | undefined> {
    const result = await this.documentClient
      .get({
        TableName: this.resourcesTableName,
        Key: { Resource: resource, Group: `${team}#${channel}` },
      })
      .promise();
    const owners = restoreOwners(result.Item?.Owners)
    return owners?.map(o => o.name);
  }

  async dequeueOwner(
    resource: string,
    channel: string,
    team: string,
    owner: string
  ): Promise<string[]> {
    const result = await this.documentClient
      .get({
        TableName: this.resourcesTableName,
        Key: { Resource: resource, Group: `${team}#${channel}` },
      })
      .promise();
    const owners = restoreOwners(result.Item?.Owners)
    if (!owners) {
      return [];
    }
    const newOwners = owners.filter(o => o.name != owner);
    await this.documentClient
      .put({
        TableName: this.resourcesTableName,
        Item: {
          Resource: resource,
          Group: `${team}#${channel}`,
          Owners: makeOwnersSavable(newOwners),
        },
      })
      .promise();
    return newOwners.map(o => o.name);
  }

  async enqueueOwner(
    resource: string,
    owner: string,
    channel: string,
    team: string
  ): Promise<string[]> {
    const result = await this.documentClient
      .get({
        TableName: this.resourcesTableName,
        Key: { Resource: resource, Group: `${team}#${channel}` },
      })
      .promise();
    const owners : Owner[] = result.Item?.Owners

    const newOwners = owners ? owners.concat({ name: owner, created: new Date() }) : [{ name: owner, created: new Date() }];

    await this.documentClient
      .put({
        TableName: this.resourcesTableName,
        Item: {
          Resource: resource,
          Group: `${team}#${channel}`,
          Owners: makeOwnersSavable(newOwners),
        },
      })
      .promise();
    return newOwners.map(o => o.name);
  }
}
