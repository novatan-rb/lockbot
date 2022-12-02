import TokenAuthorizer from "./token-authorizer";

export interface LockRepo {
  getAll(
    channel: string,
    team: string
  ): Promise<Map<string, Owner[]>>;
  getOwners(
    resource: string,
    channel: string,
    team: string
  ): Promise<string[] | undefined>;
  enqueueOwner(
    resource: string,
    owner: string,
    channel: string,
    team: string
  ): Promise<string[]>;
  dequeueOwner(
    resource: string,
    owner: string,
    channel: string,
    team: string
  ): Promise<string[]>;
}

export type Destination = "user" | "channel";
export type Owner = { name: string; created: Date }

export interface Response {
  message: string;
  destination: Destination;
}

function queueMessage(resource: string, owners: string[] | undefined): string {
  if (!owners || owners.length === 0) {
    return `No one is in line for \`${resource}\` 🔒`;
  }
  if (owners.length === 1) {
    return `<@${owners[0]}> has locked \`${resource}\` 🔒`;
  }
  return `<@${owners[0]}> has locked \`${resource}\`, with ${ownerNameList(owners.slice(1, -1))} waiting in line. 🔒`;
}

function ownerNameList(owners: string[]): string {
  if (owners.length === 1) {
    return `<@${owners[0]}>`;
  }
  const last = owners.pop();
  return `<@${owners.join(", ")}> and <@${last}>`;
}

export default class LockBot {
  constructor(
    private readonly lockRepo: LockRepo,
    private readonly tokenAuthorizer: TokenAuthorizer
  ) {}

  lock = async (
    resource: string,
    user: string,
    channel: string,
    team: string,
    metadata?: Record<string, string>
  ): Promise<Response> => {
    if (!resource || resource === "help") {
      return {
        message:
          "How to use `/lock`\n\n" +
          "To lock a resource in this channel called `thingy`, use `/lock thingy`\n\n" +
          "_Example:_\n" +
          `> *<@${user}>*: \`/lock dev\`\n` +
          `> *Lockbot*: <@${user}> has locked \`dev\` 🔒`,
        destination: "user",
      };
    }

    const lockOwners = await this.lockRepo.getOwners(resource, channel, team);
    if (lockOwners?.includes(user)) {
      return {
        message: queueMessage(resource, lockOwners),
        destination: "user",
      };
    }

    const newLockOwners = await this.lockRepo.enqueueOwner(resource, user, channel, team);

    return {
      message: queueMessage(resource, newLockOwners),
      destination: "channel",
    };
  };

  unlock = async (
    resource: string,
    user: string,
    channel: string,
    team: string,
    options: { force: boolean }
  ): Promise<Response> => {
    if (!resource || resource === "help") {
      return {
        message:
          "How to use `/unlock`\n\n" +
          "To unlock a resource in this channel called `thingy`, " +
          "use `/unlock thingy`\n\n_Example:_\n" +
          `> *<@${user}>*: \`/unlock dev\`\n` +
          `> *Lockbot*: <@${user}> has unlocked \`dev\` 🔓\n\n`,
        destination: "user",
      };
    }
    const lockOwners = await this.lockRepo.getOwners(resource, channel, team);
    if (!lockOwners || !lockOwners.includes(user)) {
      return {
        message: queueMessage(resource, lockOwners),
        destination: "user",
      };
    }

    const newLockOwners = await this.lockRepo.dequeueOwner(resource, channel, team, user);
    return {
      message: queueMessage(resource, newLockOwners),
      destination: "channel",
    };
  };

  locks = async (channel: string, team: string): Promise<Response> => {
    const locks = await this.lockRepo.getAll(channel, team);
    if (locks.size === 0) {
      return {
        message: `No active locks in this channel 🔓`,
        destination: "user",
      };
    }
    let locksMessage = "Active locks in this channel:\n";
    locks.forEach((queueOwners, lockedResource) => {
      queueOwners?.forEach(({name: lockOwner, created: lockDate}) => {
        locksMessage +=
          `> \`${lockedResource}\` is locked by <@${lockOwner}> 🔒` +
          ` _<!date^${Math.floor(
            lockDate.valueOf() / 1000
          )}^{date_pretty} {time}|${lockDate.toUTCString()}>_\n`;
      });
    });
    return { message: locksMessage.trimRight(), destination: "user" };
  };

  lbtoken = async (
    param: string,
    user: string,
    channel: string,
    team: string,
    url: string
  ): Promise<Response> => {
    if (param !== "new") {
      return {
        message:
          "How to use `/lbtoken`\n\n" +
          "To generate a new access token for the " +
          "Lockbot API use `/lbtoken new`\n\n" +
          `• The token is scoped to your user \`${user}\`, ` +
          `this team \`${team}\` and this channel \`${channel}\`\n` +
          "• Make a note of your token as it won't be displayed again\n" +
          "• If you generate a new token in this channel it will " +
          "invalidate the existing token for this channel\n\n" +
          "The API is secured using basic access authentication. " +
          "To authenticate with the API you must set a header:\n" +
          "```Authorization: Basic <credentials>```\n" +
          "where `<credentials>` is `user:token` base64 encoded\n\n" +
          `Explore the Lockbot API with OpenAPI 3 ` +
          `and Swagger UI: ${url}/api-docs`,
        destination: "user",
      };
    }
    const accessToken = await this.tokenAuthorizer.createAccessToken(
      user,
      channel,
      team
    );
    const credentials = Buffer.from(`${user}:${accessToken}`).toString(
      "base64"
    );
    const auth = `--header 'Authorization: Basic ${credentials}'`;
    const baseUrl = `${url}/api/teams/${team}/channels/${channel}/locks`;
    const get = "--request GET";
    const del = "--request DELETE";
    const post = "--request POST";
    const json = "--header 'Content-Type: application/json'";
    const body = `--data-raw '{ "name": "dev", "owner": "${user}"}'`;
    return {
      message:
        `Here is your new access token: \`${accessToken}\`\n\n` +
        "_Example API usage with `curl`:_\n\n" +
        "> Fetch all locks 📜\n" +
        `\`\`\`curl ${get} '${baseUrl}' ${auth}\`\`\`\n\n` +
        "> Fetch lock `dev` 👀\n" +
        `\`\`\`curl ${get} '${baseUrl}/dev' ${auth}\`\`\`\n\n` +
        "> Create lock `dev` 🔒\n" +
        `\`\`\`curl ${post} '${baseUrl}' ${auth} ${json} ${body}\`\`\`\n\n` +
        "> Delete lock `dev` 🔓\n" +
        `\`\`\`curl ${del} '${baseUrl}/dev' ${auth}\`\`\``,
      destination: "user",
    };
  };
}
