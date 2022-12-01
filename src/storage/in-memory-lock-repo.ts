import { LockRepo, Owner } from "../lock-bot";

export default class InMemoryLockRepo implements LockRepo {
  private readonly lockMap: Map<string, Owner[]> =
    new Map();

  private static readonly separator = "🎱🈂️💟🍐🍚🕕😽🎉⛎4️⃣";

  private static toKey = (resource: string, channel: string, team: string) => {
    return `${channel}${InMemoryLockRepo.separator}${resource}${InMemoryLockRepo.separator}${team}`;
  };

  private static fromKey = (key: string) => {
    const strings = key.split(InMemoryLockRepo.separator);
    const channel = strings[0];
    const resource = strings[1];
    const team = strings[2];
    return { resource, channel, team };
  };

  async delete(resource: string, channel: string, team: string): Promise<void> {
    this.lockMap.delete(InMemoryLockRepo.toKey(resource, channel, team));
  }

  async getAll(
    channel: string,
    team: string
  ): Promise<Map<string, Owner[]>> {
    const all = new Map<string, Owner[]>();
    this.lockMap.forEach((value, key) => {
      const {
        resource,
        channel: resourceChannel,
        team: resourceTeam,
      } = InMemoryLockRepo.fromKey(key);
      if (resourceTeam === team && resourceChannel === channel) {
        all.set(resource, value);
      }
    });
    return all;
  }

  async getOwner(
    resource: string,
    channel: string,
    team: string
  ): Promise<string | undefined> {
    return this.lockMap.get(InMemoryLockRepo.toKey(resource, channel, team))?.[0]
      ?.name;
  }

  async getOwners(
    resource: string,
    channel: string,
    team: string
  ): Promise<string[] | undefined> {
    return this.lockMap.get(InMemoryLockRepo.toKey(resource, channel, team))?.map(o => o.name);
  }

  async enqueueOwner(
    resource: string,
    owner: string,
    channel: string,
    team: string
  ): Promise<string[]> {
    const key = InMemoryLockRepo.toKey(resource, channel, team)
    const owners = this.lockMap.get(key);
    const newOwners = owners ? owners.concat({ name: owner, created: new Date() }) : [{ name: owner, created: new Date() }];
    this.lockMap.set(key, newOwners);
    return newOwners.map(o => o.name);
  }

  async setOwner(
    resource: string,
    name: string,
    channel: string,
    team: string
  ): Promise<void> {
    this.lockMap.set(InMemoryLockRepo.toKey(resource, channel, team), [{
      name,
      created: new Date(),
    }]);
  }
}
